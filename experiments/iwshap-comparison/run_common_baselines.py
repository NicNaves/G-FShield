#!/usr/bin/env python3
"""Run resumable all-feature and historical-IWSHAP-subset Weka baselines."""

from __future__ import annotations

import argparse
import json
import os
import signal
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def atomic_json(path: Path, value: dict) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(
        json.dumps(value, indent=2, sort_keys=True, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    os.replace(temporary, path)


def terminate(process: subprocess.Popen) -> None:
    if process.poll() is not None:
        return
    if os.name == "posix":
        os.killpg(process.pid, signal.SIGTERM)
    else:
        process.terminate()
    try:
        process.wait(timeout=30)
    except subprocess.TimeoutExpired:
        if os.name == "posix":
            os.killpg(process.pid, signal.SIGKILL)
        else:
            process.kill()
        process.wait(timeout=30)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-root", required=True, type=Path)
    parser.add_argument("--output-root", required=True, type=Path)
    parser.add_argument(
        "--baseline-runner",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "10-day-campaign/run_baseline.py",
    )
    parser.add_argument(
        "--evaluator-image", default="gfshield-campaign-evaluator:quality-5dec3b1"
    )
    parser.add_argument("--cpuset", default="8-15")
    parser.add_argument("--numa-node", default="1")
    parser.add_argument("--aggregate-cpus", type=int, default=6)
    parser.add_argument("--aggregate-memory", default="12g")
    parser.add_argument("--evaluation-timeout-seconds", type=int, default=1800)
    args = parser.parse_args()

    data_root = args.data_root.resolve()
    output_root = args.output_root.resolve()
    output_root.mkdir(parents=True, exist_ok=True)
    manifest = json.loads(
        (data_root / "audit-and-split-manifest.json").read_text(encoding="utf-8")
    )
    state_path = output_root / "state.json"
    state = (
        json.loads(state_path.read_text(encoding="utf-8"))
        if state_path.exists()
        else {
            "schema_version": 1,
            "created_utc": utc_now(),
            "source_commit": manifest["source_commit"],
            "state": "RUNNING",
            "evaluations": [],
        }
    )
    completed = {
        (item["scenario"], item["variant"])
        for item in state["evaluations"]
        if item.get("return_code") == 0 and Path(item["result_path"]).is_file()
    }

    for scenario in manifest["scenarios"]:
        scenario_name = scenario["scenario"]
        variants = (
            ("all-features", data_root / scenario_name, scenario["features"]),
            (
                "historical-iwshap-subset",
                data_root / scenario_name / "iwshap-selected",
                scenario["iwshap_log"]["best"]["feature_count"],
            ),
        )
        for variant, dataset_dir, feature_count in variants:
            if (scenario_name, variant) in completed:
                continue
            destination = output_root / scenario_name / variant
            destination.mkdir(parents=True, exist_ok=True)
            run_id = f"iwshap-{scenario_name}-{variant}-s20260909"
            command = [
                sys.executable,
                str(args.baseline_runner.resolve()),
                "--campaign-id",
                "gfshield-iwshap-external-2026",
                "--arm-id",
                variant,
                "--run-id",
                run_id,
                "--seed",
                "20260909",
                "--dataset-dir",
                str(dataset_dir),
                "--output-dir",
                str(destination),
                "--evaluator-image",
                args.evaluator_image,
                "--feature-count",
                str(feature_count),
                "--cpuset",
                args.cpuset,
                "--numa-node",
                args.numa_node,
                "--aggregate-cpus",
                str(args.aggregate_cpus),
                "--aggregate-memory",
                args.aggregate_memory,
                "--dataset-hash",
                scenario["split_index"]["sha256"],
                "--train-hash",
                scenario["splits"]["train"][
                    "full_arff" if variant == "all-features" else "iwshap_selected_arff"
                ]["sha256"],
                "--validation-hash",
                scenario["splits"]["validation"][
                    "full_arff" if variant == "all-features" else "iwshap_selected_arff"
                ]["sha256"],
                "--test-hash",
                scenario["splits"]["test"][
                    "full_arff" if variant == "all-features" else "iwshap_selected_arff"
                ]["sha256"],
            ]
            started = utc_now()
            before = time.monotonic()
            log_path = destination / "runner.log"
            with log_path.open("w", encoding="utf-8") as log:
                process = subprocess.Popen(
                    command,
                    stdout=log,
                    stderr=subprocess.STDOUT,
                    text=True,
                    start_new_session=(os.name == "posix"),
                )
                try:
                    return_code = process.wait(timeout=args.evaluation_timeout_seconds)
                    timed_out = False
                except subprocess.TimeoutExpired:
                    timed_out = True
                    terminate(process)
                    return_code = 124
            result_path = destination / "final-result.json"
            state["evaluations"].append(
                {
                    "scenario": scenario_name,
                    "variant": variant,
                    "feature_count": feature_count,
                    "started_utc": started,
                    "finished_utc": utc_now(),
                    "elapsed_seconds": time.monotonic() - before,
                    "timeout_seconds": args.evaluation_timeout_seconds,
                    "timed_out": timed_out,
                    "return_code": return_code,
                    "command": command,
                    "log_path": str(log_path),
                    "result_path": str(result_path),
                    "artifact_valid": return_code == 0 and result_path.is_file(),
                }
            )
            atomic_json(state_path, state)
            if return_code != 0:
                state["state"] = "FAILED"
                state["finished_utc"] = utc_now()
                atomic_json(state_path, state)
                return return_code

    state["state"] = "COMPLETED"
    state["finished_utc"] = utc_now()
    atomic_json(state_path, state)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
