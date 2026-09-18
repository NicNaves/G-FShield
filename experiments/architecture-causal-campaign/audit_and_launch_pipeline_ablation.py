#!/usr/bin/env python3
"""Audit pipeline-ablation pilot artifacts and launch the formal campaign only on success."""

from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path


REPO = Path("/home/idscps/nicolas/G-FShield-pipeline-ablation-v11")
PILOT = Path("/home/idscps/nicolas/experiment-artifacts/pipeline-ablation/pilot-v11")
FORMAL = Path("/home/idscps/nicolas/experiment-artifacts/pipeline-ablation/formal-v11")
TAG = "experiment-pipeline-ablation-v11"
IMAGE_TAG = "pipeline-ablation-75b2db2"
EXPECTED_ARMS = {"monolith", "distributed-w1", "distributed-w2", "distributed-w4"}
PILOT_PID = int(sys.argv[1])


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def atomic_json(path: Path, value: object) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(
        json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    os.replace(temporary, path)


def process_is_pilot() -> bool:
    cmdline = Path(f"/proc/{PILOT_PID}/cmdline")
    if not cmdline.exists():
        return False
    return "run_pipeline_ablation.py" in cmdline.read_bytes().replace(b"\0", b" ").decode(
        "utf-8", errors="replace"
    )


def audit_pilot() -> dict:
    state_path = PILOT / "state.json"
    if not state_path.exists():
        raise RuntimeError("pilot state is missing")
    state = json.loads(state_path.read_text(encoding="utf-8"))
    if state.get("state") != "PILOT_COMPLETED":
        raise RuntimeError(f"pilot did not complete: {state.get('state')}")
    completed = state.get("completed", [])
    if len(completed) != 4 or {row.get("arm") for row in completed} != EXPECTED_ARMS:
        raise RuntimeError("pilot does not contain one valid cell for every arm")
    if any(int(row.get("seed", -1)) != 41 for row in completed):
        raise RuntimeError("pilot seed differs from 41")
    audited = []
    for cell in completed:
        run_dir = Path(cell["result_path"]).parent
        required = [
            run_dir / "final-result.json",
            run_dir / "resource-samples.jsonl",
            run_dir / "checksums.sha256",
        ]
        if cell["architecture"] == "monolith":
            required.append(run_dir / "all-candidate-trace.jsonl")
        else:
            required.extend([run_dir / "compose.log", run_dir / "resolved-compose.yaml"])
        missing = [str(path) for path in required if not path.exists()]
        if missing:
            raise RuntimeError(f"missing pilot artifacts: {missing}")
        result = json.loads((run_dir / "final-result.json").read_text(encoding="utf-8"))
        expected_arm_id = f"matched-rf-vnd-iwssr-{cell['arm']}"
        if (
            result.get("campaign_id") != "gfshield-pipeline-ablation-2026-v11"
            or result.get("arm_id") != expected_arm_id
            or int(result.get("seed", -1)) != 41
            or int(result.get("candidate_count", 0)) <= 0
            or result.get("status") not in {"completed", "timeout"}
        ):
            raise RuntimeError(f"invalid result identity or metrics in {run_dir}")
        if not (run_dir / "resource-samples.jsonl").read_text(encoding="utf-8").strip():
            raise RuntimeError(f"empty resource telemetry in {run_dir}")
        checksum = subprocess.run(
            ["sha256sum", "-c", "checksums.sha256"],
            cwd=run_dir,
            text=True,
            capture_output=True,
        )
        if checksum.returncode != 0:
            raise RuntimeError(f"checksum failure in {run_dir}: {checksum.stdout}{checksum.stderr}")
        if cell["architecture"] == "monolith":
            trace_rows = sum(
                1
                for line in (run_dir / "all-candidate-trace.jsonl").read_text(
                    encoding="utf-8", errors="replace"
                ).splitlines()
                if line.strip()
            )
            if trace_rows != int(result["candidate_count"]):
                raise RuntimeError(
                    f"monolith trace mismatch in {run_dir}: "
                    f"{trace_rows} != {result['candidate_count']}"
                )
        else:
            compose = (run_dir / "resolved-compose.yaml").read_text(
                encoding="utf-8", errors="replace"
            )
            workers = int(cell["pipeline_workers"])
            listener_values = {
                int(value)
                for value in re.findall(
                    r"KAFKA_LISTENER_CONCURRENCY:\s*[\"']?(\d+)", compose
                )
            }
            partition_values = {
                int(value)
                for value in re.findall(r"KAFKA_NUM_PARTITIONS:\s*[\"']?(\d+)", compose)
            }
            if listener_values != {workers} or partition_values != {workers}:
                raise RuntimeError(
                    f"resolved compose worker mismatch in {run_dir}: "
                    f"listeners={listener_values}, partitions={partition_values}, "
                    f"expected={workers}"
                )
        audited.append(
            {
                "arm": cell["arm"],
                "run_id": cell["run_id"],
                "candidate_count": int(result["candidate_count"]),
                "test_f1_macro": float(result["test_f1_macro"]),
                "checksums_sha256": sha256(run_dir / "checksums.sha256"),
            }
        )
    manifest_path = PILOT / "frozen-manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("launch_commit") != "75b2db2e3726905830cc3685b512708ec4f3660e":
        raise RuntimeError("pilot launch commit mismatch")
    return {
        "audit_completed_utc": utc_now(),
        "pilot_state_sha256": sha256(state_path),
        "pilot_manifest_sha256": sha256(manifest_path),
        "completed_cells": audited,
        "attempt_count": len(state.get("attempts", [])),
        "gate_sha256": sha256(Path(__file__)),
    }


def main() -> int:
    while process_is_pilot():
        time.sleep(60)
    audit = audit_pilot()
    atomic_json(PILOT / "pilot-audit.json", audit)
    if FORMAL.exists():
        raise RuntimeError(f"formal target already exists: {FORMAL}")
    FORMAL.mkdir(parents=True)
    command = [
        "python3",
        str(REPO / "experiments/architecture-causal-campaign/run_pipeline_ablation.py"),
        "--protocol",
        str(REPO / "experiments/architecture-causal-campaign/protocol-pipeline-ablation-v11.json"),
        "--campaign-tag",
        TAG,
        "--image-tag",
        IMAGE_TAG,
        "--state",
        str(FORMAL / "state.json"),
        "--results",
        str(FORMAL / "results"),
    ]
    with (FORMAL / "supervisor.log").open("w", encoding="utf-8") as log:
        process = subprocess.Popen(
            command, cwd=REPO, stdout=log, stderr=subprocess.STDOUT, start_new_session=True
        )
    launch = {
        "launched_utc": utc_now(),
        "pid": process.pid,
        "command": command,
        "pilot_audit_sha256": sha256(PILOT / "pilot-audit.json"),
        "campaign_tag": TAG,
        "image_tag": IMAGE_TAG,
    }
    atomic_json(FORMAL / "launch.json", launch)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
