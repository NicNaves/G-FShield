#!/usr/bin/env python3
"""Run the two post-baseline distributed optimization profiles sequentially."""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

SEEDS = "20260941,20260942,20260943,20260944,20260945"
PROFILES = ("rebalanced", "scaled-rcl")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def atomic_json(path: Path, value: dict) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    temporary.replace(path)


def validate_baseline(path: Path) -> dict:
    state_path = path / "state.json"
    if not state_path.exists():
        raise RuntimeError(f"baseline state is missing: {state_path}")
    state = json.loads(state_path.read_text(encoding="utf-8"))
    if len(state.get("completed", [])) != 100:
        raise RuntimeError("optimized study requires exactly 100 valid baseline cells")
    if state.get("state") not in {"STOPPED_AT_TARGET", "CAMPAIGN_TARGET_COMPLETED"}:
        raise RuntimeError(f"baseline is not frozen at its target: {state.get('state')}")
    return {
        "path": str(path.resolve()),
        "state_sha256": sha256_file(state_path),
        "completed_cells": 100,
        "batch_seeds": list(range(20260941, 20260946)),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-root", required=True, type=Path)
    parser.add_argument("--output-root", required=True, type=Path)
    parser.add_argument("--baseline-root", required=True, type=Path)
    parser.add_argument("--image-tag", required=True)
    parser.add_argument("--evaluator-image", default="gfshield-campaign-evaluator:quality-5dec3b1")
    parser.add_argument("--run-timeout-seconds", type=int, default=1200)
    parser.add_argument("--finalization-reserve-seconds", type=int, default=120)
    args = parser.parse_args()

    baseline = validate_baseline(args.baseline_root.resolve())
    args.output_root.mkdir(parents=True, exist_ok=True)
    runner = Path(__file__).with_name("run_concurrent_campaign.py")
    manifest_path = args.output_root / "optimization-study-manifest.json"
    manifest = {
        "schema_version": 1,
        "study_type": "post-hoc exploratory engineering optimization",
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "baseline": baseline,
        "profiles": list(PROFILES),
        "new_cells_per_profile": 50,
        "new_cells_total": 100,
        "aggregate_budget": {"cpus": 6.0, "memory": "12g"},
        "image_tag": args.image_tag,
        "status": {},
    }
    if manifest_path.exists():
        existing = json.loads(manifest_path.read_text(encoding="utf-8"))
        for key in ("baseline", "profiles", "aggregate_budget", "image_tag"):
            if existing.get(key) != manifest.get(key):
                raise RuntimeError(f"existing optimization manifest differs in {key}")
        manifest = existing
    else:
        atomic_json(manifest_path, manifest)

    for profile in PROFILES:
        destination = args.output_root / profile
        command = [
            sys.executable, str(runner),
            "--data-root", str(args.data_root.resolve()),
            "--output-root", str(destination.resolve()),
            "--batch-seeds", SEEDS,
            "--architectures", "distributed",
            "--campaign-id", f"gfshield-concurrent-{profile}-2026-v1",
            "--image-tag", args.image_tag,
            "--evaluator-image", args.evaluator_image,
            "--distributed-profile", profile,
            "--max-completed-cells", "50",
            "--run-timeout-seconds", str(args.run_timeout_seconds),
            "--finalization-reserve-seconds", str(args.finalization_reserve_seconds),
            "--global-timeout-seconds", str(5 * 24 * 60 * 60),
        ]
        manifest["status"][profile] = {"state": "RUNNING", "output": str(destination.resolve())}
        atomic_json(manifest_path, manifest)
        completed = subprocess.run(command, check=False)
        state_path = destination / "state.json"
        state = json.loads(state_path.read_text(encoding="utf-8")) if state_path.exists() else {}
        manifest["status"][profile] = {
            "state": state.get("state", "MISSING_STATE"),
            "completed_cells": len(state.get("completed", [])),
            "return_code": completed.returncode,
            "output": str(destination.resolve()),
        }
        atomic_json(manifest_path, manifest)
        if completed.returncode != 0 or len(state.get("completed", [])) != 50:
            return completed.returncode or 5
    manifest["finished_utc"] = datetime.now(timezone.utc).isoformat()
    manifest["study_state"] = "CAMPAIGN_TARGET_COMPLETED"
    atomic_json(manifest_path, manifest)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())