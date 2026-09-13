#!/usr/bin/env python3
"""Summarize frozen feature subsets evaluated by one common XGBoost protocol."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import statistics
from pathlib import Path
from typing import Any

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt


SCENARIOS = ("suspension", "fabrication")
ARCHITECTURES = ("distributed", "monolith")
METRICS = ("f1_macro", "f1_positive", "precision_positive", "recall_positive")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def method_group(method: str) -> str:
    for architecture in ARCHITECTURES:
        if method.startswith(f"{architecture}-seed-"):
            return architecture
    return method


def load_rows(root: Path) -> list[dict[str, Any]]:
    rows = []
    for scenario in SCENARIOS:
        for path in sorted((root / scenario).glob("*/final-result.json")):
            result = json.loads(path.read_text(encoding="utf-8"))
            test = result["test"]
            validation = result["validation"]
            rows.append({
                "scenario": scenario,
                "method": result["method"],
                "method_group": method_group(result["method"]),
                "subset_size": int(result["subset_size"]),
                "reduction_percent": float(result["dimensionality_reduction_percent"]),
                **{f"test_{metric}": float(test[metric]) for metric in METRICS},
                **{f"validation_{metric}": float(validation[metric]) for metric in METRICS},
                "result_path": str(path),
                "result_sha256": sha256_file(path),
            })
    if len(rows) != 124:
        raise RuntimeError(f"expected 124 common-classifier results, found {len(rows)}")
    for scenario in SCENARIOS:
        for architecture in ARCHITECTURES:
            count = sum(
                row["scenario"] == scenario and row["method_group"] == architecture
                for row in rows
            )
            if count != 30:
                raise RuntimeError(f"expected 30 {scenario}/{architecture} rows, found {count}")
    return rows


def quantile(values: list[float], fraction: float) -> float:
    ordered = sorted(values)
    position = fraction * (len(ordered) - 1)
    lower = int(position)
    upper = min(lower + 1, len(ordered) - 1)
    weight = position - lower
    return ordered[lower] * (1 - weight) + ordered[upper] * weight


def summarize(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    output = []
    groups = ("all-features", "historical-iwshap-subset", *ARCHITECTURES)
    for scenario in SCENARIOS:
        for group in groups:
            subset = [
                row for row in rows
                if row["scenario"] == scenario and row["method_group"] == group
            ]
            record: dict[str, Any] = {
                "scenario": scenario,
                "method_group": group,
                "n": len(subset),
            }
            for column in ("subset_size", "reduction_percent", *(f"test_{m}" for m in METRICS)):
                values = [float(row[column]) for row in subset]
                record[f"{column}_median"] = statistics.median(values)
                record[f"{column}_q1"] = quantile(values, 0.25)
                record[f"{column}_q3"] = quantile(values, 0.75)
                record[f"{column}_min"] = min(values)
                record[f"{column}_max"] = max(values)
            output.append(record)
    return output


def compare_to_iwshap(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    output = []
    for scenario in SCENARIOS:
        baseline = next(
            row for row in rows
            if row["scenario"] == scenario
            and row["method_group"] == "historical-iwshap-subset"
        )
        for architecture in ARCHITECTURES:
            subset = [
                row for row in rows
                if row["scenario"] == scenario and row["method_group"] == architecture
            ]
            for metric in METRICS:
                column = f"test_{metric}"
                values = [float(row[column]) for row in subset]
                reference = float(baseline[column])
                output.append({
                    "scenario": scenario,
                    "architecture": architecture,
                    "metric": metric,
                    "iwshap_fixed_subset": reference,
                    "architecture_median": statistics.median(values),
                    "median_difference": statistics.median(values) - reference,
                    "higher": sum(value > reference for value in values),
                    "equal": sum(value == reference for value in values),
                    "lower": sum(value < reference for value in values),
                    "inference_status": "descriptive; fixed comparator is not a paired stochastic sample",
                })
    return output


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


def plot(rows: list[dict[str, Any]], output: Path) -> None:
    fig, axes = plt.subplots(1, 2, figsize=(10.5, 4.5))
    colors = {"distributed": "#2563EB", "monolith": "#D97706"}
    for axis, scenario in zip(axes, SCENARIOS):
        for position, architecture in enumerate(ARCHITECTURES):
            values = sorted(
                row["test_f1_macro"] for row in rows
                if row["scenario"] == scenario and row["method_group"] == architecture
            )
            offsets = [position - 0.14 + 0.28 * index / (len(values) - 1) for index in range(len(values))]
            axis.scatter(offsets, values, color=colors[architecture], alpha=0.75, s=20)
            axis.hlines(statistics.median(values), position - 0.2, position + 0.2, colors=colors[architecture], linewidth=2.5)
        iwshap = next(row["test_f1_macro"] for row in rows if row["scenario"] == scenario and row["method_group"] == "historical-iwshap-subset")
        all_features = next(row["test_f1_macro"] for row in rows if row["scenario"] == scenario and row["method_group"] == "all-features")
        axis.axhline(iwshap, color="#059669", linestyle="--", label="IWSHAP historical subset")
        axis.axhline(all_features, color="#64748B", linestyle=":", label="All features")
        axis.set_xticks([0, 1], ["G-FShield", "Monolith"])
        axis.set_title(scenario.capitalize())
        axis.set_ylabel("Held-out macro-F1 (common XGBoost)")
        axis.grid(axis="y", alpha=0.25)
    axes[1].legend(fontsize=8)
    fig.tight_layout()
    fig.savefig(output / "xgboost-common-comparison.pdf")
    fig.savefig(output / "xgboost-common-comparison.png", dpi=220)
    plt.close(fig)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    rows = load_rows(args.input)
    summary = summarize(rows)
    comparisons = compare_to_iwshap(rows)
    write_csv(args.output / "run-level-results.csv", rows)
    write_csv(args.output / "summary.csv", summary)
    write_csv(args.output / "comparison-to-iwshap.csv", comparisons)
    plot(rows, args.output)
    (args.output / "provenance.json").write_text(json.dumps({
        "result_count": len(rows),
        "input_root": str(args.input.resolve()),
        "result_sha256": {row["method"]: row["result_sha256"] for row in rows},
        "inference_status": "external fixed-subset comparisons are descriptive",
    }, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
