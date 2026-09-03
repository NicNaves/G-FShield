#!/usr/bin/env python3
"""Run one isolated campaign arm and emit one normalized end-to-end result."""

from __future__ import annotations

import argparse
import base64
import json
import os
import re
import signal
import socket
import subprocess
import sys
import tempfile
import threading
import time
import urllib.parse
import urllib.request
import urllib.error
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


RCL_SERVICES = {
    "ig": ("grasp-fs-rcl-ig", 8089, "/ig"),
    "gr": ("grasp-fs-rcl-gr", 8088, "/gr"),
    "su": ("grasp-fs-rcl-su", 8087, "/su"),
    "relieff": ("grasp-fs-rcl-relieff", 8086, "/rf"),
}
LOCAL_SEARCH_SERVICES = {
    "bitflip": "grasp-fs-dls-bitflip",
    "iwss": "grasp-fs-dls-iwss",
    "iwssr": "grasp-fs-dls-iwssr",
}
CONTROLLER_SERVICES = {
    "vnd": "grasp-fs-dls-vnd",
    "rvnd": "grasp-fs-dls-rvnd",
}
LOCAL_SEARCH_ORDERS = {
    "bitflip": ("BIT_FLIP", "IWSS", "IWSSR"),
    "iwss": ("IWSS", "IWSSR", "BIT_FLIP"),
    "iwssr": ("IWSSR", "BIT_FLIP", "IWSS"),
}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


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


def run(command: list[str], **kwargs: Any) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, text=True, check=True, **kwargs)


def safe_id(value: str, maximum: int = 48) -> str:
    normalized = re.sub(r"[^a-z0-9_-]+", "-", value.lower()).strip("-")
    return (normalized or "campaign")[:maximum]


def free_loopback_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
        listener.bind(("127.0.0.1", 0))
        return int(listener.getsockname()[1])


def read_host_file(path: str) -> str | None:
    try:
        return Path(path).read_text(encoding="utf-8", errors="replace")
    except OSError:
        return None


def host_snapshot() -> dict[str, Any]:
    """Capture raw host counters so percentages can be derived consistently."""
    thermal: dict[str, str] = {}
    thermal_root = Path("/sys/class/thermal")
    if thermal_root.exists():
        for temperature in thermal_root.glob("thermal_zone*/temp"):
            try:
                thermal[str(temperature)] = temperature.read_text(encoding="ascii").strip()
            except OSError:
                continue
    return {
        "proc_stat": read_host_file("/proc/stat"),
        "proc_meminfo": read_host_file("/proc/meminfo"),
        "proc_loadavg": read_host_file("/proc/loadavg"),
        "proc_diskstats": read_host_file("/proc/diskstats"),
        "proc_net_dev": read_host_file("/proc/net/dev"),
        "thermal_millidegrees_celsius": thermal,
    }


def cgroup_snapshot(container_ids: list[str]) -> dict[str, dict[str, str]]:
    result: dict[str, dict[str, str]] = {}
    for container_id in container_ids:
        values: dict[str, str] = {}
        candidates = {
            "cpu_v1": Path("/sys/fs/cgroup/cpu/docker") / container_id / "cpu.stat",
            "memory_v1": Path("/sys/fs/cgroup/memory/docker") / container_id / "memory.stat",
            "oom_v1": Path("/sys/fs/cgroup/memory/docker") / container_id / "memory.oom_control",
            "cpu_v2": Path("/sys/fs/cgroup/system.slice") / f"docker-{container_id}.scope" / "cpu.stat",
            "memory_v2": Path("/sys/fs/cgroup/system.slice") / f"docker-{container_id}.scope" / "memory.events",
        }
        for name, path in candidates.items():
            try:
                values[name] = path.read_text(encoding="utf-8", errors="replace")
            except OSError:
                continue
        result[container_id] = values
    return result


