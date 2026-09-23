#!/usr/bin/env python3
"""Run the v12 optimization factorial, isolated from the frozen v11 campaign."""

from __future__ import annotations

import argparse
import copy
import importlib.util
import json
import math
import re
import os
import platform
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any


_BASE_SPEC = importlib.util.spec_from_file_location(
    "causal_campaign_base", Path(__file__).with_name("run_campaign.py")
)
if _BASE_SPEC is None or _BASE_SPEC.loader is None:
    raise RuntimeError("could not load causal campaign runner")
base = importlib.util.module_from_spec(_BASE_SPEC)
_BASE_SPEC.loader.exec_module(base)


EXPECTED_ARMS = {"monolith": ("monolith", 0)}
for workers in (1, 3):
    for neighbors in (1, 3):
        for memo in (False, True):
            EXPECTED_ARMS[f"distributed-w{workers}-n{neighbors}-m{int(memo)}"] = ("distributed", workers)

V13_ID = "gfshield-performance-2026-v13"
V13_ARMS = {"monolith": ("monolith", 0)}
for early in (False, True):
    for budget in (0, 3):
        V13_ARMS[f"distributed-e{int(early)}-b{budget}"] = ("distributed", 3)


def expected_arms(protocol: dict[str, Any]) -> dict[str, tuple[str, int]]:
    return V13_ARMS if protocol["campaign_id"] == V13_ID else EXPECTED_ARMS



