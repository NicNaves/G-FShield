#!/usr/bin/env python3
"""Analyze the preregistered paired concurrent-load campaign."""

from __future__ import annotations

import argparse
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

BOOTSTRAP_SEED = 20260914
BOOTSTRAP_REPETITIONS = 20_000
PERMUTATION_REPETITIONS = 200_000


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


def load_resource_parser(repo_root: Path):
    path = repo_root / "experiments/10-day-campaign/analyze_results.py"
    spec = importlib.util.spec_from_file_location("campaign10_analysis_for_load", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.parse_resource_samples


def remap_result(state_path: Path, recorded: str) -> Path:
    path = Path(recorded)
    if path.is_file():
        return path
    campaign_root = state_path.parent
    parts = path.parts
    indexes = [index for index, part in enumerate(parts) if part == campaign_root.name]
    if indexes:
        remapped = campaign_root.joinpath(*parts[indexes[-1] + 1:])
        if remapped.is_file():
            return remapped
    raise FileNotFoundError(recorded)


def numeric(value: Any) -> float:
    return float(value) if isinstance(value, (int, float)) else math.nan


def threshold_key(value: float) -> str:
    return str(value)


def distributed_job(row: dict[str, Any], threshold: float, selection_seconds: float) -> dict[str, float]:
    target = row.get("validation_time_to_targets_ms", {}).get(threshold_key(threshold))
    test = row.get("test") or {}
    return {
        "completed": float(row.get("status") == "completed"),
        "qualified": float(numeric(row.get("selected_validation_f1")) >= threshold),
        "time_to_quality_seconds_censored": (
            float(target) / 1000.0 if isinstance(target, (int, float)) else selection_seconds
        ),
        "test_f1_macro": numeric(test.get("f1_macro")),
        "subset_size": float(len(row.get("selected_features", []))) if row.get("selected_features") else math.nan,
        "construction_count": numeric(row.get("construction_evaluation_count")),
        "local_search_count": numeric(row.get("local_search_evaluation_count")),
    }


def monolith_job(row: dict[str, Any], threshold: float, selection_seconds: float) -> dict[str, float]:
    result = row.get("result") or {}
    target = result.get("validation_time_to_targets_ms", {}).get(threshold_key(threshold))
    features = result.get("selected_features") or []
    return {
        "completed": float(
            result.get("status") in {"completed", "timeout"}
            and isinstance(result.get("test_f1_macro"), (int, float))
        ),
        "qualified": float(numeric(result.get("validation_f1_macro")) >= threshold),
        "time_to_quality_seconds_censored": (
            float(target) / 1000.0 if isinstance(target, (int, float)) else selection_seconds
        ),
        "test_f1_macro": numeric(result.get("test_f1_macro")),
        "subset_size": float(len(features)) if features else numeric(result.get("selected_feature_count")),
        "construction_count": numeric(result.get("construction_evaluation_count")),
        "local_search_count": numeric(result.get("local_search_evaluation_count")),
    }


def finite_median(values: list[float]) -> float:
    array = np.asarray(values, dtype=float)
    array = array[np.isfinite(array)]
    return float(np.median(array)) if len(array) else math.nan


def batch_resources(
    architecture: str,
    result_path: Path,
    batch: dict[str, Any],
    parse_resources,
) -> dict[str, float]:
    if architecture == "distributed":
        resource = parse_resources(result_path.parent / "resource-samples.jsonl")
        return {
            "cpu_cores_median": numeric(resource.get("cpu_cores_median")),
            "cpu_cores_peak": numeric(resource.get("cpu_cores_peak")),
            "memory_mib_median": numeric(resource.get("memory_mib_median")),
            "memory_mib_peak": numeric(resource.get("memory_mib_peak")),
        }
    resources = []
    for job in batch["jobs"]:
        path = Path(job["result_path"]).parent / "resource-samples.jsonl"
        if path.exists():
            resources.append(parse_resources(path))
    return {
        "cpu_cores_median": float(sum(numeric(item.get("cpu_cores_median")) for item in resources)),
        "cpu_cores_peak": float(sum(numeric(item.get("cpu_cores_peak")) for item in resources)),
        "memory_mib_median": float(sum(numeric(item.get("memory_mib_median")) for item in resources)),
        "memory_mib_peak": float(sum(numeric(item.get("memory_mib_peak")) for item in resources)),
    }


def load_batches(state_path: Path, repo_root: Path, expected_pairs: int = 30) -> pd.DataFrame:
    state = json.loads(state_path.read_text(encoding="utf-8"))
    accepted_states = {"CAMPAIGN_COMPLETED", "CAMPAIGN_TARGET_COMPLETED", "STOPPED_AT_TARGET"}
    if state.get("state") not in accepted_states:
        raise RuntimeError(f"campaign is not frozen at a valid endpoint: {state.get('state')}")
    frozen = json.loads((state_path.parent / "frozen-manifest.json").read_text(encoding="utf-8"))
    configuration = frozen["configuration"]
    thresholds = configuration["quality_thresholds"]
    selection_seconds = (
        configuration["run_timeout_seconds"] - configuration["finalization_reserve_seconds"]
    )
    parse_resources = load_resource_parser(repo_root)
    rows = []
    for completed in state["completed"]:
        result_path = remap_result(state_path, completed["result_path"])
        errors = verify_checksums(result_path.parent, result_path.parent / "checksums.sha256")
        if errors:
            raise RuntimeError("; ".join(errors[:10]))
        batch = json.loads(result_path.read_text(encoding="utf-8"))
        architecture = completed["architecture"]
        threshold = float(thresholds[completed["scenario"]])
        jobs = [
            (distributed_job(job, threshold, selection_seconds)
             if architecture == "distributed"
             else monolith_job(job, threshold, selection_seconds))
            for job in batch["jobs"]
        ]
        resources = batch_resources(architecture, result_path, batch, parse_resources)
        qualified = sum(job["qualified"] for job in jobs)
        completed_count = sum(job["completed"] for job in jobs)
        local_count = sum(job["local_search_count"] for job in jobs if math.isfinite(job["local_search_count"]))
        construction_count = sum(job["construction_count"] for job in jobs if math.isfinite(job["construction_count"]))
        row = {
            "scenario": completed["scenario"],
            "concurrency": int(completed["load"]),
            "batch_seed": int(completed["batch_seed"]),
            "architecture": architecture,
            "batch_id": completed["batch_id"],
            "result_sha256": sha256_file(result_path),
            "selection_seconds": selection_seconds,
            "requested_job_count": int(completed["load"]),
            "completed_job_count": completed_count,
            "qualified_job_count": qualified,
            "completed_jobs_per_minute": completed_count / (selection_seconds / 60.0),
            "qualified_jobs_per_minute": qualified / (selection_seconds / 60.0),
            "median_time_to_quality_seconds_censored": finite_median(
                [job["time_to_quality_seconds_censored"] for job in jobs]
            ),
            "median_test_f1_macro": finite_median([job["test_f1_macro"] for job in jobs]),
            "median_subset_size": finite_median([job["subset_size"] for job in jobs]),
            "construction_evaluation_count": construction_count,
            "local_search_evaluation_count": local_count,
            "local_search_evaluations_per_second": local_count / selection_seconds,
            **resources,
        }
        row["estimated_cpu_core_seconds"] = row["cpu_cores_median"] * selection_seconds
        row["cpu_core_seconds_per_qualified_job"] = (
            row["estimated_cpu_core_seconds"] / qualified if qualified > 0 else math.inf
        )
        rows.append(row)
    frame = pd.DataFrame(rows).sort_values(
        ["scenario", "concurrency", "batch_seed", "architecture"]
    )
    expected = {
        (scenario, load, seed, architecture)
        for scenario in configuration["scenarios"]
        for load in configuration["loads"]
        for seed in configuration["batch_seeds"][:expected_pairs]
        for architecture in configuration["architectures"]
    }
    actual = set(zip(frame.scenario, frame.concurrency, frame.batch_seed, frame.architecture))
    if actual != expected:
        raise RuntimeError(f"unexpected campaign cells: missing={len(expected-actual)} extra={len(actual-expected)}")
    return frame


def bootstrap_median_ci(values: np.ndarray, rng: np.random.Generator) -> tuple[float, float]:
    samples = rng.choice(values, size=(BOOTSTRAP_REPETITIONS, len(values)), replace=True)
    medians = np.median(samples, axis=1)
    return float(np.quantile(medians, 0.025)), float(np.quantile(medians, 0.975))


def paired_permutation_p(values: np.ndarray, rng: np.random.Generator) -> float:
    observed = abs(float(np.mean(values)))
    if len(values) <= 18:
        masks = np.arange(1 << len(values), dtype=np.uint64)[:, None]
        bits = (masks >> np.arange(len(values), dtype=np.uint64)) & 1
        signs = np.where(bits == 1, 1.0, -1.0)
    else:
        signs = rng.choice((-1.0, 1.0), size=(PERMUTATION_REPETITIONS, len(values)))
    permuted = np.abs(np.mean(signs * values, axis=1))
    return float((np.count_nonzero(permuted >= observed - 1e-15) + 1) / (len(permuted) + 1))


def holm_adjust(values: list[float]) -> list[float]:
    order = np.argsort(values)
    adjusted = [0.0] * len(values)
    running = 0.0
    count = len(values)
    for rank, index in enumerate(order):
        running = max(running, min(1.0, (count - rank) * values[index]))
        adjusted[index] = running
    return adjusted


METRICS = [
    ("qualified_job_count", "higher", "primary"),
    ("completed_job_count", "higher", "primary"),
    ("median_time_to_quality_seconds_censored", "lower", "primary"),
    ("local_search_evaluations_per_second", "higher", "throughput"),
    ("median_test_f1_macro", "higher", "quality"),
    ("estimated_cpu_core_seconds", "lower", "resource"),
    ("memory_mib_peak", "lower", "resource"),
]


def paired_comparisons(frame: pd.DataFrame, expected_pairs: int = 30) -> pd.DataFrame:
    rng = np.random.default_rng(BOOTSTRAP_SEED)
    rows = []
    for scenario in sorted(frame.scenario.unique()):
        for load in sorted(frame.concurrency.unique()):
            group = frame[(frame.scenario == scenario) & (frame.concurrency == load)]
            pivoted = {
                metric: group.pivot(index="batch_seed", columns="architecture", values=metric)
                for metric, _direction, _family in METRICS
            }
            for metric, direction, family in METRICS:
                pivot = pivoted[metric].dropna()
                raw = (
                    pivot["distributed"].to_numpy(float)
                    - pivot["monolith"].to_numpy(float)
                )
                finite = raw[np.isfinite(raw)]
                if metric != "median_test_f1_macro" and len(finite) != expected_pairs:
                    raise RuntimeError(f"{scenario} load={load} metric={metric} has {len(finite)} finite pairs")
                if len(finite):
                    low, high = bootstrap_median_ci(finite, rng)
                    p_value = paired_permutation_p(finite, rng)
                    difference = float(np.median(finite))
                else:
                    low = high = difference = math.nan
                    p_value = 1.0
                rows.append({
                    "scenario": scenario,
                    "concurrency": load,
                    "metric": metric,
                    "direction_favoring_distributed": direction,
                    "family": family,
                    "paired_count": len(finite),
                    "distributed_median": float(np.median(pivot["distributed"])),
                    "monolith_median": float(np.median(pivot["monolith"])),
                    "paired_median_difference_distributed_minus_monolith": difference,
                    "paired_median_ci_low": low,
                    "paired_median_ci_high": high,
                    "p_permutation": p_value,
                })
    for family in sorted({row["family"] for row in rows}):
        indexes = [index for index, row in enumerate(rows) if row["family"] == family]
        adjusted = holm_adjust([rows[index]["p_permutation"] for index in indexes])
        for index, value in zip(indexes, adjusted):
            rows[index]["p_holm_within_family"] = value
    return pd.DataFrame(rows)


def summaries(frame: pd.DataFrame) -> pd.DataFrame:
    numeric_columns = [
        column for column in frame.select_dtypes(include="number").columns
        if column != "batch_seed"
    ]
    return (
        frame.groupby(["scenario", "concurrency", "architecture"])[numeric_columns]
        .agg(["median", "mean", "std", "min", "max"])
        .reset_index()
    )


def plot_capacity(frame: pd.DataFrame, output: Path) -> None:
    colors = {"distributed": "#2563EB", "monolith": "#D97706"}
    fig, axes = plt.subplots(2, 2, figsize=(11, 7), sharex=True)
    metrics = [
        ("qualified_job_count", "Qualified jobs / batch"),
        ("local_search_evaluations_per_second", "IWSSR evaluations / s"),
    ]
    for row_index, scenario in enumerate(("suspension", "fabrication")):
        for column_index, (metric, label) in enumerate(metrics):
            axis = axes[row_index, column_index]
            group = frame[frame.scenario == scenario]
            for architecture in ("distributed", "monolith"):
                values = group[group.architecture == architecture]
                medians = values.groupby("concurrency")[metric].median()
                axis.plot(medians.index, medians.values, marker="o", label=architecture.title(),
                          color=colors[architecture])
            axis.set_xscale("log", base=2)
            axis.set_xticks([1, 2, 4, 8, 16])
            axis.set_xticklabels(["1", "2", "4", "8", "16"])
            axis.set_title(scenario.title())
            axis.set_ylabel(label)
            axis.grid(alpha=0.25)
            if row_index == 1:
                axis.set_xlabel("Concurrent jobs")
    axes[0, 0].legend()
    fig.tight_layout()
    fig.savefig(output / "concurrent-load-capacity.pdf", bbox_inches="tight")
    fig.savefig(output / "concurrent-load-capacity.png", dpi=220, bbox_inches="tight")
    plt.close(fig)


def write_report(frame: pd.DataFrame, comparisons: pd.DataFrame, output: Path, exploratory: bool) -> None:
    lines = [
        "# Concurrent-load campaign analysis",
        "",
        f"- Valid batch cells: {len(frame)}.",
        "- Experimental unit: paired batch seed; jobs inside a batch are not independent replicates.",
        "- Positive paired differences are distributed minus monolith.",
        "- Interpretation: exploratory effect sizes; not a confirmatory superiority test."
        if exploratory else "- Interpretation: preregistered confirmatory analysis.",
        "",
    ]
    for scenario in sorted(frame.scenario.unique()):
        lines.extend([f"## {scenario.title()}", ""])
        for load in sorted(frame.concurrency.unique()):
            subset = comparisons[
                (comparisons.scenario == scenario) & (comparisons.concurrency == load)
            ]
            primary = subset[subset.metric == "qualified_job_count"].iloc[0]
            throughput = subset[subset.metric == "local_search_evaluations_per_second"].iloc[0]
            lines.extend([
                f"### Concurrency {load}",
                "",
                f"- Qualified jobs, median: distributed {primary.distributed_median:.3f}; monolith {primary.monolith_median:.3f}; paired difference {primary.paired_median_difference_distributed_minus_monolith:+.3f} (95% bootstrap CI {primary.paired_median_ci_low:+.3f} to {primary.paired_median_ci_high:+.3f}; Holm p={primary.p_holm_within_family:.6g}).",
                f"- IWSSR/s, median: distributed {throughput.distributed_median:.3f}; monolith {throughput.monolith_median:.3f}; Holm p={throughput.p_holm_within_family:.6g}.",
                "",
            ])
    (output / "analysis-report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--state", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--expected-pairs", type=int, default=30)
    parser.add_argument("--exploratory", action="store_true")
    args = parser.parse_args()
    if args.expected_pairs <= 0:
        parser.error("expected pairs must be positive")
    repo_root = Path(__file__).resolve().parents[2]
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    frame = load_batches(args.state.resolve(), repo_root)
    comparisons = paired_comparisons(frame)
    frame.to_csv(output / "batch-level-results.csv", index=False)
    summaries(frame).to_csv(output / "scenario-load-architecture-summary.csv", index=False)
    comparisons.to_csv(output / "paired-comparisons.csv", index=False)
    plot_capacity(frame, output)
    write_report(frame, comparisons, output, args.exploratory)
    provenance = {
        "analysis_commit": subprocess_commit(repo_root),
        "state_sha256": sha256_file(args.state.resolve()),
        "frozen_manifest_sha256": sha256_file(args.state.resolve().parent / "frozen-manifest.json"),
        "bootstrap_seed": BOOTSTRAP_SEED,
        "bootstrap_repetitions": BOOTSTRAP_REPETITIONS,
        "permutation_repetitions": PERMUTATION_REPETITIONS,
        "batch_count": len(frame),
        "expected_pairs": args.expected_pairs,
        "exploratory": args.exploratory,
    }
    (output / "analysis-provenance.json").write_text(
        json.dumps(provenance, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    return 0


def subprocess_commit(repo_root: Path) -> str:
    import subprocess
    return subprocess.run(
        ["git", "rev-parse", "HEAD"], cwd=repo_root, check=True,
        capture_output=True, text=True,
    ).stdout.strip()


if __name__ == "__main__":
    raise SystemExit(main())