class ResourceSampler:
    def __init__(self, project: str, compose: Path, environment: dict[str, str], output: Path):
        self.project = project
        self.compose = compose
        self.environment = environment
        self.output = output
        self.stop_event = threading.Event()
        self.thread = threading.Thread(target=self._sample, daemon=True)
        self.started = False

    def start(self) -> None:
        self.thread.start()
        self.started = True

    def stop(self) -> None:
        if not self.started:
            return
        self.stop_event.set()
        self.thread.join(timeout=35)

    def _sample(self) -> None:
        self.output.parent.mkdir(parents=True, exist_ok=True)
        sample_number = 0
        while not self.stop_event.is_set():
            record: dict[str, Any] = {
                "timestamp_utc": utc_now(),
                "monotonic_ns": time.monotonic_ns(),
                "host": host_snapshot(),
            }
            try:
                ids = subprocess.run(
                    self._compose_command("ps", "-q"),
                    env=self.environment,
                    capture_output=True,
                    text=True,
                    timeout=20,
                    check=False,
                ).stdout.split()
                if ids:
                    stats = subprocess.run(
                        ["docker", "stats", "--no-stream", "--format", "{{json .}}", *ids],
                        capture_output=True,
                        text=True,
                        timeout=20,
                        check=False,
                    )
                    inspect = subprocess.run(
                        ["docker", "inspect", *ids],
                        capture_output=True,
                        text=True,
                        timeout=20,
                        check=False,
                    )
                    record["stats"] = [json.loads(line) for line in stats.stdout.splitlines() if line]
                    record["inspect"] = json.loads(inspect.stdout) if inspect.returncode == 0 else []
                    record["cgroups"] = cgroup_snapshot(ids)
                    record["stats_error"] = stats.stderr.strip() or None
                    record["inspect_error"] = inspect.stderr.strip() or None
                all_stats = subprocess.run(
                    ["docker", "stats", "--no-stream", "--format", "{{json .}}"],
                    capture_output=True,
                    text=True,
                    timeout=20,
                    check=False,
                )
                record["all_container_stats"] = [
                    json.loads(line) for line in all_stats.stdout.splitlines() if line
                ]
                record["all_container_stats_error"] = all_stats.stderr.strip() or None
                if sample_number % 10 == 0:
                    lag = subprocess.run(
                        self._compose_command(
                            "exec", "-T", "kafka", "kafka-consumer-groups",
                            "--bootstrap-server", "kafka:9092", "--all-groups", "--describe",
                        ),
                        env=self.environment,
                        capture_output=True,
                        text=True,
                        timeout=20,
                        check=False,
                    )
                    offsets = subprocess.run(
                        self._compose_command(
                            "exec", "-T", "kafka", "kafka-run-class", "kafka.tools.GetOffsetShell",
                            "--broker-list", "kafka:9092", "--time", "-1",
                        ),
                        env=self.environment,
                        capture_output=True,
                        text=True,
                        timeout=20,
                        check=False,
                    )
                    record["kafka_consumer_lag"] = lag.stdout
                    record["kafka_consumer_lag_error"] = lag.stderr.strip() or None
                    record["kafka_topic_end_offsets"] = offsets.stdout
                    record["kafka_topic_end_offsets_error"] = offsets.stderr.strip() or None
            except Exception as error:  # telemetry failure must not kill the algorithm
                record["sampler_error"] = repr(error)
            with self.output.open("a", encoding="utf-8", newline="\n") as handle:
                handle.write(json.dumps(record, sort_keys=True, ensure_ascii=False) + "\n")
                handle.flush()
                os.fsync(handle.fileno())
            sample_number += 1
            self.stop_event.wait(30)

    def _compose_command(self, *parts: str) -> list[str]:
        return ["docker", "compose", "-p", self.project, "-f", str(self.compose), *parts]


class Stack:
    def __init__(self, project: str, compose: Path, environment: dict[str, str]):
        self.project = project
        self.compose = compose
        self.environment = environment

    def command(self, *parts: str) -> list[str]:
        return ["docker", "compose", "-p", self.project, "-f", str(self.compose), *parts]

    def call(self, *parts: str, check: bool = True, **kwargs: Any) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            self.command(*parts),
            env=self.environment,
            text=True,
            check=check,
            **kwargs,
        )

    def down(self) -> None:
        self.call(
            "down", "--volumes", "--remove-orphans", "--timeout", "30",
            check=False, capture_output=True,
        )


def wait_for_port(port: int, deadline: float) -> None:
    while time.monotonic() < deadline:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=2):
                return
        except OSError:
            time.sleep(2)
    raise TimeoutError(f"RCL service did not open loopback port {port}")


