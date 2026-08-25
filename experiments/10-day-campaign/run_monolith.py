#!/usr/bin/env python3
"""Run one resource-bounded monolith comparator from a versioned image."""

from __future__ import annotations

import argparse
import json
import os
import re
import signal
import subprocess
import tempfile
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


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


def safe_id(value: str) -> str:
    return re.sub(r"[^a-z0-9_.-]+", "-", value.lower()).strip("-")[:63]


class ContainerSampler:
    def __init__(self, container: str, output: Path):
        self.container = container
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
        while not self.stop_event.is_set():
            record: dict[str, Any] = {"timestamp_utc": utc_now(), "monotonic_ns": time.monotonic_ns()}
            stats = subprocess.run(
                ["docker", "stats", "--no-stream", "--format", "{{json .}}", self.container],
                capture_output=True, text=True, timeout=20, check=False,
            )
            inspect = subprocess.run(
                ["docker", "inspect", self.container],
                capture_output=True, text=True, timeout=20, check=False,
            )
            try:
                record["stats"] = [json.loads(line) for line in stats.stdout.splitlines() if line]
            except json.JSONDecodeError:
                record["stats"] = []
            try:
                record["inspect"] = json.loads(inspect.stdout) if inspect.returncode == 0 else []
            except json.JSONDecodeError:
                record["inspect"] = []
            record["stats_error"] = stats.stderr.strip() or None
            record["inspect_error"] = inspect.stderr.strip() or None
            with self.output.open("a", encoding="utf-8", newline="\n") as handle:
                handle.write(json.dumps(record, sort_keys=True, ensure_ascii=False) + "\n")
                handle.flush()
                os.fsync(handle.fileno())
            self.stop_event.wait(30)


def monolith_arguments(args: argparse.Namespace) -> tuple[str, str, list[str]]:
    train = "/data/campaign/erenoall-train.arff"
    validation = "/data/campaign/erenoall-validation.arff"
    test = "/data/campaign/erenoall-test.arff"
    if args.monolith == "monolith1":
        return (
            f"gfshield-campaign-monolith1:{args.image_tag}",
            "/logs",
            [
                "--training", train, "--validation", validation, "--testing", test,
                "--label-col", "class", "--max-generations", "2147483647",
                "--rcl-cutoff", "30", "--sample-size", "5",
                "--feature-selector", "gainratio", "--local-search", "bitflip",
                "--classifier", "j48", "--metrics-file", "/logs/internal-metrics.csv",
                "--seed", str(args.seed), "--max-iterations-local", "100",
                "--run-timeout-seconds", str(args.run_timeout_seconds),
                "--final-evaluation-reserve-seconds", str(args.finalization_reserve_seconds),
                "--max-accepted-improvements", str(args.max_accepted_improvements),
                "--minimum-improvement", str(args.minimum_improvement),
                "--campaign-id", args.campaign_id, "--arm-id", args.arm_id,
                "--run-id", args.run_id, "--final-metrics-file", "/logs/final-result.json",
                "--dataset-hash", args.dataset_hash,
            ],
        )
    return (
        f"gfshield-campaign-monolith2:{args.image_tag}",
        "/app/logs",
        [
            "-tr", train, "--validation", validation, "-ts", test,
            "--classifier", "J48", "--fs_algos", "gr", "--neighborhoods", "vnd",
            "--ls_ops", "iwss", "--rcl_size", "30", "--subset_size", "5",
            "--ls_iters", "100", "--bitflip_tries", "10", "--build_restarts", "2147483647",
            "--seed", str(args.seed), "--delimiter", ";", "--fsync_logs", "0",
            "--log_flush_every", "50", "--log_all_iters", "1", "--log_sys_metrics", "1",
            "--run_timeout_seconds", str(args.run_timeout_seconds),
            "--final_evaluation_reserve_seconds", str(args.finalization_reserve_seconds),
            "--max_accepted_improvements", str(args.max_accepted_improvements),
            "--minimum_improvement", str(args.minimum_improvement),
            "--campaign_id", args.campaign_id, "--arm_id", args.arm_id,
            "--run_id", args.run_id, "--final_metrics_file", "/app/logs/final-result.json",
            "--dataset_hash", args.dataset_hash,
        ],
    )


