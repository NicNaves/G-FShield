#!/usr/bin/env python3
"""Generate the frozen-shape campaign manifest (JSON, valid YAML 1.2)."""

from __future__ import annotations

import argparse
import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path


CONSTRUCTIONS = ("ig", "gr", "su", "relieff")
CONTROLLERS = ("vnd", "rvnd")
LOCAL_SEARCHES = ("bitflip", "iwss", "iwssr")
SEEDS = list(range(42, 50))
RUN_TIMEOUT_SECONDS = 50 * 60


def atomic_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
            json.dump(value, handle, indent=2, sort_keys=True, ensure_ascii=False)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary_name, path)
    except BaseException:
        try:
            os.unlink(temporary_name)
        except FileNotFoundError:
            pass
        raise


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--split-manifest", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--campaign-id", default="gfshield-10d-2026-v1")
    args = parser.parse_args()

    split_manifest = json.loads(args.split_manifest.read_text(encoding="utf-8"))
    arms = []
    for construction in CONSTRUCTIONS:
        for controller in CONTROLLERS:
            for local_search in LOCAL_SEARCHES:
                arm_id = f"distributed-{construction}-{controller}-{local_search}"
                arms.append(
                    {
                        "arm_id": arm_id,
                        "architecture": "distributed",
                        "construction": construction,
                        "controller": controller,
                        "local_search": local_search,
                        "window_seconds": 8 * 60 * 60,
                        "run_timeout_seconds": RUN_TIMEOUT_SECONDS,
                        "command": None,
                        "ready": False,
                    }
                )

    arms.extend(
        [
            {
                "arm_id": "monolith1-gr-bitflip",
                "architecture": "monolith1-graspy2",
                "construction": "gr",
                "controller": None,
                "local_search": "bitflip",
                "window_seconds": 8 * 60 * 60,
                "run_timeout_seconds": RUN_TIMEOUT_SECONDS,
                "command": None,
                "ready": False,
            },
            {
                "arm_id": "monolith2-gr-iwss",
                "architecture": "monolith2-graspy",
                "construction": "gr",
                "controller": "vnd",
                "local_search": "iwss",
                "window_seconds": 8 * 60 * 60,
                "run_timeout_seconds": RUN_TIMEOUT_SECONDS,
                "command": None,
                "ready": False,
            },
        ]
    )
    for index, arm in enumerate(arms):
        arm["planned_start_offset_seconds"] = index * 8 * 60 * 60
        arm["planned_end_offset_seconds"] = (index + 1) * 8 * 60 * 60

    manifest = {
        "schema_version": 1,
        "campaign_id": args.campaign_id,
        "generated_utc": datetime.now(timezone.utc).isoformat(),
        "ready": False,
        "readiness_blockers": [
            "commands_not_frozen",
            "common_weka_j48_evaluator_not_validated",
            "resource_budget_not_verified_on_target",
            "pilot_not_approved",
            "git_commit_and_image_digests_not_frozen",
        ],
        "campaign": {
            "maximum_seconds": 240 * 60 * 60,
            "algorithm_seconds": 208 * 60 * 60,
            "baseline_maximum_seconds": 8 * 60 * 60,
            "reserve_seconds": 24 * 60 * 60,
            "start_utc": None,
            "deadline_utc": None,
        },
        "stopping": {
            "minimum_improvement": 0.0001,
            "maximum_accepted_improvements": 500,
            "graceful_shutdown_seconds": 5 * 60,
        },
        "feature_selection": {
            "relieff_sample_size": 1000,
            "relieff_seed_source": "run_seed",
        },
        "seeds": SEEDS,
        "classifier": {
            "name": "Weka J48",
            "version": "TO_BE_FROZEN",
            "parameters": {},
            "primary_metric": "macro_f1",
            "metric_scale": "0_to_1",
        },
        "dataset": {
            "source_sha256": split_manifest["source"]["sha256"],
            "split_seed": split_manifest["seed"],
            "train_sha256": split_manifest["splits"]["train"]["sha256"],
            "validation_sha256": split_manifest["splits"]["validation"]["sha256"],
            "test_sha256": split_manifest["splits"]["test"]["sha256"],
            "index_sha256": split_manifest["index"]["sha256"],
        },
        "git": {"commit": "TO_BE_FROZEN_AFTER_PILOT", "tag": "experiment-10d-v1"},
        "resources": {
            "cpuset": "TO_BE_FROZEN_AFTER_SERVER_PILOT",
            "numa_node": "TO_BE_FROZEN_AFTER_SERVER_PILOT",
            "aggregate_cpus": "TO_BE_FROZEN_AFTER_SERVER_PILOT",
            "aggregate_memory": "TO_BE_FROZEN_AFTER_SERVER_PILOT",
        },
        "arms": arms,
        "baseline": {
            "arm_id": "baseline-all-features",
            "maximum_seconds": 8 * 60 * 60,
            "run_timeout_seconds": RUN_TIMEOUT_SECONDS,
            "command": None,
            "ready": False,
            "planned_start_offset_seconds": 208 * 60 * 60,
            "planned_end_offset_seconds": 216 * 60 * 60,
        },
        "paths": {
            "result_schema": "experiments/10-day-campaign/result-schema.json",
            "raw_results": "experiments/10-day-campaign/results/raw",
            "normalized_results": "experiments/10-day-campaign/results/normalized",
            "state": "experiments/10-day-campaign/state/campaign-state.json",
        },
        "storage": {
            "minimum_free_bytes": 10 * 1024**3,
            "docker_log_rotation": {"maximum_size": "20m", "maximum_files": 5},
            "supervisor_log_rotation_bytes": 20 * 1024**2,
            "compression": "gzip",
            "raw_results_are_preserved": True,
        },
        "watchdog": {
            "external": True,
            "script": "experiments/10-day-campaign/campaign_supervisor.py",
            "launcher": "tmux",
            "poll_seconds": 15,
            "graceful_shutdown_seconds": 5 * 60,
            "maximum_orchestrator_restarts": 10,
            "deadline_is_immutable": True,
        },
    }
    if sum(arm["window_seconds"] for arm in arms) != manifest["campaign"]["algorithm_seconds"]:
        raise RuntimeError("arm windows do not add up to the 208-hour algorithm budget")
    atomic_json(args.output, manifest)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
