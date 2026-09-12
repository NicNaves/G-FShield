#!/usr/bin/env python3
"""Analyze the scenario-aware paired IWSHAP architecture campaign."""

from __future__ import annotations

import argparse
import csv
import hashlib
import importlib.util
import json
import math
from pathlib import Path
from typing import Any

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd


ANALYSIS_SEED = 20260912
BOOTSTRAP_REPETITIONS = 20_000
PERMUTATION_REPETITIONS = 200_000
EXPECTED_SEEDS = set(range(20260910, 20260940))


def load_module(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def csv_data_rows(path: Path, preamble_rows: int) -> int:
    if not path.is_file():
        return 0
    with path.open(encoding="utf-8", errors="replace", newline="") as handle:
        rows = sum(1 for row in csv.reader(handle, delimiter=";") if row)
    return max(0, rows - preamble_rows)


def stage_counts(run_dir: Path, architecture: str, result: dict[str, Any]) -> tuple[int, int]:
    if architecture == "distributed":
        return (
            int(result["construction_evaluation_count"]),
            int(result["local_search_evaluation_count"]),
        )
    construction = csv_data_rows(run_dir / "construcao_relieff_vnd.csv", 2)
    local_search = csv_data_rows(run_dir / "iwssr_relieff_vnd.csv", 2)
    if construction + local_search != int(result["candidate_count"]):
        raise RuntimeError(f"monolith stage counts do not reconcile in {run_dir}")
    return construction, local_search


def anytime_at_target(
    points: list[tuple[float, float]], target: float, horizon: float,
) -> dict[str, float | bool]:
    best = 0.0
    previous = 0.0
    area = 0.0
    reached_at: float | None = None
    for elapsed, score in points:
        if elapsed > horizon:
            break
        elapsed = max(0.0, elapsed)
        if elapsed < previous:
            continue
        area += (elapsed - previous) * best
        previous = elapsed
        best = max(best, score)
        if reached_at is None and best >= target:
            reached_at = elapsed
    area += max(0.0, horizon - previous) * best
    return {
        "anytime_auc_normalized": area / horizon,
        "baseline_target": target,
        "baseline_target_reached": reached_at is not None,
        "time_to_baseline_seconds_censored": reached_at if reached_at is not None else horizon,
    }


def baseline_targets(root: Path) -> dict[str, float]:
    targets = {}
    for scenario in ("suspension", "fabrication"):
        path = root / scenario / "all-features" / "final-result.json"
        result = json.loads(path.read_text(encoding="utf-8"))
        targets[scenario] = float(result["validation_f1_macro"])
    return targets


def load_runs(
    state_path: Path, baseline_root: Path, repo_root: Path,
) -> tuple[pd.DataFrame, dict[str, float]]:
    state = json.loads(state_path.read_text(encoding="utf-8"))
    if state.get("state") != "CAMPAIGN_COMPLETED":
        raise RuntimeError(f"campaign is not complete: {state.get('state')}")
    causal = load_module(
        repo_root / "experiments/architecture-causal-campaign/analyze_results.py",
        "causal_analysis",
    )
    resource = load_module(
        repo_root / "experiments/10-day-campaign/analyze_results.py",
        "resource_analysis",
    )
    targets = baseline_targets(baseline_root)
    rows = []
    errors: list[str] = []
    for completed in state["completed"]:
        result_path = Path(completed["result_path"])
        run_dir = result_path.parent
        checksum_path = run_dir / "checksums.sha256"
        if not checksum_path.is_file() or sha256_file(checksum_path) != completed["checksums_sha256"]:
            errors.append(f"checksum manifest mismatch: {run_dir}")
            continue
        errors.extend(causal.verify_checksums(run_dir, checksum_path))
        result = json.loads(result_path.read_text(encoding="utf-8"))
        scenario = completed["scenario"]
        architecture = completed["architecture"]
        horizon = float(result["selection_duration_ms"]) / 1000.0
        trace = causal.read_best_trace(run_dir, architecture)
        if not trace:
            errors.append(f"missing candidate trace: {run_dir}")
            continue
        resources = resource.parse_resource_samples(run_dir / "resource-samples.jsonl")
        if not resources:
            errors.append(f"missing resource measurements: {run_dir}")
            continue
        construction_count, local_search_count = stage_counts(run_dir, architecture, result)
        phase = causal.pipeline_metrics(run_dir, architecture, horizon)
        positive = result["test_per_class_metrics"]["1"]
        selection_seconds = float(result["selection_elapsed_ms"]) / 1000.0
        target_metrics = anytime_at_target(trace, targets[scenario], horizon)
        cpu_cores = float(resources["cpu_cores_median"])
        row = {
            "scenario": scenario,
            "architecture": architecture,
            "seed": int(completed["seed"]),
            "run_id": completed["run_id"],
            "result_sha256": sha256_file(result_path),
            "test_f1_macro": float(result["test_f1_macro"]),
            "test_precision_macro": float(result["test_precision_macro"]),
            "test_recall_macro": float(result["test_recall_macro"]),
            "test_f1_positive": float(positive["f1"]),
            "test_precision_positive": float(positive["precision"]),
            "test_recall_positive": float(positive["recall"]),
            "accuracy": float(result["accuracy"]),
            "subset_size": int(result["subset_size"]),
            "reduction_percent": float(result["dimensionality_reduction_percent"]),
            "selection_seconds": selection_seconds,
            "end_to_end_seconds": float(result["end_to_end_time_ms"]) / 1000.0,
            "classifier_seconds": float(result["classifier_time_ms"]) / 1000.0,
            "construction_evaluation_count": construction_count,
            "local_search_evaluation_count": local_search_count,
            "construction_evaluations_per_second": construction_count / selection_seconds,
            "local_search_evaluations_per_second": local_search_count / selection_seconds,
            "cpu_cores_median": cpu_cores,
            "cpu_cores_peak": float(resources["cpu_cores_peak"]),
            "memory_mib_median": float(resources["memory_mib_median"]),
            "memory_mib_peak": float(resources["memory_mib_peak"]),
            "estimated_cpu_core_seconds": cpu_cores * selection_seconds,
            **target_metrics,
            **phase,
        }
        rows.append(row)
    if errors:
        raise RuntimeError("artifact validation failed:\n" + "\n".join(errors[:20]))
    frame = pd.DataFrame(rows).sort_values(["scenario", "seed", "architecture"])
    expected_cells = {
        (scenario, architecture, seed)
        for scenario in targets
        for architecture in ("distributed", "monolith")
        for seed in EXPECTED_SEEDS
    }
    actual_cells = set(zip(frame.scenario, frame.architecture, frame.seed))
    if actual_cells != expected_cells or len(frame) != len(expected_cells):
        missing = sorted(expected_cells - actual_cells)
        extra = sorted(actual_cells - expected_cells)
        raise RuntimeError(f"invalid paired design; missing={missing[:5]} extra={extra[:5]}")
    return frame, targets


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
        exceed += int(np.sum(
            np.abs(np.mean(signs * differences, axis=1)) >= observed - 1e-15
        ))
    return (exceed + 1.0) / (PERMUTATION_REPETITIONS + 1.0)


def bootstrap_median_ci(
    differences: np.ndarray, rng: np.random.Generator,
) -> tuple[float, float]:
    samples = rng.choice(
        differences, size=(BOOTSTRAP_REPETITIONS, len(differences)), replace=True
    )
    medians = np.median(samples, axis=1)
    return float(np.quantile(medians, 0.025)), float(np.quantile(medians, 0.975))


def holm_adjust(values: list[float]) -> list[float]:
    order = np.argsort(values)
    adjusted = np.empty(len(values), dtype=float)
    running = 0.0
    for rank, index in enumerate(order):
        running = max(running, min(1.0, (len(values) - rank) * values[index]))
        adjusted[index] = running
    return adjusted.tolist()


METRICS = (
    ("test_f1_macro", "higher", "quality"),
    ("test_f1_positive", "higher", "quality"),
    ("test_precision_positive", "higher", "quality"),
    ("test_recall_positive", "higher", "quality"),
    ("reduction_percent", "higher", "quality"),
    ("time_to_baseline_seconds_censored", "lower", "speed"),
    ("anytime_auc_normalized", "higher", "speed"),
    ("end_to_end_seconds", "lower", "speed"),
    ("local_search_evaluations_per_second", "higher", "processing"),
    ("estimated_cpu_core_seconds", "lower", "processing"),
    ("memory_mib_peak", "lower", "processing"),
    ("local_search_overlap_percent", "higher", "mechanism"),
)


def paired_comparisons(runs: pd.DataFrame) -> pd.DataFrame:
    rng = np.random.default_rng(ANALYSIS_SEED)
    rows: list[dict[str, Any]] = []
    for scenario, scenario_runs in runs.groupby("scenario"):
        distributed = scenario_runs[scenario_runs.architecture == "distributed"].set_index("seed")
        monolith = scenario_runs[scenario_runs.architecture == "monolith"].set_index("seed")
        for metric, direction, family in METRICS:
            raw = distributed.loc[sorted(EXPECTED_SEEDS), metric].to_numpy(float) - monolith.loc[sorted(EXPECTED_SEEDS), metric].to_numpy(float)
            favorable = raw if direction == "higher" else -raw
            low, high = bootstrap_median_ci(raw, rng)
            rows.append({
                "scenario": scenario,
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
    numeric = [column for column in runs.select_dtypes(include="number").columns if column != "seed"]
    rows = []
    for (scenario, architecture), group in runs.groupby(["scenario", "architecture"]):
        row: dict[str, Any] = {"scenario": scenario, "architecture": architecture, "n": len(group)}
        for column in numeric:
            row[f"{column}_median"] = float(group[column].median())
            row[f"{column}_q1"] = float(group[column].quantile(0.25))
            row[f"{column}_q3"] = float(group[column].quantile(0.75))
        rows.append(row)
    return pd.DataFrame(rows)


def plot_paired_f1(runs: pd.DataFrame, output: Path) -> None:
    fig, axes = plt.subplots(1, 2, figsize=(10.5, 4.5), sharey=False)
    for ax, scenario in zip(axes, ("suspension", "fabrication")):
        pivot = runs[runs.scenario == scenario].pivot(index="seed", columns="architecture", values="test_f1_macro")
        for _, row in pivot.iterrows():
            ax.plot([0, 1], [row.monolith, row.distributed], color="#94A3B8", alpha=0.5)
        ax.scatter(np.zeros(len(pivot)), pivot.monolith, color="#D97706")
        ax.scatter(np.ones(len(pivot)), pivot.distributed, color="#2563EB")
        ax.set_xticks([0, 1], ["Monolith", "G-FShield"])
        ax.set_title(scenario.capitalize())
        ax.set_ylabel("Held-out macro-F1")
        ax.grid(axis="y", alpha=0.25)
    fig.tight_layout()
    fig.savefig(output / "paired-test-f1.pdf")
    fig.savefig(output / "paired-test-f1.png", dpi=220)
    plt.close(fig)


def write_report(
    path: Path, runs: pd.DataFrame, tests: pd.DataFrame, targets: dict[str, float],
) -> None:
    lines = [
        "# Formal IWSHAP architecture comparison",
        "",
        "All values below use 30 paired seeds per scenario. Positive differences are",
        "distributed minus monolith. Dataset-specific time targets equal the all-feature",
        "validation baseline computed before this campaign; those time analyses are",
        "descriptive because they were not embedded in the frozen campaign manifest.",
        "",
    ]
    for scenario in ("suspension", "fabrication"):
        subset = runs[runs.scenario == scenario]
        dist = subset[subset.architecture == "distributed"]
        mono = subset[subset.architecture == "monolith"]
        quality = tests[(tests.scenario == scenario) & (tests.metric == "test_f1_macro")].iloc[0]
        speed = tests[(tests.scenario == scenario) & (tests.metric == "anytime_auc_normalized")].iloc[0]
        lines.extend([
            f"## {scenario.capitalize()}",
            "",
            f"- Validation baseline target: {targets[scenario]:.6f}.",
            f"- Median test macro-F1: distributed {dist.test_f1_macro.median():.6f}; monolith {mono.test_f1_macro.median():.6f}.",
            f"- Paired median macro-F1 difference: {quality.paired_median_difference_distributed_minus_monolith:+.6f} (95% bootstrap CI {quality.paired_median_ci_low:+.6f} to {quality.paired_median_ci_high:+.6f}; Holm p={quality.p_holm_within_family:.6g}).",
            f"- Median anytime AUC: distributed {dist.anytime_auc_normalized.median():.6f}; monolith {mono.anytime_auc_normalized.median():.6f} (Holm p={speed.p_holm_within_family:.6g}).",
            f"- Median local-search throughput: distributed {dist.local_search_evaluations_per_second.median():.3f}/s; monolith {mono.local_search_evaluations_per_second.median():.3f}/s.",
            f"- Median estimated CPU core-seconds: distributed {dist.estimated_cpu_core_seconds.median():.1f}; monolith {mono.estimated_cpu_core_seconds.median():.1f}.",
            f"- Median peak RAM: distributed {dist.memory_mib_peak.median():.1f} MiB; monolith {mono.memory_mib_peak.median():.1f} MiB.",
            f"- Median construction/local-search overlap: distributed {dist.local_search_overlap_percent.median():.2f}%; monolith {mono.local_search_overlap_percent.median():.2f}%.",
            "",
        ])
    lines.extend([
        "## Interpretation constraint",
        "",
        "The overlap measurement demonstrates concurrent pipeline execution. It does not",
        "by itself prove lower latency or lower resource cost; those claims depend on their",
        "own paired outcomes. IWSHAP historical/reproduction numbers remain a separate",
        "evidence stratum until every frozen subset is evaluated by the common XGBoost setup.",
    ])
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--state", required=True, type=Path)
    parser.add_argument("--baseline-root", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--repo-root", type=Path, default=Path(__file__).resolve().parents[2])
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    runs, targets = load_runs(args.state, args.baseline_root, args.repo_root.resolve())
    tests = paired_comparisons(runs)
    summary = summarize(runs)
    runs.to_csv(args.output / "run-level-results.csv", index=False)
    summary.to_csv(args.output / "scenario-architecture-summary.csv", index=False)
    tests.to_csv(args.output / "paired-comparisons.csv", index=False)
    plot_paired_f1(runs, args.output)
    write_report(args.output / "analysis-report.md", runs, tests, targets)
    provenance = {
        "analysis_seed": ANALYSIS_SEED,
        "bootstrap_repetitions": BOOTSTRAP_REPETITIONS,
        "permutation_repetitions": PERMUTATION_REPETITIONS,
        "state_sha256": sha256_file(args.state),
        "baseline_targets": targets,
        "run_count": len(runs),
        "paired_seeds_per_scenario": 30,
        "time_target_status": "descriptive; baseline existed before campaign but was not frozen in campaign manifest",
    }
    (args.output / "analysis-provenance.json").write_text(
        json.dumps(provenance, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
