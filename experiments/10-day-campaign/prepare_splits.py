#!/usr/bin/env python3
"""Create deterministic stratified ARFF train/validation/test splits.

The script keeps the ARFF header and original data rows byte-for-byte (apart
from line endings), uses the final column as the class, writes an index map,
and records SHA-256 hashes for every generated artifact.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import random
import tempfile
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def atomic_write_text(path: Path, lines: Iterable[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
            handle.writelines(lines)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary_name, path)
    except BaseException:
        try:
            os.unlink(temporary_name)
        except FileNotFoundError:
            pass
        raise


def read_arff(path: Path) -> tuple[list[str], list[tuple[int, str, str]]]:
    header: list[str] = []
    rows: list[tuple[int, str, str]] = []
    in_data = False
    data_index = 0

    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        for raw_line in handle:
            normalized = raw_line.rstrip("\r\n")
            stripped = normalized.strip()
            if not in_data:
                header.append(normalized + "\n")
                if stripped.lower().startswith("@data"):
                    in_data = True
                continue
            if not stripped or stripped.startswith("%"):
                continue
            parsed = next(csv.reader([normalized]))
            if len(parsed) < 2:
                raise ValueError(f"invalid ARFF row at data index {data_index}: {normalized!r}")
            label = parsed[-1].strip()
            if not label or label == "?":
                raise ValueError(f"missing class at data index {data_index}")
            rows.append((data_index, normalized + "\n", label))
            data_index += 1

    if not in_data:
        raise ValueError("ARFF file has no @data section")
    if not rows:
        raise ValueError("ARFF file has no data rows")
    return header, rows


def allocate_class(count: int) -> tuple[int, int, int]:
    train = round(count * 0.60)
    validation = round(count * 0.20)
    test = count - train - validation
    if min(train, validation, test) < 1:
        raise ValueError(f"class with {count} rows is too small for a 60/20/20 split")
    return train, validation, test


def build_splits(rows: list[tuple[int, str, str]], seed: int):
    by_class: dict[str, list[tuple[int, str, str]]] = defaultdict(list)
    for row in rows:
        by_class[row[2]].append(row)

    rng = random.Random(seed)
    splits = {"train": [], "validation": [], "test": []}
    for label in sorted(by_class):
        class_rows = list(by_class[label])
        rng.shuffle(class_rows)
        train_count, validation_count, _ = allocate_class(len(class_rows))
        splits["train"].extend(class_rows[:train_count])
        splits["validation"].extend(
            class_rows[train_count : train_count + validation_count]
        )
        splits["test"].extend(class_rows[train_count + validation_count :])

    for split_rows in splits.values():
        rng.shuffle(split_rows)
    return splits


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--seed", type=int, default=20260825)
    args = parser.parse_args()

    source = args.input.resolve()
    output = args.output_dir.resolve()
    output.mkdir(parents=True, exist_ok=True)
    header, rows = read_arff(source)
    splits = build_splits(rows, args.seed)

    generated: dict[str, dict[str, object]] = {}
    for split_name, split_rows in splits.items():
        destination = output / f"erenoall-{split_name}.arff"
        atomic_write_text(destination, [*header, *(row[1] for row in split_rows)])
        generated[split_name] = {
            "path": destination.name,
            "sha256": sha256(destination),
            "records": len(split_rows),
            "classes": dict(sorted(Counter(row[2] for row in split_rows).items())),
        }

    index_path = output / "split-indices.csv"
    fd, temporary_name = tempfile.mkstemp(prefix=".split-indices.", dir=output)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="") as handle:
            writer = csv.writer(handle, lineterminator="\n")
            writer.writerow(["original_data_index", "split", "class"])
            for split_name in ("train", "validation", "test"):
                for original_index, _, label in sorted(splits[split_name]):
                    writer.writerow([original_index, split_name, label])
        os.replace(temporary_name, index_path)
    except BaseException:
        try:
            os.unlink(temporary_name)
        except FileNotFoundError:
            pass
        raise

    manifest = {
        "schema_version": 1,
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "seed": args.seed,
        "ratios": {"train": 0.60, "validation": 0.20, "test": 0.20},
        "source": {
            "path": str(source),
            "sha256": sha256(source),
            "records": len(rows),
            "classes": dict(sorted(Counter(row[2] for row in rows).items())),
        },
        "splits": generated,
        "index": {
            "path": index_path.name,
            "sha256": sha256(index_path),
            "records": len(rows),
        },
    }
    manifest_path = output / "split-manifest.json"
    atomic_write_text(
        manifest_path,
        [json.dumps(manifest, indent=2, sort_keys=True, ensure_ascii=False) + "\n"],
    )
    print(json.dumps(manifest, indent=2, sort_keys=True, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
