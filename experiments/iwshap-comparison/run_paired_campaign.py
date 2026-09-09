#!/usr/bin/env python3
"""Run the preregistered 30-seed IWSHAP architecture comparison."""

from __future__ import annotations

import argparse
import json
import os
import platform
import signal
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from run_paired_pilot import (
    atomic_json, command_for, iso, sha256_file, split_hashes, terminate, utc_now,
)


TEN_DAYS_SECONDS = 10 * 24 * 60 * 60


def checked(*command: str, cwd: Path | None = None) -> str:
    return subprocess.run(
        command, cwd=cwd, check=True, capture_output=True, text=True,
    ).stdout.strip()


def capture_environment(args: argparse.Namespace, manifest_path: Path) -> dict[str, Any]:
    repo_root = Path(__file__).resolve().parents[2]
    if checked("git", "status", "--porcelain", cwd=repo_root):
        raise RuntimeError("refusing to launch the formal campaign from a dirty worktree")
    references = [
        f"gfshield-campaign-rcl-relieff:{args.image_tag}",
        f"gfshield-campaign-dls-iwssr:{args.image_tag}",
        f"gfshield-campaign-dls-vnd:{args.image_tag}",
        f"gfshield-campaign-dls-verify:{args.image_tag}",
        args.evaluator_image,
        f"gfshield-campaign-monolith2:{args.image_tag}",
    ]
    return {
        "launch_commit": checked("git", "rev-parse", "HEAD", cwd=repo_root),
        "manifest_path": str(manifest_path),
        "manifest_sha256": sha256_file(manifest_path),
        "images": {
            reference: checked("docker", "image", "inspect", reference, "--format", "{{.Id}}")
            for reference in references
        },
        "host": {
            "node": platform.node(),
            "platform": platform.platform(),
            "python": platform.python_version(),
            "logical_cpus": os.cpu_count(),
            "docker": checked("docker", "version", "--format", "{{.Server.Version}}"),
            "lscpu": checked("lscpu"),
            "memory_info": Path("/proc/meminfo").read_text(encoding="utf-8"),
        },
    }


def checksum_directory(root: Path) -> str:
    target = root / "checksums.sha256"
    rows = [
        f"{sha256_file(path)}  {path.relative_to(root).as_posix()}"
        for path in sorted(root.rglob("*"))
        if path.is_file() and path != target
    ]
    target.write_text("\n".join(rows) + "\n", encoding="utf-8")
    return sha256_file(target)


def valid_result(
    path: Path, scenario: dict[str, Any], architecture: str,
    seed: int, run_id: str, campaign_id: str,
) -> bool:
    try:
        result = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return False
    expected = {
        "campaign_id": campaign_id,
        "arm_id": f"matched-rf-vnd-iwssr-{architecture}",
        "run_id": run_id,
        "seed": seed,
        "classifier": "Weka J48",
        "classifier_version": "weka-stable 3.8.6",
        "feature_selector": "relieff",
        "neighborhood_controller": "vnd",
        "local_search": "iwssr",
        "dataset_hash": scenario["split_index"]["sha256"],
        "train_hash": scenario["splits"]["train"]["full_arff"]["sha256"],
        "validation_hash": scenario["splits"]["validation"]["full_arff"]["sha256"],
        "test_hash": scenario["splits"]["test"]["full_arff"]["sha256"],
    }
    return (
        all(result.get(key) == value for key, value in expected.items())
        and result.get("status") in {"completed", "timeout"}
        and isinstance(result.get("test_f1_macro"), (int, float))
        and isinstance(result.get("candidate_count"), int)
        and result["candidate_count"] > 0
    )


def schedule(seeds: list[int], scenarios: list[str]) -> list[tuple[int, str, str]]:
    cells = []
    for index, seed in enumerate(seeds):
        scenario_order = scenarios if index % 2 == 0 else list(reversed(scenarios))
        architecture_order = (
            ("distributed", "monolith")
            if index % 2 == 0 else ("monolith", "distributed")
        )
        for scenario in scenario_order:
            cells.extend((seed, scenario, architecture) for architecture in architecture_order)
    return cells


