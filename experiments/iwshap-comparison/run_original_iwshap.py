#!/usr/bin/env python3
"""Run the pinned IWSHAP artifact unchanged under bounded Docker resources."""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any


PINNED_COMMIT = "fb0d3093c12421d08ab3fb595d20c29ba2442e65"
TEN_DAYS_SECONDS = 10 * 24 * 60 * 60
ATTACK_FILES = {
    "suspension": "attack_dataset_susp.csv",
    "fabrication": "attack_dataset_fabr.csv",
}


def checked(*command: str) -> str:
    return subprocess.run(command, check=True, text=True, capture_output=True).stdout.strip()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_json(path: Path, value: object) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    temporary.replace(path)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-root", required=True, type=Path)
    parser.add_argument("--output-root", required=True, type=Path)
    parser.add_argument("--image", default=f"sf24-iwshap:{PINNED_COMMIT[:12]}")
    parser.add_argument("--cpuset", default="8-15")
    parser.add_argument("--cpus", type=float, default=6.0)
    parser.add_argument("--memory", default="12g")
    parser.add_argument("--cell-timeout-seconds", type=int, default=86400)
    parser.add_argument("--global-timeout-seconds", type=int, default=TEN_DAYS_SECONDS)
    args = parser.parse_args()
    if not 0 < args.global_timeout_seconds <= TEN_DAYS_SECONDS:
        parser.error("global timeout must be positive and no greater than ten days")

    source = args.source_root.resolve()
    commit = checked("git", "-C", str(source), "rev-parse", "HEAD")
    if commit != PINNED_COMMIT:
        raise RuntimeError(f"expected source commit {PINNED_COMMIT}, got {commit}")
    image_id = checked("docker", "image", "inspect", args.image, "--format", "{{.Id}}")
    versions = checked(
        "docker", "run", "--rm", args.image, "python3", "-c",
        "import numpy,pandas,shap,sklearn,xgboost;"
        "print('numpy='+numpy.__version__);print('pandas='+pandas.__version__);"
        "print('shap='+shap.__version__);print('scikit-learn='+sklearn.__version__);"
        "print('xgboost='+xgboost.__version__)",
    ).splitlines()
    output = args.output_root.resolve()
    output.mkdir(parents=True, exist_ok=True)
    started = datetime.now(timezone.utc)
    deadline = started + timedelta(seconds=args.global_timeout_seconds)
    state: dict[str, Any] = {
        "schema_version": 1,
        "state": "RUNNING",
        "started_utc": started.isoformat(),
        "deadline_utc": deadline.isoformat(),
        "source_commit": commit,
        "image": args.image,
        "image_id": image_id,
        "package_versions": versions,
        "protocol": (
            "original repository code: categorical encoding before split; 80/20 "
            "random_state=42; XGBClassifier repository defaults; same 20% reused "
            "for iterative selection and reported performance"
        ),
        "resources": {"cpuset": args.cpuset, "cpus": args.cpus, "memory": args.memory},
        "inputs": {},
        "completed": [],
    }
    safe = source / "dataset" / "safe_dataset.csv"
    state["inputs"]["safe"] = {"path": str(safe), "sha256": sha256_file(safe)}
    write_json(output / "state.json", state)

    for scenario, attack_name in ATTACK_FILES.items():
        if datetime.now(timezone.utc) >= deadline:
            state["state"] = "GLOBAL_TIMEOUT"
            write_json(output / "state.json", state)
            return 3
        destination = output / scenario
        logs = destination / "logs"
        graphics = destination / "graphics"
        logs.mkdir(parents=True, exist_ok=True)
        graphics.mkdir(parents=True, exist_ok=True)
        attack = source / "dataset" / attack_name
        state["inputs"][scenario] = {"path": str(attack), "sha256": sha256_file(attack)}
        name = f"iwshap-reproduction-{scenario}"
        command = [
            "docker", "run", "--rm", "--name", name,
            "--cpuset-cpus", args.cpuset, "--cpus", str(args.cpus),
            "--memory", args.memory, "--network", "none",
            "-v", f"{source}:/source:ro", "-v", f"{logs}:/outputs/logs",
            "-v", f"{graphics}:/outputs/graphics", "-w", "/source",
            args.image, "python3", "IWSHAP.py",
            "--safe-path", f"dataset/{safe.name}",
            "--attack-path", f"dataset/{attack.name}",
            "--log-path", "/outputs/logs", "--graphic-path", "/outputs/graphics",
        ]
        before = time.monotonic()
        remaining = max(1, int((deadline - datetime.now(timezone.utc)).total_seconds()))
        timeout = min(args.cell_timeout_seconds, remaining)
        with (destination / "console.log").open("w", encoding="utf-8") as console:
            try:
                completed = subprocess.run(
                    command, stdout=console, stderr=subprocess.STDOUT,
                    text=True, timeout=timeout, check=False,
                )
                return_code = completed.returncode
                status = "completed" if return_code == 0 else "failed"
            except subprocess.TimeoutExpired:
                subprocess.run(
                    ["docker", "rm", "-f", name], check=False,
                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                )
                return_code = 124
                status = "timeout"
        record = {
            "scenario": scenario, "status": status, "return_code": return_code,
            "elapsed_seconds": time.monotonic() - before, "command": command,
            "log_files": [str(path) for path in sorted(logs.glob("Log_*.txt"))],
        }
        state["completed"].append(record)
        write_json(output / "state.json", state)
        if status != "completed":
            state["state"] = "INCOMPLETE"
            write_json(output / "state.json", state)
            return 4
    state["state"] = "REPRODUCTION_COMPLETED"
    state["finished_utc"] = datetime.now(timezone.utc).isoformat()
    write_json(output / "state.json", state)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
