#!/usr/bin/env python3
"""Evaluate the all-features J48 baseline once for one campaign seed."""

from __future__ import annotations

import argparse
import hashlib
import signal
import subprocess
import time
from pathlib import Path

from run_arm import atomic_json, parse_evaluator_line, utc_now
from run_monolith import ContainerSampler, safe_id


def handle_termination(_signum: int, _frame: object) -> None:
    raise KeyboardInterrupt


def main() -> int:
    if hasattr(signal, "SIGTERM"):
        signal.signal(signal.SIGTERM, handle_termination)
    parser = argparse.ArgumentParser()
    parser.add_argument("--campaign-id", required=True)
    parser.add_argument("--arm-id", required=True)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--seed", type=int, required=True)
    parser.add_argument("--dataset-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--evaluator-image", required=True)
    parser.add_argument("--feature-count", type=int, required=True)
    parser.add_argument("--cpuset", default="8-15")
    parser.add_argument("--numa-node", default="1")
    parser.add_argument("--aggregate-cpus", type=float, default=8.0)
    parser.add_argument("--aggregate-memory", default="16g")
    parser.add_argument("--dataset-hash", required=True)
    parser.add_argument("--train-hash", required=True)
    parser.add_argument("--validation-hash", required=True)
    parser.add_argument("--test-hash", required=True)
    args = parser.parse_args()

    output = args.output_dir.resolve()
    output.mkdir(parents=True, exist_ok=True)
    container = safe_id(f"gfs10d-{args.run_id}")
    command = [
        "docker", "run", "--rm", "-i", "--name", container,
        "--cpuset-cpus", args.cpuset, "--cpus", str(args.aggregate_cpus),
        "--cpuset-mems", args.numa_node,
        "--memory", args.aggregate_memory, "--memory-swap", args.aggregate_memory,
        "--volume", f"{args.dataset_dir.resolve()}:/datasets:ro",
        args.evaluator_image,
        "--train", "/datasets/campaign/erenoall-train.arff",
        "--validation", "/datasets/campaign/erenoall-validation.arff",
        "--test", "/datasets/campaign/erenoall-test.arff",
    ]
    features = list(range(args.feature_count))
    serialized = ",".join(map(str, features))
    started = time.monotonic()
    process = subprocess.Popen(
        command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
    )
    sampler = ContainerSampler(container, output / "resource-samples.jsonl")
    sampler.start()
    try:
        assert process.stdin is not None and process.stdout is not None
        ready = process.stdout.readline().strip()
        if ready != "READY\tweka-stable-3.8.6\tJ48-default":
            raise RuntimeError(f"unexpected evaluator banner: {ready}")
        process.stdin.write(f"validation\t{serialized}\n")
        process.stdin.flush()
        validation = parse_evaluator_line(process.stdout.readline())
        # Exactly one holdout request for this independent baseline execution.
        process.stdin.write(f"test\t{serialized}\nQUIT\n")
        process.stdin.flush()
        test = parse_evaluator_line(process.stdout.readline())
        stderr = process.communicate(timeout=1800)[1]
        if process.returncode != 0:
            raise RuntimeError(f"evaluator failed with {process.returncode}: {stderr[-2000:]}")
    finally:
        sampler.stop()
        if process.poll() is None:
            process.kill()
            process.wait()
        subprocess.run(["docker", "rm", "-f", container], capture_output=True, check=False)

    elapsed_ms = int((time.monotonic() - started) * 1000)
    result = {
        "campaign_id": args.campaign_id,
        "arm_id": args.arm_id,
        "run_id": args.run_id,
        "seed": args.seed,
        "candidate_id": hashlib.sha256(f"{args.run_id}:all-features".encode()).hexdigest(),
        "parent_id": None,
        "request_id": f"{args.run_id}-baseline",
        "stage": "end_to_end",
        "algorithm": "all-features baseline",
        "feature_selector": None,
        "neighborhood_controller": None,
        "local_search": None,
        "classifier": "Weka J48",
        "classifier_version": "weka-stable 3.8.6",
        "classifier_parameters": {"confidence_factor": 0.25, "minimum_instances_per_leaf": 2, "pruned": True},
        "dataset_hash": args.dataset_hash,
        "train_hash": args.train_hash,
        "validation_hash": args.validation_hash,
        "test_hash": args.test_hash,
        "selected_features": features,
        "subset_size": args.feature_count,
        "dimensionality_reduction_percent": 0.0,
        "validation_f1_macro": validation["f1_macro"],
        "validation_f1_weighted": validation["f1_weighted"],
        "validation_precision_macro": validation["precision_macro"],
        "validation_precision_weighted": validation["precision_weighted"],
        "validation_recall_macro": validation["recall_macro"],
        "validation_recall_weighted": validation["recall_weighted"],
        "test_f1_macro": test["f1_macro"],
        "test_f1_weighted": test["f1_weighted"],
        "test_precision_macro": test["precision_macro"],
        "test_recall_macro": test["recall_macro"],
        "accuracy": test["accuracy"],
        "class_labels": test.get("class_labels", []),
        "validation_per_class_metrics": validation.get("per_class_metrics", {}),
        "validation_confusion_matrix": validation.get("confusion_matrix", []),
        "test_per_class_metrics": test.get("per_class_metrics", {}),
        "test_confusion_matrix": test.get("confusion_matrix", []),
        "candidate_time_ms": None,
        "classifier_time_ms": test["elapsed_ms"],
        "run_elapsed_ms": elapsed_ms,
        "end_to_end_time_ms": elapsed_ms,
        "timestamp_utc": utc_now(),
        "monotonic_elapsed_ms": elapsed_ms,
        "candidate_count": 1,
        "accepted_improvement_count": 1,
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
        "restart_count": 0,
        "stop_reason": "normal_exit",
        "status": "completed",
        "error_code": None,
    }
    atomic_json(output / "final-result.json", result)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
