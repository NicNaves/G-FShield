#!/usr/bin/env python3
"""Run the 100-cell pipeline-ablation campaign with an immutable ten-day cap."""

from __future__ import annotations

import argparse
import importlib.util
import json
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


EXPECTED_ARMS = {
    "monolith": ("monolith", 0),
    "distributed-w1": ("distributed", 1),
    "distributed-w2": ("distributed", 2),
    "distributed-w4": ("distributed", 4),
}


def arm_map(protocol: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {str(row["id"]): row for row in protocol["arms"]}


def validate_inputs(
    protocol: dict[str, Any], repo_root: Path, tag: str, image_tag: str
) -> dict[str, Any]:
    seeds = [int(seed) for seed in protocol["seeds"]]
    if len(seeds) != 25 or len(seeds) != len(set(seeds)):
        raise RuntimeError("pipeline ablation requires exactly 25 unique seeds")
    arms = arm_map(protocol)
    observed = {
        key: (str(value["architecture"]), int(value["pipeline_workers"]))
        for key, value in arms.items()
    }
    if observed != EXPECTED_ARMS:
        raise RuntimeError(f"unexpected ablation arms: {observed}")
    orders = protocol["order_design"]["orders"]
    if len(orders) != 4 or any(set(order) != set(EXPECTED_ARMS) for order in orders):
        raise RuntimeError("order design must contain four complete arm permutations")
    for position in range(4):
        if {order[position] for order in orders} != set(EXPECTED_ARMS):
            raise RuntimeError("each arm must occur once in every Williams-design position")
    if int(protocol["maximum_seconds"]) > 10 * 24 * 60 * 60:
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
        "expected_cells": len(seeds) * len(arms),
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
    return [
        "python3", str(repo_root / "experiments/10-day-campaign/run_arm.py"),
        *common,
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
    if args.pilot_seed is not None:
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
        ):
            raise RuntimeError("existing frozen manifest does not match this launch")
    else:
        base.atomic_json(frozen_path, frozen)

    if args.state.exists():
        state = json.loads(args.state.read_text(encoding="utf-8"))
    else:
        start = base.utc_now()
        state = {
            "campaign_id": protocol["campaign_id"],
            "state": "RUNNING",
            "started_utc": base.iso(start),
            "deadline_utc": base.iso(
                start + timedelta(seconds=protocol["maximum_seconds"])
            ),
            "completed": [],
            "attempts": [],
        }
        base.atomic_json(args.state, state)

    completed = {(row["seed"], row["arm"]) for row in state["completed"]}
    deadline = datetime.fromisoformat(state["deadline_utc"])
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
            run_id = f"ablation-{arm_id}-s{seed}-{uuid.uuid4().hex[:12]}"
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


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--protocol", type=Path, required=True)
    parser.add_argument("--campaign-tag", required=True)
    parser.add_argument("--image-tag", required=True)
    parser.add_argument("--state", type=Path, required=True)
    parser.add_argument("--results", type=Path, required=True)
    parser.add_argument("--pilot-seed", type=int)
    parser.add_argument("--pilot-run-timeout-seconds", type=int, default=900)
    parser.add_argument(
        "--pilot-finalization-reserve-seconds", type=int, default=300
    )
    args = parser.parse_args()
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
    return execute(args)


if __name__ == "__main__":
    raise SystemExit(main())
