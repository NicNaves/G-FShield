#!/usr/bin/env python3
"""Analyze the independently confirmed quality-yield architecture hypothesis."""

from __future__ import annotations

import argparse
import ast
import hashlib
import importlib.util
import json
import re
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

try:
    import analyze_results as base
except ModuleNotFoundError:
    _base_spec = importlib.util.spec_from_file_location(
        "analyze_results", Path(__file__).with_name("analyze_results.py")
    )
    if _base_spec is None or _base_spec.loader is None:
        raise RuntimeError("could not load the causal base analyzer")
    base = importlib.util.module_from_spec(_base_spec)
    _base_spec.loader.exec_module(base)


ANALYSIS_SEED = 20260906
REPETITIONS = 200_000
BOOTSTRAPS = 20_000
QUALITY_THRESHOLD = 0.945
NONINFERIORITY_MARGIN = -0.005
DISTRIBUTED_EVENT = re.compile(
    r"(?:rcl generation ready|dls iteration search=IWSSR).*?"
    r"f1=([-+0-9.Ee]+).*?features=(\[[^]]*\]).*?campaignElapsedMs=(\d+)"
)


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
        / completed["architecture"]
        / f"seed-{int(completed['seed'])}"
        / completed["run_id"]
    )


def distributed_candidates(run_dir: Path, result: dict) -> list[dict]:
    offset = float(result.get("measurement_start_offset_ms", 0.0))
    horizon = float(result["selection_duration_ms"])
    candidates = []
    for line in (run_dir / "compose.log").read_text(
        encoding="utf-8", errors="replace"
    ).splitlines():
        match = DISTRIBUTED_EVENT.search(line)
        if not match:
            continue
        elapsed = max(0.0, float(match.group(3)) - offset)
        if elapsed > horizon:
            continue
        # Java services use one-based feature identifiers; the paired monolith
        # and Weka evaluator use zero-based column indexes.
        features = tuple(sorted(int(value) - 1 for value in ast.literal_eval(match.group(2))))
        candidates.append(
            {"elapsed_ms": elapsed, "f1": float(match.group(1)), "features": features}
        )
    return candidates


def monolith_candidates(run_dir: Path, result: dict) -> list[dict]:
    horizon = float(result.get("selection_duration_ms") or 2_700_000.0)
    path = run_dir / "all-candidate-trace.jsonl"
    if not path.exists():
        raise RuntimeError(f"missing all-candidate trace in {run_dir}")
    candidates = []
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        if not line.strip():
            continue
        row = json.loads(line)
        elapsed = float(row["monotonic_elapsed_ms"])
        if elapsed <= horizon:
            candidates.append(
                {
                    "elapsed_ms": elapsed,
                    "f1": float(row["validation_f1_macro"]),
                    "features": tuple(sorted(int(value) for value in row["selected_features"])),
                }
            )
    return candidates


def monolith_trace_count(run_dir: Path) -> int:
    """Count every persisted trace row, including post-deadline completions."""
    path = run_dir / "all-candidate-trace.jsonl"
    if not path.exists():
        raise RuntimeError(f"missing all-candidate trace in {run_dir}")
    return sum(
        1
        for line in path.read_text(encoding="utf-8", errors="replace").splitlines()
        if line.strip()
    )


def yield_metrics(candidates: list[dict], horizon_seconds: float) -> dict:
    unique: dict[tuple[int, ...], dict] = {}
    for candidate in candidates:
        current = unique.get(candidate["features"])
        if current is None:
            unique[candidate["features"]] = {
                **candidate,
                "qualified_elapsed_ms": (
                    candidate["elapsed_ms"]
                    if candidate["f1"] >= QUALITY_THRESHOLD
                    else float("inf")
                ),
            }
            continue
        current["f1"] = max(current["f1"], candidate["f1"])
        current["elapsed_ms"] = min(current["elapsed_ms"], candidate["elapsed_ms"])
        if candidate["f1"] >= QUALITY_THRESHOLD:
            current["qualified_elapsed_ms"] = min(
                current["qualified_elapsed_ms"], candidate["elapsed_ms"]
            )
    qualifying = [row for row in unique.values() if row["f1"] >= QUALITY_THRESHOLD]
    first_seconds = min(
        (row["qualified_elapsed_ms"] / 1000.0 for row in qualifying),
        default=horizon_seconds,
    )
    count = len(qualifying)
    return {
        "unique_candidate_count": len(unique),
        "distinct_qualified_count": count,
        "qualified_subset_throughput": count / horizon_seconds,
        "reached_quality_threshold": count > 0,
        "time_to_first_qualified_seconds_censored": first_seconds,
    }


def paired_one_sided_permutation(differences: np.ndarray) -> float:
    observed = float(np.mean(differences))
    rng = np.random.default_rng(ANALYSIS_SEED)
    exceed = 0
    for start in range(0, REPETITIONS, 10_000):
        size = min(10_000, REPETITIONS - start)
        signs = rng.choice((-1.0, 1.0), size=(size, len(differences)))
        exceed += int(np.sum(np.mean(signs * differences, axis=1) >= observed - 1e-15))
    return (exceed + 1.0) / (REPETITIONS + 1.0)