def wait_for_http_service(port: int, route: str, deadline: float) -> None:
    """Wait for the Spring HTTP dispatcher, not only for the TCP accept socket."""
    probe = urllib.request.Request(f"http://127.0.0.1:{port}{route}", method="GET")
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(probe, timeout=3):
                return
        except urllib.error.HTTPError:
            # A 4xx response proves that Tomcat and the dispatcher are ready.
            return
        except Exception:
            time.sleep(2)
    raise TimeoutError(f"RCL HTTP service did not become ready on loopback port {port}")


def complete_record_count(path: Path) -> int:
    """Count only newline-terminated records while another process writes the file."""
    if not path.exists():
        return 0
    with path.open("rb") as handle:
        return sum(1 for line in handle if line.endswith(b"\n") and line.strip())


def metric_evaluation_count(metrics_dir: Path) -> int:
    """Count completed CSV data rows across services in one isolated run."""
    total = 0
    if not metrics_dir.exists():
        return total
    for path in metrics_dir.glob("*.csv"):
        rows = complete_record_count(path)
        if rows > 0:
            total += rows - 1  # one header per service file
    return total


def enabled_local_searches(args: argparse.Namespace) -> tuple[str, ...]:
    if not args.enabled_local_searches:
        return LOCAL_SEARCH_ORDERS[args.local_search]
    values = tuple(
        value.strip().lower()
        for value in args.enabled_local_searches.split(",")
        if value.strip()
    )
    invalid = [value for value in values if value not in LOCAL_SEARCH_SERVICES]
    if not values or invalid or len(values) != len(set(values)):
        raise ValueError(f"invalid enabled local searches: {args.enabled_local_searches}")
    return tuple(value.upper() for value in values)


