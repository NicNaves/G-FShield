#!/usr/bin/env python3
"""Run a resumable paired concurrent-load campaign on X-CANIDS."""

from __future__ import annotations

import argparse
import json
import math
import os
import platform
import re
import signal
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from run_paired_campaign import checksum_directory, checked
from run_paired_pilot import atomic_json, iso, sha256_file, split_hashes, terminate, utc_now

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "10-day-campaign"))
from run_arm import (  # noqa: E402
    CONTROLLER_SERVICES,
    LOCAL_SEARCH_SERVICES,
    RCL_SERVICES,
    ResourceSampler,
    Stack,
    best_message,
    evaluate_selected_features,
    free_loopback_port,
    parse_best_messages,
    run,
    validation_times_to_targets_ms,
    wait_for_http_service,
    wait_for_port,
)

TEN_DAYS_SECONDS = 10 * 24 * 60 * 60
RESOURCE_PROFILES = {
    "baseline": {
        "rcl_cpus": 1.0, "rcl_memory_mib": 3072, "rcl_replicas": 1,
        "local_search_cpus": 3.0, "local_search_memory_mib": 4096,
    },
    "rebalanced": {
        "rcl_cpus": 3.0, "rcl_memory_mib": 4096, "rcl_replicas": 1,
        "local_search_cpus": 1.0, "local_search_memory_mib": 3072,
    },
    "scaled-rcl": {
        "rcl_cpus": 3.0, "rcl_memory_mib": 4096, "rcl_replicas": 4,
        "local_search_cpus": 1.0, "local_search_memory_mib": 3072,
    },
}
RCL_GENERATION = re.compile(
    r"rcl generation ready algorithm=RELIEF requestId=(\S+).*?seedId=(\S+).*?campaignElapsedMs=(\d+)"
)
IWSSR_ITERATION = re.compile(
    r"dls iteration search=IWSSR seedId=(\S+).*?campaignElapsedMs=(\d+)"
)


def parse_ints(value: str) -> list[int]:
    rows = [int(item.strip()) for item in value.split(",") if item.strip()]
    if not rows or len(rows) != len(set(rows)):
        raise argparse.ArgumentTypeError("values must be unique comma-separated integers")
    return rows


def memory_mib(value: str) -> int:
    match = re.fullmatch(r"(\d+)([gGmM])", value)
    if not match:
        raise ValueError("aggregate memory must use an integer g or m suffix")
    amount = int(match.group(1))
    return amount * 1024 if match.group(2).lower() == "g" else amount


def resource_profile(args: argparse.Namespace, concurrency: int) -> dict[str, Any]:
    profile = dict(RESOURCE_PROFILES[args.distributed_profile])
    requested_replicas = args.rcl_replicas or profile["rcl_replicas"]
    replicas = min(concurrency, requested_replicas)
    profile["rcl_replicas"] = replicas
    profile["rcl_cpus_per_replica"] = profile["rcl_cpus"] / replicas
    profile["rcl_memory_per_replica_mib"] = profile["rcl_memory_mib"] // replicas
    profile["requests_per_replica"] = math.ceil(concurrency / replicas)
    profile["name"] = args.distributed_profile
    return profile


