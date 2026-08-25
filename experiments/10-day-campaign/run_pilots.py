#!/usr/bin/env python3
"""Run and validate the resumable pre-campaign pilot matrix."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import signal
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from run_arm import atomic_json


SOURCE_HASH = "60ebfcdc9c209e5c760e2bdbf5be75dfe4d931b81442597b0ef32e2f5fe6c1f6"
TRAIN_HASH = "5876bf5570b7f71d7bc4eb51ebb1792f6e7357c7010cce78248a121420a870af"
VALIDATION_HASH = "c44a00ca554c63e8134e01e1e5a2b2c1c167e4bcd02cd6e318d3d602a5f1031a"
TEST_HASH = "05d393c5881aec032664ef4a84e18337988e819edc74664fe1255757961cfab4"


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def common_arguments(args: argparse.Namespace, case: dict[str, str], output: Path) -> list[str]:
    run_id = f"{args.pilot_namespace}-{case['name']}"
    return [
        "--campaign-id", f"gfshield-formal-pilots-{args.pilot_namespace}",
        "--arm-id", case["name"],
        "--run-id", run_id,
        "--seed", str(args.seed),
        "--dataset-dir", str(args.dataset_dir.resolve()),
        "--output-dir", str(output.resolve()),
    ]


def command_for(args: argparse.Namespace, case: dict[str, str], output: Path) -> list[str]:
    root = Path(__file__).resolve().parents[2]
    common = common_arguments(args, case, output)
    resource = [
        "--cpuset", "8-15", "--numa-node", "1",
        "--aggregate-cpus", "8", "--aggregate-memory", "16g",
    ]
    if case["kind"] == "distributed":
        return [
            sys.executable, str(root / "experiments/10-day-campaign/run_arm.py"),
            *common,
            "--construction", case["construction"],
            "--controller", case["controller"],
            "--local-search", case["local_search"],
            "--run-timeout-seconds", str(args.duration_seconds),
            "--finalization-reserve-seconds", str(args.finalization_reserve_seconds),
            "--startup-timeout-seconds", "300",
            "--max-generations", "2147483647",
            "--rcl-cutoff", "30", "--sample-size", "5",
            "--neighborhood-iterations", "100",
            "--local-search-iterations", str(args.local_search_iterations),
            "--image-tag", args.image_tag,
            "--evaluator-image", f"gfshield-campaign-evaluator:{args.image_tag}",
            "--feature-count", "51",
            *resource,
            "--dataset-hash", SOURCE_HASH,
            "--train-hash", TRAIN_HASH,
            "--validation-hash", VALIDATION_HASH,
            "--test-hash", TEST_HASH,
        ]
    if case["kind"] in {"monolith1", "monolith2"}:
        return [
            sys.executable, str(root / "experiments/10-day-campaign/run_monolith.py"),
            "--monolith", case["kind"],
            *common,
            "--image-tag", args.image_tag,
            "--run-timeout-seconds", str(args.duration_seconds),
            "--finalization-reserve-seconds", str(args.finalization_reserve_seconds),
            *resource,
            "--dataset-hash", SOURCE_HASH,
        ]
    return [
        sys.executable, str(root / "experiments/10-day-campaign/run_baseline.py"),
        *common,
        "--evaluator-image", f"gfshield-campaign-evaluator:{args.image_tag}",
        "--feature-count", "51",
        *resource,
        "--dataset-hash", SOURCE_HASH,
        "--train-hash", TRAIN_HASH,
        "--validation-hash", VALIDATION_HASH,
        "--test-hash", TEST_HASH,
    ]


def validate_resource_samples(path: Path, expected_containers: int) -> tuple[list[str], dict[str, Any]]:
    issues: list[str] = []
    samples: list[dict[str, Any]] = []
    if path.exists():
        for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
            try:
                samples.append(json.loads(line))
            except json.JSONDecodeError:
                issues.append("resource sample contains invalid JSON")
    if not samples:
        return ["resource samples are missing"], {"sample_count": 0}
    richest = max(samples, key=lambda item: len(item.get("inspect") or []))
    inspected = richest.get("inspect") or []
    if len(inspected) < expected_containers:
        issues.append(f"expected {expected_containers} containers, observed {len(inspected)}")
    cpu_total = 0.0
    memory_total = 0
    restarts = 0
    oom = False
    cpusets: set[str] = set()
    memsets: set[str] = set()
    for container in inspected:
        host = container.get("HostConfig") or {}
        state = container.get("State") or {}
        cpu_total += float(host.get("NanoCpus") or 0) / 1_000_000_000
        memory_total += int(host.get("Memory") or 0)
        cpusets.add(str(host.get("CpusetCpus") or ""))
        memsets.add(str(host.get("CpusetMems") or ""))
        restarts += int(container.get("RestartCount") or 0)
        oom = oom or bool(state.get("OOMKilled"))
    if cpusets != {"8-15"}:
        issues.append(f"unexpected CPU sets: {sorted(cpusets)}")
    if memsets != {"1"}:
        issues.append(f"unexpected NUMA memory sets: {sorted(memsets)}")
    if abs(cpu_total - 8.0) > 0.01:
        issues.append(f"aggregate CPU limit is {cpu_total}, expected 8")
    if memory_total != 16 * 1024**3:
        issues.append(f"aggregate memory limit is {memory_total}, expected {16 * 1024**3}")
    if restarts:
        issues.append(f"observed {restarts} container restarts")
    if oom:
        issues.append("an OOM-killed container was observed")
    return issues, {
        "sample_count": len(samples),
        "container_count": len(inspected),
        "aggregate_cpus": cpu_total,
        "aggregate_memory_bytes": memory_total,
        "cpusets": sorted(cpusets),
        "numa_memory_sets": sorted(memsets),
        "restart_count": restarts,
        "oom_killed": oom,
    }


def validate_case(output: Path, case: dict[str, str], duration_seconds: int) -> dict[str, Any]:
    issues: list[str] = []
    result_path = output / "final-result.json"
    result: dict[str, Any] = {}
    if not result_path.exists():
        issues.append("final-result.json is missing")
    else:
        try:
            result = json.loads(result_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as error:
            issues.append(f"invalid final-result.json: {error}")
    required = json.loads(
        (Path(__file__).with_name("result-schema.json")).read_text(encoding="utf-8")
    )["required"]
    missing = [field for field in required if field not in result]
    if missing:
        issues.append(f"missing required result fields: {missing}")
    if result.get("status") not in {"completed", "timeout"}:
        issues.append(f"invalid result status: {result.get('status')!r}")
    elapsed = result.get("run_elapsed_ms")
    if not isinstance(elapsed, int) or elapsed > duration_seconds * 1000:
        issues.append(f"run elapsed {elapsed!r} exceeds the absolute pilot limit")
    features = result.get("selected_features") or []
    if not features or len(features) != len(set(features)):
        issues.append("selected feature subset is empty or contains duplicates")
    for metric in ("validation_f1_macro", "test_f1_macro"):
        value = result.get(metric)
        if not isinstance(value, (int, float)) or not 0 <= value <= 1:
            issues.append(f"invalid {metric}: {value!r}")
    expected_containers = 8 if case["kind"] == "distributed" else 1
    resource_issues, resource_summary = validate_resource_samples(
        output / "resource-samples.jsonl", expected_containers
    )
    issues.extend(resource_issues)
    return {
        "approved": not issues,
        "issues": issues,
        "result": result,
        "resources": resource_summary,
    }


def cases() -> list[dict[str, str]]:
    return [
        {"name": "pilot-distributed-ig-vnd-bitflip", "kind": "distributed", "construction": "ig", "controller": "vnd", "local_search": "bitflip"},
        {"name": "pilot-distributed-gr-rvnd-iwss", "kind": "distributed", "construction": "gr", "controller": "rvnd", "local_search": "iwss"},
        {"name": "pilot-distributed-su-vnd-iwssr", "kind": "distributed", "construction": "su", "controller": "vnd", "local_search": "iwssr"},
        {"name": "pilot-distributed-relieff-rvnd-bitflip", "kind": "distributed", "construction": "relieff", "controller": "rvnd", "local_search": "bitflip"},
        {"name": "pilot-monolith1", "kind": "monolith1"},
        {"name": "pilot-monolith2", "kind": "monolith2"},
        {"name": "pilot-all-features-baseline", "kind": "baseline"},
    ]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset-dir", type=Path, required=True)
    parser.add_argument("--output-root", type=Path, required=True)
    parser.add_argument("--image-tag", required=True)
    parser.add_argument("--duration-seconds", type=int, default=30 * 60)
    parser.add_argument("--finalization-reserve-seconds", type=int, default=5 * 60)
    parser.add_argument("--local-search-iterations", type=int, default=5)
    parser.add_argument("--seed", type=int, default=104729)
    parser.add_argument("--pilot-namespace")
    args = parser.parse_args()
    if args.finalization_reserve_seconds >= args.duration_seconds:
        parser.error("finalization reserve must be shorter than pilot duration")
    if args.local_search_iterations <= 0:
        parser.error("local-search iterations must be positive")
    args.output_root.mkdir(parents=True, exist_ok=True)
    state_path = args.output_root / "pilot-state.json"
    report_path = args.output_root / "pilot-report.json"
    state = {
        "started_utc": utc_now(),
        "image_tag": args.image_tag,
        "duration_seconds": args.duration_seconds,
        "local_search_iterations": args.local_search_iterations,
        "seed": args.seed,
        "cases": {},
        "pilot_namespace": args.pilot_namespace
        or f"p{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}",
    }
    if state_path.exists():
        state = json.loads(state_path.read_text(encoding="utf-8"))
        if state.get("image_tag") != args.image_tag:
            raise RuntimeError("existing pilot state belongs to a different image tag")
        if args.pilot_namespace and state.get("pilot_namespace") != args.pilot_namespace:
            raise RuntimeError("existing pilot state belongs to a different pilot namespace")
        if state.get("local_search_iterations") != args.local_search_iterations:
            raise RuntimeError("existing pilot state uses different local-search iterations")
    args.pilot_namespace = state["pilot_namespace"]
    atomic_json(state_path, state)
    for case in cases():
        output = args.output_root / case["name"]
        prior = validate_case(output, case, args.duration_seconds) if output.exists() else {"approved": False}
        if prior.get("approved"):
            state["cases"][case["name"]] = {"status": "reused", **prior}
            atomic_json(state_path, state)
            continue
        if shutil.disk_usage(args.output_root).free < 10 * 1024**3:
            raise RuntimeError("less than 10 GiB free before pilot launch")
        command = command_for(args, case, output)
        log_path = args.output_root / f"{case['name']}.orchestrator.log"
        state["active_case"] = {"name": case["name"], "command": command, "started_utc": utc_now()}
        atomic_json(state_path, state)
        with log_path.open("ab", buffering=0) as log:
            process = subprocess.Popen(
                command, stdout=log, stderr=subprocess.STDOUT,
                start_new_session=(os.name == "posix"),
            )
            try:
                return_code = process.wait(timeout=args.duration_seconds + 5 * 60)
            except KeyboardInterrupt:
                if os.name == "posix":
                    os.killpg(process.pid, signal.SIGTERM)
                else:
                    process.terminate()
                try:
                    return_code = process.wait(timeout=60)
                except subprocess.TimeoutExpired:
                    if os.name == "posix":
                        os.killpg(process.pid, signal.SIGKILL)
                    else:
                        process.kill()
                    return_code = process.wait()
                state["interrupted_utc"] = utc_now()
                state["interrupted_case"] = case["name"]
                state.pop("active_case", None)
                atomic_json(state_path, state)
                return 130
            except subprocess.TimeoutExpired:
                if os.name == "posix":
                    os.killpg(process.pid, signal.SIGKILL)
                else:
                    process.kill()
                return_code = process.wait()
        validation = validate_case(output, case, args.duration_seconds)
        state["cases"][case["name"]] = {
            "status": "passed" if validation["approved"] else "failed",
            "return_code": return_code,
            "finished_utc": utc_now(),
            "command": command,
            **validation,
        }
        state.pop("active_case", None)
        atomic_json(state_path, state)
        if not validation["approved"]:
            break
    approved = len(state["cases"]) == len(cases()) and all(
        value.get("approved") for value in state["cases"].values()
    )
    report = {
        **state,
        "finished_utc": utc_now(),
        "approved": approved,
        "free_bytes_after": shutil.disk_usage(args.output_root).free,
    }
    atomic_json(report_path, report)
    return 0 if approved else 1


if __name__ == "__main__":
    raise SystemExit(main())