def parse_best_messages(path: Path, run_id: str) -> list[dict[str, Any]]:
    messages: list[dict[str, Any]] = []
    if not path.exists():
        return messages
    for line_number, line in enumerate(path.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
        line = line.strip()
        if not line.startswith("{"):
            continue
        try:
            message = json.loads(line)
        except json.JSONDecodeError:
            continue
        message_run_id = message.get("runId") or message.get("run_id")
        if message_run_id not in (None, run_id):
            continue
        message["_raw_line"] = line_number
        messages.append(message)
    return messages


def score_of(message: dict[str, Any]) -> float:
    try:
        return float(message.get("f1Score"))
    except (TypeError, ValueError):
        return float("-inf")


def has_valid_feature_subset(message: dict[str, Any]) -> bool:
    raw = message.get("solutionFeatures")
    if not isinstance(raw, list) or not raw:
        return False
    try:
        features = [int(feature) for feature in raw]
    except (TypeError, ValueError):
        return False
    return all(feature > 0 for feature in features) and len(features) == len(set(features))


def best_message(messages: list[dict[str, Any]]) -> dict[str, Any] | None:
    eligible = [
        item for item in messages
        if has_valid_feature_subset(item) and 0.0 <= score_of(item) <= 1.0
    ]
    if not eligible:
        return None
    return min(
        eligible,
        key=lambda item: (
            -score_of(item),
            len(item.get("solutionFeatures") or []),
            int(item.get("runnigTime") or 2**63 - 1),
            int(item.get("_raw_line") or 2**63 - 1),
        ),
    )


def validation_time_to_target_ms(
    messages: list[dict[str, Any]], target: float = 0.95,
) -> int | None:
    elapsed = []
    for message in messages:
        try:
            score = float(message.get("f1Score"))
            time_ms = int(message.get("monotonicElapsedMs"))
        except (TypeError, ValueError):
            continue
        if score >= target and time_ms >= 0:
            elapsed.append(time_ms)
    return min(elapsed, default=None)


def validation_times_to_targets_ms(
    messages: list[dict[str, Any]], targets: tuple[float, ...] = (0.93, 0.94, 0.945, 0.95),
) -> dict[str, int | None]:
    return {
        str(target): validation_time_to_target_ms(messages, target)
        for target in targets
    }


def parse_evaluator_line(line: str) -> dict[str, Any]:
    fields = line.strip().split("\t")
    if len(fields) not in (9, 12) or fields[0] != "OK":
        raise RuntimeError(f"invalid evaluator output: {line.strip()}")
    names = (
        "f1_macro", "f1_weighted", "precision_macro", "precision_weighted",
        "recall_macro", "recall_weighted", "accuracy",
    )
    result = {name: float(value) for name, value in zip(names, fields[1:8])}
    result["elapsed_ms"] = int(fields[8])
    if len(fields) == 12:
        labels = [
            base64.urlsafe_b64decode(value + "=" * (-len(value) % 4)).decode("utf-8")
            for value in fields[9].split(",") if value
        ]
        per_class_rows = [
            [float(value) for value in row.split(",")]
            for row in fields[10].split(";") if row
        ]
        result["class_labels"] = labels
        result["per_class_metrics"] = {
            label: {"f1": row[0], "precision": row[1], "recall": row[2]}
            for label, row in zip(labels, per_class_rows)
        }
        result["confusion_matrix"] = [
            [float(value) for value in row.split(",")]
            for row in fields[11].split(";") if row
        ]
    return result


def evaluate_selected_features(
    args: argparse.Namespace,
    features: list[int],
    deadline_monotonic: float,
) -> tuple[dict[str, Any], dict[str, Any]]:
    zero_based = sorted({int(feature) - 1 for feature in features})
    if not zero_based or zero_based[0] < 0:
        raise ValueError(f"distributed feature identifiers must be one-based positive integers: {features}")
    command = [
        "docker", "run", "--rm", "-i",
        "--cpuset-cpus", args.cpuset,
        "--cpuset-mems", args.numa_node,
        "--cpus", str(args.aggregate_cpus),
        "--memory", args.aggregate_memory,
        "--memory-swap", args.aggregate_memory,
        "-v", f"{args.dataset_dir.resolve()}:/datasets:ro",
        args.evaluator_image,
        "--train", "/datasets/campaign/erenoall-train.arff",
        "--validation", "/datasets/campaign/erenoall-validation.arff",
        "--test", "/datasets/campaign/erenoall-test.arff",
    ]
    serialized = ",".join(str(feature) for feature in zero_based)
    protocol = f"validation\t{serialized}\ntest\t{serialized}\nQUIT\n"
    remaining = deadline_monotonic - time.monotonic()
    if remaining <= 0:
        raise TimeoutError("no finalization reserve remained for validation/test evaluation")
    process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    try:
        stdout, stderr = process.communicate(input=protocol, timeout=remaining)
    except subprocess.TimeoutExpired as error:
        process.kill()
        process.communicate()
        raise TimeoutError("validation/test evaluator exceeded the arm's absolute deadline") from error
    if process.returncode != 0:
        raise RuntimeError(f"evaluator failed with {process.returncode}: {stderr[-2000:]}")
    lines = [line.strip() for line in stdout.splitlines() if line.strip()]
    ready = next((line for line in lines if line.startswith("READY\t")), "")
    if not ready.startswith("READY\tweka-stable-3.8.6\tJ48-default"):
        raise RuntimeError(f"unexpected evaluator banner: {ready or stdout[-2000:]}")
    results = [line for line in lines if line.startswith("OK\t")]
    if len(results) != 2:
        raise RuntimeError(f"evaluator returned {len(results)} result rows instead of two: {stdout[-2000:]}")
    validation = parse_evaluator_line(results[0])
    # results[1] is the only holdout request made for the selected subset.
    test = parse_evaluator_line(results[1])
    return validation, test


def normalized_result(
    args: argparse.Namespace,
    best: dict[str, Any] | None,
    validation: dict[str, Any] | None,
    test: dict[str, Any] | None,
    started_monotonic: float,
    stop_reason: str,
    status: str,
    accepted_improvement_count: int,
    error_code: str | None = None,
) -> dict[str, Any]:
    raw_features = list(best.get("solutionFeatures") or []) if best else []
    features = sorted(int(feature) - 1 for feature in raw_features)
    elapsed_ms = int((time.monotonic() - started_monotonic) * 1000)
    feature_count = args.feature_count
    reduction = ((feature_count - len(features)) / feature_count * 100.0) if features else None
    return {
        "campaign_id": args.campaign_id,
        "arm_id": args.arm_id,
        "run_id": args.run_id,
        "seed": args.seed,
        "candidate_id": (best or {}).get("candidateId") or (best or {}).get("seedId"),
        "parent_id": (best or {}).get("parentId"),
        "request_id": args.request_id,
        "stage": "end_to_end",
        "algorithm": "G-FShield",
        "feature_selector": args.construction,
        "neighborhood_controller": args.controller,
        "local_search": args.local_search,
        "classifier": "Weka J48",
        "classifier_version": "weka-stable 3.8.6",
        "classifier_parameters": {"confidence_factor": 0.25, "minimum_instances_per_leaf": 2, "pruned": True},
        "dataset_hash": args.dataset_hash,
        "train_hash": args.train_hash,
        "validation_hash": args.validation_hash,
        "test_hash": args.test_hash,
        "selected_features": features,
        "subset_size": len(features) if features else None,
        "dimensionality_reduction_percent": reduction,
        "validation_f1_macro": (validation or {}).get("f1_macro"),
        "validation_f1_weighted": (validation or {}).get("f1_weighted"),
        "validation_precision_macro": (validation or {}).get("precision_macro"),
        "validation_precision_weighted": (validation or {}).get("precision_weighted"),
        "validation_recall_macro": (validation or {}).get("recall_macro"),
        "validation_recall_weighted": (validation or {}).get("recall_weighted"),
        "test_f1_macro": (test or {}).get("f1_macro"),
        "test_f1_weighted": (test or {}).get("f1_weighted"),
        "test_precision_macro": (test or {}).get("precision_macro"),
        "test_recall_macro": (test or {}).get("recall_macro"),
        "accuracy": (test or {}).get("accuracy"),
        "class_labels": (test or {}).get("class_labels", []),
        "validation_per_class_metrics": (validation or {}).get("per_class_metrics", {}),
        "validation_confusion_matrix": (validation or {}).get("confusion_matrix", []),
        "test_per_class_metrics": (test or {}).get("per_class_metrics", {}),
        "test_confusion_matrix": (test or {}).get("confusion_matrix", []),
        "candidate_time_ms": (best or {}).get("runnigTime"),
        "classifier_time_ms": (test or {}).get("elapsed_ms"),
        "run_elapsed_ms": elapsed_ms,
        "end_to_end_time_ms": elapsed_ms,
        "timestamp_utc": utc_now(),
        "monotonic_elapsed_ms": elapsed_ms,
        # BEST_SOLUTION_TOPIC contains accepted best-so-far improvements, not
        # every candidate evaluated inside the construction/local-search services.
        "candidate_count": None,
        "accepted_improvement_count": accepted_improvement_count,
        "process_cpu_percent": None,
        "container_cpu_percent": None,
        "host_cpu_percent": None,
        "process_rss_mb": None,
        "container_memory_mb": None,
        "host_memory_mb": None,
        "cpu_throttled_seconds": None,
        "disk_read_bytes": None,
        "disk_write_bytes": None,
        "network_rx_bytes": None,
        "network_tx_bytes": None,
        "kafka_lag": None,
        "restart_count": None,
        "stop_reason": stop_reason,
        "status": status,
        "error_code": error_code,
    }


def run_distributed(args: argparse.Namespace) -> int:
    runner_started_monotonic = time.monotonic()
    runner_started_monotonic_ns = time.monotonic_ns()
    measurement_started_monotonic = runner_started_monotonic
    measurement_start_offset_ms = 0
    result_dir = args.output_dir.resolve()
    result_dir.mkdir(parents=True, exist_ok=True)
    compose = Path(__file__).with_name("docker-compose.campaign.yml").resolve()
    project = safe_id(f"gfs10d-{args.run_id}")
    port = free_loopback_port()
    request_id = args.request_id or f"{args.run_id}-request"
    args.request_id = request_id
    if args.finalization_reserve_seconds >= args.run_timeout_seconds:
        raise ValueError("finalization reserve must be shorter than the absolute run timeout")
    if args.max_accepted_improvements <= 0:
        raise ValueError("maximum accepted improvements must be positive")
    if args.relieff_sample_size <= 0:
        raise ValueError("ReliefF sample size must be positive")
    selection_duration_seconds = args.run_timeout_seconds - args.finalization_reserve_seconds
    # Containers need a provisional deadline at creation time. The supervisor
    # applies the exact request-relative deadline after the warm stack is ready;
    # this later service-side deadline only prevents premature self-termination.
    selection_deadline = (
        runner_started_monotonic + args.startup_timeout_seconds + selection_duration_seconds
    )
    absolute_deadline = selection_deadline + args.finalization_reserve_seconds
    deadline_epoch_ms = int(
        (time.time() + args.startup_timeout_seconds + selection_duration_seconds) * 1000
    )
    environment = os.environ.copy()
    environment.update(
        {
            "CAMPAIGN_DATASET_DIR": str(args.dataset_dir.resolve()),
            "CAMPAIGN_METRICS_DIR": str((result_dir / "metrics").resolve()),
            "CAMPAIGN_ID": args.campaign_id,
            "CAMPAIGN_ARM_ID": args.arm_id,
            "CAMPAIGN_RUN_ID": args.run_id,
            "CAMPAIGN_REQUEST_ID": request_id,
            "CAMPAIGN_RANDOM_SEED": str(args.seed),
            "CAMPAIGN_DEADLINE_EPOCH_MS": str(deadline_epoch_ms),
            "CAMPAIGN_START_MONOTONIC_NS": str(runner_started_monotonic_ns),
            "CAMPAIGN_RCL_HOST_PORT": str(port),
            "CAMPAIGN_CPUSET": args.cpuset,
            "CAMPAIGN_IMAGE_TAG": args.image_tag,
            "CAMPAIGN_MINIMUM_IMPROVEMENT": str(args.minimum_improvement),
            "CAMPAIGN_MAX_ACCEPTED_IMPROVEMENTS": str(args.max_accepted_improvements),
            "CAMPAIGN_RELIEFF_SAMPLE_SIZE": str(args.relieff_sample_size),
        }
    )
    if args.pipeline_workers > 1:
        # Same six-core/12-GiB aggregate ceiling as the monolith, allocated to
        # independent pipeline consumers instead of one sequential process.
        environment.update(
            {
                "CAMPAIGN_RCL_CPUS": "1.0",
                "CAMPAIGN_RCL_MEMORY": "3g",
                "CAMPAIGN_RCL_JAVA_OPTS": "-Xms512m -Xmx2200m -XX:+UseContainerSupport -XX:+UseG1GC",
                "CAMPAIGN_LOCAL_SEARCH_CPUS": "3.0",
                "CAMPAIGN_LOCAL_SEARCH_MEMORY": "4g",
                "CAMPAIGN_LOCAL_SEARCH_JAVA_OPTS": "-Xms512m -Xmx3200m -XX:+UseContainerSupport -XX:+UseG1GC",
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
                "CAMPAIGN_KAFKA_PARTITIONS": str(args.pipeline_workers),
                "CAMPAIGN_ZOOKEEPER_CPUS": "0.25",
                "CAMPAIGN_ZOOKEEPER_MEMORY": "1g",
            }
        )
    configured_searches = enabled_local_searches(args)
    rcl_service, _container_port, route = RCL_SERVICES[args.construction]
    local_services = [LOCAL_SEARCH_SERVICES[value.lower()] for value in configured_searches]
    controller_service = CONTROLLER_SERVICES[args.controller]
    algorithm_services = [rcl_service, *local_services, controller_service, "grasp-fs-dls-verify"]
    services = ["zookeeper", "kafka", *algorithm_services]
    stack = Stack(project, compose, environment)
    consumer: subprocess.Popen[str] | None = None
    stdout_handle = None
    stderr_handle = None
    sampler = ResourceSampler(project, compose, environment, result_dir / "resource-samples.jsonl")
    raw_messages = result_dir / "best-solution-messages.jsonl"
    raw_consumer_log = result_dir / "kafka-consumer.stderr.log"
    stop_reason = "run_timeout"
    try:
        stack.down()
        with (result_dir / "resolved-compose.yaml").open("w", encoding="utf-8", newline="\n") as resolved:
            stack.call("config", stdout=resolved)
        with (result_dir / "compose-up.log").open("w", encoding="utf-8", newline="\n") as startup_log:
            stack.call(
                "up", "-d", "--no-build", *services,
                stdout=startup_log, stderr=subprocess.STDOUT,
            )
        container_ids = stack.call("ps", "-q", capture_output=True).stdout.split()
        if not container_ids:
            raise RuntimeError("campaign stack started without container identifiers")
        run(["docker", "update", "--cpuset-mems", args.numa_node, *container_ids], capture_output=True)
        startup_deadline = time.monotonic() + args.startup_timeout_seconds
        wait_for_port(port, startup_deadline)
        wait_for_http_service(port, route, startup_deadline)
        stdout_handle = raw_messages.open("w", encoding="utf-8", newline="\n")
        stderr_handle = raw_consumer_log.open("w", encoding="utf-8", newline="\n")
        consumer = subprocess.Popen(
            stack.command(
                "exec", "-T", "kafka", "kafka-console-consumer",
                "--bootstrap-server", "kafka:9092",
                "--topic", "BEST_SOLUTION_TOPIC",
                "--from-beginning",
            ),
            env=environment,
            stdout=stdout_handle,
            stderr=stderr_handle,
            text=True,
            start_new_session=True,
        )
        query = urllib.parse.urlencode(
            {
                "maxGenerations": args.max_generations,
                "rclCutoff": args.rcl_cutoff,
                "sampleSize": args.sample_size,
                "datasetTrainingName": "campaign/erenoall-train.arff",
                "datasetTestingName": "campaign/erenoall-validation.arff",
                "classifier": "J48",
                "useTrainingCache": str(args.use_training_cache).lower(),
                "neighborhoodStrategy": args.controller.upper(),
                "localSearches": ",".join(configured_searches),
                "neighborhoodMaxIterations": args.neighborhood_iterations,
                "bitFlipMaxIterations": args.local_search_iterations,
                "iwssMaxIterations": args.local_search_iterations,
                "iwssrMaxIterations": args.local_search_iterations,
            }
        )
        request = urllib.request.Request(
            f"http://127.0.0.1:{port}{route}?{query}",
            method="POST",
        )
        sampler.start()
        measurement_started_monotonic = time.monotonic()
        measurement_start_offset_ms = max(
            0,
            int(round((measurement_started_monotonic - runner_started_monotonic) * 1000.0)),
        )
        selection_deadline = measurement_started_monotonic + selection_duration_seconds
        absolute_deadline = measurement_started_monotonic + args.run_timeout_seconds
        with urllib.request.urlopen(request, timeout=30) as response:
            launch = json.loads(response.read().decode("utf-8"))
        launch["measurement_definition"] = "request_to_result_after_service_readiness"
        launch["measurement_start_offset_ms"] = measurement_start_offset_ms
        atomic_json(result_dir / "launch.json", launch)

        while True:
            if complete_record_count(raw_messages) >= args.max_accepted_improvements:
                stop_reason = "accepted_improvement_limit"
                break
            remaining = selection_deadline - time.monotonic()
            if remaining <= 0:
                stop_reason = "run_timeout"
                break
            time.sleep(min(5.0, remaining))
    except KeyboardInterrupt:
        stop_reason = "cancelled"
    except Exception as error:
        atomic_json(result_dir / "runner-error.json", {"timestamp_utc": utc_now(), "error": repr(error)})
        stop_reason = "runner_error"
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
        # Preserve RFC3339 timestamps so the causal analysis can reconstruct
        # whether RCL construction and DLS processing were active concurrently.
        with (result_dir / "compose.log").open("w", encoding="utf-8", newline="\n") as compose_log:
            stack.call("logs", "--no-color", "--timestamps", stdout=compose_log, check=False)
        stack.down()

    messages = parse_best_messages(raw_messages, args.run_id)
    best = best_message(messages)
    if best is None:
        result = normalized_result(
            args, None, None, None, measurement_started_monotonic, stop_reason,
            "cancelled" if stop_reason == "cancelled" else "failed", len(messages), "NO_COMPLETE_SOLUTION",
        )
        result["measurement_definition"] = "request_to_result_after_service_readiness"
        result["measurement_start_offset_ms"] = measurement_start_offset_ms
        result["cold_start_end_to_end_time_ms"] = int(
            round((time.monotonic() - runner_started_monotonic) * 1000.0)
        )
        atomic_json(result_dir / "final-result.json", result)
        return 1
    try:
        validation, test = evaluate_selected_features(
            args, list(best["solutionFeatures"]), absolute_deadline)
        status = "timeout" if stop_reason == "run_timeout" else "completed"
        result = normalized_result(
            args, best, validation, test, measurement_started_monotonic,
            stop_reason, status, len(messages),
        )
        result["candidate_count"] = metric_evaluation_count(result_dir / "metrics")
        raw_target_times = validation_times_to_targets_ms(messages)
        result["validation_time_to_targets_ms"] = {
            target: (
                max(0, elapsed_ms - measurement_start_offset_ms)
                if elapsed_ms is not None else None
            )
            for target, elapsed_ms in raw_target_times.items()
        }
        result["validation_time_to_target_ms"] = result["validation_time_to_targets_ms"]["0.95"]
        result["measurement_definition"] = "request_to_result_after_service_readiness"
        result["measurement_start_offset_ms"] = measurement_start_offset_ms
        result["cold_start_end_to_end_time_ms"] = int(
            round((time.monotonic() - runner_started_monotonic) * 1000.0)
        )
        atomic_json(result_dir / "selected-validation-solution.json", best)
        atomic_json(result_dir / "final-result.json", result)
        return 0
    except Exception as error:
        atomic_json(result_dir / "final-evaluation-error.json", {"timestamp_utc": utc_now(), "error": repr(error)})
        result = normalized_result(
            args, best, None, None, measurement_started_monotonic,
            "final_evaluation_failed", "failed", len(messages), "FINAL_EVALUATION_FAILED",
        )
        result["measurement_definition"] = "request_to_result_after_service_readiness"
        result["measurement_start_offset_ms"] = measurement_start_offset_ms
        result["cold_start_end_to_end_time_ms"] = int(
            round((time.monotonic() - runner_started_monotonic) * 1000.0)
        )
        atomic_json(result_dir / "final-result.json", result)
        return 1


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser()
    result.add_argument("--architecture", choices=("distributed",), default="distributed")
    result.add_argument("--campaign-id", required=True)
    result.add_argument("--arm-id", required=True)
    result.add_argument("--run-id", required=True)
    result.add_argument("--request-id")
    result.add_argument("--seed", required=True, type=int)
    result.add_argument("--construction", choices=tuple(RCL_SERVICES), required=True)
    result.add_argument("--controller", choices=tuple(CONTROLLER_SERVICES), required=True)
    result.add_argument("--local-search", choices=tuple(LOCAL_SEARCH_SERVICES), required=True)
    result.add_argument(
        "--enabled-local-searches",
        help="comma-separated operator set; defaults to the three-operator campaign order",
    )
    result.add_argument("--dataset-dir", required=True, type=Path)
    result.add_argument("--output-dir", required=True, type=Path)
    result.add_argument("--run-timeout-seconds", type=int, default=3600)
    result.add_argument("--finalization-reserve-seconds", type=int, default=300)
    result.add_argument("--startup-timeout-seconds", type=int, default=300)
    result.add_argument("--max-generations", type=int, default=2_147_483_647)
    result.add_argument("--rcl-cutoff", type=int, default=30)
    result.add_argument("--sample-size", type=int, default=5)
    result.add_argument("--relieff-sample-size", type=int, default=1000)
    result.add_argument("--neighborhood-iterations", type=int, default=50)
    result.add_argument("--local-search-iterations", type=int, default=100)
    result.add_argument("--pipeline-workers", type=int, default=1)
    result.add_argument("--use-training-cache", action="store_true")
    result.add_argument("--minimum-improvement", type=float, default=0.0001)
    result.add_argument("--max-accepted-improvements", type=int, default=500)
    result.add_argument("--cpuset", default="8-15")
    result.add_argument("--numa-node", default="1")
    result.add_argument("--aggregate-cpus", type=float, default=8.0)
    result.add_argument("--aggregate-memory", default="16g")
    result.add_argument("--image-tag", required=True)
    result.add_argument("--evaluator-image", required=True)
    result.add_argument("--feature-count", type=int, required=True)
    result.add_argument("--dataset-hash", required=True)
    result.add_argument("--train-hash", required=True)
    result.add_argument("--validation-hash", required=True)
    result.add_argument("--test-hash", required=True)
    return result


def handle_termination(_signum: int, _frame: Any) -> None:
    raise KeyboardInterrupt


def main() -> int:
    if hasattr(signal, "SIGTERM"):
        signal.signal(signal.SIGTERM, handle_termination)
    args = parser().parse_args()
    if args.pipeline_workers <= 0:
        raise SystemExit("--pipeline-workers must be positive")
    return run_distributed(args)


if __name__ == "__main__":
    raise SystemExit(main())
