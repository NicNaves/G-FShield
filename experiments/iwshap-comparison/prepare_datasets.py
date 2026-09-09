#!/usr/bin/env python3
"""Audit the pinned IWSHAP artifacts and create leakage-resistant ARFF splits.

The source files are never modified. Identical complete feature vectors are
assigned to one split by a salted SHA-256 hash, preventing exact row copies
from crossing train, validation, and test boundaries. The final column is the
binary class and is written as a nominal ARFF attribute.
"""

from __future__ import annotations

import argparse
import ast
import csv
import hashlib
import json
import math
import re
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Iterator, Sequence


HERE = Path(__file__).resolve().parent
REGISTRY_PATH = HERE / "source-registry.json"
SPLITS = ("train", "validation", "test")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def sha256_normalized_text(path: Path) -> str:
    content = path.read_bytes().replace(b"\r\n", b"\n").replace(b"\r", b"\n")
    return hashlib.sha256(content).hexdigest()


def load_registry() -> dict:
    return json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))


def verify_sources(root: Path, registry: dict) -> None:
    failures: list[str] = []
    for relative, expected in registry["files"].items():
        source = root / relative
        if not source.is_file():
            failures.append(f"missing {relative}")
            continue
        actual = sha256_normalized_text(source)
        if actual.lower() != expected.lower():
            failures.append(f"hash mismatch for {relative}: {actual}")
    if failures:
        raise RuntimeError("source verification failed:\n- " + "\n- ".join(failures))


def read_header(path: Path) -> list[str]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return next(csv.reader(handle))


