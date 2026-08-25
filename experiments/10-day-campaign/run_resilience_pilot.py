#!/usr/bin/env python3
"""Validate formal pilot evidence and destructive operational recovery paths."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import signal
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from campaign_supervisor import rotate_log, terminate_group
from orchestrator import atomic_json, recover_orphan


EXPECTED_HASHES = {
    "dataset_hash": "60ebfcdc9c209e5c760e2bdbf5be75dfe4d931b81442597b0ef32e2f5fe6c1f6",
    "train_hash": "5876bf5570b7f71d7bc4eb51ebb1792f6e7357c7010cce78248a121420a870af",
    "validation_hash": "c44a00ca554c63e8134e01e1e5a2b2c1c167e4bcd02cd6e318d3d602a5f1031a",
    "test_hash": "05d393c5881aec032664ef4a84e18337988e819edc74664fe1255757961cfab4",
}
EXPECTED_CLASSIFIER = {
    "classifier": "Weka J48",
    "classifier_version": "weka-stable 3.8.6",
    "classifier_parameters": {
        "confidence_factor": 0.25,
        "minimum_instances_per_leaf": 2,
        "pruned": True,
    },
}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def directory_size(path: Path) -> int:
    return sum(item.stat().st_size for item in path.rglob("*") if item.is_file())


def validate_scientific_evidence(report: dict[str, Any]) -> list[str]:
    issues: list[str] = []
    cases = report.get("cases") or {}
    if report.get("approved") is not True or len(cases) != 7:
        issues.append("formal pilot matrix is not approved and complete")
    for name, case in cases.items():
        if case.get("approved") is not True:
            issues.append(f"{name}: case is not approved")
            continue
        result = case.get("result") or {}
        for field, expected in EXPECTED_HASHES.items():
            if result.get(field) != expected:
                issues.append(f"{name}: unexpected {field}")
        for field, expected in EXPECTED_CLASSIFIER.items():
            if result.get(field) != expected:
                issues.append(f"{name}: unexpected {field}")
        for field in ("campaign_id", "arm_id", "run_id", "request_id", "candidate_id"):
            if not isinstance(result.get(field), str) or not result[field]:
                issues.append(f"{name}: missing end-to-end identifier {field}")
        if result.get("stage") != "end_to_end":
            issues.append(f"{name}: result is not end-to-end")
        for field in (
            "validation_f1_macro", "validation_f1_weighted",
            "test_f1_macro", "test_f1_weighted", "test_precision_macro",
            "test_recall_macro", "accuracy",
        ):
            value = result.get(field)
            if not isinstance(value, (int, float)) or not 0 <= value <= 1:
                issues.append(f"{name}: invalid 0-1 metric {field}")
        if not result.get("test_confusion_matrix") or not result.get("test_per_class_metrics"):
            issues.append(f"{name}: holdout detail is missing")
    return issues


def source_audit(repo_root: Path) -> tuple[list[str], dict[str, str]]:
    issues: list[str] = []
    expected_markers = {
        "experiments/10-day-campaign/run_arm.py": [
            'protocol = f"validation\\t{serialized}\\ntest\\t{serialized}\\nQUIT\\n"',
            "results[1] is the only holdout request",
        ],
        "experiments/10-day-campaign/run_baseline.py": [
            "Exactly one holdout request",
        ],
        "experiments/monoliths/monolith1-graspy2/main.py": [
            "Consume the untouched test split only once",
        ],
        "experiments/monoliths/monolith2-graspy/main.py": [
            "Evaluate the untouched holdout exactly once",
        ],
        (
            "grasp-fs-distributed-ls/Verify/grasp-fs.dls.verify/src/main/java/"
            "com/br/graspfs/dls/verify/consumer/KafkaSolutionsConsumer.java"
        ): [
            'topics = {"SOLUTIONS_TOPIC", "LOCAL_SEARCH_PROGRESS_TOPIC"}',
        ],
    }
    hashes: dict[str, str] = {}
    for relative, markers in expected_markers.items():
        path = repo_root / relative
        content = path.read_text(encoding="utf-8")
        hashes[relative] = hashlib.sha256(path.read_bytes()).hexdigest()
        for marker in markers:
            if marker not in content:
                issues.append(f"source audit marker missing from {relative}: {marker}")
    return issues, hashes


def operational_checks(repo_root: Path) -> tuple[list[str], dict[str, Any]]:
    issues: list[str] = []
    evidence: dict[str, Any] = {}
    if os.name != "posix":
        return ["signal and orphan pilot must run on the Linux campaign host"], evidence
    with tempfile.TemporaryDirectory() as temporary:
        root = Path(temporary)
        checkpoint = root / "graceful-checkpoint.json"
        graceful_code = (
            "import json,signal,sys,time; p=sys.argv[1]; "
            "signal.signal(signal.SIGTERM, lambda *_: (open(p,'w').write(json.dumps({'checkpoint':True})),sys.exit(0))); "
            "time.sleep(60)"
        )
        graceful = subprocess.Popen(
            [sys.executable, "-c", graceful_code, str(checkpoint)], start_new_session=True
        )
        time.sleep(0.2)
        graceful_action = terminate_group(graceful, 2)
        if graceful_action != "sigterm" or not checkpoint.exists():
            issues.append("graceful SIGTERM did not persist its checkpoint")
        evidence["graceful_termination"] = {
            "action": graceful_action,
            "checkpoint_persisted": checkpoint.exists(),
        }

        forced = subprocess.Popen(
            [sys.executable, "-c", "import signal,time; signal.signal(signal.SIGTERM, signal.SIG_IGN); time.sleep(60)"],
            start_new_session=True,
        )
        time.sleep(0.2)
        forced_action = terminate_group(forced, 1)
        if forced_action != "sigkill":
            issues.append("forced SIGKILL fallback was not exercised")
        evidence["forced_termination"] = {"action": forced_action}

        run_id = "resilience-orphan-run"
        orphan = subprocess.Popen(
            [sys.executable, "-c", "import time; time.sleep(60)", run_id],
            start_new_session=True,
        )
        state_path = root / "campaign-state.json"
        state = {"active_run": {"pid": orphan.pid, "run_id": run_id}}
        atomic_json(state_path, state)
        time.sleep(0.2)
        recover_orphan(state, state_path, 1)
        recovered = json.loads(state_path.read_text(encoding="utf-8"))
        orphan.wait(timeout=5)
        recovery_action = recovered["recovery_events"][-1]["action"]
        if "active_run" in recovered or recovery_action not in {"sigterm_orphan", "sigkill_orphan"}:
            issues.append("orphan recovery did not clear the persisted active run")
        evidence["orphan_recovery"] = {"action": recovery_action}

        resumable = {
            "campaign_id": "resilience",
            "campaign_deadline_utc": "2099-01-01T00:00:00+00:00",
            "next_arm_index": 3,
            "completed_runs": [{"arm_id": "a", "seed": 42, "artifact_valid": True}],
        }
        resume_path = root / "resume-state.json"
        atomic_json(resume_path, resumable)
        restored = json.loads(resume_path.read_text(encoding="utf-8"))
        if restored != resumable:
            issues.append("atomic checkpoint did not round-trip for resume")
        evidence["checkpoint_resume"] = {
            "atomic_round_trip": restored == resumable,
            "completed_run_preserved": restored["completed_runs"] == resumable["completed_runs"],
            "deadline_preserved": restored["campaign_deadline_utc"] == resumable["campaign_deadline_utc"],
        }

        log = root / "rotation.log"
        original = os.urandom(4096)
        log.write_bytes(original)
        archive = rotate_log(log, 1024)
        sidecar = archive.with_suffix(archive.suffix + ".sha256") if archive else None
        if archive is None or not archive.exists() or sidecar is None or not sidecar.exists():
            issues.append("log rotation did not preserve a compressed checksummed archive")
        evidence["log_rotation"] = {
            "archive_created": bool(archive and archive.exists()),
            "checksum_created": bool(sidecar and sidecar.exists()),
            "source_bytes": len(original),
        }
        restart_test = subprocess.run(
            [
                sys.executable,
                str(
                    repo_root
                    / "experiments/10-day-campaign/tests/test_campaign_supervisor.py"
                ),
                "CampaignSupervisorTest",
            ],
            cwd=repo_root,
            capture_output=True,
            text=True,
        )
        if restart_test.returncode != 0:
            issues.append("the external supervisor did not restart an exited orchestrator")
        evidence["orchestrator_restart"] = {
            "passed": restart_test.returncode == 0,
            "return_code": restart_test.returncode,
            "test": "CampaignSupervisorTest",
        }
    return issues, evidence


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Formal pilot validation report",
        "",
        f"- Generated (UTC): `{report['generated_utc']}`",
        f"- Overall approval: **{'approved' if report['approved'] else 'rejected'}**",
        f"- Formal pilot SHA-256: `{report['formal_pilot_sha256']}`",
        f"- Observed pilot bytes: `{report['storage']['observed_bytes']}`",
        f"- Projected 240-hour bytes: `{report['storage']['projected_240h_bytes']}`",
        f"- Free bytes after pilots: `{report['storage']['free_bytes']}`",
        "",
        "## Checks",
        "",
        "| Check | Result |",
        "|---|---|",
    ]
    for name, value in report["checks"].items():
        lines.append(f"| {name} | {'passed' if value else 'failed'} |")
    lines.extend(["", "## Issues", ""])
    lines.extend(f"- {issue}" for issue in report["issues"] or ["None."])
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pilot-report", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    repo_root = Path(__file__).resolve().parents[2]
    pilot = json.loads(args.pilot_report.read_text(encoding="utf-8"))
    scientific_issues = validate_scientific_evidence(pilot)
    source_issues, source_hashes = source_audit(repo_root)
    operational_issues, operations = operational_checks(repo_root)
    elapsed = sum(
        max(1, int(((case.get("result") or {}).get("run_elapsed_ms") or 0) / 1000))
        for case in (pilot.get("cases") or {}).values()
    )
    observed_bytes = directory_size(args.pilot_report.parent)
    projected = int(observed_bytes * (240 * 60 * 60) / max(1, elapsed))
    free_bytes = shutil.disk_usage(args.output_dir).free
    storage_issues: list[str] = []
    if free_bytes < projected + 10 * 1024**3:
        storage_issues.append("free storage is below the projected campaign need plus 10 GiB")
    issues = scientific_issues + source_issues + operational_issues + storage_issues
    report = {
        "generated_utc": utc_now(),
        "approved": not issues,
        "formal_pilot_path": str(args.pilot_report.resolve()),
        "formal_pilot_sha256": hashlib.sha256(args.pilot_report.read_bytes()).hexdigest(),
        "checks": {
            "scientific_result_contract": not scientific_issues,
            "holdout_source_audit": not source_issues,
            "sigterm_sigkill_checkpoint_resume_orphan_rotation_restart": not operational_issues,
            "storage_projection": not storage_issues,
        },
        "issues": issues,
        "source_hashes": source_hashes,
        "operations": operations,
        "storage": {
            "observed_bytes": observed_bytes,
            "observed_elapsed_seconds": elapsed,
            "projected_240h_bytes": projected,
            "free_bytes": free_bytes,
            "required_headroom_bytes": 10 * 1024**3,
            "projection_is_linear_and_conservative": True,
        },
    }
    atomic_json(args.output_dir / "resilience-report.json", report)
    (args.output_dir / "pilot-validation-report.md").write_text(
        render_markdown(report), encoding="utf-8", newline="\n"
    )
    return 0 if report["approved"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
