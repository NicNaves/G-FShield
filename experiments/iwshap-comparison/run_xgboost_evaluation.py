#!/usr/bin/env python3
"""Evaluate frozen external-comparison subsets with one pinned XGBoost setup."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ATTRIBUTE = re.compile(r"^@attribute\s+(?:'([^']+)'|\"([^\"]+)\"|(\S+))", re.I)


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def atomic_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(
        json.dumps(value, indent=2, sort_keys=True, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    os.replace(temporary, path)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_arff(path: Path) -> tuple[list[str], list[list[float]], list[int]]:
    attributes: list[str] = []
    rows: list[list[float]] = []
    labels: list[int] = []
    in_data = False
    with path.open(encoding="utf-8", newline="") as handle:
        for raw_line in handle:
            line = raw_line.strip()
            if not line or line.startswith("%"):
                continue
            if not in_data:
                match = ATTRIBUTE.match(line)
                if match:
                    attributes.append(next(value for value in match.groups() if value is not None))
                elif line.lower() == "@data":
                    in_data = True
                continue
            values = next(csv.reader([line]))
            if len(values) != len(attributes):
                raise ValueError(f"{path}: expected {len(attributes)} values, got {len(values)}")
            rows.append([float("nan") if value.strip() == "?" else float(value) for value in values[:-1]])
            labels.append(int(float(values[-1])))
    if not in_data or not attributes or attributes[-1].lower() != "class":
        raise ValueError(f"{path}: unsupported ARFF header or missing class attribute")
    return attributes[:-1], rows, labels


def metric_block(labels: Any, predictions: Any) -> dict[str, Any]:
    from sklearn.metrics import (  # type: ignore
        accuracy_score, confusion_matrix, f1_score, precision_score, recall_score,
    )

    return {
        "accuracy": float(accuracy_score(labels, predictions)),
        "f1_macro": float(f1_score(labels, predictions, average="macro", zero_division=0)),
        "precision_macro": float(precision_score(labels, predictions, average="macro", zero_division=0)),
        "recall_macro": float(recall_score(labels, predictions, average="macro", zero_division=0)),
        "f1_positive": float(f1_score(labels, predictions, pos_label=1, zero_division=0)),
        "precision_positive": float(precision_score(labels, predictions, pos_label=1, zero_division=0)),
        "recall_positive": float(recall_score(labels, predictions, pos_label=1, zero_division=0)),
        "confusion_matrix": confusion_matrix(labels, predictions, labels=[0, 1]).tolist(),
    }


def historical_indices(scenario: dict[str, Any], feature_names: list[str]) -> list[int]:
    positions = {name: index for index, name in enumerate(feature_names)}
    selected_names = scenario["iwshap_log"]["best"]["features"]
    missing = [name for name in selected_names if name not in positions]
    if missing:
        raise ValueError(f"historical features absent from full ARFF: {missing}")
    return [positions[name] for name in selected_names]


def paired_subsets(paired_root: Path | None, scenario: str) -> list[tuple[str, list[int], str]]:
    if paired_root is None:
        return []
    variants = []
    for architecture in ("distributed", "monolith"):
        path = paired_root / scenario / architecture / "final-result.json"
        if path.is_file():
            result = json.loads(path.read_text(encoding="utf-8"))
            variants.append((architecture, result["selected_features"], str(path)))
    return variants


def evaluate(
    scenario: dict[str, Any], data_root: Path, output_root: Path,
    paired_root: Path | None, threads: int,
) -> None:
    import numpy as np  # type: ignore
    import sklearn  # type: ignore
    import xgboost  # type: ignore
    from xgboost import XGBClassifier  # type: ignore

    name = scenario["scenario"]
    campaign = data_root / name / "campaign"
    datasets = {}
    feature_names: list[str] | None = None
    for split in ("train", "validation", "test"):
        path = campaign / f"erenoall-{split}.arff"
        expected = scenario["splits"][split]["full_arff"]["sha256"]
        if sha256_file(path) != expected:
            raise RuntimeError(f"hash mismatch for {path}")
        names, rows, labels = read_arff(path)
        if feature_names is not None and names != feature_names:
            raise RuntimeError(f"feature order mismatch in {path}")
        feature_names = names
        datasets[split] = (np.asarray(rows, dtype=np.float32), np.asarray(labels, dtype=np.int8))
    assert feature_names is not None
    variants = [
        ("all-features", list(range(len(feature_names))), "generated from complete feature order"),
        ("historical-iwshap-subset", historical_indices(scenario, feature_names), scenario["iwshap_log_scope"]),
        *paired_subsets(paired_root, name),
    ]
    for method, indices, source in variants:
        destination = output_root / name / method / "final-result.json"
        if destination.is_file():
            continue
        model = XGBClassifier(
            use_label_encoder=False,
            eval_metric="logloss",
            random_state=0,
            n_jobs=threads,
        )
        train_x, train_y = datasets["train"]
        validation_x, validation_y = datasets["validation"]
        test_x, test_y = datasets["test"]
        started = time.monotonic()
        model.fit(train_x[:, indices], train_y)
        fit_seconds = time.monotonic() - started
        validation_started = time.monotonic()
        validation_predictions = model.predict(validation_x[:, indices])
        validation_seconds = time.monotonic() - validation_started
        test_started = time.monotonic()
        test_predictions = model.predict(test_x[:, indices])
        test_seconds = time.monotonic() - test_started
        atomic_json(destination, {
            "schema_version": 1,
            "timestamp_utc": utc_now(),
            "scenario": name,
            "method": method,
            "source": source,
            "source_commit": scenario.get("source_commit"),
            "classifier": "XGBoost",
            "xgboost_version": xgboost.__version__,
            "scikit_learn_version": sklearn.__version__,
            "classifier_parameters": model.get_params(),
            "training_protocol": "train only; validation reported; untouched test reported once",
            "selected_features": indices,
            "selected_feature_names": [feature_names[index] for index in indices],
            "subset_size": len(indices),
            "dimensionality_reduction_percent": 100.0 * (1.0 - len(indices) / len(feature_names)),
            "fit_seconds": fit_seconds,
            "validation_predict_seconds": validation_seconds,
            "test_predict_seconds": test_seconds,
            "validation": metric_block(validation_y, validation_predictions),
            "test": metric_block(test_y, test_predictions),
            "hashes": {
                split: scenario["splits"][split]["full_arff"]["sha256"]
                for split in ("train", "validation", "test")
            },
        })


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-root", required=True, type=Path)
    parser.add_argument("--output-root", required=True, type=Path)
    parser.add_argument("--paired-root", type=Path)
    parser.add_argument("--threads", type=int, default=6)
    args = parser.parse_args()
    if args.threads <= 0:
        parser.error("threads must be positive")
    manifest = json.loads(
        (args.data_root / "audit-and-split-manifest.json").read_text(encoding="utf-8")
    )
    for scenario in manifest["scenarios"]:
        scenario["source_commit"] = manifest["source_commit"]
        evaluate(scenario, args.data_root.resolve(), args.output_root.resolve(), args.paired_root, args.threads)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
