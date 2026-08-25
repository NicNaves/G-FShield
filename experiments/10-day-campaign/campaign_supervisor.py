#!/usr/bin/env python3
"""External watchdog and restart supervisor for the ten-day campaign."""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import os
import shutil
import signal
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from orchestrator import CampaignLock, atomic_json, iso, load_json, utc_now


FINAL_STATES = {
    "CAMPAIGN_COMPLETED",
    "CAMPAIGN_INCOMPLETE",
    "CAMPAIGN_FAILED",
    "GLOBAL_TIMEOUT",
}


def rotate_log(path: Path, maximum_bytes: int) -> Path | None:
    """Compress a full log and retain a checksum before opening a fresh file."""
    if not path.exists() or path.stat().st_size < maximum_bytes:
        return None
    stamp = utc_now().strftime("%Y%m%dT%H%M%S%fZ")
    archive = path.with_name(f"{path.name}.{stamp}.gz")
    digest = hashlib.sha256()
    with path.open("rb") as source, gzip.open(archive, "wb", compresslevel=6) as target:
        while chunk := source.read(1024 * 1024):
            digest.update(chunk)
            target.write(chunk)
    archive_digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    archive.with_suffix(archive.suffix + ".sha256").write_text(
        f"{archive_digest}  {archive.name}\n"
        f"{digest.hexdigest()}  {path.name} (uncompressed)\n",
        encoding="ascii",
    )
    path.unlink()
    return archive


def terminate_group(process: subprocess.Popen[Any], grace_seconds: int) -> str:
    if process.poll() is not None:
        return "already_exited"
    if os.name == "posix":
        os.killpg(process.pid, signal.SIGTERM)
    else:
        process.terminate()
    try:
        process.wait(timeout=grace_seconds)
        return "sigterm"
    except subprocess.TimeoutExpired:
        if os.name == "posix":
            os.killpg(process.pid, signal.SIGKILL)
        else:
            process.kill()
        process.wait()
        return "sigkill"


def update_campaign_failure(state_path: Path, reason: str) -> None:
    if not state_path.exists():
        return
    state = load_json(state_path)
    if state.get("state") not in FINAL_STATES:
        state["state"] = "CAMPAIGN_FAILED"
        state["failure_reason"] = reason
        state["failed_utc"] = iso(utc_now())
        atomic_json(state_path, state)