def bootstrap_interval(values: np.ndarray, low: float, high: float, seed: int) -> tuple[float, float]:
    rng = np.random.default_rng(seed)
    samples = rng.choice(values, size=(BOOTSTRAPS, len(values)), replace=True)
    means = np.mean(samples, axis=1)
    return float(np.quantile(means, low)), float(np.quantile(means, high))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--state", type=Path, required=True)
    parser.add_argument("--results-root", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    state = json.loads(args.state.read_text(encoding="utf-8"))
    if state.get("state") != "CAMPAIGN_COMPLETED":
        raise RuntimeError(f"campaign is not complete: {state.get('state')}")
    protocol = json.loads((args.state.parent / "frozen-manifest.json").read_text(encoding="utf-8"))["protocol"]
    declared = protocol["hypotheses"]
    if float(declared["quality_threshold_validation_macro_f1"]) != QUALITY_THRESHOLD:
        raise RuntimeError("analyzer threshold differs from frozen protocol")
    runs = base.load_runs(args.state, results_root=args.results_root)
    rows = []
    for completed in state["completed"]:
        run_dir = relocated_run_dir(completed, args.results_root)
        result = json.loads((run_dir / "final-result.json").read_text(encoding="utf-8"))
        if completed["architecture"] == "distributed":
            candidates = distributed_candidates(run_dir, result)
            persisted_count = len(candidates)
        else:
            candidates = monolith_candidates(run_dir, result)
            persisted_count = monolith_trace_count(run_dir)
        if persisted_count != int(result["candidate_count"]):
            raise RuntimeError(
                f"candidate trace mismatch in {run_dir}: "
                f"{persisted_count} != {result['candidate_count']}"
            )
        metrics = yield_metrics(
            candidates,
            float(result.get("selection_duration_ms") or 2_700_000) / 1000.0,
        )
        rows.append({"architecture": completed["architecture"], "seed": int(completed["seed"]), **metrics})
    yields = pd.DataFrame(rows).sort_values(["seed", "architecture"])
    enriched = runs.merge(yields, on=["architecture", "seed"], validate="one_to_one")
    distributed = enriched[enriched.architecture == "distributed"].set_index("seed")
    monolith = enriched[enriched.architecture == "monolith"].set_index("seed")
    seeds = sorted(distributed.index)
    primary = (
        distributed.loc[seeds, "distinct_qualified_count"].to_numpy(float)
        - monolith.loc[seeds, "distinct_qualified_count"].to_numpy(float)
    )
    primary_p = paired_one_sided_permutation(primary)
    primary_low, primary_high = bootstrap_interval(primary, 0.025, 0.975, ANALYSIS_SEED + 1)
    quality = (
        distributed.loc[seeds, "test_f1_macro"].to_numpy(float)
        - monolith.loc[seeds, "test_f1_macro"].to_numpy(float)
    )
    quality_lower, _ = bootstrap_interval(quality, 0.05, 1.0, ANALYSIS_SEED + 2)
    overlap_d = float(distributed["local_search_overlap_percent"].median())
    overlap_m = float(monolith["local_search_overlap_percent"].median())
    supported = (
        float(np.mean(primary)) > 0.0
        and primary_p <= 0.05
        and quality_lower >= NONINFERIORITY_MARGIN
        and overlap_d > overlap_m
    )
    args.output.mkdir(parents=True, exist_ok=True)
    enriched.to_csv(args.output / "run-level-quality-yield.csv", index=False)
    result = {
        "paired_seed_count": len(seeds),
        "quality_threshold": QUALITY_THRESHOLD,
        "distributed_distinct_qualified_median": float(distributed["distinct_qualified_count"].median()),
        "monolith_distinct_qualified_median": float(monolith["distinct_qualified_count"].median()),
        "paired_mean_difference": float(np.mean(primary)),
        "paired_median_difference": float(np.median(primary)),
        "paired_mean_bootstrap_95_ci": [primary_low, primary_high],
        "distributed_wins": int(np.sum(primary > 0)),
        "ties": int(np.sum(primary == 0)),
        "distributed_losses": int(np.sum(primary < 0)),
        "primary_one_sided_permutation_p": primary_p,
        "quality_guardrail_lower_95": quality_lower,
        "quality_guardrail_margin": NONINFERIORITY_MARGIN,
        "distributed_overlap_median_percent": overlap_d,
        "monolith_overlap_median_percent": overlap_m,
        "architectural_quality_yield_supported": supported,
    }
    (args.output / "quality-yield-result.json").write_text(
        json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    fig, ax = plt.subplots(figsize=(7.2, 4.2))
    ax.scatter(
        monolith.loc[seeds, "distinct_qualified_count"],
        distributed.loc[seeds, "distinct_qualified_count"], alpha=0.8,
    )
    maximum = max(enriched["distinct_qualified_count"].max(), 1)
    ax.plot([0, maximum], [0, maximum], "--", color="0.4", linewidth=1)
    ax.set_xlabel("Monolith: distinct subsets with validation macro-F1 >= 0.945")
    ax.set_ylabel("Distributed: distinct subsets with validation macro-F1 >= 0.945")
    ax.set_title("Paired quality yield within 2,700 seconds")
    fig.tight_layout()
    fig.savefig(args.output / "paired-quality-yield.pdf")
    fig.savefig(args.output / "paired-quality-yield.png", dpi=220)
    plt.close(fig)
    (args.output / "analysis-provenance.json").write_text(
        json.dumps(
            {
                "analysis_seed": ANALYSIS_SEED,
                "bootstrap_repetitions": BOOTSTRAPS,
                "permutation_repetitions": REPETITIONS,
                "state_sha256": sha256_file(args.state),
                "analysis_scope": "independent_confirmatory_quality_yield",
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
