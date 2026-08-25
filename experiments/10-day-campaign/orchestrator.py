#!/usr/bin/env python3
"""Resumable sequential campaign orchestrator with monotonic hard deadlines."""

from __future__ import annotations

import argparse
import hashlib
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
from typing import Any, Callable


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
    seeds = manifest.get("seeds", [])
    maximum = campaign.get("maximum_seconds")
    algorithm = campaign.get("algorithm_seconds")
    baseline = campaign.get("baseline_maximum_seconds")
    reserve = campaign.get("reserve_seconds")
    supervisor_grace = manifest.get("stopping", {}).get("graceful_shutdown_seconds", 0)

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
    if len(seeds) != 8 or len(seeds) != len(set(seeds)) or not all(isinstance(seed, int) for seed in seeds):
        errors.append("campaign must define exactly eight unique integer seeds")
    if algorithm is not None and sum(arm.get("window_seconds", 0) for arm in arms) != algorithm:
        errors.append("arm windows do not match the algorithm budget")

    for arm in arms:
        arm_id = arm.get("arm_id", "<missing>")
        window = arm.get("window_seconds", 0)
        timeout = arm.get("run_timeout_seconds", 0)
        if timeout <= 0 or window <= 0 or timeout + 10 * 60 > window:
            errors.append(f"invalid time budget for arm {arm_id}")
        if 8 * (timeout + supervisor_grace) + 10 * 60 > window:
            errors.append(f"arm {arm_id} cannot attempt eight runs within its window")
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
        if baseline_config.get("run_timeout_seconds", 0) <= 0:
            errors.append("baseline run timeout is invalid")
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
        while True:
            try:
                descriptor = os.open(self.path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
                break
            except FileExistsError as error:
                try:
                    age_seconds = time.time() - self.path.stat().st_mtime
                    contents = self.path.read_text(encoding="ascii").strip()
                    owner_pid = int(contents)
                except (OSError, ValueError):
                    age_seconds = 0.0
                    owner_pid = -1
                owner_running = False
                if owner_pid > 0:
                    try:
                        os.kill(owner_pid, 0)
                        owner_running = True
                    except ProcessLookupError:
                        owner_running = False
                    except PermissionError:
                        owner_running = True
                    except OSError:
                        owner_running = False
                if owner_running or age_seconds < 60:
                    raise RuntimeError(f"campaign lock already exists: {self.path}") from error
                try:
                    self.path.unlink()
                except FileNotFoundError:
                    continue
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


def recover_orphan(state: dict[str, Any], state_path: Path, grace_seconds: int) -> None:
    active = state.get("active_run")
    if not isinstance(active, dict):
        return
    pid = active.get("pid")
    run_id = str(active.get("run_id") or "")
    recovery = {
        "timestamp_utc": iso(utc_now()),
        "run_id": run_id,
        "pid": pid,
        "action": "no_live_process",
    }
    if isinstance(pid, int) and pid > 0 and os.name == "posix":
        cmdline_path = Path(f"/proc/{pid}/cmdline")
        try:
            cmdline = cmdline_path.read_bytes().replace(b"\0", b" ").decode("utf-8", errors="replace")
        except OSError:
            cmdline = ""
        if run_id and run_id in cmdline:
            try:
                os.killpg(pid, signal.SIGTERM)
                deadline = time.monotonic() + grace_seconds
                while cmdline_path.exists() and time.monotonic() < deadline:
                    time.sleep(1)
                if cmdline_path.exists():
                    os.killpg(pid, signal.SIGKILL)
                    recovery["action"] = "sigkill_orphan"
                else:
                    recovery["action"] = "sigterm_orphan"
            except ProcessLookupError:
                recovery["action"] = "process_already_exited"
            except PermissionError:
                recovery["action"] = "permission_denied"
        elif cmdline:
            recovery["action"] = "pid_identity_mismatch"
    state.setdefault("recovery_events", []).append(recovery)
    state.pop("active_run", None)
    atomic_json(state_path, state)


def run_once(
    command: list[str],
    timeout_seconds: int,
    grace_seconds: int,
    log_path: Path,
    environment: dict[str, str],
    on_start: Callable[[int], None] | None = None,
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
        if on_start is not None:
            on_start(process.pid)
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


def attach_result_artifact(
    process_result: dict[str, object],
    result_path: Path,
    campaign_id: str,
    arm_id: str,
    run_id: str,
) -> bool:
    process_result["result_path"] = str(result_path)
    if not result_path.exists():
        process_result["artifact_valid"] = False
        process_result["artifact_error"] = "final-result.json is missing"
        return False
    try:
        raw = result_path.read_bytes()
        result = json.loads(raw)
    except (OSError, json.JSONDecodeError) as error:
        process_result["artifact_valid"] = False
        process_result["artifact_error"] = repr(error)
        return False
    identities_match = (
        result.get("campaign_id") == campaign_id
        and result.get("arm_id") == arm_id
        and result.get("run_id") == run_id
    )
    experimental_status = result.get("status")
    valid_status = experimental_status in {"completed", "timeout"}
    process_result.update(
        {
            "artifact_valid": bool(identities_match and valid_status),
            "result_sha256": hashlib.sha256(raw).hexdigest(),
            "experimental_status": experimental_status,
            "experimental_stop_reason": result.get("stop_reason"),
            "experimental_error_code": result.get("error_code"),
        }
    )
    if not identities_match:
        process_result["artifact_error"] = "result identity mismatch"
    elif not valid_status:
        process_result["artifact_error"] = f"invalid experimental status: {experimental_status!r}"
    return bool(process_result["artifact_valid"])


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
        recover_orphan(state, state_path, grace)
        seeds = manifest["seeds"]
        result_root = manifest_path.parent / "results" / "raw"
        baseline_arm_id = manifest["baseline"]["arm_id"]
        resuming_baseline = (
            state.get("current_arm") == baseline_arm_id
            and state.get("state") in {"RUNNING_ARM", "FINALIZING_ARM"}
            and state.get("arm_deadline_utc")
        )

        for arm_index in range(state["next_arm_index"], len(manifest["arms"])):
            arm = manifest["arms"][arm_index]
            now = utc_now()
            if now >= algorithm_deadline or now >= global_deadline:
                state["state"] = "GLOBAL_TIMEOUT"
                atomic_json(state_path, state)
                return 3
            resuming_arm = (
                state.get("current_arm") == arm["arm_id"]
                and state.get("state") in {"RUNNING_ARM", "FINALIZING_ARM"}
                and state.get("arm_deadline_utc")
            )
            if resuming_arm:
                arm_deadline = datetime.fromisoformat(state["arm_deadline_utc"])
            else:
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
            if utc_now() >= arm_deadline:
                state["state"] = "ARM_COMPLETED"
                state["next_arm_index"] = arm_index + 1
                atomic_json(state_path, state)
                continue

            completed_for_arm = {
                run["seed"]
                for run in state["completed_runs"]
                if run["arm_id"] == arm["arm_id"] and run.get("artifact_valid") is True
            }
            for seed in seeds:
                if seed in completed_for_arm:
                    continue
                supervised_timeout = arm["run_timeout_seconds"] + grace
                while seed not in completed_for_arm:
                    remaining = (arm_deadline - utc_now()).total_seconds()
                    if remaining < supervised_timeout + 10 * 60:
                        break
                    run_id = f"{arm['arm_id']}-s{seed}-{uuid.uuid4().hex[:12]}"
                    run_output = (result_root / arm["arm_id"] / run_id).resolve()
                    context = {
                        "campaign_id": manifest["campaign_id"],
                        "arm_id": arm["arm_id"],
                        "run_id": run_id,
                        "seed": seed,
                        "run_timeout_seconds": arm["run_timeout_seconds"],
                        "result_dir": str(run_output),
                    }
                    command = format_command(arm["command"], context)
                    environment = os.environ.copy()
                    environment.update({key.upper(): str(value) for key, value in context.items()})
                    def register_active_run(pid: int) -> None:
                        state["active_run"] = {
                            "pid": pid,
                            "arm_id": arm["arm_id"],
                            "run_id": run_id,
                            "seed": seed,
                            "started_utc": iso(utc_now()),
                        }
                        atomic_json(state_path, state)

                    result = run_once(
                        command,
                        supervised_timeout,
                        grace,
                        run_output / "orchestrator.log",
                        environment,
                        register_active_run,
                    )
                    state.pop("active_run", None)
                    result.update({"arm_id": arm["arm_id"], "run_id": run_id, "seed": seed})
                    artifact_valid = attach_result_artifact(
                        result,
                        run_output / "final-result.json",
                        manifest["campaign_id"],
                        arm["arm_id"],
                        run_id,
                    )
                    state["completed_runs"].append(result)
                    atomic_json(state_path, state)
                    if artifact_valid:
                        completed_for_arm.add(seed)
                if seed not in completed_for_arm:
                    break

            valid_seed_count = len(completed_for_arm)
            state["current_arm_valid_seed_count"] = valid_seed_count
            state["state"] = "FINALIZING_ARM"
            atomic_json(state_path, state)
            state["state"] = "ARM_COMPLETED" if valid_seed_count == len(seeds) else "ARM_INCOMPLETE"
            state["next_arm_index"] = arm_index + 1
            atomic_json(state_path, state)

        if not resuming_baseline:
            state["state"] = "CAMPAIGN_ALGORITHMS_COMPLETED"
            state["current_arm"] = None
            atomic_json(state_path, state)

        baseline = manifest["baseline"]
        baseline_start = utc_now()
        if resuming_baseline:
            baseline_deadline = datetime.fromisoformat(state["arm_deadline_utc"])
        else:
            baseline_deadline = min(
                baseline_start + timedelta(seconds=baseline["maximum_seconds"]),
                datetime.fromisoformat(state["campaign_start_utc"])
                + timedelta(
                    seconds=manifest["campaign"]["maximum_seconds"]
                    - manifest["campaign"]["reserve_seconds"]
                ),
            )
            state.update(
                {
                    "state": "RUNNING_ARM",
                    "current_arm": baseline["arm_id"],
                    "arm_start_utc": iso(baseline_start),
                    "arm_deadline_utc": iso(baseline_deadline),
                }
            )
            atomic_json(state_path, state)
        completed_baseline_seeds = {
            run["seed"]
            for run in state["completed_runs"]
            if run["arm_id"] == baseline["arm_id"] and run.get("artifact_valid") is True
        }
        for seed in seeds:
            if seed in completed_baseline_seeds:
                continue
            timeout_seconds = baseline["run_timeout_seconds"]
            supervised_timeout = timeout_seconds + grace
            while seed not in completed_baseline_seeds:
                remaining = (baseline_deadline - utc_now()).total_seconds()
                if remaining < supervised_timeout + 10 * 60:
                    break
                run_id = f"{baseline['arm_id']}-s{seed}-{uuid.uuid4().hex[:12]}"
                run_output = (result_root / baseline["arm_id"] / run_id).resolve()
                context = {
                    "campaign_id": manifest["campaign_id"],
                    "arm_id": baseline["arm_id"],
                    "run_id": run_id,
                    "seed": seed,
                    "run_timeout_seconds": timeout_seconds,
                    "result_dir": str(run_output),
                }
                command = format_command(baseline["command"], context)
                environment = os.environ.copy()
                environment.update({key.upper(): str(value) for key, value in context.items()})
                def register_active_baseline(pid: int) -> None:
                    state["active_run"] = {
                        "pid": pid,
                        "arm_id": baseline["arm_id"],
                        "run_id": run_id,
                        "seed": seed,
                        "started_utc": iso(utc_now()),
                    }
                    atomic_json(state_path, state)

                result = run_once(
                    command,
                    supervised_timeout,
                    grace,
                    run_output / "orchestrator.log",
                    environment,
                    register_active_baseline,
                )
                state.pop("active_run", None)
                result.update({"arm_id": baseline["arm_id"], "run_id": run_id, "seed": seed})
                artifact_valid = attach_result_artifact(
                    result,
                    run_output / "final-result.json",
                    manifest["campaign_id"],
                    baseline["arm_id"],
                    run_id,
                )
                state["completed_runs"].append(result)
                atomic_json(state_path, state)
                if artifact_valid:
                    completed_baseline_seeds.add(seed)
            if seed not in completed_baseline_seeds:
                break

        state["state"] = "FINALIZING_ARM"
        atomic_json(state_path, state)
        expected_arm_ids = [arm["arm_id"] for arm in manifest["arms"]] + [baseline["arm_id"]]
        valid_seeds_by_arm = {
            arm_id: sorted({
                run["seed"]
                for run in state["completed_runs"]
                if run["arm_id"] == arm_id and run.get("artifact_valid") is True
            })
            for arm_id in expected_arm_ids
        }
        incomplete = {
            arm_id: [seed for seed in seeds if seed not in valid_seeds]
            for arm_id, valid_seeds in valid_seeds_by_arm.items()
            if len(valid_seeds) != len(seeds)
        }
        state["completion_summary"] = {
            "valid_seeds_by_arm": valid_seeds_by_arm,
            "missing_seeds_by_arm": incomplete,
        }
        state["state"] = "CAMPAIGN_COMPLETED" if not incomplete else "CAMPAIGN_INCOMPLETE"
        state["current_arm"] = None
        atomic_json(state_path, state)
    return 0 if not incomplete else 4


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
