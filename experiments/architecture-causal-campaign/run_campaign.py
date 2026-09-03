#!/usr/bin/env python3
"""Run the paired architecture campaign with an immutable ten-day deadline."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
import signal
import subprocess
import tempfile
import time
import uuid
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


def sha256_json(value: object) -> str:
    payload = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def atomic_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as handle:
            json.dump(value, handle, indent=2, sort_keys=True, ensure_ascii=False)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    except BaseException:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass
        raise


def checked(*command: str, cwd: Path | None = None) -> str:
    return subprocess.run(
        list(command), cwd=cwd, check=True, capture_output=True, text=True,
    ).stdout.strip()


def best_effort(*command: str) -> str | None:
    try:
        return checked(*command)
    except (OSError, subprocess.CalledProcessError):
        return None


def image_id(reference: str) -> str:
    return checked("docker", "image", "inspect", reference, "--format", "{{.Id}}")


def dataset_paths(repo_root: Path) -> dict[str, Path]:
    root = repo_root / "datasets/campaign"
    return {
        "train": root / "erenoall-train.arff",
        "validation": root / "erenoall-validation.arff",
        "test": root / "erenoall-test.arff",
    }


def validate_inputs(protocol: dict[str, Any], repo_root: Path, tag: str, image_tag: str) -> dict[str, Any]:
    if len(protocol["seeds"]) < 20 or len(protocol["seeds"]) != len(set(protocol["seeds"])):
        raise RuntimeError("the causal campaign requires at least 20 unique paired seeds")
    if protocol["maximum_seconds"] > 10 * 24 * 60 * 60:
        raise RuntimeError("campaign maximum exceeds ten days")
    resources = protocol["resources"]
    component_limits = resources["distributed_component_ceiling_sum"]
    cpu_sum = sum(float(component["cpu"]) for component in component_limits.values())
    memory_sum = sum(float(component["memory_gib"]) for component in component_limits.values())
    expected_memory = float(str(resources["aggregate_memory"]).lower().removesuffix("g"))
    if abs(cpu_sum - float(resources["aggregate_cpu_ceiling"])) > 1e-9:
        raise RuntimeError("distributed component CPU limits do not equal the aggregate ceiling")
    if abs(memory_sum - expected_memory) > 1e-9:
        raise RuntimeError("distributed component memory limits do not equal the aggregate ceiling")
    workers = int(protocol["algorithm"]["pipeline_workers"])
    if workers < 2 or any(
        int(component_limits[name].get("concurrency", workers)) != workers
        for name in ("iwssr", "vnd", "verifier")
    ) or int(component_limits["kafka"]["partitions"]) != workers:
        raise RuntimeError("pipeline worker, consumer, and Kafka partition counts are inconsistent")
    head = checked("git", "rev-parse", "HEAD", cwd=repo_root)
    tag_commit = checked("git", "rev-list", "-n", "1", tag, cwd=repo_root)
    if head != tag_commit:
        raise RuntimeError("campaign tag does not resolve to HEAD")
    if checked("git", "status", "--porcelain", cwd=repo_root):
        raise RuntimeError("refusing to launch from a dirty worktree")

    paths = dataset_paths(repo_root)
    expected = {
        "train": protocol["dataset"]["train_sha256"],
        "validation": protocol["dataset"]["validation_sha256"],
        "test": protocol["dataset"]["test_sha256"],
    }
    actual = {name: sha256_file(path) for name, path in paths.items()}
    if actual != expected:
        raise RuntimeError(f"dataset hash mismatch: expected={expected} actual={actual}")

    references = {
        "rcl_relief": f"gfshield-campaign-rcl-relieff:{image_tag}",
        "dls_iwssr": f"gfshield-campaign-dls-iwssr:{image_tag}",
        "dls_vnd": f"gfshield-campaign-dls-vnd:{image_tag}",
        "dls_verify": f"gfshield-campaign-dls-verify:{image_tag}",
        "evaluator": f"gfshield-campaign-evaluator:{image_tag}",
        "monolith": f"gfshield-campaign-monolith2:{image_tag}",
    }
    images = {name: {"reference": ref, "image_id": image_id(ref)} for name, ref in references.items()}
    return {
        "launch_commit": head,
        "campaign_tag": tag,
        "dataset_hashes": actual,
        "images": images,
        "host": {
            "node": platform.node(),
            "platform": platform.platform(),
            "python": platform.python_version(),
            "docker": checked("docker", "version", "--format", "{{.Server.Version}}"),
            "logical_cpus": os.cpu_count(),
            "load_average": os.getloadavg() if hasattr(os, "getloadavg") else None,
            "lscpu_json": best_effort("lscpu", "--json"),
            "memory_info": best_effort("cat", "/proc/meminfo"),
            "docker_info_json": best_effort("docker", "info", "--format", "{{json .}}"),
            "concurrent_containers_jsonl": best_effort(
                "docker", "ps", "--no-trunc", "--format", "{{json .}}"
            ),
        },
    }


def common_arguments(
    protocol: dict[str, Any], repo_root: Path, output: Path, architecture: str,
    seed: int, run_id: str, image_tag: str,
) -> list[str]:
    resources = protocol["resources"]
    algorithm = protocol["algorithm"]
    dataset = protocol["dataset"]
    common = [
        "--campaign-id", protocol["campaign_id"],
        "--arm-id", f"matched-rf-vnd-iwssr-{architecture}",
        "--run-id", run_id,
        "--seed", str(seed),
        "--dataset-dir", str(repo_root / "datasets"),
        "--output-dir", str(output),
        "--run-timeout-seconds", str(protocol["run_timeout_seconds"]),
        "--finalization-reserve-seconds", str(protocol["finalization_reserve_seconds"]),
        "--max-accepted-improvements", str(algorithm["maximum_accepted_improvements"]),
        "--minimum-improvement", str(algorithm["minimum_improvement"]),
        "--image-tag", image_tag,
        "--cpuset", resources["cpuset"],
        "--numa-node", resources["numa_node"],
        "--aggregate-cpus", str(resources["aggregate_cpu_ceiling"]),
        "--aggregate-memory", resources["aggregate_memory"],
    ]
    if architecture == "monolith":
        return [
            "python3", str(repo_root / "experiments/10-day-campaign/run_monolith.py"),
            "--monolith", "monolith2", "--matched-architecture", *common,
            "--dataset-hash", dataset["source_sha256"],
        ]
    return [
        "python3", str(repo_root / "experiments/10-day-campaign/run_arm.py"),
        *common,
        "--construction", "relieff", "--controller", "vnd",
        "--local-search", "iwssr", "--enabled-local-searches", "iwssr",
        "--pipeline-workers", str(algorithm["pipeline_workers"]),
        "--use-training-cache",
        "--startup-timeout-seconds", str(protocol["startup_timeout_seconds"]),
        "--max-generations", "2147483647",
        "--rcl-cutoff", str(algorithm["rcl_cutoff"]),
        "--sample-size", str(algorithm["initial_subset_size"]),
        "--relieff-sample-size", str(algorithm["relieff_sample_size"]),
        "--neighborhood-iterations", str(algorithm["neighborhood_cycles"]),
        "--local-search-iterations", str(algorithm["local_search_iterations"]),
        "--evaluator-image", f"gfshield-campaign-evaluator:{image_tag}",
        "--feature-count", "51",
        "--dataset-hash", dataset["source_sha256"],
        "--train-hash", dataset["train_sha256"],
        "--validation-hash", dataset["validation_sha256"],
        "--test-hash", dataset["test_sha256"],
    ]


def checksum_manifest(root: Path) -> Path:
    target = root / "checksums.sha256"
    rows = []
    for path in sorted(item for item in root.rglob("*") if item.is_file() and item != target):
        rows.append(f"{sha256_file(path)}  {path.relative_to(root).as_posix()}")
    target.write_text("\n".join(rows) + "\n", encoding="utf-8", newline="\n")
    return target


def valid_result(path: Path, protocol: dict[str, Any], architecture: str, seed: int, run_id: str) -> bool:
    try:
        result = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return False
    expected = {
        "campaign_id": protocol["campaign_id"],
        "arm_id": f"matched-rf-vnd-iwssr-{architecture}",
        "run_id": run_id,
        "seed": seed,
        "classifier": "Weka J48",
        "classifier_version": "weka-stable 3.8.6",
        "feature_selector": "relieff",
        "neighborhood_controller": "vnd",
        "local_search": "iwssr",
        "dataset_hash": protocol["dataset"]["source_sha256"],
        "train_hash": protocol["dataset"]["train_sha256"],
        "validation_hash": protocol["dataset"]["validation_sha256"],
        "test_hash": protocol["dataset"]["test_sha256"],
    }
    if any(result.get(key) != value for key, value in expected.items()):
        return False
    if not isinstance(result.get("candidate_count"), int) or result["candidate_count"] <= 0:
        return False
    if not isinstance(result.get("test_f1_macro"), (int, float)):
        return False
    return result.get("status") in {"completed", "timeout"}


def terminate_group(process: subprocess.Popen[str], grace: int) -> None:
    if process.poll() is not None:
        return
    os.killpg(process.pid, signal.SIGTERM)
    try:
        process.wait(timeout=grace)
    except subprocess.TimeoutExpired:
        os.killpg(process.pid, signal.SIGKILL)
        process.wait()


def run_cell(command: list[str], output: Path, timeout: int, grace: int) -> dict[str, Any]:
    output.mkdir(parents=True, exist_ok=True)
    started = utc_now()
    started_monotonic = time.monotonic()
    with (output / "supervisor.log").open("w", encoding="utf-8", newline="\n") as log:
        process = subprocess.Popen(
            command, stdout=log, stderr=subprocess.STDOUT, text=True, start_new_session=True,
        )
        try:
            return_code = process.wait(timeout=timeout + grace)
        except subprocess.TimeoutExpired:
            terminate_group(process, grace)
            return_code = 124
    return {
        "command": command,
        "started_utc": iso(started),
        "finished_utc": iso(utc_now()),
        "elapsed_seconds": time.monotonic() - started_monotonic,
        "return_code": return_code,
    }


def schedule(protocol: dict[str, Any], pilot_seed: int | None = None) -> list[tuple[int, str]]:
    seeds = [pilot_seed] if pilot_seed is not None else list(protocol["seeds"])
    rows = []
    for index, seed in enumerate(seeds):
        order = ("distributed", "monolith") if index % 2 == 0 else ("monolith", "distributed")
        rows.extend((seed, architecture) for architecture in order)
    return rows


def execute(args: argparse.Namespace) -> int:
    protocol = json.loads(args.protocol.read_text(encoding="utf-8"))
    if args.pilot_seed is not None:
        protocol["run_timeout_seconds"] = args.pilot_run_timeout_seconds
        protocol["finalization_reserve_seconds"] = args.pilot_finalization_reserve_seconds
        protocol["graceful_shutdown_seconds"] = min(
            protocol["graceful_shutdown_seconds"], args.pilot_run_timeout_seconds
        )
    repo_root = Path(__file__).resolve().parents[2]
    frozen = validate_inputs(protocol, repo_root, args.campaign_tag, args.image_tag)
    frozen.update({
        "protocol": protocol,
        "source_protocol_sha256": sha256_file(args.protocol),
        "effective_protocol_sha256": sha256_json(protocol),
        "image_tag": args.image_tag,
        "frozen_utc": iso(utc_now()),
    })
    frozen_path = args.state.with_name("frozen-manifest.json")
    if frozen_path.exists():
        previous = json.loads(frozen_path.read_text(encoding="utf-8"))
        if (
            previous["effective_protocol_sha256"] != frozen["effective_protocol_sha256"]
            or previous["launch_commit"] != frozen["launch_commit"]
        ):
            raise RuntimeError("existing frozen manifest does not match this launch")
    else:
        atomic_json(frozen_path, frozen)

    if args.state.exists():
        state = json.loads(args.state.read_text(encoding="utf-8"))
    else:
        start = utc_now()
        state = {
            "campaign_id": protocol["campaign_id"],
            "state": "RUNNING",
            "started_utc": iso(start),
            "deadline_utc": iso(start + timedelta(seconds=protocol["maximum_seconds"])),
            "completed": [],
            "attempts": [],
        }
        atomic_json(args.state, state)

    completed = {(row["seed"], row["architecture"]) for row in state["completed"]}
    deadline = datetime.fromisoformat(state["deadline_utc"])
    for seed, architecture in schedule(protocol, args.pilot_seed):
        if (seed, architecture) in completed:
            continue
        if utc_now() >= deadline:
            state["state"] = "GLOBAL_TIMEOUT"
            atomic_json(args.state, state)
            return 3
        for attempt_number in range(1, protocol["maximum_attempts_per_cell"] + 1):
            run_id = f"causal-{architecture}-s{seed}-{uuid.uuid4().hex[:12]}"
            output = (args.results / architecture / f"seed-{seed}" / run_id).resolve()
            command = common_arguments(protocol, repo_root, output, architecture, seed, run_id, args.image_tag)
            attempt = run_cell(
                command, output, protocol["run_timeout_seconds"],
                protocol["graceful_shutdown_seconds"],
            )
            attempt.update({
                "architecture": architecture,
                "seed": seed,
                "run_id": run_id,
                "attempt_number": attempt_number,
                "result_path": str(output / "final-result.json"),
            })
            attempt["artifact_valid"] = valid_result(
                output / "final-result.json", protocol, architecture, seed, run_id,
            )
            checksums = checksum_manifest(output)
            attempt["checksums_path"] = str(checksums)
            attempt["checksums_sha256"] = sha256_file(checksums)
            state["attempts"].append(attempt)
            if attempt["artifact_valid"]:
                state["completed"].append({
                    "architecture": architecture,
                    "seed": seed,
                    "run_id": run_id,
                    "result_path": attempt["result_path"],
                    "checksums_sha256": attempt["checksums_sha256"],
                })
                completed.add((seed, architecture))
                atomic_json(args.state, state)
                break
            atomic_json(args.state, state)
        if (seed, architecture) not in completed:
            state["state"] = "INCOMPLETE"
            atomic_json(args.state, state)
            return 4

    state["state"] = "PILOT_COMPLETED" if args.pilot_seed is not None else "CAMPAIGN_COMPLETED"
    state["finished_utc"] = iso(utc_now())
    atomic_json(args.state, state)
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--protocol", type=Path, required=True)
    parser.add_argument("--campaign-tag", required=True)
    parser.add_argument("--image-tag", required=True)
    parser.add_argument("--state", type=Path, required=True)
    parser.add_argument("--results", type=Path, required=True)
    parser.add_argument("--pilot-seed", type=int)
    parser.add_argument("--pilot-run-timeout-seconds", type=int, default=900)
    parser.add_argument("--pilot-finalization-reserve-seconds", type=int, default=300)
    args = parser.parse_args()
    if args.pilot_seed is not None:
        if args.pilot_run_timeout_seconds <= 0:
            parser.error("--pilot-run-timeout-seconds must be positive")
        if not 0 < args.pilot_finalization_reserve_seconds < args.pilot_run_timeout_seconds:
            parser.error("pilot finalization reserve must be positive and shorter than its timeout")
    return execute(args)


if __name__ == "__main__":
    raise SystemExit(main())
