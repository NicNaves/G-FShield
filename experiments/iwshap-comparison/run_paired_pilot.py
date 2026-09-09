#!/usr/bin/env python3
"""Run a resumable matched distributed/monolith pilot on IWSHAP data."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import signal
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def atomic_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(
        json.dumps(value, indent=2, sort_keys=True, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    os.replace(temporary, path)


def terminate(process: subprocess.Popen[str], grace_seconds: int) -> None:
    if process.poll() is not None:
        return
    if os.name == "posix":
        os.killpg(process.pid, signal.SIGTERM)
    else:
        process.terminate()
    try:
        process.wait(timeout=grace_seconds)
    except subprocess.TimeoutExpired:
        if os.name == "posix":
            os.killpg(process.pid, signal.SIGKILL)
        else:
            process.kill()
        process.wait(timeout=30)


def split_hashes(scenario: dict[str, Any], data_root: Path) -> dict[str, str]:
    hashes: dict[str, str] = {}
    for split in ("train", "validation", "test"):
        path = data_root / scenario["scenario"] / "campaign" / f"erenoall-{split}.arff"
        expected = scenario["splits"][split]["full_arff"]["sha256"]
        actual = sha256_file(path)
        if actual != expected:
            raise RuntimeError(f"{path} hash mismatch: expected {expected}, got {actual}")
        hashes[split] = actual
    return hashes


def command_for(
    args: argparse.Namespace,
    scenario: dict[str, Any],
    architecture: str,
    output: Path,
) -> tuple[list[str], str]:
    scenario_name = scenario["scenario"]
    run_id = f"iwshap-pilot-{scenario_name}-{architecture}-s{args.seed}"
    dataset_dir = args.data_root.resolve() / scenario_name
    dataset_hash = scenario["split_index"]["sha256"]
    common = [
        "--campaign-id", "gfshield-iwshap-paired-pilot-2026",
        "--arm-id", f"matched-rf-vnd-iwssr-{architecture}",
        "--run-id", run_id,
        "--seed", str(args.seed),
        "--dataset-dir", str(dataset_dir),
        "--output-dir", str(output),
        "--run-timeout-seconds", str(args.run_timeout_seconds),
        "--finalization-reserve-seconds", str(args.finalization_reserve_seconds),
        "--max-accepted-improvements", str(args.max_accepted_improvements),
        "--minimum-improvement", str(args.minimum_improvement),
        "--image-tag", args.image_tag,
        "--cpuset", args.cpuset,
        "--numa-node", args.numa_node,
        "--aggregate-cpus", str(args.aggregate_cpus),
        "--aggregate-memory", args.aggregate_memory,
    ]
    if architecture == "monolith":
        return ([
            sys.executable, str(args.monolith_runner.resolve()),
            "--monolith", "monolith2", "--matched-architecture", *common,
            "--dataset-hash", dataset_hash,
        ], run_id)
    return ([
        sys.executable, str(args.distributed_runner.resolve()), *common,
        "--construction", "relieff",
        "--controller", "vnd",
        "--local-search", "iwssr",
        "--enabled-local-searches", "iwssr",
        "--pipeline-workers", str(args.pipeline_workers),
        "--use-training-cache",
        "--startup-timeout-seconds", str(args.startup_timeout_seconds),
        "--max-generations", "2147483647",
        "--rcl-cutoff", "30",
        "--sample-size", "5",
        "--relieff-sample-size", "1000",
        "--neighborhood-iterations", "100",
        "--local-search-iterations", "100",
        "--evaluator-image", args.evaluator_image,
        "--feature-count", str(scenario["features"]),
        "--dataset-hash", dataset_hash,
        "--train-hash", scenario["splits"]["train"]["full_arff"]["sha256"],
        "--validation-hash", scenario["splits"]["validation"]["full_arff"]["sha256"],
        "--test-hash", scenario["splits"]["test"]["full_arff"]["sha256"],
    ], run_id)


def valid_result(path: Path, scenario: str, architecture: str, run_id: str) -> bool:
    try:
        result = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return False
    return (
        result.get("campaign_id") == "gfshield-iwshap-paired-pilot-2026"
        and result.get("arm_id") == f"matched-rf-vnd-iwssr-{architecture}"
        and result.get("run_id") == run_id
        and result.get("status") in {"completed", "timeout"}
        and isinstance(result.get("test_f1_macro"), (int, float))
        and isinstance(result.get("candidate_count"), int)
        and result["candidate_count"] > 0
        and scenario in run_id
    )


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-root", required=True, type=Path)
    parser.add_argument("--output-root", required=True, type=Path)
    parser.add_argument("--distributed-runner", type=Path, default=root / "10-day-campaign/run_arm.py")
    parser.add_argument("--monolith-runner", type=Path, default=root / "10-day-campaign/run_monolith.py")
    parser.add_argument("--image-tag", default="quality-5dec3b1")
    parser.add_argument("--evaluator-image", default="gfshield-campaign-evaluator:quality-5dec3b1")
    parser.add_argument("--seed", type=int, default=20260909)
    parser.add_argument("--run-timeout-seconds", type=int, default=1200)
    parser.add_argument("--finalization-reserve-seconds", type=int, default=120)
    parser.add_argument("--global-timeout-seconds", type=int, default=7200)
    parser.add_argument("--shutdown-grace-seconds", type=int, default=300)
    parser.add_argument("--max-accepted-improvements", type=int, default=50)
    parser.add_argument("--minimum-improvement", type=float, default=0.0001)
    parser.add_argument("--pipeline-workers", type=int, default=3)
    parser.add_argument("--startup-timeout-seconds", type=int, default=300)
    parser.add_argument("--cpuset", default="8-15")
    parser.add_argument("--numa-node", default="1")
    parser.add_argument("--aggregate-cpus", type=float, default=6.0)
    parser.add_argument("--aggregate-memory", default="12g")
    args = parser.parse_args()
    if not 0 < args.finalization_reserve_seconds < args.run_timeout_seconds:
        parser.error("finalization reserve must be positive and shorter than run timeout")

    manifest_path = args.data_root.resolve() / "audit-and-split-manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    for scenario in manifest["scenarios"]:
        split_hashes(scenario, args.data_root.resolve())

    output_root = args.output_root.resolve()
    output_root.mkdir(parents=True, exist_ok=True)
    state_path = output_root / "state.json"
    effective_configuration = {
        "algorithm": "ReliefF + VND + IWSSR",
        "pipeline_workers": args.pipeline_workers,
        "run_timeout_seconds": args.run_timeout_seconds,
        "finalization_reserve_seconds": args.finalization_reserve_seconds,
        "max_accepted_improvements": args.max_accepted_improvements,
        "minimum_improvement": args.minimum_improvement,
        "cpuset": args.cpuset,
        "numa_node": args.numa_node,
        "aggregate_cpus": args.aggregate_cpus,
        "aggregate_memory": args.aggregate_memory,
        "image_tag": args.image_tag,
        "evaluator_image": args.evaluator_image,
    }
    if state_path.exists():
        state = json.loads(state_path.read_text(encoding="utf-8"))
    else:
        started = utc_now()
        state = {
            "schema_version": 1,
            "state": "RUNNING",
            "started_utc": iso(started),
            "deadline_utc": iso(started + timedelta(seconds=args.global_timeout_seconds)),
            "source_commit": manifest["source_commit"],
            "seed": args.seed,
            "configuration": effective_configuration,
            "attempts": [],
            "completed": [],
        }
        atomic_json(state_path, state)
    if state.get("seed") != args.seed or state.get("configuration") != effective_configuration:
        raise RuntimeError("existing state uses a different seed or configuration")

    completed = {(row["scenario"], row["architecture"]) for row in state["completed"]}
    scenarios = {row["scenario"]: row for row in manifest["scenarios"]}
    schedule = (
        ("suspension", "distributed"),
        ("suspension", "monolith"),
        ("fabrication", "monolith"),
        ("fabrication", "distributed"),
    )
    deadline = datetime.fromisoformat(state["deadline_utc"])
    for scenario_name, architecture in schedule:
        if (scenario_name, architecture) in completed:
            continue
        if utc_now() >= deadline:
            state["state"] = "GLOBAL_TIMEOUT"
            atomic_json(state_path, state)
            return 3
        destination = output_root / scenario_name / architecture
        command, run_id = command_for(args, scenarios[scenario_name], architecture, destination)
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
                timed_out = False
            except subprocess.TimeoutExpired:
                timed_out = True
                terminate(process, args.shutdown_grace_seconds)
                return_code = 124
        result_path = destination / "final-result.json"
        artifact_valid = valid_result(result_path, scenario_name, architecture, run_id)
        attempt = {
            "scenario": scenario_name,
            "architecture": architecture,
            "run_id": run_id,
            "command": command,
            "started_utc": iso(started),
            "finished_utc": iso(utc_now()),
            "elapsed_seconds": time.monotonic() - before,
            "return_code": return_code,
            "outer_timeout": timed_out,
            "result_path": str(result_path),
            "artifact_valid": artifact_valid,
        }
        state["attempts"].append(attempt)
        if artifact_valid:
            state["completed"].append({
                "scenario": scenario_name,
                "architecture": architecture,
                "run_id": run_id,
                "result_path": str(result_path),
            })
            completed.add((scenario_name, architecture))
        else:
            state["state"] = "INCOMPLETE"
            atomic_json(state_path, state)
            return 4
        atomic_json(state_path, state)

    state["state"] = "PILOT_COMPLETED"
    state["finished_utc"] = iso(utc_now())
    atomic_json(state_path, state)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
