#!/usr/bin/env python3
"""Create traceable tables for the external IWSHAP comparison."""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path
from typing import Any


def load(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def positive_metrics(result: dict[str, Any]) -> dict[str, float | None]:
    metrics = result.get("test_per_class_metrics", {}).get("1", {})
    return {
        "f1_positive": metrics.get("f1"),
        "precision_positive": metrics.get("precision"),
        "recall_positive": metrics.get("recall"),
    }


def row_from_result(
    scenario: str, evidence: str, method: str, result: dict[str, Any]
) -> dict[str, Any]:
    return {
        "scenario": scenario,
        "evidence": evidence,
        "method": method,
        "classifier": result.get("classifier"),
        "partition_protocol": "grouped 60/20/20; untouched test",
        "records": None,
        "subset_size": result.get("subset_size"),
        "reduction_percent": result.get("dimensionality_reduction_percent"),
        "f1_macro": result.get("test_f1_macro"),
        **positive_metrics(result),
        "accuracy": result.get("accuracy"),
        "classifier_time_ms": result.get("classifier_time_ms"),
        "end_to_end_time_ms": result.get("end_to_end_time_ms"),
        "candidate_count": result.get("candidate_count"),
        "source": str(result.get("_source_path", "")),
    }


def historical_rows(manifest: dict[str, Any]) -> list[dict[str, Any]]:
    rows = []
    for scenario in manifest["scenarios"]:
        log = scenario["iwshap_log"]
        for method, values, size in (
            ("IWSHAP repository all-feature baseline", log["baseline"], scenario["features"]),
            ("IWSHAP repository selected subset", log["best"], log["best"]["feature_count"]),
        ):
            rows.append({
                "scenario": scenario["scenario"],
                "evidence": "historical repository log",
                "method": method,
                "classifier": "XGBoost (repository environment)",
                "partition_protocol": "repository 80/20; same 20% reused during selection",
                "records": None,
                "subset_size": size,
                "reduction_percent": 100.0 * (1.0 - size / scenario["features"]),
                "f1_macro": None,
                "f1_positive": values.get("f1_positive_class"),
                "precision_positive": values.get("precision_positive_class"),
                "recall_positive": values.get("recall_positive_class"),
                "accuracy": None,
                "classifier_time_ms": (
                    1000.0 * values["reported_fit_predict_seconds"]
                    if "reported_fit_predict_seconds" in values else None
                ),
                "end_to_end_time_ms": (
                    1000.0 * values["cumulative_reported_fit_predict_seconds_to_first_best"]
                    if "cumulative_reported_fit_predict_seconds_to_first_best" in values else None
                ),
                "candidate_count": log["evaluated_rounds"] if method.endswith("selected subset") else 1,
                "source": scenario["iwshap_log_scope"],
            })
    return rows


def read_common_results(root: Path) -> list[dict[str, Any]]:
    rows = []
    for path in sorted(root.glob("*/*/final-result.json")):
        result = load(path)
        result["_source_path"] = path
        scenario, variant = path.parts[-3], path.parts[-2]
        row = row_from_result(scenario, "controlled J48 re-evaluation", variant, result)
        row["reduction_percent"] = (
            100.0 * (1.0 - row["subset_size"] / 688) if row["subset_size"] else None
        )
        rows.append(row)
    return rows


def read_paired_results(root: Path) -> list[dict[str, Any]]:
    rows = []
    for path in sorted(root.glob("*/*/final-result.json")):
        result = load(path)
        result["_source_path"] = path
        scenario, architecture = path.parts[-3], path.parts[-2]
        rows.append(row_from_result(
            scenario, "single-seed matched-architecture pilot", architecture, result
        ))
    return rows


def fmt(value: Any, digits: int = 4) -> str:
    if value is None:
        return "--"
    if isinstance(value, float):
        return f"{value:.{digits}f}"
    return str(value)


def write_report(path: Path, manifest: dict[str, Any], rows: list[dict[str, Any]]) -> None:
    lines = [
        "# IWSHAP external-comparison audit",
        "",
        f"Pinned source commit: `{manifest['source_commit']}`.",
        "",
        "The historical XGBoost rows and controlled J48 rows are different evidence",
        "strata and must not be subtracted from one another. Only rows sharing the",
        "controlled J48 protocol support a direct quality/runtime comparison. The",
        "single-seed architecture pilot is descriptive until the paired campaign is run.",
        "",
        "| Scenario | Evidence | Method | Features | Reduction | Macro-F1 | Positive F1 | Positive precision | Positive recall | Classifier ms | End-to-end ms |",
        "|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for row in rows:
        lines.append(
            "| {scenario} | {evidence} | {method} | {subset_size} | {reduction_percent}% | "
            "{f1_macro} | {f1_positive} | {precision_positive} | {recall_positive} | "
            "{classifier_time_ms} | {end_to_end_time_ms} |".format(
                **{key: fmt(value, 2 if key.endswith("_ms") or key == "reduction_percent" else 4)
                   for key, value in row.items()}
            )
        )
    lines.extend(["", "## Controlled contrasts", ""])
    for scenario in (item["scenario"] for item in manifest["scenarios"]):
        common = {
            row["method"]: row for row in rows
            if row["scenario"] == scenario
            and row["evidence"] == "controlled J48 re-evaluation"
        }
        all_features = common.get("all-features")
        selected = common.get("historical-iwshap-subset")
        if all_features and selected:
            macro_delta = selected["f1_macro"] - all_features["f1_macro"]
            positive_delta = selected["f1_positive"] - all_features["f1_positive"]
            classifier_speedup = (
                all_features["classifier_time_ms"] / selected["classifier_time_ms"]
            )
            end_to_end_speedup = (
                all_features["end_to_end_time_ms"] / selected["end_to_end_time_ms"]
            )
            lines.append(
                f"- **{scenario}:** historical subset versus all 688 features: "
                f"macro-F1 {macro_delta:+.4f}, positive-class F1 {positive_delta:+.4f}, "
                f"classifier {classifier_speedup:.2f}x faster, and measured baseline "
                f"end-to-end evaluation {end_to_end_speedup:.2f}x faster."
            )
    lines.extend([
        "",
        "## Scope constraints",
        "",
        "- The July reduced CSV is a label-free, four-feature export for fabrication; labels are reconstructed only after exact row-order validation against the pinned source files.",
        "- The June log is a 16-feature suspension run and is not treated as the provenance of the July CSV.",
        "- The public demonstration CSVs contain 20,000 records per scenario; they do not reproduce the paper's 784,744-instance experiment.",
        "- The original repository selects features while repeatedly evaluating the same 20% partition that it reports as test performance. Its historical score is therefore contextual, not an unbiased comparator for the untouched grouped test partition.",
    ])
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--baseline-root", required=True, type=Path)
    parser.add_argument("--paired-root", type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    args = parser.parse_args()
    manifest = load(args.manifest)
    rows = historical_rows(manifest) + read_common_results(args.baseline_root)
    if args.paired_root:
        rows += read_paired_results(args.paired_root)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    columns = list(rows[0])
    with (args.output_dir / "comparison.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)
    write_report(args.output_dir / "comparison-report.md", manifest, rows)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