def parse_seeds(value: str) -> list[int]:
    seeds = [int(item.strip()) for item in value.split(",") if item.strip()]
    if len(seeds) < 30 or len(seeds) != len(set(seeds)):
        raise argparse.ArgumentTypeError("at least 30 unique comma-separated seeds are required")
    return seeds


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-root", required=True, type=Path)
    parser.add_argument("--output-root", required=True, type=Path)
    parser.add_argument(
        "--seeds", type=parse_seeds,
        default=list(range(20260910, 20260940)),
    )
    parser.add_argument("--campaign-id", default="gfshield-iwshap-paired-formal-2026")
    parser.add_argument("--run-prefix", default="iwshap-formal")
    parser.add_argument("--distributed-runner", type=Path, default=root / "10-day-campaign/run_arm.py")
    parser.add_argument("--monolith-runner", type=Path, default=root / "10-day-campaign/run_monolith.py")
    parser.add_argument("--image-tag", default="quality-5dec3b1")
    parser.add_argument("--evaluator-image", default="gfshield-campaign-evaluator:quality-5dec3b1")
    parser.add_argument("--run-timeout-seconds", type=int, default=1200)
    parser.add_argument("--finalization-reserve-seconds", type=int, default=120)
    parser.add_argument("--global-timeout-seconds", type=int, default=TEN_DAYS_SECONDS)
    parser.add_argument("--shutdown-grace-seconds", type=int, default=300)
    parser.add_argument("--maximum-attempts-per-cell", type=int, default=2)
    parser.add_argument("--max-accepted-improvements", type=int, default=50)
    parser.add_argument("--minimum-improvement", type=float, default=0.0001)
    parser.add_argument("--pipeline-workers", type=int, default=3)
    parser.add_argument("--startup-timeout-seconds", type=int, default=300)
    parser.add_argument("--cpuset", default="8-15")
    parser.add_argument("--numa-node", default="1")
    parser.add_argument("--aggregate-cpus", type=float, default=6.0)
    parser.add_argument("--aggregate-memory", default="12g")
    args = parser.parse_args()
    if not 0 < args.global_timeout_seconds <= TEN_DAYS_SECONDS:
        parser.error("global timeout must be positive and no greater than ten days")
    if not 0 < args.finalization_reserve_seconds < args.run_timeout_seconds:
        parser.error("finalization reserve must be positive and shorter than run timeout")
    if args.maximum_attempts_per_cell <= 0:
        parser.error("maximum attempts must be positive")

    data_root = args.data_root.resolve()
    manifest_path = data_root / "audit-and-split-manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    scenarios = {row["scenario"]: row for row in manifest["scenarios"]}
    for scenario in scenarios.values():
        split_hashes(scenario, data_root)
    configuration = {
        "seeds": args.seeds,
        "campaign_id": args.campaign_id,
        "run_prefix": args.run_prefix,
        "source_commit": manifest["source_commit"],
        "algorithm": "ReliefF + VND + IWSSR",
        "pipeline_workers": args.pipeline_workers,
        "run_timeout_seconds": args.run_timeout_seconds,
        "finalization_reserve_seconds": args.finalization_reserve_seconds,
        "global_timeout_seconds": args.global_timeout_seconds,
        "maximum_attempts_per_cell": args.maximum_attempts_per_cell,
        "max_accepted_improvements": args.max_accepted_improvements,
        "minimum_improvement": args.minimum_improvement,
        "cpuset": args.cpuset,
        "numa_node": args.numa_node,
        "aggregate_cpus": args.aggregate_cpus,
        "aggregate_memory": args.aggregate_memory,
        "image_tag": args.image_tag,
        "evaluator_image": args.evaluator_image,
    }
    output_root = args.output_root.resolve()
    output_root.mkdir(parents=True, exist_ok=True)
    frozen_path = output_root / "frozen-manifest.json"
    state_path = output_root / "state.json"
    if frozen_path.exists():
        frozen = json.loads(frozen_path.read_text(encoding="utf-8"))
        if frozen.get("configuration") != configuration:
            raise RuntimeError("existing frozen manifest uses a different configuration")
    else:
        frozen = capture_environment(args, manifest_path)
        frozen["frozen_utc"] = iso(utc_now())
        frozen["configuration"] = configuration
        atomic_json(frozen_path, frozen)
    if state_path.exists():
        state = json.loads(state_path.read_text(encoding="utf-8"))
    else:
        started = utc_now()
        state = {
            "schema_version": 1,
            "campaign_id": args.campaign_id,
            "state": "RUNNING",
            "started_utc": iso(started),
            "deadline_utc": iso(started + timedelta(seconds=args.global_timeout_seconds)),
            "attempts": [],
            "completed": [],
        }
        atomic_json(state_path, state)
    completed = {
        (row["seed"], row["scenario"], row["architecture"])
        for row in state["completed"]
    }
    deadline = datetime.fromisoformat(state["deadline_utc"])
    base_run_prefix = args.run_prefix
    for seed, scenario_name, architecture in schedule(args.seeds, list(scenarios)):
        cell = (seed, scenario_name, architecture)
        if cell in completed:
            continue
        previous_attempts = sum(
            1 for row in state["attempts"]
            if (row["seed"], row["scenario"], row["architecture"]) == cell
        )
        for attempt_number in range(
            previous_attempts + 1, args.maximum_attempts_per_cell + 1
        ):
            if utc_now() >= deadline:
                state["state"] = "GLOBAL_TIMEOUT"
                atomic_json(state_path, state)
                return 3
            args.seed = seed
            args.run_prefix = f"{base_run_prefix}-a{attempt_number}"
            destination = output_root / scenario_name / architecture / f"seed-{seed}" / f"attempt-{attempt_number}"
            command, run_id = command_for(args, scenarios[scenario_name], architecture, destination)
            args.run_prefix = base_run_prefix
            destination.mkdir(parents=True, exist_ok=True)
            started = utc_now()
            before = time.monotonic()
            with (destination / "supervisor.log").open("w", encoding="utf-8") as log:
                process = subprocess.Popen(
                    command, stdout=log, stderr=subprocess.STDOUT, text=True,
                    start_new_session=(os.name == "posix"),
                )
                remaining = max(1, (deadline - utc_now()).total_seconds())
                outer_timeout = min(args.run_timeout_seconds + args.shutdown_grace_seconds, remaining)
                try:
                    return_code = process.wait(timeout=outer_timeout)
                    supervisor_timeout = False
                except subprocess.TimeoutExpired:
                    supervisor_timeout = True
                    terminate(process, args.shutdown_grace_seconds)
                    return_code = 124
            result_path = destination / "final-result.json"
            artifact_valid = valid_result(
                result_path, scenarios[scenario_name], architecture,
                seed, run_id, args.campaign_id,
            )
            attempt = {
                "seed": seed,
                "scenario": scenario_name,
                "architecture": architecture,
                "attempt_number": attempt_number,
                "run_id": run_id,
                "command": command,
                "started_utc": iso(started),
                "finished_utc": iso(utc_now()),
                "elapsed_seconds": time.monotonic() - before,
                "return_code": return_code,
                "supervisor_timeout": supervisor_timeout,
                "result_path": str(result_path),
                "artifact_valid": artifact_valid,
                "checksums_sha256": checksum_directory(destination),
            }
            state["attempts"].append(attempt)
            if artifact_valid:
                state["completed"].append({
                    "seed": seed,
                    "scenario": scenario_name,
                    "architecture": architecture,
                    "run_id": run_id,
                    "result_path": str(result_path),
                    "checksums_sha256": attempt["checksums_sha256"],
                })
                completed.add(cell)
                atomic_json(state_path, state)
                break
            atomic_json(state_path, state)
        if cell not in completed:
            state["state"] = "INCOMPLETE"
            atomic_json(state_path, state)
            return 4
    state["state"] = "CAMPAIGN_COMPLETED"
    state["finished_utc"] = iso(utc_now())
    atomic_json(state_path, state)
    return 0


if __name__ == "__main__":
    signal.signal(signal.SIGTERM, lambda _signum, _frame: sys.exit(143))
    raise SystemExit(main())
