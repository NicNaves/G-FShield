#!/usr/bin/env python3
"""Resumable sequential campaign orchestrator with monotonic hard deadlines."""

from __future__ import annotations

import argparse
import json
import os
import signal
import subprocess
import sys
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


def load_json(path: Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def validate_manifest(manifest: dict[str, Any], require_ready: bool = True) -> list[str]:
    errors: list[str] = []
    campaign = manifest.get("campaign", {})
    arms = manifest.get("arms", [])
    maximum = campaign.get("maximum_seconds")
    algorithm = campaign.get("algorithm_seconds")
    baseline = campaign.get("baseline_maximum_seconds")
    reserve = campaign.get("reserve_seconds")

    if maximum != 240 * 60 * 60:
        errors.append("campaign maximum must be exactly 240 hours")
    if algorithm != 208 * 60 * 60:
        errors.append("algorithm budget must be exactly 208 hours")
    if baseline is None or baseline > 8 * 60 * 60:
        errors.append("baseline budget must not exceed 8 hours")
    if reserve is None or reserve < 24 * 60 * 60:
        errors.append("reserve must be at least 24 hours")
    if all(isinstance(value, int) for value in (algorithm, baseline, reserve, maximum)):
        if algorithm + baseline + reserve != maximum:
            errors.append("algorithm, baseline, and reserve budgets must add to 240 hours")

    arm_ids = [arm.get("arm_id") for arm in arms]
    if not arms:
        errors.append("manifest has no arms")
    if len(arm_ids) != len(set(arm_ids)):
        errors.append("arm identifiers must be unique")
    if any(not arm_id for arm_id in arm_ids):
        errors.append("every arm needs an arm_id")
    if algorithm is not None and sum(arm.get("window_seconds", 0) for arm in arms) != algorithm:
        errors.append("arm windows do not match the algorithm budget")

    for arm in arms:
        arm_id = arm.get("arm_id", "<missing>")
        window = arm.get("window_seconds", 0)
        timeout = arm.get("run_timeout_seconds", 0)
        if timeout <= 0 or window <= 0 or timeout + 10 * 60 > window:
            errors.append(f"invalid time budget for arm {arm_id}")
        command = arm.get("command")
        if require_ready and (not arm.get("ready") or not isinstance(command, list) or not command):
            errors.append(f"arm {arm_id} is not frozen and runnable")

    if require_ready:
        if not manifest.get("ready"):
            errors.append("manifest ready flag is false")
        if manifest.get("readiness_blockers"):
            errors.append("manifest still contains readiness blockers")
        baseline_config = manifest.get("baseline", {})
        if not baseline_config.get("ready") or not baseline_config.get("command"):
            errors.append("baseline is not frozen and runnable")
        git_config = manifest.get("git", {})
        if "TO_BE_FROZEN" in json.dumps(git_config):
            errors.append("git commit/tag are not frozen")
        if "TO_BE_FROZEN" in json.dumps(manifest.get("resources", {})):
            errors.append("resource budget is not frozen")
        if "TO_BE_FROZEN" in json.dumps(manifest.get("classifier", {})):
            errors.append("classifier version/parameters are not frozen")
    return errors


class CampaignLock:
    def __init__(self, path: Path):
        self.path = path
        self.acquired = False

    def __enter__(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        try:
            descriptor = os.open(self.path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        except FileExistsError as error:
            raise RuntimeError(f"campaign lock already exists: {self.path}") from error
        with os.fdopen(descriptor, "w", encoding="ascii") as handle:
            handle.write(f"{os.getpid()}\n")
        self.acquired = True
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        if self.acquired:
            try:
                self.path.unlink()
            except FileNotFoundError:
                pass


def format_command(command: list[str], context: dict[str, object]) -> list[str]:
    return [str(part).format(**context) for part in command]


def terminate_process(process: subprocess.Popen, grace_seconds: int) -> tuple[str, int]:
    if process.poll() is not None:
        return "completed", process.returncode
    if os.name == "posix":
        os.killpg(process.pid, signal.SIGTERM)
    else:
        process.terminate()
    try:
        return "timeout", process.wait(timeout=grace_seconds)
    except subprocess.TimeoutExpired:
        if os.name == "posix":
            os.killpg(process.pid, signal.SIGKILL)
        else:
            process.kill()
        return "timeout_forced", process.wait()


def run_once(
    command: list[str],
    timeout_seconds: int,
    grace_seconds: int,
    log_path: Path,
    environment: dict[str, str],
) -> dict[str, object]:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    started_utc = utc_now()
    started_monotonic = time.monotonic()
    with log_path.open("ab", buffering=0) as log_handle:
        process = subprocess.Popen(
            command,
            stdout=log_handle,
            stderr=subprocess.STDOUT,
            env=environment,
            start_new_session=(os.name == "posix"),
        )
        try:
            return_code = process.wait(timeout=timeout_seconds)
            status = "completed" if return_code == 0 else "failed"
            stop_reason = "normal_exit" if return_code == 0 else "nonzero_exit"
        except subprocess.TimeoutExpired:
            status, return_code = terminate_process(process, grace_seconds)
            stop_reason = "run_timeout"
    finished_utc = utc_now()
    return {
        "command": command,
        "started_utc": iso(started_utc),
        "finished_utc": iso(finished_utc),
        "elapsed_seconds": time.monotonic() - started_monotonic,
        "status": status,
        "stop_reason": stop_reason,
        "return_code": return_code,
        "log_path": str(log_path),
    }


def execute(manifest_path: Path, state_path: Path) -> int:
    manifest = load_json(manifest_path)
    errors = validate_manifest(manifest, require_ready=True)
    if errors:
        for error in errors:
            print(f"PRECHECK ERROR: {error}", file=sys.stderr)
        return 2

    lock_path = state_path.with_suffix(".lock")
    with CampaignLock(lock_path):
        if state_path.exists():
            state = load_json(state_path)
        else:
            start = utc_now()
            state = {
                "campaign_id": manifest["campaign_id"],
                "state": "PREPARED",
                "campaign_start_utc": iso(start),
                "campaign_deadline_utc": iso(
                    start + timedelta(seconds=manifest["campaign"]["maximum_seconds"])
                ),
                "next_arm_index": 0,
                "completed_runs": [],
            }
            atomic_json(state_path, state)

        global_deadline = datetime.fromisoformat(state["campaign_deadline_utc"])
        algorithm_deadline = datetime.fromisoformat(state["campaign_start_utc"]) + timedelta(
            seconds=manifest["campaign"]["algorithm_seconds"]
        )
        grace = manifest["stopping"]["graceful_shutdown_seconds"]
        seeds = manifest["seeds"]
        result_root = manifest_path.parent / "results" / "raw"

        for arm_index in range(state["next_arm_index"], len(manifest["arms"])):
            arm = manifest["arms"][arm_index]
            now = utc_now()
            if now >= algorithm_deadline or now >= global_deadline:
                state["state"] = "GLOBAL_TIMEOUT"
                atomic_json(state_path, state)
                return 3
            arm_deadline = min(
                now + timedelta(seconds=arm["window_seconds"]),
                algorithm_deadline,
            )
            state.update(
                {
                    "state": "RUNNING_ARM",
                    "current_arm": arm["arm_id"],
                    "arm_start_utc": iso(now),
                    "arm_deadline_utc": iso(arm_deadline),
                }
            )
            atomic_json(state_path, state)

            completed_for_arm = {
                run["seed"]
                for run in state["completed_runs"]
                if run["arm_id"] == arm["arm_id"]
            }
            for seed in seeds:
                if seed in completed_for_arm:
                    continue
                remaining = (arm_deadline - utc_now()).total_seconds()
                if remaining < arm["run_timeout_seconds"] + 10 * 60:
                    break
                run_id = f"{arm['arm_id']}-s{seed}-{uuid.uuid4().hex[:12]}"
                context = {
                    "campaign_id": manifest["campaign_id"],
                    "arm_id": arm["arm_id"],
                    "run_id": run_id,
                    "seed": seed,
                    "run_timeout_seconds": arm["run_timeout_seconds"],
                }
                command = format_command(arm["command"], context)
                environment = os.environ.copy()
                environment.update({key.upper(): str(value) for key, value in context.items()})
                result = run_once(
                    command,
                    arm["run_timeout_seconds"],
                    grace,
                    result_root / arm["arm_id"] / f"{run_id}.log",
                    environment,
                )
                result.update({"arm_id": arm["arm_id"], "run_id": run_id, "seed": seed})
                state["completed_runs"].append(result)
                atomic_json(state_path, state)

            state["state"] = "ARM_COMPLETED"
            state["next_arm_index"] = arm_index + 1
            atomic_json(state_path, state)

        state["state"] = "CAMPAIGN_ALGORITHMS_COMPLETED"
        state["current_arm"] = None
        atomic_json(state_path, state)
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--state", type=Path)
    parser.add_argument("--preflight", action="store_true")
    parser.add_argument("--development-preflight", action="store_true")
    parser.add_argument("--run", action="store_true")
    args = parser.parse_args()
    manifest = load_json(args.manifest)

    if args.preflight or args.development_preflight:
        errors = validate_manifest(manifest, require_ready=not args.development_preflight)
        if errors:
            for error in errors:
                print(f"PRECHECK ERROR: {error}")
            return 2
        print("preflight passed")
        return 0
    if args.run:
        if args.state is None:
            parser.error("--state is required with --run")
        return execute(args.manifest, args.state)
    parser.error("choose --preflight, --development-preflight, or --run")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
