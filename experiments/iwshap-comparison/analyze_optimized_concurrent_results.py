#!/usr/bin/env python3
"""Analyze the 100-cell post-hoc concurrent-load optimization study."""

from __future__ import annotations

import argparse
import importlib.util
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd

HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location(
    "concurrent_analysis", HERE / "analyze_concurrent_results.py"
)
ANALYSIS = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(ANALYSIS)
PROFILES = ("original", "rebalanced", "scaled-rcl")


def load_inputs(baseline_state: Path, optimization_root: Path, repo_root: Path) -> tuple[pd.DataFrame, dict]:
    study_path = optimization_root / "optimization-study-manifest.json"
    if not study_path.exists():
        raise RuntimeError(f"optimization study manifest is missing: {study_path}")
    study = json.loads(study_path.read_text(encoding="utf-8"))
    expected_hash = study["baseline"]["state_sha256"]
    if ANALYSIS.sha256_file(baseline_state) != expected_hash:
        raise RuntimeError("baseline state checksum differs from the frozen optimization manifest")
    baseline = ANALYSIS.load_batches(baseline_state, repo_root, expected_pairs=5)
    baseline["profile"] = baseline["architecture"].map(
        {"distributed": "original", "monolith": "monolith"}
    )
    frames = [baseline]
    for profile in ("rebalanced", "scaled-rcl"):
        state_path = optimization_root / profile / "state.json"
        frame = ANALYSIS.load_batches(state_path, repo_root, expected_pairs=5)
        if set(frame.architecture) != {"distributed"}:
            raise RuntimeError(f"{profile} contains a non-distributed architecture")
        frame["profile"] = profile
        frames.append(frame)
    return pd.concat(frames, ignore_index=True), study


def comparisons(frame: pd.DataFrame) -> pd.DataFrame:
    rows = []
    monolith = frame[frame.profile == "monolith"].copy()
    for profile in PROFILES:
        distributed = frame[frame.profile == profile].copy()
        distributed["architecture"] = "distributed"
        reference = monolith.copy()
        reference["architecture"] = "monolith"
        result = ANALYSIS.paired_comparisons(
            pd.concat([distributed, reference], ignore_index=True), expected_pairs=5
        )
        result.insert(0, "distributed_profile", profile)
        rows.append(result)
    return pd.concat(rows, ignore_index=True)


def plot_capacity(frame: pd.DataFrame, output: Path) -> None:
    colors = {
        "monolith": "#D97706", "original": "#6B7280",
        "rebalanced": "#2563EB", "scaled-rcl": "#059669",
    }
    fig, axes = plt.subplots(2, 2, figsize=(12, 7), sharex=True)
    metrics = (("qualified_job_count", "Qualified jobs / batch"),
               ("completed_job_count", "Completed jobs / batch"))
    for row, scenario in enumerate(("suspension", "fabrication")):
        for column, (metric, label) in enumerate(metrics):
            axis = axes[row, column]
            subset = frame[frame.scenario == scenario]
            for profile in ("monolith", *PROFILES):
                values = subset[subset.profile == profile].groupby("concurrency")[metric].median()
                axis.plot(values.index, values.values, marker="o", label=profile, color=colors[profile])
            axis.set_xscale("log", base=2)
            axis.set_xticks([1, 2, 4, 8, 16])
            axis.set_xticklabels(["1", "2", "4", "8", "16"])
            axis.set_title(scenario.title())
            axis.set_ylabel(label)
            axis.grid(alpha=0.25)
            if row == 1:
                axis.set_xlabel("Concurrent jobs")
    axes[0, 0].legend()
    fig.tight_layout()
    fig.savefig(output / "optimized-capacity.pdf", bbox_inches="tight")
    fig.savefig(output / "optimized-capacity.png", dpi=220, bbox_inches="tight")
    plt.close(fig)


def write_report(comparison: pd.DataFrame, output: Path) -> None:
    lines = [
        "# Exploratory concurrent-load optimization analysis", "",
        "This is a post-hoc engineering study with five paired batches per cell.",
        "It reports effect sizes and uncertainty; it is not confirmatory evidence of superiority.", "",
    ]
    primary = comparison[comparison.metric == "qualified_job_count"]
    for profile in PROFILES:
        lines.extend([f"## {profile}", ""])
        for row in primary[primary.distributed_profile == profile].itertuples():
            lines.append(
                f"- {row.scenario}, load {row.concurrency}: median difference versus monolith "
                f"{row.paired_median_difference_distributed_minus_monolith:+.3f} qualified jobs "
                f"(bootstrap interval {row.paired_median_ci_low:+.3f} to {row.paired_median_ci_high:+.3f})."
            )
        lines.append("")
    (output / "optimization-analysis-report.md").write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--baseline-state", required=True, type=Path)
    parser.add_argument("--optimization-root", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    repo_root = Path(__file__).resolve().parents[2]
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    frame, study = load_inputs(
        args.baseline_state.resolve(), args.optimization_root.resolve(), repo_root
    )
    comparison = comparisons(frame)
    frame.to_csv(output / "optimization-batch-level-results.csv", index=False)
    comparison.to_csv(output / "optimization-paired-comparisons.csv", index=False)
    plot_capacity(frame, output)
    write_report(comparison, output)
    provenance = {
        "analysis_commit": ANALYSIS.subprocess_commit(repo_root),
        "baseline_state_sha256": ANALYSIS.sha256_file(args.baseline_state.resolve()),
        "study_manifest_sha256": ANALYSIS.sha256_file(
            args.optimization_root.resolve() / "optimization-study-manifest.json"
        ),
        "expected_pairs": 5,
        "exploratory": True,
        "profiles": list(PROFILES),
        "study_state": study.get("study_state"),
    }
    (output / "optimization-analysis-provenance.json").write_text(
        json.dumps(provenance, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())