def execute(args: argparse.Namespace) -> int:
    output = args.output_dir.resolve()
    output.mkdir(parents=True, exist_ok=True)
    image, log_mount, application_arguments = monolith_arguments(args)
    container = safe_id(f"gfs10d-{args.run_id}")
    command = [
        "docker", "run", "--rm", "--name", container,
        "--stop-timeout", "300", "--cpuset-cpus", args.cpuset,
        "--cpuset-mems", args.numa_node,
        "--cpus", str(args.aggregate_cpus), "--memory", args.aggregate_memory,
        "--memory-swap", args.aggregate_memory,
        "--volume", f"{args.dataset_dir.resolve()}:/data:ro",
        "--volume", f"{output}:{log_mount}",
        image,
        *application_arguments,
    ]
    log = (output / "container.log").open("w", encoding="utf-8", newline="\n")
    sampler = ContainerSampler(container, output / "resource-samples.jsonl")
    process: subprocess.Popen[str] | None = None
    started = time.monotonic()
    try:
        subprocess.run(["docker", "rm", "-f", container], capture_output=True, check=False)
        process = subprocess.Popen(command, stdout=log, stderr=subprocess.STDOUT, text=True, start_new_session=True)
        sampler.start()
        return_code = process.wait(timeout=args.run_timeout_seconds + 300)
        if return_code != 0:
            atomic_json(
                output / "runner-error.json",
                {"timestamp_utc": utc_now(), "error": f"container exit code {return_code}"},
            )
            return 1
        result_path = output / "final-result.json"
        if not result_path.exists():
            atomic_json(
                output / "runner-error.json",
                {"timestamp_utc": utc_now(), "error": "final-result.json was not produced"},
            )
            return 1
        result = json.loads(result_path.read_text(encoding="utf-8"))
        if result.get("run_id") != args.run_id or result.get("campaign_id") != args.campaign_id:
            atomic_json(
                output / "runner-error.json",
                {"timestamp_utc": utc_now(), "error": "result identity mismatch"},
            )
            return 1
        return 0
    except (KeyboardInterrupt, subprocess.TimeoutExpired):
        subprocess.run(["docker", "stop", "--time", "300", container], check=False)
        return 124
    finally:
        sampler.stop()
        if process is not None and process.poll() is None:
            process.kill()
            process.wait()
        subprocess.run(["docker", "rm", "-f", container], capture_output=True, check=False)
        log.close()
        atomic_json(
            output / "runner-state.json",
            {"finished_utc": utc_now(), "elapsed_seconds": time.monotonic() - started},
        )


def handle_termination(_signum: int, _frame: Any) -> None:
    raise KeyboardInterrupt


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--monolith", choices=("monolith1", "monolith2"), required=True)
    parser.add_argument("--campaign-id", required=True)
    parser.add_argument("--arm-id", required=True)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--seed", type=int, required=True)
    parser.add_argument("--dataset-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--image-tag", required=True)
    parser.add_argument("--run-timeout-seconds", type=int, default=3600)
    parser.add_argument("--finalization-reserve-seconds", type=int, default=300)
    parser.add_argument("--max-accepted-improvements", type=int, default=500)
    parser.add_argument("--minimum-improvement", type=float, default=0.0001)
    parser.add_argument("--cpuset", default="8-15")
    parser.add_argument("--numa-node", default="1")
    parser.add_argument("--aggregate-cpus", type=float, default=8.0)
    parser.add_argument("--aggregate-memory", default="16g")
    parser.add_argument("--dataset-hash", required=True)
    args = parser.parse_args()
    signal.signal(signal.SIGTERM, handle_termination)
    return execute(args)


if __name__ == "__main__":
    raise SystemExit(main())
