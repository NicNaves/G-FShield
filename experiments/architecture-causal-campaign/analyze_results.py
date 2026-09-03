#!/usr/bin/env python3
"""Analyze paired causal-campaign results without modifying raw artifacts."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import math
import re
from datetime import datetime
from pathlib import Path
from typing import Any

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd


BOOTSTRAP_REPETITIONS = 20_000
PERMUTATION_REPETITIONS = 200_000
ANALYSIS_SEED = 20260903
THRESHOLDS = (0.93, 0.94, 0.945, 0.95)
SELECTION_HORIZON_SECONDS = 2700.0
NONINFERIORITY_MARGIN = -0.005


def load_resource_parser(repo_root: Path):
    path = repo_root / "experiments/10-day-campaign/analyze_results.py"
    spec = importlib.util.spec_from_file_location("campaign10_analysis", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.parse_resource_samples


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def verify_checksums(root: Path, manifest_path: Path) -> list[str]:
    errors = []
    for line in manifest_path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        expected, relative = line.split(None, 1)
        path = root / relative.strip()
        if not path.is_file():
            errors.append(f"missing {path}")
        elif sha256_file(path) != expected:
            errors.append(f"checksum mismatch {path}")
    return errors


def merged_intervals(intervals: list[tuple[float, float]]) -> list[tuple[float, float]]:
    valid = sorted((start, end) for start, end in intervals if end > start)
    merged: list[list[float]] = []
    for start, end in valid:
        if not merged or start > merged[-1][1]:
            merged.append([start, end])
        else:
            merged[-1][1] = max(merged[-1][1], end)
    return [(start, end) for start, end in merged]


def interval_duration(intervals: list[tuple[float, float]]) -> float:
    return sum(end - start for start, end in merged_intervals(intervals))


def intersection_duration(
    left: list[tuple[float, float]], right: list[tuple[float, float]],
) -> float:
    a = merged_intervals(left)
    b = merged_intervals(right)
    i = j = 0
    total = 0.0
    while i < len(a) and j < len(b):
        total += max(0.0, min(a[i][1], b[j][1]) - max(a[i][0], b[j][0]))
        if a[i][1] <= b[j][1]:
            i += 1
        else:
            j += 1
    return total


DOCKER_TIMESTAMP = re.compile(r"(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z)")
ELAPSED_MS = re.compile(r"elapsedMs=(\d+)")


def distributed_phase_intervals(path: Path) -> tuple[list[tuple[float, float]], list[tuple[float, float]]]:
    construction: list[tuple[float, float]] = []
    local_search: list[tuple[float, float]] = []
    if not path.exists():
        return construction, local_search
    with path.open(encoding="utf-8", errors="replace") as handle:
        for line in handle:
            timestamp = DOCKER_TIMESTAMP.search(line)
            elapsed = ELAPSED_MS.search(line)
            if timestamp is None or elapsed is None:
                continue
            finished = datetime.fromisoformat(
                timestamp.group(1).replace("Z", "+00:00")
            ).timestamp()
            started = finished - float(elapsed.group(1)) / 1000.0
            if "rcl generation published algorithm=" in line:
                construction.append((started, finished))
            elif "dls completed search=IWSSR" in line:
                local_search.append((started, finished))
    return construction, local_search


def monolith_phase_intervals(path: Path) -> tuple[list[tuple[float, float]], list[tuple[float, float]]]:
    construction: list[tuple[float, float]] = []
    local_search: list[tuple[float, float]] = []
    if not path.exists():
        return construction, local_search
    with path.open(encoding="utf-8", errors="replace") as handle:
        for line in handle:
            try:
                row = json.loads(line)
                interval = (
                    float(row["started_elapsed_ms"]) / 1000.0,
                    float(row["finished_elapsed_ms"]) / 1000.0,
                )
            except (KeyError, TypeError, ValueError, json.JSONDecodeError):
                continue
            if row.get("phase") == "construction":
                construction.append(interval)
            elif row.get("phase") == "local_search":
                local_search.append(interval)
    return construction, local_search


def pipeline_metrics(run_dir: Path, architecture: str) -> dict[str, float]:
    if architecture == "distributed":
        construction, local_search = distributed_phase_intervals(run_dir / "compose.log")
    else:
        construction, local_search = monolith_phase_intervals(run_dir / "phase-events.jsonl")
    construction_seconds = interval_duration(construction)
    local_search_seconds = interval_duration(local_search)
    overlap_seconds = intersection_duration(construction, local_search)
    return {
        "construction_active_seconds": construction_seconds,
        "local_search_active_seconds": local_search_seconds,
        "construction_local_search_overlap_seconds": overlap_seconds,
        "local_search_overlap_percent": (
            100.0 * overlap_seconds / local_search_seconds
            if local_search_seconds > 0.0 else math.nan
        ),
    }


INTERNAL_CANDIDATE = re.compile(
    r"(?:rcl generation ready|dls iteration search=IWSSR).*?f1=([-+0-9.Ee]+).*?campaignElapsedMs=(\d+)"
)


def distributed_candidate_trace(path: Path) -> list[tuple[float, float]]:
    points: list[tuple[float, float]] = []
    if not path.exists():
        return points
    with path.open(encoding="utf-8", errors="replace") as handle:
        for line in handle:
            match = INTERNAL_CANDIDATE.search(line)
            if match:
                points.append((float(match.group(2)) / 1000.0, float(match.group(1))))
    return points


def read_best_trace(run_dir: Path, architecture: str) -> list[tuple[float, float]]:
    if architecture == "distributed":
        points = distributed_candidate_trace(run_dir / "compose.log")
        # Compatibility fallback for the pre-instrumentation pilot only.
        path = run_dir / "best-solution-messages.jsonl"
    else:
        points = []
        path = run_dir / "best-solution-trace.jsonl"
    if not path.exists():
        return points
    with path.open(encoding="utf-8", errors="replace") as handle:
        for line in handle:
            if not line.strip():
                continue
            try:
                row = json.loads(line)
                score = row["f1Score"] if architecture == "distributed" else row["validation_f1_macro"]
                elapsed = row["monotonicElapsedMs"] if architecture == "distributed" else row["monotonic_elapsed_ms"]
                points.append((float(elapsed) / 1000.0, float(score)))
            except (KeyError, TypeError, ValueError, json.JSONDecodeError):
                continue
    points.sort()
    best = 0.0
    monotonic = []
    for elapsed, score in points:
        best = max(best, score)
        if not monotonic or best > monotonic[-1][1] + 1e-15:
            monotonic.append((elapsed, best))
    return monotonic


def anytime_metrics(points: list[tuple[float, float]]) -> dict[str, float | bool]:
    horizon = SELECTION_HORIZON_SECONDS
    previous_time = 0.0
    previous_score = 0.0
    area = 0.0
    target_times: dict[float, float] = {}
    for elapsed, score in points:
        current_time = min(max(elapsed, 0.0), horizon)
        if current_time < previous_time:
            continue
        area += (current_time - previous_time) * previous_score
        previous_time = current_time
        previous_score = max(previous_score, score)
        for threshold in THRESHOLDS:
            if previous_score >= threshold and threshold not in target_times:
                target_times[threshold] = current_time
        if current_time >= horizon:
            break
    area += max(0.0, horizon - previous_time) * previous_score
    result: dict[str, float | bool] = {"anytime_auc_normalized": area / horizon}
    for threshold in THRESHOLDS:
        key = str(threshold).replace(".", "_")
        reached = threshold in target_times
        result[f"target_{key}_reached"] = reached
        result[f"time_to_{key}_seconds_censored"] = target_times.get(threshold, horizon)
    return result


def load_runs(state_path: Path) -> pd.DataFrame:
    state = json.loads(state_path.read_text(encoding="utf-8"))
    if state.get("state") != "CAMPAIGN_COMPLETED":
        raise RuntimeError(f"campaign is not complete: {state.get('state')}")
    repo_root = Path(__file__).resolve().parents[2]
    parse_resources = load_resource_parser(repo_root)
    rows = []
    checksum_errors = []
    for completed in state["completed"]:
        result_path = Path(completed["result_path"])
        run_dir = result_path.parent
        checksum_path = run_dir / "checksums.sha256"
        if sha256_file(checksum_path) != completed["checksums_sha256"]:
            checksum_errors.append(f"state checksum mismatch {checksum_path}")
        checksum_errors.extend(verify_checksums(run_dir, checksum_path))
        result = json.loads(result_path.read_text(encoding="utf-8"))
        resources = parse_resources(run_dir / "resource-samples.jsonl")
        trace = read_best_trace(run_dir, completed["architecture"])
        if not trace:
            raise RuntimeError(f"missing internal candidate trace in {run_dir}")
        trace_metrics = anytime_metrics(trace)
        phase_metrics = pipeline_metrics(run_dir, completed["architecture"])
        elapsed_seconds = float(result["end_to_end_time_ms"]) / 1000.0
        candidates = int(result["candidate_count"])
        cpu_cores = float(resources.get("cpu_cores_median", math.nan))
        memory_mib = float(resources.get("memory_mib_median", math.nan))
        if not math.isfinite(cpu_cores) or not math.isfinite(memory_mib):
            raise RuntimeError(f"missing resource samples in {run_dir}")
        if phase_metrics["construction_active_seconds"] <= 0.0 or phase_metrics["local_search_active_seconds"] <= 0.0:
            raise RuntimeError(f"missing construction/local-search intervals in {run_dir}")
        row = {
            "architecture": completed["architecture"],
            "seed": int(completed["seed"]),
            "run_id": completed["run_id"],
            "run_dir": str(run_dir),
            "test_f1_macro": float(result["test_f1_macro"]),
            "validation_f1_macro": float(result["validation_f1_macro"]),
            "test_precision_macro": float(result["test_precision_macro"]),
            "test_recall_macro": float(result["test_recall_macro"]),
            "accuracy": float(result["accuracy"]),
            "subset_size": int(result["subset_size"]),
            "reduction_percent": float(result["dimensionality_reduction_percent"]),
            "elapsed_seconds": elapsed_seconds,
            "candidate_count": candidates,
            "candidates_per_second": candidates / elapsed_seconds,
            "cpu_cores_median": cpu_cores,
            "memory_mib_median": memory_mib,
            "cpu_hours": cpu_cores * elapsed_seconds / 3600.0,
            "memory_gib_hours": memory_mib / 1024.0 * elapsed_seconds / 3600.0,
            "cpu_hours_per_candidate": cpu_cores * elapsed_seconds / 3600.0 / candidates,
            "memory_gib_hours_per_candidate": memory_mib / 1024.0 * elapsed_seconds / 3600.0 / candidates,
            "stop_reason": result["stop_reason"],
        }
        row.update(trace_metrics)
        row.update(phase_metrics)
        row["estimated_cpu_core_seconds_to_0_94_censored"] = (
            cpu_cores * float(row["time_to_0_94_seconds_censored"])
        )
        rows.append(row)
    if checksum_errors:
        raise RuntimeError("; ".join(checksum_errors))
    frame = pd.DataFrame(rows)
    counts = frame.groupby(["architecture", "seed"]).size()
    if not (counts == 1).all() or set(frame["architecture"]) != {"distributed", "monolith"}:
        raise RuntimeError("results do not form unique architecture/seed cells")
    if frame.groupby("seed")["architecture"].nunique().min() != 2:
        raise RuntimeError("one or more paired seeds are incomplete")
    return frame.sort_values(["seed", "architecture"])


def rank_biserial(differences: np.ndarray) -> float:
    nonzero = differences[np.abs(differences) > 1e-15]
    if len(nonzero) == 0:
        return 0.0
    ranks = pd.Series(np.abs(nonzero)).rank(method="average").to_numpy()
    return float((ranks[nonzero > 0].sum() - ranks[nonzero < 0].sum()) / ranks.sum())


def permutation_p(differences: np.ndarray, rng: np.random.Generator) -> float:
    observed = abs(float(np.mean(differences)))
    exceed = 0
    batch = 10_000
    for start in range(0, PERMUTATION_REPETITIONS, batch):
        size = min(batch, PERMUTATION_REPETITIONS - start)
        signs = rng.choice((-1.0, 1.0), size=(size, len(differences)))
        statistics = np.abs(np.mean(signs * differences, axis=1))
        exceed += int(np.sum(statistics >= observed - 1e-15))
    return (exceed + 1.0) / (PERMUTATION_REPETITIONS + 1.0)


def bootstrap_median_ci(differences: np.ndarray, rng: np.random.Generator) -> tuple[float, float]:
    samples = rng.choice(differences, size=(BOOTSTRAP_REPETITIONS, len(differences)), replace=True)
    medians = np.median(samples, axis=1)
    return float(np.quantile(medians, 0.025)), float(np.quantile(medians, 0.975))


def bootstrap_mean_lower_bound(differences: np.ndarray, rng: np.random.Generator) -> float:
    samples = rng.choice(differences, size=(BOOTSTRAP_REPETITIONS, len(differences)), replace=True)
    return float(np.quantile(np.mean(samples, axis=1), 0.05))


def holm_adjust(values: list[float]) -> list[float]:
    order = np.argsort(values)
    adjusted = np.empty(len(values), dtype=float)
    running = 0.0
    total = len(values)
    for rank, index in enumerate(order):
        running = max(running, min(1.0, (total - rank) * values[index]))
        adjusted[index] = running
    return adjusted.tolist()


def comparisons(runs: pd.DataFrame) -> pd.DataFrame:
    distributed = runs[runs["architecture"] == "distributed"].set_index("seed")
    monolith = runs[runs["architecture"] == "monolith"].set_index("seed")
    seeds = sorted(set(distributed.index) & set(monolith.index))
    metrics = [
        ("time_to_0_94_seconds_censored", "lower", "primary"),
        ("test_f1_macro", "higher", "quality_guardrail"),
        ("anytime_auc_normalized", "higher", "secondary"),
        ("time_to_0_93_seconds_censored", "lower", "secondary"),
        ("time_to_0_945_seconds_censored", "lower", "secondary"),
        ("time_to_0_95_seconds_censored", "lower", "secondary"),
        ("candidates_per_second", "higher", "secondary"),
        ("cpu_cores_median", "higher", "secondary"),
        ("estimated_cpu_core_seconds_to_0_94_censored", "lower", "secondary"),
        ("cpu_hours_per_candidate", "lower", "secondary"),
        ("memory_gib_hours_per_candidate", "lower", "secondary"),
        ("local_search_overlap_percent", "higher", "secondary"),
        ("reduction_percent", "higher", "secondary"),
    ]
    rng = np.random.default_rng(ANALYSIS_SEED)
    rows: list[dict[str, Any]] = []
    for metric, direction, family in metrics:
        raw = distributed.loc[seeds, metric].to_numpy(float) - monolith.loc[seeds, metric].to_numpy(float)
        favorable = raw if direction == "higher" else -raw
        low, high = bootstrap_median_ci(raw, rng)
        rows.append({
            "metric": metric,
            "family": family,
            "favorable_direction": direction,
            "paired_mean_difference_distributed_minus_monolith": float(np.mean(raw)),
            "paired_median_difference_distributed_minus_monolith": float(np.median(raw)),
            "paired_median_ci_low": low,
            "paired_median_ci_high": high,
            "distributed_wins": int(np.sum(favorable > 0)),
            "ties": int(np.sum(np.abs(favorable) <= 1e-15)),
            "distributed_losses": int(np.sum(favorable < 0)),
            "rank_biserial_favorable_to_distributed": rank_biserial(favorable),
            "p_permutation": permutation_p(favorable, rng),
        })
    for family in {row["family"] for row in rows}:
        indexes = [index for index, row in enumerate(rows) if row["family"] == family]
        adjusted = holm_adjust([rows[index]["p_permutation"] for index in indexes])
        for index, value in zip(indexes, adjusted):
            rows[index]["p_holm_within_family"] = value
    return pd.DataFrame(rows)


def summarize(runs: pd.DataFrame) -> pd.DataFrame:
    columns = [
        "test_f1_macro", "validation_f1_macro", "test_precision_macro",
        "test_recall_macro", "accuracy", "subset_size", "reduction_percent",
        "elapsed_seconds", "candidate_count", "candidates_per_second",
        "cpu_cores_median", "memory_mib_median", "cpu_hours_per_candidate",
        "memory_gib_hours_per_candidate",
        "anytime_auc_normalized", "time_to_0_93_seconds_censored",
        "time_to_0_94_seconds_censored", "time_to_0_945_seconds_censored",
        "time_to_0_95_seconds_censored",
        "estimated_cpu_core_seconds_to_0_94_censored",
        "construction_active_seconds", "local_search_active_seconds",
        "construction_local_search_overlap_seconds", "local_search_overlap_percent",
    ]
    rows = []
    for architecture, group in runs.groupby("architecture"):
        row: dict[str, Any] = {"architecture": architecture, "n": len(group)}
        for column in columns:
            row[column + "_median"] = float(group[column].median())
            row[column + "_q1"] = float(group[column].quantile(0.25))
            row[column + "_q3"] = float(group[column].quantile(0.75))
        rows.append(row)
    return pd.DataFrame(rows)


def plot_pairs(runs: pd.DataFrame, output: Path) -> None:
    pivot = runs.pivot(index="seed", columns="architecture", values="test_f1_macro")
    fig, ax = plt.subplots(figsize=(7.2, 4.8))
    for _, row in pivot.iterrows():
        ax.plot([0, 1], [row["monolith"], row["distributed"]], color="#94A3B8", alpha=0.55)
    ax.scatter(np.zeros(len(pivot)), pivot["monolith"], color="#D97706", label="Monolith")
    ax.scatter(np.ones(len(pivot)), pivot["distributed"], color="#2563EB", label="G-FShield")
    ax.set_xticks([0, 1], ["Monolith", "G-FShield"])
    ax.set_ylabel("Held-out macro-F1")
    ax.grid(axis="y", alpha=0.25)
    fig.tight_layout()
    fig.savefig(output / "paired-test-f1.pdf")
    fig.savefig(output / "paired-test-f1.png", dpi=220)
    plt.close(fig)


def plot_anytime(runs: pd.DataFrame, output: Path) -> None:
    grid = np.linspace(0.0, SELECTION_HORIZON_SECONDS, 181)
    fig, ax = plt.subplots(figsize=(7.2, 4.8))
    colors = {"monolith": "#D97706", "distributed": "#2563EB"}
    labels = {"monolith": "Monolith", "distributed": "G-FShield"}
    for architecture in ("monolith", "distributed"):
        curves = []
        for _, row in runs[runs.architecture == architecture].iterrows():
            points = read_best_trace(Path(row["run_dir"]), architecture)
            values = np.zeros_like(grid)
            for elapsed, score in points:
                values[grid >= elapsed] = np.maximum(values[grid >= elapsed], score)
            curves.append(values)
        matrix = np.asarray(curves)
        median = np.median(matrix, axis=0)
        q1 = np.quantile(matrix, 0.25, axis=0)
        q3 = np.quantile(matrix, 0.75, axis=0)
        ax.step(grid / 60.0, median, where="post", color=colors[architecture], label=labels[architecture])
        ax.fill_between(grid / 60.0, q1, q3, step="post", color=colors[architecture], alpha=0.16)
    ax.axhline(0.94, color="#475569", linestyle="--", linewidth=1, label="Macro-F1 0.94")
    ax.set_xlabel("Selection time (minutes)")
    ax.set_ylabel("Best validation macro-F1 so far")
    ax.grid(alpha=0.25)
    ax.legend()
    fig.tight_layout()
    fig.savefig(output / "anytime-validation-f1.pdf")
    fig.savefig(output / "anytime-validation-f1.png", dpi=220)
    plt.close(fig)


def plot_processing(runs: pd.DataFrame, output: Path) -> None:
    metrics = [
        ("time_to_0_94_seconds_censored", "Time to macro-F1 0.94 (s)"),
        ("candidates_per_second", "Candidate evaluations / s"),
        ("cpu_cores_median", "Median utilized CPU cores"),
        ("local_search_overlap_percent", "Local search overlapping construction (%)"),
    ]
    fig, axes = plt.subplots(2, 2, figsize=(10.4, 7.2))
    for ax, (metric, ylabel) in zip(axes.ravel(), metrics):
        pivot = runs.pivot(index="seed", columns="architecture", values=metric)
        for _, row in pivot.iterrows():
            ax.plot([0, 1], [row["monolith"], row["distributed"]], color="#94A3B8", alpha=0.45)
        ax.scatter(np.zeros(len(pivot)), pivot["monolith"], color="#D97706")
        ax.scatter(np.ones(len(pivot)), pivot["distributed"], color="#2563EB")
        ax.set_xticks([0, 1], ["Monolith", "G-FShield"])
        ax.set_ylabel(ylabel)
        ax.grid(axis="y", alpha=0.25)
    fig.tight_layout()
    fig.savefig(output / "paired-speed-processing.pdf")
    fig.savefig(output / "paired-speed-processing.png", dpi=220)
    plt.close(fig)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--state", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    runs = load_runs(args.state)
    summary = summarize(runs)
    tests = comparisons(runs)
    runs.to_csv(args.output / "run-level-results.csv", index=False)
    summary.to_csv(args.output / "architecture-summary.csv", index=False)
    tests.to_csv(args.output / "paired-comparisons.csv", index=False)
    plot_pairs(runs, args.output)
    plot_anytime(runs, args.output)
    plot_processing(runs, args.output)
    primary = tests.loc[tests["metric"] == "time_to_0_94_seconds_censored"].iloc[0]
    distributed = runs[runs.architecture == "distributed"].set_index("seed")
    monolith = runs[runs.architecture == "monolith"].set_index("seed")
    seeds = sorted(set(distributed.index) & set(monolith.index))
    quality_difference = (
        distributed.loc[seeds, "test_f1_macro"].to_numpy(float)
        - monolith.loc[seeds, "test_f1_macro"].to_numpy(float)
    )
    quality_lower = bootstrap_mean_lower_bound(
        quality_difference, np.random.default_rng(ANALYSIS_SEED + 1)
    )
    speed_supported = (
        primary["paired_median_difference_distributed_minus_monolith"] < 0.0
        and primary["p_permutation"] <= 0.05
    )
    quality_supported = quality_lower >= NONINFERIORITY_MARGIN
    overlap_distributed = runs.loc[
        runs.architecture == "distributed", "local_search_overlap_percent"
    ].median()
    overlap_monolith = runs.loc[
        runs.architecture == "monolith", "local_search_overlap_percent"
    ].median()
    mechanism_supported = overlap_distributed > overlap_monolith
    conclusion = (
        "The prespecified evidence supports the architectural speed advantage."
        if speed_supported and quality_supported and mechanism_supported
        else "The prespecified evidence does not establish the architectural speed advantage."
    )
    report = [
        "# Causal architecture campaign analysis",
        "",
        f"- Complete paired seeds: {runs['seed'].nunique()}.",
        f"- Distributed median test macro-F1: {runs.loc[runs.architecture == 'distributed', 'test_f1_macro'].median():.6f}.",
        f"- Monolith median test macro-F1: {runs.loc[runs.architecture == 'monolith', 'test_f1_macro'].median():.6f}.",
        f"- Paired median time-to-0.94 difference (distributed minus monolith): {primary['paired_median_difference_distributed_minus_monolith']:.3f} s.",
        f"- Primary paired permutation p-value: {primary['p_permutation']:.6g}.",
        f"- One-sided 95% bootstrap lower bound for paired mean held-out macro-F1 difference: {quality_lower:.6f} (margin {NONINFERIORITY_MARGIN:.3f}).",
        f"- Median utilized CPU cores: distributed {runs.loc[runs.architecture == 'distributed', 'cpu_cores_median'].median():.3f}; monolith {runs.loc[runs.architecture == 'monolith', 'cpu_cores_median'].median():.3f}.",
        f"- Median candidate throughput: distributed {runs.loc[runs.architecture == 'distributed', 'candidates_per_second'].median():.4f}/s; monolith {runs.loc[runs.architecture == 'monolith', 'candidates_per_second'].median():.4f}/s.",
        f"- Median estimated CPU-hours per candidate: distributed {runs.loc[runs.architecture == 'distributed', 'cpu_hours_per_candidate'].median():.6f}; monolith {runs.loc[runs.architecture == 'monolith', 'cpu_hours_per_candidate'].median():.6f}.",
        f"- Median local-search overlap: distributed {overlap_distributed:.2f}%; monolith {overlap_monolith:.2f}%.",
        f"- Conclusion: {conclusion}",
        "",
        "A positive difference alone is not architectural proof. The conclusion must also consider",
        "the prespecified effect direction, adjusted uncertainty, throughput, resource-normalized",
        "costs, implementation-parity checks, and the single-host external-validity boundary.",
    ]
    (args.output / "analysis-report.md").write_text("\n".join(report) + "\n", encoding="utf-8")
    provenance = {
        "analysis_seed": ANALYSIS_SEED,
        "bootstrap_repetitions": BOOTSTRAP_REPETITIONS,
        "permutation_repetitions": PERMUTATION_REPETITIONS,
        "state_sha256": sha256_file(args.state),
        "run_count": len(runs),
        "paired_seed_count": int(runs["seed"].nunique()),
    }
    (args.output / "analysis-provenance.json").write_text(
        json.dumps(provenance, indent=2, sort_keys=True) + "\n", encoding="utf-8",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