def iter_csv(path: Path) -> Iterator[list[str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.reader(handle)
        next(reader)
        yield from reader


def iter_scenario_rows(root: Path, attack_relative: str) -> Iterator[list[str]]:
    yield from iter_csv(root / "dataset/safe_dataset.csv")
    yield from iter_csv(root / attack_relative)


def canonical_feature_bytes(features: Sequence[str]) -> bytes:
    return json.dumps(
        list(features), ensure_ascii=False, separators=(",", ":")
    ).encode("utf-8")


def feature_digest(features: Sequence[str]) -> str:
    return hashlib.sha256(canonical_feature_bytes(features)).hexdigest()


def assigned_split(digest: str, seed: int) -> str:
    value = int(hashlib.sha256(f"{seed}:{digest}".encode("ascii")).hexdigest()[:16], 16)
    bucket = value % 100
    if bucket < 60:
        return "train"
    if bucket < 80:
        return "validation"
    return "test"


def quote_arff_name(name: str) -> str:
    return "'" + name.replace("\\", "\\\\").replace("'", "\\'") + "'"


def arff_header(relation: str, feature_names: Sequence[str]) -> str:
    lines = [f"@relation {quote_arff_name(relation)}", ""]
    lines.extend(f"@attribute {quote_arff_name(name)} numeric" for name in feature_names)
    lines.extend(("@attribute 'label' {0,1}", "", "@data"))
    return "\n".join(lines) + "\n"


def is_missing(value: str) -> bool:
    stripped = value.strip()
    return not stripped or stripped.lower() in {"nan", "na", "null", "none"}


def arff_value(value: str, categorical_encoding: dict[str, int] | None = None) -> str:
    stripped = value.strip()
    if is_missing(value):
        return "?"
    if categorical_encoding is not None:
        return str(categorical_encoding[stripped])
    number = float(stripped)
    if not math.isfinite(number):
        return "?"
    return stripped


def parse_log(path: Path) -> dict:
    text = path.read_text(encoding="utf-8")
    baseline_match = re.search(
        r"Baseline: F1-Score=([0-9.]+), Recall=([0-9.]+), Precision=([0-9.]+)", text
    )
    final_f1_match = re.search(r"Melhor F1 Score: ([0-9.]+)", text)
    features_match = re.search(r"Melhores features finais:\s*\n\s*(\[[^\n]+\])", text)
    round_metrics = [
        (float(f1), float(recall), float(precision), float(seconds))
        for f1, recall, precision, seconds in re.findall(
            r"F1 Score: ([0-9.]+), Recall: ([0-9.]+), Precision: ([0-9.]+), Tempo: ([0-9.]+) segundos",
            text,
        )
    ]
    if not (baseline_match and final_f1_match and features_match and round_metrics):
        raise RuntimeError(f"could not parse expected fields from {path}")
    best_features = ast.literal_eval(features_match.group(1))
    best_f1 = float(final_f1_match.group(1))
    best_index = max(
        index for index, metrics in enumerate(round_metrics) if metrics[0] == best_f1
    )
    return {
        "baseline": {
            "f1_positive_class": float(baseline_match.group(1)),
            "recall_positive_class": float(baseline_match.group(2)),
            "precision_positive_class": float(baseline_match.group(3)),
        },
        "best": {
            "f1_positive_class": best_f1,
            "features": best_features,
            "feature_count": len(best_features),
            "first_best_round_zero_based": next(
                i for i, metrics in enumerate(round_metrics) if metrics[0] == best_f1
            ),
            "last_equal_best_round_zero_based": best_index,
            "reported_fit_predict_seconds": round_metrics[
                next(i for i, metrics in enumerate(round_metrics) if metrics[0] == best_f1)
            ][3],
            "cumulative_reported_fit_predict_seconds_to_first_best": sum(
                item[3] for item in round_metrics[: next(
                    i for i, metrics in enumerate(round_metrics) if metrics[0] == best_f1
                ) + 1]
            ),
        },
        "evaluated_rounds": len(round_metrics),
        "sum_reported_model_fit_predict_seconds": sum(item[3] for item in round_metrics),
        "metric_definition": "binary positive-class metrics from sklearn defaults",
        "selection_set": "the same 20% split called test by IWSHAP",
    }


def validate_reduced_export(
    root: Path, attack_relative: str, reduced_relative: str, feature_names: Sequence[str]
) -> dict:
    reduced_path = root / reduced_relative
    reduced_header = read_header(reduced_path)
    if list(feature_names) != reduced_header:
        raise RuntimeError("reduced CSV columns differ from the final log feature list")
    full_header = read_header(root / "dataset/safe_dataset.csv")
    indices = [full_header.index(name) for name in feature_names]
    compared = 0
    mismatches = 0
    reduced_row_digests: set[str] = set()
    reduced_rows = iter_csv(reduced_path)
    for source_row, reduced_row in zip(
        iter_scenario_rows(root, attack_relative), reduced_rows, strict=True
    ):
        compared += 1
        reduced_row_digests.add(feature_digest(reduced_row))
        if [source_row[index] for index in indices] != reduced_row:
            mismatches += 1
    return {
        "rows_compared": compared,
        "mismatched_rows": mismatches,
        "contains_label": "label" in reduced_header,
        "columns": reduced_header,
        "unique_feature_rows": len(reduced_row_digests),
        "duplicate_rows_beyond_first": compared - len(reduced_row_digests),
    }


def write_scenario(
    root: Path, output_root: Path, name: str, config: dict, seed: int
) -> dict:
    safe_header = read_header(root / "dataset/safe_dataset.csv")
    attack_header = read_header(root / config["attack_file"])
    if safe_header != attack_header or not safe_header or safe_header[-1] != "label":
        raise RuntimeError(f"incompatible or invalid headers for {name}")
    feature_names = safe_header[:-1]
    log_summary = parse_log(root / config["log_file"])
    selected_features = log_summary["best"]["features"]
    missing_selected = sorted(set(selected_features) - set(feature_names))
    if missing_selected:
        raise RuntimeError(f"unknown selected features for {name}: {missing_selected}")
    selected_indices = [feature_names.index(feature) for feature in selected_features]

    group_counts: Counter[str] = Counter()
    group_labels: dict[str, set[str]] = defaultdict(set)
    classes: Counter[str] = Counter()
    categorical_indices: set[int] = set()
    missing_values = 0
    records = 0
    for row in iter_scenario_rows(root, config["attack_file"]):
        if len(row) != len(safe_header):
            raise RuntimeError(f"row width mismatch in {name} at record {records}")
        label = row[-1].strip()
        if label not in {"0", "1"}:
            raise RuntimeError(f"unexpected label {label!r} in {name}")
        for index, value in enumerate(row[:-1]):
            if is_missing(value):
                continue
            try:
                float(value)
            except ValueError:
                categorical_indices.add(index)
        digest = feature_digest(row[:-1])
        group_counts[digest] += 1
        group_labels[digest].add(label)
        classes[label] += 1
        missing_values += sum(is_missing(value) for value in row[:-1])
        records += 1

    categorical_values: dict[int, set[str]] = {
        index: set() for index in categorical_indices
    }
    if categorical_indices:
        for row in iter_scenario_rows(root, config["attack_file"]):
            for index in categorical_indices:
                if not is_missing(row[index]):
                    categorical_values[index].add(row[index].strip())
    categorical_encodings = {
        index: {value: code for code, value in enumerate(sorted(values))}
        for index, values in categorical_values.items()
    }

    scenario_root = output_root / name
    full_dir = scenario_root / "campaign"
    selected_dir = scenario_root / "iwshap-selected"
    full_dir.mkdir(parents=True, exist_ok=True)
    selected_dir.mkdir(parents=True, exist_ok=True)
    full_handles = {
        split: (full_dir / f"erenoall-{split}.arff").open("w", encoding="utf-8", newline="\n")
        for split in SPLITS
    }
    selected_handles = {
        split: (selected_dir / f"iwshap-selected-{split}.arff").open(
            "w", encoding="utf-8", newline="\n"
        )
        for split in SPLITS
    }
    split_counts = {split: Counter() for split in SPLITS}
    index_path = scenario_root / "split-indices.csv"
    try:
        for handle in full_handles.values():
            handle.write(arff_header(f"iwshap_{name}", feature_names))
        for handle in selected_handles.values():
            handle.write(arff_header(f"iwshap_{name}_selected", selected_features))
        with index_path.open("w", encoding="utf-8", newline="") as index_handle:
            writer = csv.writer(index_handle, lineterminator="\n")
            writer.writerow(["record_index", "feature_sha256", "split", "class"])
            for record_index, row in enumerate(
                iter_scenario_rows(root, config["attack_file"])
            ):
                features, label = row[:-1], row[-1].strip()
                digest = feature_digest(features)
                split = assigned_split(digest, seed)
                full_handles[split].write(
                    ",".join(
                        [
                            *(
                                arff_value(value, categorical_encodings.get(index))
                                for index, value in enumerate(features)
                            ),
                            label,
                        ]
                    )
                    + "\n"
                )
                selected_handles[split].write(
                    ",".join(
                        [
                            *(
                                arff_value(features[index], categorical_encodings.get(index))
                                for index in selected_indices
                            ),
                            label,
                        ]
                    )
                    + "\n"
                )
                writer.writerow([record_index, digest, split, label])
                split_counts[split][label] += 1
    finally:
        for handle in [*full_handles.values(), *selected_handles.values()]:
            handle.close()

    split_manifest = {
        split: {
            "records": sum(split_counts[split].values()),
            "classes": dict(sorted(split_counts[split].items())),
            "full_arff": {
                "path": str((full_dir / f"erenoall-{split}.arff").relative_to(output_root)),
                "sha256": sha256_file(full_dir / f"erenoall-{split}.arff"),
            },
            "iwshap_selected_arff": {
                "path": str(
                    (selected_dir / f"iwshap-selected-{split}.arff").relative_to(output_root)
                ),
                "sha256": sha256_file(selected_dir / f"iwshap-selected-{split}.arff"),
            },
        }
        for split in SPLITS
    }
    summary = {
        "scenario": name,
        "records": records,
        "features": len(feature_names),
        "classes": dict(sorted(classes.items())),
        "missing_feature_values": missing_values,
        "categorical_encoding": {
            feature_names[index]: categorical_encodings[index]
            for index in sorted(categorical_encodings)
        },
        "unique_complete_feature_vectors": len(group_counts),
        "duplicate_records_beyond_first": records - len(group_counts),
        "conflicting_label_feature_groups": sum(
            len(labels) > 1 for labels in group_labels.values()
        ),
        "split_method": {
            "name": "salted_sha256_complete_feature_group",
            "seed": seed,
            "ratios": {"train": 0.60, "validation": 0.20, "test": 0.20},
            "guarantee": "an identical complete feature vector occurs in one split only",
        },
        "splits": split_manifest,
        "iwshap_log": log_summary,
        "iwshap_log_scope": config["log_scope"],
        "iwshap_selected_reduction_from_688": 1.0
        - (len(selected_features) / len(feature_names)),
    }
    if config.get("reduced_file"):
        summary["reduced_export_validation"] = validate_reduced_export(
            root, config["attack_file"], config["reduced_file"], selected_features
        )
    return summary


def markdown_report(manifest: dict) -> str:
    lines = [
        "# IWSHAP source-data audit",
        "",
        f"Pinned source commit: `{manifest['source_commit']}`.",
        "",
        "The historical IWSHAP scores below are transcribed from the pinned logs. They are not",
        "direct head-to-head results: the original program repeatedly uses its 20% `test` split",
        "to select features and reports positive-class F1, whereas the new comparison reserves",
        "an untouched test split and reports both positive-class and macro metrics.",
        "",
        "## Public demo-data audit",
        "",
        "| Scenario | Demo rows | Features | Class 0 | Class 1 | Unique full vectors | Duplicate rows |",
        "|---|---:|---:|---:|---:|---:|---:|",
    ]
    for scenario in manifest["scenarios"]:
        lines.append(
            "| {scenario} | {records} | {features} | {c0} | {c1} | {unique} | {duplicates} |".format(
                scenario=scenario["scenario"],
                records=scenario["records"],
                features=scenario["features"],
                c0=scenario["classes"]["0"],
                c1=scenario["classes"]["1"],
                unique=scenario["unique_complete_feature_vectors"],
                duplicates=scenario["duplicate_records_beyond_first"],
            )
        )
    lines.extend(
        [
            "",
            "## Historical log audit",
            "",
            "| Scenario | Positive-class F1 | Selected | Exact reduction from 688 | First best round | Cumulative logged fit/predict time | Best-subset fit/predict time |",
            "|---|---:|---:|---:|---:|---:|---:|",
        ]
    )
    for scenario in manifest["scenarios"]:
        best = scenario["iwshap_log"]["best"]
        lines.append(
            "| {scenario} | {f1:.6f} | {selected} | {reduction:.2%} | {round} | {cumulative:.3f} s | {single:.3f} s |".format(
                scenario=scenario["scenario"],
                f1=best["f1_positive_class"],
                selected=best["feature_count"],
                reduction=scenario["iwshap_selected_reduction_from_688"],
                round=best["first_best_round_zero_based"],
                cumulative=best["cumulative_reported_fit_predict_seconds_to_first_best"],
                single=best["reported_fit_predict_seconds"],
            )
        )
    lines.extend(
        [
            "",
            "The full paper states 99.17% reduction while also reporting 16 selected features out of 688. Those counts imply 97.67%; the new study reports the arithmetic result and records the published percentage as an internal inconsistency. The paper's roughly 41.96 s time-to-best and 1.01 s best-subset execution time are different quantities; neither is compared directly with an end-to-end G-FShield run.",
            "",
            "## Interpretation constraints",
            "",
            "- The July reduced CSV is an IWSHAP output, not an independent raw dataset.",
            "- It omits `label`; the preparation script reconstructs labels only after proving row-for-row equality with the pinned source concatenation.",
            "- The four-feature July export has only 886 distinct rows among 20,000 records; its repetitions must not be randomly split as independent observations.",
            "- The linked June log is the suspension scenario. It must not be attributed to the July fabrication CSV.",
            "- The June log contains no input hash or row count. Its scores match the full-paper suspension result, so this audit does not assume that it was produced from the 20,000-row demo CSV.",
            "- Exact full-vector duplicates are kept in one split. Temporal/session separation cannot be guaranteed because the public CSVs contain no session identifier.",
            "- No source license file exists at the pinned repository commit, so generated data remain untracked until redistribution permission is established.",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-root", required=True, type=Path)
    parser.add_argument("--output-root", required=True, type=Path)
    parser.add_argument("--split-seed", type=int, default=20260909)
    args = parser.parse_args()

    source_root = args.source_root.resolve()
    output_root = args.output_root.resolve()
    output_root.mkdir(parents=True, exist_ok=True)
    registry = load_registry()
    verify_sources(source_root, registry)
    scenarios = [
        write_scenario(source_root, output_root, name, config, args.split_seed)
        for name, config in registry["scenarios"].items()
    ]
    manifest = {
        "schema_version": 1,
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "source_repository": registry["source_repository"],
        "source_commit": registry["source_commit"],
        "source_files": registry["files"],
        "source_hash_policy": registry["hash_policy"],
        "license_status": registry["license_status"],
        "scenarios": scenarios,
    }
    manifest_path = output_root / "audit-and-split-manifest.json"
    manifest_path.write_text(
        json.dumps(manifest, indent=2, sort_keys=True, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    (output_root / "audit-report.md").write_text(
        markdown_report(manifest), encoding="utf-8"
    )
    print(json.dumps(manifest, indent=2, sort_keys=True, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
