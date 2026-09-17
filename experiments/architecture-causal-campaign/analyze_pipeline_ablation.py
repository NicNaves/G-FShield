#!/usr/bin/env python3
"""Analyze the preregistered G-FShield pipeline-ablation campaign."""

from __future__ import annotations

import argparse
import ast
import hashlib
import importlib.util
import json
import math
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd


def load_module(name: str, filename: str):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    if spec is None or spec.loader is None:
        raise RuntimeError(f"could not load {filename}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


base = load_module("pipeline_ablation_base_analysis", "analyze_results.py")
quality = load_module("pipeline_ablation_quality_analysis", "analyze_quality_yield.py")

ANALYSIS_SEED = 20260917
PERMUTATIONS = 200_000
BOOTSTRAPS = 20_000
QUALITY_THRESHOLD = 0.945
NONINFERIORITY_MARGIN = -0.005
ARMS = ["monolith", "distributed-w1", "distributed-w2", "distributed-w4"]
DISTRIBUTED_ARMS = ["distributed-w1", "distributed-w2", "distributed-w4"]


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def relocated_run_dir(completed: dict, results_root: Path | None) -> Path:
    original = Path(completed["result_path"]).parent
    if original.exists() or results_root is None:
        return original
    return (
        results_root
        / completed["arm"]
        / f"seed-{int(completed['seed'])}"
        / completed["run_id"]
    )


def quality_yield_metrics(candidates: list[dict], horizon_seconds: float) -> dict:
    first_seen: dict[tuple[int, ...], float] = {}
    first_qualified: dict[tuple[int, ...], float] = {}
    for candidate in candidates:
        features = tuple(candidate["features"])
        elapsed_seconds = max(0.0, float(candidate["elapsed_ms"]) / 1000.0)
        first_seen[features] = min(first_seen.get(features, math.inf), elapsed_seconds)
        if float(candidate["f1"]) >= QUALITY_THRESHOLD:
            first_qualified[features] = min(
                first_qualified.get(features, math.inf), elapsed_seconds
            )
    qualified_times = sorted(
        time for time in first_qualified.values() if time <= horizon_seconds
    )
    auc = sum(horizon_seconds - time for time in qualified_times) / horizon_seconds
    count = len(qualified_times)
    return {
        "unique_candidate_count": len(first_seen),
        "distinct_qualified_count": count,
        "quality_yield_auc_normalized": auc,
        "qualified_subset_throughput": count / horizon_seconds,
        "reached_quality_threshold": count > 0,
        "time_to_first_qualified_seconds_censored": (
            qualified_times[0] if qualified_times else horizon_seconds
        ),
    }


def one_sided_sign_flip(values: np.ndarray, seed: int) -> float:
    observed = float(np.mean(values))
    rng = np.random.default_rng(seed)
    exceed = 0
    for start in range(0, PERMUTATIONS, 10_000):
        size = min(10_000, PERMUTATIONS - start)
        signs = rng.choice((-1.0, 1.0), size=(size, len(values)))
        exceed += int(np.sum(np.mean(signs * values, axis=1) >= observed - 1e-15))
    return (exceed + 1.0) / (PERMUTATIONS + 1.0)


def bootstrap_mean_interval(
    values: np.ndarray, low: float, high: float, seed: int
) -> tuple[float, float]:
    rng = np.random.default_rng(seed)
    samples = rng.choice(values, size=(BOOTSTRAPS, len(values)), replace=True)
    means = np.mean(samples, axis=1)
    return float(np.quantile(means, low)), float(np.quantile(means, high))


def holm_adjust(p_values: dict[str, float]) -> dict[str, float]:
    ordered = sorted(p_values, key=p_values.get)
    adjusted: dict[str, float] = {}
    running = 0.0
    total = len(ordered)
    for rank, name in enumerate(ordered):
        candidate = min(1.0, (total - rank) * p_values[name])
        running = max(running, candidate)
        adjusted[name] = running
    return adjusted


def load_rows(
    state_path: Path, results_root: Path | None
) -> pd.DataFrame:
    state = json.loads(state_path.read_text(encoding="utf-8"))
    if state.get("state") != "CAMPAIGN_COMPLETED":
        raise RuntimeError(f"campaign is not complete: {state.get('state')}")
    manifest = json.loads(
        (state_path.parent / "frozen-manifest.json").read_text(encoding="utf-8")
    )
    protocol = manifest["protocol"]
    repo_root = Path(__file__).resolve().parents[2]
    parse_resources = base.load_resource_parser(repo_root)
    rows = []
    checksum_errors = []
    for completed in state["completed"]:
        run_dir = relocated_run_dir(completed, results_root)
        checksum_path = run_dir / "checksums.sha256"
        if sha256_file(checksum_path) != completed["checksums_sha256"]:
            checksum_errors.append(f"state checksum mismatch {checksum_path}")
        checksum_errors.extend(base.verify_checksums(run_dir, checksum_path))
        result = json.loads((run_dir / "final-result.json").read_text(encoding="utf-8"))
        architecture = completed["architecture"]
        arm = completed["arm"]
        resources = parse_resources(run_dir / "resource-samples.jsonl")
        trace = base.read_best_trace(run_dir, architecture)
        if not trace:
            raise RuntimeError(f"missing internal candidate trace in {run_dir}")
        horizon = float(
            result.get(
                "selection_duration_ms",
                protocol["measurement_window"]["selection_seconds"] * 1000.0,
            )
        ) / 1000.0
        anytime = base.anytime_metrics(trace, horizon)
        phases = base.pipeline_metrics(run_dir, architecture, horizon)
        if architecture == "distributed":
            candidates = quality.distributed_candidates(run_dir, result)
            persisted_count = len(candidates)
        else:
            candidates = quality.monolith_candidates(run_dir, result)
            persisted_count = quality.monolith_trace_count(run_dir)
        if persisted_count != int(result["candidate_count"]):
            raise RuntimeError(
                f"candidate trace mismatch in {run_dir}: "
                f"{persisted_count} != {result['candidate_count']}"
            )
        yield_values = quality_yield_metrics(candidates, horizon)
        selection_elapsed = float(
            result.get(
                "selection_elapsed_ms",
                horizon * 1000.0
                if result.get("stop_reason") == "run_timeout"
                else min(float(result["end_to_end_time_ms"]), horizon * 1000.0),
            )
        ) / 1000.0
        cpu_cores = float(resources.get("cpu_cores_median", math.nan))
        memory_mib = float(resources.get("memory_mib_median", math.nan))
        if not math.isfinite(cpu_cores) or not math.isfinite(memory_mib):
            raise RuntimeError(f"missing resource samples in {run_dir}")
        candidates_count = int(result["candidate_count"])
        cpu_hours = cpu_cores * selection_elapsed / 3600.0
        memory_gib_hours = memory_mib / 1024.0 * selection_elapsed / 3600.0
        row = {
            "arm": arm,
            "architecture": architecture,
            "pipeline_workers": int(completed["pipeline_workers"]),
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
            "selection_elapsed_seconds": selection_elapsed,
            "candidate_count": candidates_count,
            "candidates_per_second": candidates_count / selection_elapsed,
            "cpu_cores_median": cpu_cores,
            "memory_mib_median": memory_mib,
            "cpu_hours": cpu_hours,
            "memory_gib_hours": memory_gib_hours,
            "cpu_hours_per_candidate": cpu_hours / candidates_count,
            "memory_gib_hours_per_candidate": memory_gib_hours / candidates_count,
            "selection_horizon_seconds": horizon,
            "stop_reason": result["stop_reason"],
        }
        row.update(anytime)
        row.update(phases)
        row.update(yield_values)
        qualified_count = int(yield_values["distinct_qualified_count"])
        row["cpu_hours_per_qualified_subset"] = (
            cpu_hours / qualified_count if qualified_count else math.nan
        )
        row["memory_gib_hours_per_qualified_subset"] = (
            memory_gib_hours / qualified_count if qualified_count else math.nan
        )
        rows.append(row)
    if checksum_errors:
        raise RuntimeError("; ".join(checksum_errors))
    frame = pd.DataFrame(rows)
    counts = frame.groupby(["arm", "seed"]).size()
    if (
        len(frame) != 100
        or set(frame["arm"]) != set(ARMS)
        or not (counts == 1).all()
        or frame.groupby("seed")["arm"].nunique().min() != 4
    ):
        raise RuntimeError("results do not form 25 complete four-arm seed blocks")
    return frame.sort_values(["seed", "arm"])


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--state", type=Path, required=True)
    parser.add_argument("--results-root", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    manifest = json.loads(
        (args.state.parent / "frozen-manifest.json").read_text(encoding="utf-8")
    )
    protocol = manifest["protocol"]
    if (
        float(protocol["hypotheses"]["quality_threshold_validation_macro_f1"])
        != QUALITY_THRESHOLD
    ):
        raise RuntimeError("analyzer threshold differs from frozen protocol")
    frame = load_rows(args.state, args.results_root)
    pivot_auc = frame.pivot(index="seed", columns="arm", values="quality_yield_auc_normalized")
    seeds = sorted(pivot_auc.index)
    slopes = (
        pivot_auc.loc[seeds, "distributed-w4"].to_numpy(float)
        - pivot_auc.loc[seeds, "distributed-w1"].to_numpy(float)
    ) / 2.0
    primary_p = one_sided_sign_flip(slopes, ANALYSIS_SEED)
    primary_ci = bootstrap_mean_interval(slopes, 0.025, 0.975, ANALYSIS_SEED + 1)

    contrast_pairs = {
        "distributed-w1_minus_monolith": ("distributed-w1", "monolith"),
        "distributed-w2_minus_monolith": ("distributed-w2", "monolith"),
        "distributed-w4_minus_monolith": ("distributed-w4", "monolith"),
        "distributed-w2_minus_distributed-w1": ("distributed-w2", "distributed-w1"),
        "distributed-w4_minus_distributed-w2": ("distributed-w4", "distributed-w2"),
        "distributed-w4_minus_distributed-w1": ("distributed-w4", "distributed-w1"),
    }
    contrasts = {}
    raw_p = {}
    for index, (name, (left, right)) in enumerate(contrast_pairs.items()):
        differences = (
            pivot_auc.loc[seeds, left].to_numpy(float)
            - pivot_auc.loc[seeds, right].to_numpy(float)
        )
        raw_p[name] = one_sided_sign_flip(differences, ANALYSIS_SEED + 10 + index)
        ci = bootstrap_mean_interval(
            differences, 0.025, 0.975, ANALYSIS_SEED + 20 + index
        )
        contrasts[name] = {
            "mean_difference": float(np.mean(differences)),
            "median_difference": float(np.median(differences)),
            "bootstrap_95_ci": list(ci),
            "wins": int(np.sum(differences > 0)),
            "ties": int(np.sum(differences == 0)),
            "losses": int(np.sum(differences < 0)),
            "one_sided_permutation_p": raw_p[name],
        }
    adjusted = holm_adjust(raw_p)
    for name, value in adjusted.items():
        contrasts[name]["holm_adjusted_p"] = value

    pivot_quality = frame.pivot(index="seed", columns="arm", values="test_f1_macro")
    quality_difference = (
        pivot_quality.loc[seeds, "distributed-w4"].to_numpy(float)
        - pivot_quality.loc[seeds, "monolith"].to_numpy(float)
    )
    quality_lower, _ = bootstrap_mean_interval(
        quality_difference, 0.05, 1.0, ANALYSIS_SEED + 100
    )
    medians = (
        frame.groupby("arm")
        .median(numeric_only=True)
        .reindex(ARMS)
    )
    d1_mean = float(pivot_auc["distributed-w1"].mean())
    d2_mean = float(pivot_auc["distributed-w2"].mean())
    d4_mean = float(pivot_auc["distributed-w4"].mean())
    dose_response = d2_mean >= d1_mean and d4_mean >= d2_mean
    mechanism = (
        all(
            float(medians.loc[arm, "local_search_overlap_percent"]) > 0.0
            for arm in DISTRIBUTED_ARMS
        )
        and abs(float(medians.loc["monolith", "local_search_overlap_percent"])) < 1e-12
    )
    supported = (
        float(np.mean(slopes)) > 0.0
        and primary_p <= 0.05
        and dose_response
        and quality_lower >= NONINFERIORITY_MARGIN
        and mechanism
    )

    args.output.mkdir(parents=True, exist_ok=True)
    frame.to_csv(args.output / "run-level-pipeline-ablation.csv", index=False)
    result = {
        "campaign_id": protocol["campaign_id"],
        "paired_seed_count": len(seeds),
        "run_count": len(frame),
        "quality_threshold": QUALITY_THRESHOLD,
        "primary_mean_slope_per_worker_doubling": float(np.mean(slopes)),
        "primary_median_slope_per_worker_doubling": float(np.median(slopes)),
        "primary_bootstrap_95_ci": list(primary_ci),
        "primary_one_sided_permutation_p": primary_p,
        "dose_response_mean_auc": {
            "distributed-w1": d1_mean,
            "distributed-w2": d2_mean,
            "distributed-w4": d4_mean,
        },
        "dose_response_guardrail_satisfied": dose_response,
        "quality_guardrail_lower_95": quality_lower,
        "quality_guardrail_margin": NONINFERIORITY_MARGIN,
        "mechanism_guardrail_satisfied": mechanism,
        "pipeline_scaling_supported": supported,
        "arm_medians": {
            arm: {
                "quality_yield_auc_normalized": float(
                    medians.loc[arm, "quality_yield_auc_normalized"]
                ),
                "distinct_qualified_count": float(
                    medians.loc[arm, "distinct_qualified_count"]
                ),
                "candidates_per_second": float(
                    medians.loc[arm, "candidates_per_second"]
                ),
                "local_search_overlap_percent": float(
                    medians.loc[arm, "local_search_overlap_percent"]
                ),
                "test_f1_macro": float(medians.loc[arm, "test_f1_macro"]),
                "cpu_cores_median": float(medians.loc[arm, "cpu_cores_median"]),
                "memory_mib_median": float(medians.loc[arm, "memory_mib_median"]),
                "cpu_hours_per_qualified_subset_aggregate": float(
                    frame.loc[frame.arm == arm, "cpu_hours"].sum()
                    / frame.loc[frame.arm == arm, "distinct_qualified_count"].sum()
                ) if frame.loc[frame.arm == arm, "distinct_qualified_count"].sum() else None,
                "memory_gib_hours_per_qualified_subset_aggregate": float(
                    frame.loc[frame.arm == arm, "memory_gib_hours"].sum()
                    / frame.loc[frame.arm == arm, "distinct_qualified_count"].sum()
                ) if frame.loc[frame.arm == arm, "distinct_qualified_count"].sum() else None,
            }
            for arm in ARMS
        },
        "quality_yield_auc_contrasts": contrasts,
    }
    (args.output / "pipeline-ablation-result.json").write_text(
        json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )

    fig, axes = plt.subplots(1, 2, figsize=(11.0, 4.3))
    values = [
        frame.loc[frame.arm == arm, "quality_yield_auc_normalized"].to_numpy()
        for arm in ARMS
    ]
    axes[0].boxplot(values, labels=["Monolith", "G-F w1", "G-F w2", "G-F w4"])
    axes[0].set_ylabel("Normalized quality-yield AUC")
    axes[0].set_title("Quality-yield distribution")
    worker_x = np.array([1, 2, 4])
    worker_medians = [
        float(medians.loc[f"distributed-w{worker}", "quality_yield_auc_normalized"])
        for worker in worker_x
    ]
    axes[1].plot(worker_x, worker_medians, marker="o")
    axes[1].set_xscale("log", base=2)
    axes[1].set_xticks(worker_x, labels=["1", "2", "4"])
    axes[1].set_xlabel("Pipeline consumers")
    axes[1].set_ylabel("Median normalized quality-yield AUC")
    axes[1].set_title("Pipeline ablation")
    fig.tight_layout()
    fig.savefig(args.output / "pipeline-ablation.pdf")
    fig.savefig(args.output / "pipeline-ablation.png", dpi=220)
    plt.close(fig)

    (args.output / "analysis-provenance.json").write_text(
        json.dumps(
            {
                "analysis_scope": "preregistered_pipeline_ablation",
                "analysis_seed": ANALYSIS_SEED,
                "bootstrap_repetitions": BOOTSTRAPS,
                "permutation_repetitions": PERMUTATIONS,
                "state_sha256": sha256_file(args.state),
            },
            indent=2,
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