def supervise(args: argparse.Namespace) -> int:
    manifest = load_json(args.manifest)
    maximum_seconds = int(manifest["campaign"]["maximum_seconds"])
    if maximum_seconds != 240 * 60 * 60:
        raise RuntimeError("the external watchdog requires an exact 240-hour campaign")
    prior_supervisor: dict[str, Any] = {}
    if args.supervisor_state.exists():
        prior_supervisor = load_json(args.supervisor_state)
        if prior_supervisor.get("campaign_id") != manifest.get("campaign_id"):
            raise RuntimeError("supervisor state belongs to a different campaign_id")
    expected_campaign_deadline = prior_supervisor.get("campaign_recorded_deadline_utc")
    if prior_supervisor.get("hard_deadline_utc"):
        hard_deadline = datetime.fromisoformat(prior_supervisor["hard_deadline_utc"])
    elif args.state.exists():
        existing = load_json(args.state)
        if existing.get("campaign_id") != manifest.get("campaign_id"):
            raise RuntimeError("campaign state belongs to a different campaign_id")
        hard_deadline = datetime.fromisoformat(existing["campaign_deadline_utc"])
        expected_campaign_deadline = existing["campaign_deadline_utc"]
    else:
        hard_deadline = utc_now() + timedelta(seconds=maximum_seconds)
    hard_deadline_monotonic = time.monotonic() + max(
        0.0, (hard_deadline - utc_now()).total_seconds()
    )
    termination_start = hard_deadline - timedelta(seconds=args.grace_seconds)
    termination_start_monotonic = hard_deadline_monotonic - args.grace_seconds

    args.supervisor_state.parent.mkdir(parents=True, exist_ok=True)
    args.log.parent.mkdir(parents=True, exist_ok=True)
    lock_path = args.supervisor_state.with_suffix(".lock")
    stop_requested = False
    child: subprocess.Popen[Any] | None = None

    def handle_stop(_signum: int, _frame: object) -> None:
        nonlocal stop_requested
        stop_requested = True

    signal.signal(signal.SIGTERM, handle_stop)
    if hasattr(signal, "SIGINT"):
        signal.signal(signal.SIGINT, handle_stop)

    with CampaignLock(lock_path):
        restarts = 0
        supervisor = {
            "campaign_id": manifest["campaign_id"],
            "state": "WATCHDOG_RUNNING",
            "watchdog_started_utc": iso(utc_now()),
            "hard_deadline_utc": iso(hard_deadline),
            "termination_start_utc": iso(termination_start),
            "minimum_free_disk_bytes": args.minimum_free_disk_bytes,
            "restart_count": restarts,
            "events": [],
        }
        atomic_json(args.supervisor_state, supervisor)

        while True:
            now = utc_now()
            if stop_requested:
                action = terminate_group(child, args.grace_seconds) if child else "no_child"
                supervisor.update({
                    "state": "WATCHDOG_INTERRUPTED",
                    "finished_utc": iso(utc_now()),
                    "termination_action": action,
                })
                atomic_json(args.supervisor_state, supervisor)
                return 130
            if now >= termination_start or time.monotonic() >= termination_start_monotonic:
                grace_remaining = max(0, int(hard_deadline_monotonic - time.monotonic()))
                action = terminate_group(child, grace_remaining) if child else "no_child"
                if args.state.exists():
                    campaign_state = load_json(args.state)
                    campaign_state["state"] = "GLOBAL_TIMEOUT"
                    campaign_state["global_timeout_utc"] = iso(utc_now())
                    campaign_state["watchdog_termination_action"] = action
                    atomic_json(args.state, campaign_state)
                supervisor.update({
                    "state": "GLOBAL_TIMEOUT",
                    "finished_utc": iso(utc_now()),
                    "termination_action": action,
                })
                atomic_json(args.supervisor_state, supervisor)
                return 3

            free_bytes = shutil.disk_usage(args.output_root).free
            supervisor["last_check_utc"] = iso(now)
            supervisor["last_free_disk_bytes"] = free_bytes
            if free_bytes < args.minimum_free_disk_bytes:
                action = terminate_group(child, args.grace_seconds) if child else "no_child"
                reason = f"free disk {free_bytes} below threshold {args.minimum_free_disk_bytes}"
                update_campaign_failure(args.state, reason)
                supervisor.update({
                    "state": "CAMPAIGN_FAILED",
                    "failure_reason": reason,
                    "termination_action": action,
                    "finished_utc": iso(utc_now()),
                })
                atomic_json(args.supervisor_state, supervisor)
                return 5

            if args.state.exists():
                campaign_state = load_json(args.state)
                state_name = campaign_state.get("state")
                recorded_deadline_text = campaign_state["campaign_deadline_utc"]
                if expected_campaign_deadline is None:
                    expected_campaign_deadline = recorded_deadline_text
                    supervisor["campaign_recorded_deadline_utc"] = recorded_deadline_text
                elif recorded_deadline_text != expected_campaign_deadline:
                    action = terminate_group(child, args.grace_seconds) if child else "no_child"
                    update_campaign_failure(args.state, "campaign deadline changed after attestation")
                    supervisor.update({
                        "state": "CAMPAIGN_FAILED",
                        "failure_reason": "campaign deadline changed after attestation",
                        "termination_action": action,
                        "finished_utc": iso(utc_now()),
                    })
                    atomic_json(args.supervisor_state, supervisor)
                    return 6
                if state_name in FINAL_STATES:
                    supervisor.update({"state": state_name, "finished_utc": iso(now)})
                    atomic_json(args.supervisor_state, supervisor)
                    return 0 if state_name == "CAMPAIGN_COMPLETED" else 4

            if child is None or child.poll() is not None:
                if child is not None:
                    event = {
                        "timestamp_utc": iso(now),
                        "event": "orchestrator_exit",
                        "return_code": child.returncode,
                    }
                    supervisor["events"].append(event)
                    restarts += 1
                    supervisor["restart_count"] = restarts
                    if restarts > args.maximum_restarts:
                        update_campaign_failure(args.state, "orchestrator restart limit exceeded")
                        supervisor.update({
                            "state": "CAMPAIGN_FAILED",
                            "failure_reason": "orchestrator restart limit exceeded",
                            "finished_utc": iso(now),
                        })
                        atomic_json(args.supervisor_state, supervisor)
                        return 7
                    remaining = hard_deadline_monotonic - time.monotonic()
                    time.sleep(min(args.restart_delay_seconds, max(0.0, remaining)))
                    continue
                rotate_log(args.log, args.log_rotation_bytes)
                command = [
                    sys.executable,
                    str(Path(__file__).with_name("orchestrator.py")),
                    "--manifest", str(args.manifest.resolve()),
                    "--state", str(args.state.resolve()),
                    "--run",
                ]
                log_handle = args.log.open("ab", buffering=0)
                try:
                    child = subprocess.Popen(
                        command,
                        stdout=log_handle,
                        stderr=subprocess.STDOUT,
                        start_new_session=(os.name == "posix"),
                    )
                finally:
                    log_handle.close()
                supervisor["orchestrator_pid"] = child.pid
                supervisor["events"].append({
                    "timestamp_utc": iso(utc_now()),
                    "event": "orchestrator_start",
                    "pid": child.pid,
                    "restart_number": restarts,
                })
            atomic_json(args.supervisor_state, supervisor)
            remaining = hard_deadline_monotonic - time.monotonic()
            time.sleep(min(args.poll_seconds, max(0.0, remaining)))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--state", required=True, type=Path)
    parser.add_argument("--supervisor-state", required=True, type=Path)
    parser.add_argument("--log", required=True, type=Path)
    parser.add_argument("--output-root", required=True, type=Path)
    parser.add_argument("--minimum-free-disk-bytes", type=int, default=10 * 1024**3)
    parser.add_argument("--poll-seconds", type=int, default=15)
    parser.add_argument("--grace-seconds", type=int, default=5 * 60)
    parser.add_argument("--maximum-restarts", type=int, default=10)
    parser.add_argument("--restart-delay-seconds", type=int, default=30)
    parser.add_argument("--log-rotation-bytes", type=int, default=20 * 1024**2)
    args = parser.parse_args()
    args.output_root.mkdir(parents=True, exist_ok=True)
    return supervise(args)


if __name__ == "__main__":
    raise SystemExit(main())
