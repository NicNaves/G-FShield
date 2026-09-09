#!/usr/bin/env python3
"""Gate the formal IWSHAP campaign on a completed optimization ablation."""

from __future__ import annotations

import argparse
import json
import math
import re
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


PATTERNS = {
    "construction": re.compile(r"rcl generation ready.*?campaignElapsedMs=(\d+)"),
    "local_search": re.compile(r"dls iteration search=IWSSR.*?campaignElapsedMs=(\d+)"),
}


def atomic_json(path: Path, value: object) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(
        json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    temporary.replace(path)


def phase_counts(path: Path, cutoff_ms: int) -> dict[str, int]:
    counts = {name: 0 for name in PATTERNS}
    with path.open(encoding="utf-8", errors="replace") as handle:
        for line in handle:
            for name, pattern in PATTERNS.items():
                match = pattern.search(line)
                if match and int(match.group(1)) <= cutoff_ms:
                    counts[name] += 1
    return counts


def result_and_counts(root: Path, scenario: str) -> tuple[dict[str, Any], dict[str, int]]:
    run = root / scenario / "distributed"
    result = json.loads((run / "final-result.json").read_text(encoding="utf-8"))
    if result.get("status") not in {"completed", "timeout"}:
        raise RuntimeError(f"invalid {scenario} result status: {result.get('status')}")
    f1 = result.get("test_f1_macro")
    if not isinstance(f1, (int, float)) or not math.isfinite(f1):
        raise RuntimeError(f"invalid {scenario} test macro-F1")
    cutoff = int(result["selection_elapsed_ms"])
    return result, phase_counts(run / "compose.log", cutoff)


def wait_for_ablation(state_path: Path, timeout_seconds: int, poll_seconds: int) -> dict[str, Any]:
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        if state_path.exists():
            state = json.loads(state_path.read_text(encoding="utf-8"))
            if state.get("state") != "RUNNING":
                return state
        time.sleep(poll_seconds)
    raise TimeoutError("ablation gate timed out")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ablation-root", required=True, type=Path)
    parser.add_argument("--reference-root", required=True, type=Path)
    parser.add_argument("--data-root", required=True, type=Path)
    parser.add_argument("--formal-output-root", required=True, type=Path)
    parser.add_argument("--image-tag", required=True)
    parser.add_argument("--evaluator-image", required=True)
    parser.add_argument("--wait-timeout-seconds", type=int, default=4200)
    parser.add_argument("--poll-seconds", type=int, default=30)
    args = parser.parse_args()

    state = wait_for_ablation(
        args.ablation_root / "state.json",
        args.wait_timeout_seconds,
        args.poll_seconds,
    )
    if state.get("state") != "PILOT_COMPLETED":
        raise RuntimeError(f"ablation did not complete: {state.get('state')}")

    report: dict[str, Any] = {
        "generated_utc": datetime.now(timezone.utc).isoformat(),
        "gate": "PASS",
        "criterion": "both distributed pipeline stages complete more evaluations after the bulk-filter change",
        "scenarios": {},
    }
    for scenario in ("suspension", "fabrication"):
        current_result, current = result_and_counts(args.ablation_root, scenario)
        reference_result, reference = result_and_counts(args.reference_root, scenario)
        stage_pass = {
            stage: current[stage] > reference[stage] for stage in PATTERNS
        }
        report["scenarios"][scenario] = {
            "current": current,
            "reference": reference,
            "count_speedup": {
                stage: current[stage] / reference[stage] if reference[stage] else None
                for stage in PATTERNS
            },
            "stage_pass": stage_pass,
            "current_test_f1_macro": current_result["test_f1_macro"],
            "reference_test_f1_macro": reference_result["test_f1_macro"],
        }
        if not all(stage_pass.values()):
            report["gate"] = "FAIL"

    gate_path = args.ablation_root / "formal-campaign-gate.json"
    atomic_json(gate_path, report)
    if report["gate"] != "PASS":
        return 4

    campaign = Path(__file__).with_name("run_paired_campaign.py")
    command = [
        sys.executable, str(campaign),
        "--data-root", str(args.data_root.resolve()),
        "--output-root", str(args.formal_output_root.resolve()),
        "--image-tag", args.image_tag,
        "--evaluator-image", args.evaluator_image,
    ]
    return subprocess.run(command, check=False).returncode


if __name__ == "__main__":
    raise SystemExit(main())