def java_opts(memory_limit_mib: int) -> str:
    heap_mib = max(384, int(memory_limit_mib * 0.72))
    initial_mib = min(512, max(256, heap_mib // 4))
    return (
        f"-Xms{initial_mib}m -Xmx{heap_mib}m "
        "-XX:+UseContainerSupport -XX:+UseG1GC"
    )


def scenario_manifest(data_root: Path) -> tuple[Path, dict[str, dict[str, Any]]]:
    manifest_path = data_root / "audit-and-split-manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    scenarios = {row["scenario"]: row for row in manifest["scenarios"]}
    for row in scenarios.values():
        split_hashes(row, data_root)
    return manifest_path, scenarios


def capture_environment(args: argparse.Namespace, manifest_path: Path) -> dict[str, Any]:
    repo_root = Path(__file__).resolve().parents[2]
    if checked("git", "status", "--porcelain", cwd=repo_root):
        raise RuntimeError("refusing to freeze a formal load campaign from a dirty worktree")
    references = [
        f"gfshield-campaign-rcl-relieff:{args.image_tag}",
        f"gfshield-campaign-dls-iwssr:{args.image_tag}",
        f"gfshield-campaign-dls-vnd:{args.image_tag}",
        f"gfshield-campaign-dls-verify:{args.image_tag}",
        args.evaluator_image,
        f"gfshield-campaign-monolith2:{args.image_tag}",
    ]
    protocol_name = (
        "concurrent-load-protocol-v1.json"
        if args.distributed_profile == "baseline"
        else "concurrent-load-optimization-protocol-v1.json"
    )
    protocol_path = Path(__file__).with_name(protocol_name)
    return {
        "launch_commit": checked("git", "rev-parse", "HEAD", cwd=repo_root),
        "protocol_path": str(protocol_path),
        "protocol_sha256": sha256_file(protocol_path),
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


def job_ids(batch_id: str, seeds: list[int]) -> list[dict[str, Any]]:
    return [
        {
            "seed": seed,
            "request_id": f"{batch_id}-request-{index + 1}",
            "run_id": f"{batch_id}-job-{index + 1}-s{seed}",
        }
        for index, seed in enumerate(seeds)
    ]


def query_for(job: dict[str, Any], deadline_epoch_ms: int) -> str:
    return urllib.parse.urlencode({
        "maxGenerations": 2_147_483_647,
        "rclCutoff": 30,
        "sampleSize": 5,
        "datasetTrainingName": "campaign/erenoall-train.arff",
        "datasetTestingName": "campaign/erenoall-validation.arff",
        "classifier": "J48",
        "useTrainingCache": "true",
        "neighborhoodStrategy": "VND",
        "localSearches": "IWSSR",
        "neighborhoodMaxIterations": 100,
        "iwssrMaxIterations": 100,
        "requestId": job["request_id"],
        "runId": job["run_id"],
        "randomSeed": job["seed"],
        "deadlineEpochMs": deadline_epoch_ms,
    })


def request_counts(compose_log: Path, jobs: list[dict[str, Any]], cutoff_ms: int) -> dict[str, dict[str, int]]:
    by_request = {job["request_id"]: {"construction": 0, "local_search": 0} for job in jobs}
    seed_owner: dict[str, str] = {}
    if not compose_log.exists():
        return by_request
    for line in compose_log.read_text(encoding="utf-8", errors="replace").splitlines():
        generation = RCL_GENERATION.search(line)
        if generation and int(generation.group(3)) <= cutoff_ms:
            owner, seed_id = generation.group(1), generation.group(2)
            if owner in by_request:
                by_request[owner]["construction"] += 1
                seed_owner[seed_id] = owner
            continue
        iteration = IWSSR_ITERATION.search(line)
        if iteration and int(iteration.group(2)) <= cutoff_ms:
            owner = seed_owner.get(iteration.group(1))
            if owner is not None:
                by_request[owner]["local_search"] += 1
    return by_request


def distributed_batch(
    args: argparse.Namespace,
    scenario: dict[str, Any],
    batch_id: str,
    seeds: list[int],
    output: Path,
) -> dict[str, Any]:
    output.mkdir(parents=True, exist_ok=True)
    jobs = job_ids(batch_id, seeds)
    profile = resource_profile(args, len(jobs))
    rcl_replicas = profile["rcl_replicas"]
    project = re.sub(r"[^a-z0-9_-]", "-", f"gfsload-{batch_id}".lower())[:48]
    compose = ROOT / "10-day-campaign/docker-compose.campaign.yml"
    port = free_loopback_port() if rcl_replicas == 1 else 0
    metrics = output / "metrics"
    selection_seconds = args.run_timeout_seconds - args.finalization_reserve_seconds
    runner_start = time.monotonic()
    runner_start_ns = time.monotonic_ns()
    provisional_deadline = int(
        (time.time() + args.startup_timeout_seconds + selection_seconds) * 1000
    )
    environment = os.environ.copy()
    environment.update({
        "CAMPAIGN_DATASET_DIR": str((args.data_root / scenario["scenario"]).resolve()),
        "CAMPAIGN_METRICS_DIR": str(metrics.resolve()),
        "CAMPAIGN_ID": args.campaign_id,
        "CAMPAIGN_ARM_ID": "concurrent-load-distributed",
        "CAMPAIGN_RUN_ID": batch_id,
        "CAMPAIGN_REQUEST_ID": f"{batch_id}-template",
        "CAMPAIGN_RANDOM_SEED": str(seeds[0]),
        "CAMPAIGN_DEADLINE_EPOCH_MS": str(provisional_deadline),
        "CAMPAIGN_START_MONOTONIC_NS": str(runner_start_ns),
        "CAMPAIGN_RCL_HOST_PORT": str(port),
        "CAMPAIGN_CPUSET": args.cpuset,
        "CAMPAIGN_IMAGE_TAG": args.image_tag,
        "CAMPAIGN_MINIMUM_IMPROVEMENT": str(args.minimum_improvement),
        "CAMPAIGN_MAX_ACCEPTED_IMPROVEMENTS": str(args.max_accepted_improvements),
        "CAMPAIGN_RELIEFF_SAMPLE_SIZE": "1000",
        "CAMPAIGN_RCL_CPUS": str(profile["rcl_cpus_per_replica"]),
        "CAMPAIGN_RCL_MEMORY": f"{profile['rcl_memory_per_replica_mib']}m",
        "CAMPAIGN_RCL_JAVA_OPTS": java_opts(profile["rcl_memory_per_replica_mib"]),
        "CAMPAIGN_RCL_ASYNC_CORE_SIZE": str(profile["requests_per_replica"]),
        "CAMPAIGN_RCL_ASYNC_MAX_SIZE": str(profile["requests_per_replica"]),
        "CAMPAIGN_RCL_ASYNC_QUEUE_CAPACITY": str(max(16, profile["requests_per_replica"])),
        "CAMPAIGN_LOCAL_SEARCH_CPUS": str(profile["local_search_cpus"]),
        "CAMPAIGN_LOCAL_SEARCH_MEMORY": f"{profile['local_search_memory_mib']}m",
        "CAMPAIGN_LOCAL_SEARCH_JAVA_OPTS": java_opts(profile["local_search_memory_mib"]),
        "CAMPAIGN_LOCAL_SEARCH_CONCURRENCY": str(args.pipeline_workers),
        "CAMPAIGN_CONTROLLER_CPUS": "0.5",
        "CAMPAIGN_CONTROLLER_MEMORY": "1g",
        "CAMPAIGN_CONTROLLER_JAVA_OPTS": "-Xms128m -Xmx700m -XX:+UseContainerSupport -XX:+UseG1GC",
        "CAMPAIGN_CONTROLLER_CONCURRENCY": str(args.pipeline_workers),
        "CAMPAIGN_VERIFY_CPUS": "0.5",
        "CAMPAIGN_VERIFY_MEMORY": "1g",
        "CAMPAIGN_VERIFY_CONCURRENCY": str(args.pipeline_workers),
        "CAMPAIGN_KAFKA_CPUS": "0.75",
        "CAMPAIGN_KAFKA_MEMORY": "2g",
        "CAMPAIGN_KAFKA_PARTITIONS": str(max(args.pipeline_workers, len(jobs))),
        "CAMPAIGN_ZOOKEEPER_CPUS": "0.25",
        "CAMPAIGN_ZOOKEEPER_MEMORY": "1g",
    })
    services = [
        "zookeeper", "kafka", RCL_SERVICES["relieff"][0],
        LOCAL_SEARCH_SERVICES["iwssr"], CONTROLLER_SERVICES["vnd"],
        "grasp-fs-dls-verify",
    ]
    algorithm_services = services[2:]
    stack = Stack(project, compose, environment)
    sampler = ResourceSampler(project, compose, environment, output / "resource-samples.jsonl")
    raw_messages = output / "best-solution-messages.jsonl"
    raw_errors = output / "kafka-consumer.stderr.log"
    consumer = None
    stdout_handle = None
    stderr_handle = None
    launches: list[dict[str, Any]] = []
    infrastructure_error = None
    measurement_start = time.monotonic()
    measurement_offset_ms = 0
    selection_finished_ms = 0
    try:
        stack.down()
        with (output / "resolved-compose.yaml").open("w", encoding="utf-8") as handle:
            stack.call("config", stdout=handle)
        with (output / "compose-up.log").open("w", encoding="utf-8") as handle:
            up_args = ["up", "-d", "--no-build"]
            if rcl_replicas > 1:
                up_args.extend(["--scale", f"{RCL_SERVICES['relieff'][0]}={rcl_replicas}"])
            stack.call(*up_args, *services, stdout=handle, stderr=subprocess.STDOUT)
        ids = stack.call("ps", "-q", capture_output=True).stdout.split()
        rcl_ids = stack.call(
            "ps", "-q", RCL_SERVICES["relieff"][0], capture_output=True
        ).stdout.split()
        if not ids or len(rcl_ids) != rcl_replicas:
            raise RuntimeError(
                f"shared stack expected {rcl_replicas} RCL replicas but found {len(rcl_ids)}"
            )
        run(["docker", "update", "--cpuset-mems", args.numa_node, *ids], capture_output=True)
        startup_deadline = time.monotonic() + args.startup_timeout_seconds
        route = RCL_SERVICES["relieff"][2]
        if rcl_replicas == 1:
            rcl_ports = [port]
        else:
            port_template = '{{(index (index .NetworkSettings.Ports "8086/tcp") 0).HostPort}}'
            rcl_ports = [
                int(checked("docker", "inspect", "--format", port_template, container_id))
                for container_id in rcl_ids
            ]
        for rcl_port in rcl_ports:
            wait_for_port(rcl_port, startup_deadline)
            wait_for_http_service(rcl_port, route, startup_deadline)
        stdout_handle = raw_messages.open("w", encoding="utf-8", newline="\n")
        stderr_handle = raw_errors.open("w", encoding="utf-8", newline="\n")
        consumer = subprocess.Popen(
            stack.command("exec", "-T", "kafka", "kafka-console-consumer",
                          "--bootstrap-server", "kafka:9092", "--topic", "BEST_SOLUTION_TOPIC",
                          "--from-beginning"),
            env=environment, stdout=stdout_handle, stderr=stderr_handle,
            text=True, start_new_session=True,
        )
        sampler.start()
        measurement_start = time.monotonic()
        measurement_offset_ms = int(round((measurement_start - runner_start) * 1000))
        deadline_epoch_ms = int((time.time() + selection_seconds) * 1000)
        for job_index, job in enumerate(jobs):
            sent = time.monotonic()
            replica_index = job_index % len(rcl_ports)
            request_port = rcl_ports[replica_index]
            request = urllib.request.Request(
                f"http://127.0.0.1:{request_port}{route}?{query_for(job, deadline_epoch_ms)}",
                method="POST",
            )
            with urllib.request.urlopen(request, timeout=30) as response:
                body = json.loads(response.read().decode("utf-8"))
            launches.append({
                **job,
                "accepted_request_id": body.get("requestId"),
                "rcl_replica_index": replica_index,
                "rcl_host_port": request_port,
                "launch_offset_ms": int(round((sent - measurement_start) * 1000)),
                "response_offset_ms": int(round((time.monotonic() - measurement_start) * 1000)),
            })
        atomic_json(output / "launches.json", launches)
        remaining = measurement_start + selection_seconds - time.monotonic()
        if remaining > 0:
            time.sleep(remaining)
        selection_finished_ms = int(round((time.monotonic() - measurement_start) * 1000))
    except Exception as error:
        infrastructure_error = repr(error)
        atomic_json(output / "runner-error.json", {"timestamp_utc": iso(utc_now()), "error": infrastructure_error})
    finally:
        sampler.stop()
        stack.call("stop", "--timeout", "30", *algorithm_services, check=False, capture_output=True)
        time.sleep(3)
        if consumer is not None and consumer.poll() is None:
            consumer.terminate()
            try:
                consumer.wait(timeout=10)
            except subprocess.TimeoutExpired:
                consumer.kill()
                consumer.wait()
        if stdout_handle is not None:
            stdout_handle.close()
        if stderr_handle is not None:
            stderr_handle.close()
        with (output / "compose.log").open("w", encoding="utf-8") as handle:
            stack.call("logs", "--no-color", "--timestamps", stdout=handle, check=False)
        stack.down()

    cutoff_ms = measurement_offset_ms + min(selection_finished_ms, selection_seconds * 1000)
    counts = request_counts(output / "compose.log", jobs, cutoff_ms)
    launch_by_run = {row["run_id"]: row for row in launches}
    job_results = []
    for job in jobs:
        messages = parse_best_messages(raw_messages, job["run_id"])
        best = best_message(messages)
        raw_target_times = validation_times_to_targets_ms(messages)
        request_origin_ms = measurement_offset_ms + launch_by_run.get(job["run_id"], {}).get("launch_offset_ms", 0)
        target_times = {
            target: max(0, elapsed_ms - request_origin_ms) if elapsed_ms is not None else None
            for target, elapsed_ms in raw_target_times.items()
        }
        row: dict[str, Any] = {
            **job,
            "status": "no_solution" if best is None else "selected",
            "accepted_improvement_count": len(messages),
            "construction_evaluation_count": counts[job["request_id"]]["construction"],
            "local_search_evaluation_count": counts[job["request_id"]]["local_search"],
            "validation_time_to_targets_ms": target_times,
        }
        if best is not None:
            row["selected_features"] = list(best["solutionFeatures"])
            row["selected_validation_f1"] = float(best["f1Score"])
            try:
                evaluator_args = argparse.Namespace(
                    cpuset=args.cpuset, numa_node=args.numa_node,
                    aggregate_cpus=args.aggregate_cpus,
                    aggregate_memory=args.aggregate_memory,
                    dataset_dir=args.data_root / scenario["scenario"],
                    evaluator_image=args.evaluator_image,
                )
                validation, test = evaluate_selected_features(
                    evaluator_args, row["selected_features"],
                    time.monotonic() + args.post_selection_evaluation_timeout_seconds,
                )
                row["validation"] = validation
                row["test"] = test
                row["status"] = "completed"
            except Exception as error:
                row["status"] = "evaluation_failed"
                row["evaluation_error"] = repr(error)
        job_results.append(row)
    result = {
        "schema_version": 1,
        "campaign_id": args.campaign_id,
        "batch_id": batch_id,
        "architecture": "distributed",
        "scenario": scenario["scenario"],
        "concurrency": len(jobs),
        "aggregate_cpus": args.aggregate_cpus,
        "aggregate_memory": args.aggregate_memory,
        "distributed_profile": args.distributed_profile,
        "resource_profile": profile,
        "selection_duration_ms": selection_seconds * 1000,
        "measurement_start_offset_ms": measurement_offset_ms,
        "selection_finished_ms": selection_finished_ms,
        "infrastructure_error": infrastructure_error,
        "request_launches": launches,
        "jobs": job_results,
        "completed_job_count": sum(row["status"] == "completed" for row in job_results),
        "qualified_job_count": sum(
            row.get("selected_validation_f1", 0.0) >= args.quality_thresholds[scenario["scenario"]]
            for row in job_results
        ),
    }
    atomic_json(output / "batch-result.json", result)
    return result


def monolith_command(
    args: argparse.Namespace,
    scenario: dict[str, Any],
    job: dict[str, Any],
    output: Path,
    concurrency: int,
) -> list[str]:
    per_job_cpus = args.aggregate_cpus / concurrency
    per_job_memory = f"{memory_mib(args.aggregate_memory) // concurrency}m"
    return [
        sys.executable, str((ROOT / "10-day-campaign/run_monolith.py").resolve()),
        "--monolith", "monolith2", "--matched-architecture",
        "--campaign-id", args.campaign_id,
        "--arm-id", "concurrent-load-monolith",
        "--run-id", job["run_id"],
        "--seed", str(job["seed"]),
        "--dataset-dir", str((args.data_root / scenario["scenario"]).resolve()),
        "--output-dir", str(output.resolve()),
        "--run-timeout-seconds", str(args.run_timeout_seconds),
        "--finalization-reserve-seconds", str(args.finalization_reserve_seconds),
        "--max-accepted-improvements", str(args.max_accepted_improvements),
        "--minimum-improvement", str(args.minimum_improvement),
        "--image-tag", args.image_tag,
        "--cpuset", args.cpuset,
        "--numa-node", args.numa_node,
        "--aggregate-cpus", str(per_job_cpus),
        "--aggregate-memory", per_job_memory,
        "--dataset-hash", sha256_file(args.data_root / scenario["scenario"] / "split-indices.csv"),
    ]


def monolith_batch(
    args: argparse.Namespace,
    scenario: dict[str, Any],
    batch_id: str,
    seeds: list[int],
    output: Path,
) -> dict[str, Any]:
    output.mkdir(parents=True, exist_ok=True)
    jobs = job_ids(batch_id, seeds)
    processes: list[tuple[dict[str, Any], Path, subprocess.Popen[str], Any]] = []
    started = time.monotonic()
    for job in jobs:
        destination = output / job["run_id"]
        destination.mkdir(parents=True, exist_ok=True)
        command = monolith_command(args, scenario, job, destination, len(jobs))
        log_handle = (destination / "supervisor.log").open("w", encoding="utf-8")
        process = subprocess.Popen(
            command, stdout=log_handle, stderr=subprocess.STDOUT,
            text=True, start_new_session=(os.name == "posix"),
        )
        processes.append((job, destination, process, log_handle))
    deadline = started + args.run_timeout_seconds + args.shutdown_grace_seconds
    job_results = []
    for job, destination, process, log_handle in processes:
        remaining = max(1, deadline - time.monotonic())
        try:
            code = process.wait(timeout=remaining)
            outer_timeout = False
        except subprocess.TimeoutExpired:
            outer_timeout = True
            terminate(process, args.shutdown_grace_seconds)
            code = 124
        finally:
            log_handle.close()
        result_path = destination / "final-result.json"
        if result_path.exists():
            try:
                result = json.loads(result_path.read_text(encoding="utf-8"))
            except json.JSONDecodeError as error:
                result = {"status": "invalid_json", "error": repr(error)}
        else:
            result = {"status": "missing_result"}
        job_results.append({
            **job,
            "return_code": code,
            "outer_timeout": outer_timeout,
            "result_path": str(result_path),
            "result": result,
        })
    qualified = 0
    completed = 0
    threshold = args.quality_thresholds[scenario["scenario"]]
    for row in job_results:
        result = row["result"]
        if result.get("status") in {"completed", "timeout"} and isinstance(result.get("test_f1_macro"), (int, float)):
            completed += 1
        if isinstance(result.get("validation_f1_macro"), (int, float)) and result["validation_f1_macro"] >= threshold:
            qualified += 1
    batch = {
        "schema_version": 1,
        "campaign_id": args.campaign_id,
        "batch_id": batch_id,
        "architecture": "monolith",
        "scenario": scenario["scenario"],
        "concurrency": len(jobs),
        "aggregate_cpus": args.aggregate_cpus,
        "aggregate_memory": args.aggregate_memory,
        "selection_duration_ms": (args.run_timeout_seconds - args.finalization_reserve_seconds) * 1000,
        "elapsed_ms": int(round((time.monotonic() - started) * 1000)),
        "jobs": job_results,
        "completed_job_count": completed,
        "qualified_job_count": qualified,
    }
    atomic_json(output / "batch-result.json", batch)
    return batch


def derived_job_seeds(batch_seed: int, concurrency: int) -> list[int]:
    return [batch_seed * 100 + index for index in range(1, concurrency + 1)]


def schedule(args: argparse.Namespace, scenarios: list[str]) -> list[tuple[int, str, int, str]]:
    rows = []
    for index, batch_seed in enumerate(args.batch_seeds):
        scenario_order = scenarios if index % 2 == 0 else list(reversed(scenarios))
        architecture_order = ("distributed", "monolith") if index % 2 == 0 else ("monolith", "distributed")
        load_order = args.loads if index % 2 == 0 else list(reversed(args.loads))
        for scenario in scenario_order:
            for load in load_order:
                rows.extend((batch_seed, scenario, load, architecture) for architecture in architecture_order)
    return rows


def parse_thresholds(value: str) -> dict[str, float]:
    result: dict[str, float] = {}
    for item in value.split(","):
        name, score = item.split("=", 1)
        result[name.strip()] = float(score)
    if set(result) != {"suspension", "fabrication"}:
        raise argparse.ArgumentTypeError("thresholds must define suspension and fabrication")
    return result


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-root", required=True, type=Path)
    parser.add_argument("--output-root", required=True, type=Path)
    parser.add_argument("--batch-seeds", type=parse_ints, default=list(range(20260941, 20260971)))
    parser.add_argument("--loads", type=parse_ints, default=[1, 2, 4, 8, 16])
    parser.add_argument("--scenarios", nargs="+", choices=("suspension", "fabrication"),
                        default=("suspension", "fabrication"))
    parser.add_argument("--architectures", nargs="+", choices=("distributed", "monolith"),
                        default=("distributed", "monolith"))
    parser.add_argument("--quality-thresholds", type=parse_thresholds,
                        default={"suspension": 0.78, "fabrication": 0.88})
    parser.add_argument("--campaign-id", default="gfshield-concurrent-load-2026-v1")
    parser.add_argument("--image-tag", required=True)
    parser.add_argument("--evaluator-image", default="gfshield-campaign-evaluator:quality-5dec3b1")
    parser.add_argument("--run-timeout-seconds", type=int, default=1200)
    parser.add_argument("--finalization-reserve-seconds", type=int, default=120)
    parser.add_argument("--post-selection-evaluation-timeout-seconds", type=int, default=600)
    parser.add_argument("--global-timeout-seconds", type=int, default=TEN_DAYS_SECONDS)
    parser.add_argument("--shutdown-grace-seconds", type=int, default=300)
    parser.add_argument("--maximum-attempts-per-cell", type=int, default=2)
    parser.add_argument("--max-accepted-improvements", type=int, default=50)
    parser.add_argument("--minimum-improvement", type=float, default=0.0001)
    parser.add_argument("--pipeline-workers", type=int, default=3)
    parser.add_argument("--distributed-profile", choices=tuple(RESOURCE_PROFILES), default="baseline")
    parser.add_argument("--rcl-replicas", type=int)
    parser.add_argument("--max-completed-cells", type=int)
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
    if any(load not in {1, 2, 4, 8, 16} for load in args.loads):
        parser.error("loads must be selected from 1,2,4,8,16")
    if memory_mib(args.aggregate_memory) // max(args.loads) < 512:
        parser.error("per-job monolith memory would fall below 512 MiB")
    if args.rcl_replicas is not None and args.rcl_replicas <= 0:
        parser.error("RCL replicas must be positive")
    if args.max_completed_cells is not None and args.max_completed_cells <= 0:
        parser.error("max completed cells must be positive")
    selected_profile = RESOURCE_PROFILES[args.distributed_profile]
    fixed_cpu = 0.5 + 0.5 + 0.75 + 0.25
    if abs(selected_profile["rcl_cpus"] + selected_profile["local_search_cpus"] + fixed_cpu - args.aggregate_cpus) > 1e-9:
        parser.error("distributed profile CPU allocations must equal the aggregate CPU budget")

    args.data_root = args.data_root.resolve()
    manifest_path, scenarios = scenario_manifest(args.data_root)
    configuration = {
        "campaign_id": args.campaign_id,
        "batch_seeds": args.batch_seeds,
        "loads": args.loads,
        "scenarios": list(args.scenarios),
        "architectures": list(args.architectures),
        "quality_thresholds": args.quality_thresholds,
        "algorithm": "ReliefF + VND + IWSSR",
        "run_timeout_seconds": args.run_timeout_seconds,
        "finalization_reserve_seconds": args.finalization_reserve_seconds,
        "post_selection_evaluation_timeout_seconds": args.post_selection_evaluation_timeout_seconds,
        "global_timeout_seconds": args.global_timeout_seconds,
        "maximum_attempts_per_cell": args.maximum_attempts_per_cell,
        "max_accepted_improvements": args.max_accepted_improvements,
        "minimum_improvement": args.minimum_improvement,
        "pipeline_workers": args.pipeline_workers,
        "distributed_profile": args.distributed_profile,
        "rcl_replicas": args.rcl_replicas,
        "max_completed_cells": args.max_completed_cells,
        "resource_profile_template": RESOURCE_PROFILES[args.distributed_profile],
        "cpuset": args.cpuset,
        "numa_node": args.numa_node,
        "aggregate_cpus": args.aggregate_cpus,
        "aggregate_memory": args.aggregate_memory,
        "image_tag": args.image_tag,
        "evaluator_image": args.evaluator_image,
        "experimental_unit": "paired batch seed; jobs within a batch are not independent replicates",
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
        (row["batch_seed"], row["scenario"], row["load"], row["architecture"])
        for row in state["completed"]
    }
    deadline = datetime.fromisoformat(state["deadline_utc"])
    for batch_seed, scenario_name, load, architecture in schedule(args, list(args.scenarios)):
        if args.max_completed_cells is not None and len(state["completed"]) >= args.max_completed_cells:
            state["state"] = "CAMPAIGN_TARGET_COMPLETED"
            state["finished_utc"] = iso(utc_now())
            state["stop_reason"] = "max_completed_cells"
            atomic_json(state_path, state)
            return 0
        if architecture not in args.architectures:
            continue
        cell = (batch_seed, scenario_name, load, architecture)
        if cell in completed:
            continue
        previous = sum(
            1 for row in state["attempts"]
            if (row["batch_seed"], row["scenario"], row["load"], row["architecture"]) == cell
        )
        for attempt in range(previous + 1, args.maximum_attempts_per_cell + 1):
            if utc_now() >= deadline:
                state["state"] = "GLOBAL_TIMEOUT"
                atomic_json(state_path, state)
                return 3
            batch_id = f"load-{scenario_name}-{architecture}-l{load}-b{batch_seed}-a{attempt}"
            destination = output_root / scenario_name / f"load-{load}" / architecture / f"batch-{batch_seed}" / f"attempt-{attempt}"
            seeds = derived_job_seeds(batch_seed, load)
            started = utc_now()
            before = time.monotonic()
            try:
                if architecture == "distributed":
                    result = distributed_batch(args, scenarios[scenario_name], batch_id, seeds, destination)
                    valid = result.get("infrastructure_error") is None and len(result.get("jobs", [])) == load
                else:
                    result = monolith_batch(args, scenarios[scenario_name], batch_id, seeds, destination)
                    valid = len(result.get("jobs", [])) == load
                error = None
            except Exception as exception:
                valid = False
                error = repr(exception)
                atomic_json(destination / "supervisor-error.json", {"error": error, "timestamp_utc": iso(utc_now())})
            checksum = checksum_directory(destination)
            attempt_row = {
                "batch_seed": batch_seed,
                "scenario": scenario_name,
                "load": load,
                "architecture": architecture,
                "attempt_number": attempt,
                "batch_id": batch_id,
                "job_seeds": seeds,
                "started_utc": iso(started),
                "finished_utc": iso(utc_now()),
                "elapsed_seconds": time.monotonic() - before,
                "artifact_valid": valid,
                "error": error,
                "result_path": str(destination / "batch-result.json"),
                "checksums_sha256": checksum,
            }
            state["attempts"].append(attempt_row)
            if valid:
                state["completed"].append(attempt_row)
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