def arm_map(protocol: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {str(row["id"]): row for row in protocol["arms"]}


def validate_inputs(
    protocol: dict[str, Any], repo_root: Path, tag: str, image_tag: str
) -> dict[str, Any]:
    seeds = [int(seed) for seed in protocol["seeds"]]
    v13 = protocol["campaign_id"] == V13_ID
    expected = expected_arms(protocol)
    seed_count, first_seed = (20, 150) if v13 else (11, 128)
    if len(seeds) != seed_count or len(seeds) != len(set(seeds)) or min(seeds) < first_seed:
        raise RuntimeError("invalid independent formal seeds")
    arms = arm_map(protocol)
    observed = {
        key: (str(value["architecture"]), int(value["pipeline_workers"]))
        for key, value in arms.items()
    }
    if observed != expected:
        raise RuntimeError(f"unexpected ablation arms: {observed}")
    orders = protocol["order_design"]["orders"]
    if len(orders) != len(expected) or any(len(order) != len(expected) or set(order) != set(expected) for order in orders):
        raise RuntimeError("order design must contain complete arm permutations")
    for position in range(len(expected)):
        if {order[position] for order in orders} != set(expected):
            raise RuntimeError("each arm must occur once in every Latin-square position")
    if len(protocol["arms"]) != len(expected):
        raise RuntimeError("duplicate or missing arm")
    for arm_id, definition in arms.items():
        if arm_id == "monolith":
            continue
        workers, neighbors, memo = (
            int(definition["pipeline_workers"]),
            int(definition["neighborhood_parallelism"]),
            definition["memoization"],
        )
        if v13:
            early, budget = definition["early_progress"], definition["training_limit"]
            if (type(early) is not bool or type(budget) is not int or budget not in (0, 3)
                    or workers != 3 or neighbors != 3 or memo is not False
                    or arm_id != f"distributed-e{int(early)}-b{budget}"):
                raise RuntimeError("v13 factors do not match identity")
            continue
        if not isinstance(memo, bool) or arm_id != f"distributed-w{workers}-n{neighbors}-m{int(memo)}":
            raise RuntimeError("arm factors do not match identity")
    if not 0 < int(protocol["maximum_seconds"]) <= 10 * 24 * 60 * 60:
        raise RuntimeError("campaign maximum exceeds ten days")
    selection_seconds = (
        int(protocol["run_timeout_seconds"])
        - int(protocol["finalization_reserve_seconds"])
    )
    if selection_seconds != int(protocol["measurement_window"]["selection_seconds"]):
        raise RuntimeError("selection horizon is inconsistent")

    resources = protocol["resources"]
    limits = resources["distributed_component_ceiling_sum"]
    cpu_sum = sum(float(component["cpu"]) for component in limits.values())
    memory_sum = sum(float(component["memory_gib"]) for component in limits.values())
    expected_memory = float(str(resources["aggregate_memory"]).lower().removesuffix("g"))
    if abs(cpu_sum - float(resources["aggregate_cpu_ceiling"])) > 1e-9:
        raise RuntimeError("distributed CPU limits do not equal aggregate ceiling")
    if abs(memory_sum - expected_memory) > 1e-9:
        raise RuntimeError("distributed memory limits do not equal aggregate ceiling")

    head = base.checked("git", "rev-parse", "HEAD", cwd=repo_root)
    tag_commit = base.checked("git", "rev-list", "-n", "1", tag, cwd=repo_root)
    if head != tag_commit:
        raise RuntimeError("campaign tag does not resolve to HEAD")
    if base.checked("git", "status", "--porcelain", cwd=repo_root):
        raise RuntimeError("refusing to launch from a dirty worktree")

    paths = base.dataset_paths(repo_root)
    expected_hashes = {
        "train": protocol["dataset"]["train_sha256"],
        "validation": protocol["dataset"]["validation_sha256"],
        "test": protocol["dataset"]["test_sha256"],
    }
    actual_hashes = {name: base.sha256_file(path) for name, path in paths.items()}
    if actual_hashes != expected_hashes:
        raise RuntimeError(
            f"dataset hash mismatch: expected={expected_hashes} actual={actual_hashes}"
        )
    references = {
        "rcl_relief": f"gfshield-campaign-rcl-relieff:{image_tag}",
        "dls_iwssr": f"gfshield-campaign-dls-iwssr:{image_tag}",
        "dls_vnd": f"gfshield-campaign-dls-vnd:{image_tag}",
        "dls_verify": f"gfshield-campaign-dls-verify:{image_tag}",
        "evaluator": f"gfshield-campaign-evaluator:{image_tag}",
        "monolith": f"gfshield-campaign-monolith2:{image_tag}",
    }
    images = {
        name: {"reference": reference, "image_id": base.image_id(reference)}
        for name, reference in references.items()
    }
    return {
        "launch_commit": head,
        "campaign_tag": tag,
        "dataset_hashes": actual_hashes,
        "images": images,
        "expected_cells": len(arms) if protocol.get("pilot_seed") is not None else len(seeds) * len(arms),
        "host": {
            "node": platform.node(),
            "platform": platform.platform(),
            "python": platform.python_version(),
            "docker": base.checked(
                "docker", "version", "--format", "{{.Server.Version}}"
            ),
            "logical_cpus": os.cpu_count(),
            "load_average": os.getloadavg() if hasattr(os, "getloadavg") else None,
            "lscpu_json": base.best_effort("lscpu", "--json"),
            "memory_info": base.best_effort("cat", "/proc/meminfo"),
            "docker_info_json": base.best_effort(
                "docker", "info", "--format", "{{json .}}"
            ),
            "concurrent_containers_jsonl": base.best_effort(
                "docker", "ps", "--no-trunc", "--format", "{{json .}}"
            ),
        },
    }


def common_prefix(
    protocol: dict[str, Any], repo_root: Path, output: Path, arm_id: str,
    seed: int, run_id: str, image_tag: str,
) -> list[str]:
    resources = protocol["resources"]
    algorithm = protocol["algorithm"]
    return [
        "--campaign-id", protocol["campaign_id"],
        "--arm-id", f"matched-rf-vnd-iwssr-{arm_id}",
        "--run-id", run_id,
        "--seed", str(seed),
        "--dataset-dir", str(repo_root / "datasets"),
        "--output-dir", str(output),
        "--run-timeout-seconds", str(protocol["run_timeout_seconds"]),
        "--finalization-reserve-seconds", str(protocol["finalization_reserve_seconds"]),
        "--max-accepted-improvements", str(algorithm["maximum_accepted_improvements"]),
        "--minimum-improvement", str(algorithm["minimum_improvement"]),
        "--image-tag", image_tag,
        "--cpuset", resources["cpuset"],
        "--numa-node", resources["numa_node"],
        "--aggregate-cpus", str(resources["aggregate_cpu_ceiling"]),
        "--aggregate-memory", resources["aggregate_memory"],
    ]


def command_for(
    protocol: dict[str, Any], repo_root: Path, output: Path, arm_id: str,
    seed: int, run_id: str, image_tag: str,
) -> list[str]:
    definition = arm_map(protocol)[arm_id]
    architecture = str(definition["architecture"])
    common = common_prefix(
        protocol, repo_root, output, arm_id, seed, run_id, image_tag
    )
    dataset = protocol["dataset"]
    algorithm = protocol["algorithm"]
    if architecture == "monolith":
        return [
            "python3", str(repo_root / "experiments/10-day-campaign/run_monolith.py"),
            "--monolith", "monolith2", "--matched-architecture", *common,
            "--dataset-hash", dataset["source_sha256"],
        ]
    optimization_flags = [
        "--iwssr-neighborhood-parallelism", str(definition["neighborhood_parallelism"]),
        "--iwssr-evaluation-memoization-max-entries", "50000",
    ]
    if definition["memoization"]:
        optimization_flags.append("--iwssr-evaluation-memoization")
    if protocol["campaign_id"] == V13_ID:
        optimization_flags += ["--iwssr-training-max-concurrent", str(definition["training_limit"])]
        if definition["early_progress"]:
            optimization_flags.append("--iwssr-early-progress")
    return [
        "python3", str(repo_root / "experiments/10-day-campaign/run_arm.py"),
        *common, *optimization_flags,
        "--construction", "relieff",
        "--controller", "vnd",
        "--local-search", "iwssr",
        "--enabled-local-searches", "iwssr",
        "--pipeline-workers", str(definition["pipeline_workers"]),
        "--use-training-cache",
        "--startup-timeout-seconds", str(protocol["startup_timeout_seconds"]),
        "--max-generations", "2147483647",
        "--rcl-cutoff", str(algorithm["rcl_cutoff"]),
        "--sample-size", str(algorithm["initial_subset_size"]),
        "--relieff-sample-size", str(algorithm["relieff_sample_size"]),
        "--neighborhood-iterations", str(algorithm["neighborhood_cycles"]),
        "--local-search-iterations", str(algorithm["local_search_iterations"]),
        "--evaluator-image", f"gfshield-campaign-evaluator:{image_tag}",
        "--feature-count", "51",
        "--dataset-hash", dataset["source_sha256"],
        "--train-hash", dataset["train_sha256"],
        "--validation-hash", dataset["validation_sha256"],
        "--test-hash", dataset["test_sha256"],
    ]


def valid_result(
    path: Path, protocol: dict[str, Any], arm_id: str, seed: int, run_id: str
) -> bool:
    try:
        result = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return False
    expected = {
        "campaign_id": protocol["campaign_id"],
        "arm_id": f"matched-rf-vnd-iwssr-{arm_id}",
        "run_id": run_id,
        "seed": seed,
        "classifier": "Weka J48",
        "classifier_version": "weka-stable 3.8.6",
        "feature_selector": "relieff",
        "neighborhood_controller": "vnd",
        "local_search": "iwssr",
        "dataset_hash": protocol["dataset"]["source_sha256"],
        "train_hash": protocol["dataset"]["train_sha256"],
        "validation_hash": protocol["dataset"]["validation_sha256"],
        "test_hash": protocol["dataset"]["test_sha256"],
    }
    if any(result.get(key) != value for key, value in expected.items()):
        return False
    if arm_id != "monolith":
        counters = [result.get(name) for name in (
            "local_search_trained_evaluation_count", "local_search_memoized_evaluation_count",
            "local_search_unclassified_evaluation_count", "local_search_evaluation_count",
        )]
        if any(type(value) is not int or value < 0 for value in counters):
            return False
        trained, memoized, unknown, total = counters
        if unknown != 0 or trained + memoized != total or trained <= 0:
            return False
        if not arm_map(protocol)[arm_id]["memoization"] and memoized != 0:
            return False
        definition = arm_map(protocol)[arm_id]
        if result.get("iwssr_neighborhood_parallelism") != definition["neighborhood_parallelism"]:
            return False
        if result.get("iwssr_evaluation_memoization") is not definition["memoization"]:
            return False
        try:
            compose = path.with_name("resolved-compose.yaml").read_text(encoding="utf-8")
        except OSError:
            return False
        for name, expected_value in (
            ("IWSSR_EVALUATION_MEMOIZATION_ENABLED", str(definition["memoization"]).lower()),
            ("IWSSR_NEIGHBORHOOD_PARALLELISM", str(definition["neighborhood_parallelism"])),
            ("KAFKA_LISTENER_CONCURRENCY", str(definition["pipeline_workers"])),
            ("KAFKA_NUM_PARTITIONS", str(definition["pipeline_workers"])),
        ):
            values = set(re.findall(name + r':\s*[\x22\x27]?([a-z0-9]+)', compose))
            if values != {expected_value}:
                return False
        if protocol["campaign_id"] == V13_ID:
            if (result.get("iwssr_early_progress") is not definition["early_progress"]
                    or result.get("iwssr_training_max_concurrent") != definition["training_limit"]):
                return False
            for name, value in (
                ("IWSSR_PROGRESS_EARLY_ENABLED", str(definition["early_progress"]).lower()),
                ("IWSSR_TRAINING_MAX_CONCURRENT", str(definition["training_limit"])),
            ):
                if set(re.findall(name + r':\s*[\x22\x27]?([a-z0-9]+)', compose)) != {value}:
                    return False
            try:
                logs = path.with_name("compose.log").read_text(encoding="utf-8")
            except OSError:
                return False
            admissions = re.findall(r"dls training admission limit=(\d+) active=(\d+) peakActive=(\d+)", logs)
            if not admissions:
                return False
            limit = definition["training_limit"]
            if any(int(row[0]) != limit or (limit and int(row[2]) > limit) for row in admissions):
                return False
            runtime_options = set(re.findall(
                r"dls runtime options earlyProgress=(true|false) trainingLimit=(\d+)", logs))
            if runtime_options != {(str(definition["early_progress"]).lower(), str(limit))}:
                return False
    resources = path.with_name("resource-samples.jsonl")
    if not resources.exists() or resources.stat().st_size == 0:
        return False
    score = result.get("test_f1_macro")
    if not isinstance(score, (int, float)) or not math.isfinite(score) or not 0 <= score <= 1:
        return False
    return (
        isinstance(result.get("candidate_count"), int)
        and result["candidate_count"] > 0
        and isinstance(result.get("test_f1_macro"), (int, float))
        and result.get("status") in {"completed", "timeout"}
    )


def schedule(
    protocol: dict[str, Any], pilot_seed: int | None = None
) -> list[tuple[int, str]]:
    seeds = [pilot_seed] if pilot_seed is not None else list(protocol["seeds"])
    orders = protocol["order_design"]["orders"]
    rows: list[tuple[int, str]] = []
    for index, seed in enumerate(seeds):
        rows.extend((int(seed), arm_id) for arm_id in orders[index % len(orders)])
    return rows


def execute(args: argparse.Namespace) -> int:
    protocol = json.loads(args.protocol.read_text(encoding="utf-8"))
    protocol["pilot_seed"] = args.pilot_seed
    if args.pilot_seed is not None:
        if args.pilot_seed in protocol["seeds"]:
            raise RuntimeError("pilot seed overlaps formal seeds")
        protocol["run_timeout_seconds"] = args.pilot_run_timeout_seconds
        protocol["finalization_reserve_seconds"] = (
            args.pilot_finalization_reserve_seconds
        )
        protocol["measurement_window"]["selection_seconds"] = (
            args.pilot_run_timeout_seconds
            - args.pilot_finalization_reserve_seconds
        )
        protocol["graceful_shutdown_seconds"] = min(
            protocol["graceful_shutdown_seconds"], args.pilot_run_timeout_seconds
        )
    repo_root = Path(__file__).resolve().parents[2]
    frozen = validate_inputs(
        protocol, repo_root, args.campaign_tag, args.image_tag
    )
    frozen.update(
        {
            "protocol": protocol,
            "source_protocol_sha256": base.sha256_file(args.protocol),
            "effective_protocol_sha256": base.sha256_json(protocol),
            "image_tag": args.image_tag,
            "frozen_utc": base.iso(base.utc_now()),
        }
    )
    frozen_path = args.state.with_name("frozen-manifest.json")
    if frozen_path.exists():
        previous = json.loads(frozen_path.read_text(encoding="utf-8"))
        if (
            previous["effective_protocol_sha256"]
            != frozen["effective_protocol_sha256"]
            or previous["launch_commit"] != frozen["launch_commit"]
            or previous["images"] != frozen["images"]
        ):
            raise RuntimeError("existing frozen manifest does not match this launch")
    else:
        base.atomic_json(frozen_path, frozen)

    if args.state.exists():
        state = json.loads(args.state.read_text(encoding="utf-8"))
    else:
        start = base.utc_now()
        deadline = min(
            start + timedelta(seconds=protocol["maximum_seconds"]),
            getattr(args, "shared_deadline", None) or start + timedelta(seconds=protocol["maximum_seconds"]),
        )
        state = {
            "campaign_id": protocol["campaign_id"],
            "state": "RUNNING",
            "started_utc": base.iso(start),
            "deadline_utc": base.iso(
                deadline
            ),
            "completed": [],
            "attempts": [],
        }
        base.atomic_json(args.state, state)

    completed = {(row["seed"], row["arm"]) for row in state["completed"]}
    deadline = datetime.fromisoformat(state["deadline_utc"])
    if getattr(args, "shared_deadline", None) is not None and deadline > args.shared_deadline:
        raise RuntimeError("existing formal deadline exceeds pilot campaign deadline")
    definitions = arm_map(protocol)
    for seed, arm_id in schedule(protocol, args.pilot_seed):
        if (seed, arm_id) in completed:
            continue
        if base.utc_now() >= deadline:
            state["state"] = "GLOBAL_TIMEOUT"
            base.atomic_json(args.state, state)
            return 3
        architecture = str(definitions[arm_id]["architecture"])
        for attempt_number in range(
            1, int(protocol["maximum_attempts_per_cell"]) + 1
        ):
            # Leave time for the entire cell and both supervisor grace periods.
            remaining = (deadline - base.utc_now()).total_seconds()
            required = int(protocol["run_timeout_seconds"]) + 2 * int(protocol["graceful_shutdown_seconds"])
            if remaining < required:
                state["state"] = "GLOBAL_TIMEOUT"
                base.atomic_json(args.state, state)
                return 3
            run_id = f"optimization-{arm_id}-s{seed}-{uuid.uuid4().hex[:12]}"
            output = (
                args.results / arm_id / f"seed-{seed}" / run_id
            ).resolve()
            command = command_for(
                protocol, repo_root, output, arm_id, seed, run_id, args.image_tag
            )
            attempt = base.run_cell(
                command,
                output,
                int(protocol["run_timeout_seconds"]),
                int(protocol["graceful_shutdown_seconds"]),
            )
            attempt.update(
                {
                    "architecture": architecture,
                    "arm": arm_id,
                    "pipeline_workers": int(
                        definitions[arm_id]["pipeline_workers"]
                    ),
                    "seed": seed,
                    "run_id": run_id,
                    "attempt_number": attempt_number,
                    "result_path": str(output / "final-result.json"),
                }
            )
            attempt["artifact_valid"] = valid_result(
                output / "final-result.json", protocol, arm_id, seed, run_id
            )
            checksums = base.checksum_manifest(output)
            attempt["checksums_path"] = str(checksums)
            attempt["checksums_sha256"] = base.sha256_file(checksums)
            state["attempts"].append(attempt)
            if attempt["artifact_valid"]:
                state["completed"].append(
                    {
                        "architecture": architecture,
                        "arm": arm_id,
                        "pipeline_workers": int(
                            definitions[arm_id]["pipeline_workers"]
                        ),
                        "seed": seed,
                        "run_id": run_id,
                        "result_path": attempt["result_path"],
                        "checksums_sha256": attempt["checksums_sha256"],
                    }
                )
                completed.add((seed, arm_id))
                base.atomic_json(args.state, state)
                break
            base.atomic_json(args.state, state)
        if (seed, arm_id) not in completed:
            state["state"] = "INCOMPLETE"
            base.atomic_json(args.state, state)
            return 4

    state["state"] = (
        "PILOT_COMPLETED"
        if args.pilot_seed is not None
        else "CAMPAIGN_COMPLETED"
    )
    state["finished_utc"] = base.iso(base.utc_now())
    base.atomic_json(args.state, state)
    return 0


def audit_pilot(path: Path, protocol_path: Path, repo_root: Path, image_tag: str) -> None:
    pilot = json.loads(path.read_text(encoding="utf-8"))
    source_protocol = json.loads(protocol_path.read_text(encoding="utf-8"))
    expected = expected_arms(source_protocol)
    cells = pilot.get("completed", [])
    if pilot.get("state") != "PILOT_COMPLETED" or len(cells) != len(expected):
        raise RuntimeError("complete validated pilot required")
    if {cell["arm"] for cell in cells} != set(expected):
        raise RuntimeError("pilot arms are incomplete")
    frozen = json.loads(path.with_name("frozen-manifest.json").read_text(encoding="utf-8"))
    if frozen["launch_commit"] != base.checked("git", "rev-parse", "HEAD", cwd=repo_root):
        raise RuntimeError("pilot code differs from formal launch")
    if frozen["source_protocol_sha256"] != base.sha256_file(protocol_path):
        raise RuntimeError("pilot protocol differs from formal launch")
    if frozen["image_tag"] != image_tag:
        raise RuntimeError("pilot image tag differs from formal launch")
    for image in frozen["images"].values():
        if base.image_id(image["reference"]) != image["image_id"]:
            raise RuntimeError("pilot image was replaced")
    for cell in cells:
        result_path = Path(cell["result_path"])
        if not valid_result(result_path, frozen["protocol"], cell["arm"], cell["seed"], cell["run_id"]):
            raise RuntimeError("invalid pilot result")
        checksum_path = result_path.with_name("checksums.sha256")
        if base.sha256_file(checksum_path) != cell["checksums_sha256"]:
            raise RuntimeError("pilot checksum manifest changed")
        for line in checksum_path.read_text(encoding="utf-8").splitlines():
            expected, relative = line.split("  ", 1)
            artifact = (result_path.parent / relative).resolve()
            if not artifact.is_relative_to(result_path.parent.resolve()):
                raise RuntimeError("checksum path escapes artifact directory")
            if base.sha256_file(artifact) != expected:
                raise RuntimeError(f"pilot artifact changed: {relative}")


def execute_chain(args: argparse.Namespace) -> int:
    """Explicit opt-in: technical pilot gate, then formal, sharing one deadline."""
    code = execute(args)
    if code or not getattr(args, "chain_formal", False):
        return code
    audit_pilot(args.state, args.protocol, Path(__file__).resolve().parents[2], args.image_tag)
    state = json.loads(args.state.read_text(encoding="utf-8"))
    formal = copy.copy(args)
    formal.pilot_seed = None
    formal.pilot_state = args.state
    formal.shared_deadline = datetime.fromisoformat(state["deadline_utc"])
    formal.state = args.state.parent.parent / "formal" / "state.json"
    formal.results = formal.state.parent / "results"
    containers = base.checked("docker", "ps", "--format", "{{.Image}}").splitlines()
    if any(image.startswith("gfshield-campaign-") for image in containers):
        raise RuntimeError("pilot left active experimental containers; formal blocked")
    base.atomic_json(args.state.parent.parent / "schedule.json", {
        "state": "FORMAL_RELEASED", "pilot_state": str(args.state),
        "formal_state": str(formal.state), "deadline_utc": state["deadline_utc"],
        "gate": "technical only; no selection by test F1", "released_utc": base.iso(base.utc_now()),
    })
    return execute(formal)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--protocol", type=Path, required=True)
    parser.add_argument("--campaign-tag", required=True)
    parser.add_argument("--image-tag", required=True)
    parser.add_argument("--state", type=Path, required=True)
    parser.add_argument("--results", type=Path, required=True)
    parser.add_argument("--pilot-seed", type=int)
    parser.add_argument("--previous-state", type=Path, required=True)
    parser.add_argument("--pilot-state", type=Path)
    parser.add_argument("--chain-formal", action="store_true",
                        help="v13 only: run formal after successful technical pilot audit")
    parser.add_argument("--pilot-run-timeout-seconds", type=int, default=900)
    parser.add_argument(
        "--pilot-finalization-reserve-seconds", type=int, default=300
    )
    args = parser.parse_args()
    if args.chain_formal:
        protocol = json.loads(args.protocol.read_text(encoding="utf-8"))
        if (protocol["campaign_id"] != V13_ID or args.pilot_seed != 149
                or args.state.name != "state.json" or args.state.parent.name != "pilot"
                or args.results.resolve() != (args.state.parent / "results").resolve()):
            parser.error("chain-formal requires v13 pilot seed 149 and separate pilot/state.json, pilot/results")
    if args.pilot_seed is not None:
        if args.pilot_run_timeout_seconds <= 0:
            parser.error("--pilot-run-timeout-seconds must be positive")
        if not (
            0
            < args.pilot_finalization_reserve_seconds
            < args.pilot_run_timeout_seconds
        ):
            parser.error(
                "pilot finalization reserve must be positive and shorter than timeout"
            )
    previous = json.loads(args.previous_state.read_text(encoding="utf-8"))
    if previous.get("state") != "CAMPAIGN_COMPLETED":
        raise RuntimeError("previous campaign is not complete; refusing competing workload")
    if args.pilot_seed is None:
        if args.pilot_state is None:
            parser.error("formal execution requires --pilot-state")
        audit_pilot(args.pilot_state, args.protocol, Path(__file__).resolve().parents[2], args.image_tag)
    sys_path = str(Path(__file__).resolve().parents[1] / "10-day-campaign")
    import sys
    sys.path.insert(0, sys_path)
    from orchestrator import CampaignLock
    containers = base.checked("docker", "ps", "--format", "{{.Image}}").splitlines()
    if any(image.startswith("gfshield-campaign-") for image in containers):
        raise RuntimeError("another experimental container is active")
    with CampaignLock(args.previous_state.parent / "performance-v12.lock"):
        return execute_chain(args)


if __name__ == "__main__":
    raise SystemExit(main())
