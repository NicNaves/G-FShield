#!/usr/bin/env python3
"""Freeze a runnable campaign manifest after every formal pilot has passed."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from run_arm import atomic_json


LOCAL_IMAGES = (
    "gfshield-campaign-rcl-ig",
    "gfshield-campaign-rcl-gr",
    "gfshield-campaign-rcl-su",
    "gfshield-campaign-rcl-relieff",
    "gfshield-campaign-dls-bitflip",
    "gfshield-campaign-dls-iwss",
    "gfshield-campaign-dls-iwssr",
    "gfshield-campaign-dls-vnd",
    "gfshield-campaign-dls-rvnd",
    "gfshield-campaign-dls-verify",
    "gfshield-campaign-evaluator",
    "gfshield-campaign-monolith1",
    "gfshield-campaign-monolith2",
)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def checked(
    *command: str, cwd: Path | None = None, environment: dict[str, str] | None = None
) -> str:
    return subprocess.run(
        list(command), cwd=cwd, env=environment, check=True, capture_output=True, text=True
    ).stdout.strip()


def host_provenance() -> dict[str, Any]:
    return {
        "captured_utc": datetime.now(timezone.utc).isoformat(),
        "uname": checked("uname", "-a"),
        "os_release": Path("/etc/os-release").read_text(encoding="utf-8", errors="replace"),
        "lscpu": json.loads(checked("lscpu", "--json")),
        "meminfo": Path("/proc/meminfo").read_text(encoding="utf-8", errors="replace"),
        "docker_server_version": checked("docker", "version", "--format", "{{.Server.Version}}"),
        "docker_compose_version": checked("docker", "compose", "version", "--short"),
        "docker_cgroup_driver": checked("docker", "info", "--format", "{{.CgroupDriver}}"),
        "docker_cgroup_version": checked("docker", "info", "--format", "{{.CgroupVersion}}"),
        "docker_root_dir": checked("docker", "info", "--format", "{{.DockerRootDir}}"),
        "docker_runtime_cpus": int(checked("docker", "info", "--format", "{{.NCPU}}")),
        "docker_runtime_memory_bytes": int(checked("docker", "info", "--format", "{{.MemTotal}}")),
        "containers_present_at_freeze": checked(
            "docker", "ps", "--format", "{{.Names}}|{{.Image}}|{{.Status}}"
        ).splitlines(),
        "swap_accounting_limitation": (
            "The host kernel does not expose Docker swap accounting; memory limits are enforced, "
            "but a separately verified swap limit is unavailable."
        ),
    }


def resolved_compose(repo_root: Path, image_tag: str) -> str:
    environment = os.environ.copy()
    environment.update(
        {
            "CAMPAIGN_DATASET_DIR": str((repo_root / "datasets").resolve()),
            "CAMPAIGN_METRICS_DIR": str(
                (repo_root / "experiments/10-day-campaign/frozen-metrics-placeholder").resolve()
            ),
            "CAMPAIGN_ID": "gfshield-10d-2026-v1",
            "CAMPAIGN_ARM_ID": "distributed-ig-vnd-bitflip",
            "CAMPAIGN_RUN_ID": "RUN_ID_ASSIGNED_BY_ORCHESTRATOR",
            "CAMPAIGN_REQUEST_ID": "REQUEST_ID_ASSIGNED_BY_ORCHESTRATOR",
            "CAMPAIGN_RANDOM_SEED": "42",
            "CAMPAIGN_DEADLINE_EPOCH_MS": "ASSIGNED_PER_RUN",
            "CAMPAIGN_START_MONOTONIC_NS": "ASSIGNED_PER_RUN",
            "CAMPAIGN_RCL_HOST_PORT": "18089",
            "CAMPAIGN_CPUSET": "8-15",
            "CAMPAIGN_IMAGE_TAG": image_tag,
            "CAMPAIGN_MINIMUM_IMPROVEMENT": "0.0001",
            "CAMPAIGN_MAX_ACCEPTED_IMPROVEMENTS": "500",
        }
    )
    compose = repo_root / "experiments/10-day-campaign/docker-compose.campaign.yml"
    return checked(
        "docker", "compose", "-f", str(compose), "config",
        cwd=repo_root, environment=environment,
    ) + "\n"


def image_metadata(image_tag: str) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for repository in LOCAL_IMAGES:
        reference = f"{repository}:{image_tag}"
        inspected = json.loads(checked("docker", "image", "inspect", reference))[0]
        image_id = inspected.get("Id")
        if not isinstance(image_id, str) or not image_id.startswith("sha256:") or len(image_id) != 71:
            raise RuntimeError(f"invalid immutable image ID for {reference}: {image_id!r}")
        result[repository] = {
            "reference": reference,
            "image_id": image_id,
            "repo_digests": inspected.get("RepoDigests") or [],
            "created": inspected.get("Created"),
        }
    result["confluentinc/cp-kafka"] = {
        "reference": "confluentinc/cp-kafka:7.4.0@sha256:187dac6627e7906c350f5f8c982f80ce735ff1a0e571a20de6000a309a12ce63"
    }
    result["confluentinc/cp-zookeeper"] = {
        "reference": "confluentinc/cp-zookeeper:7.4.0@sha256:90631f224b4397ecfb4e824e43d93e0e42656841c6d55ef635c49df3975260ae"
    }
    return result


def resource_arguments() -> list[str]:
    return [
        "--cpuset", "8-15", "--numa-node", "1",
        "--aggregate-cpus", "8", "--aggregate-memory", "16g",
    ]


def dataset_arguments(manifest: dict[str, Any]) -> list[str]:
    dataset = manifest["dataset"]
    return [
        "--dataset-hash", dataset["source_sha256"],
        "--train-hash", dataset["train_sha256"],
        "--validation-hash", dataset["validation_sha256"],
        "--test-hash", dataset["test_sha256"],
    ]


def common_arguments() -> list[str]:
    return [
        "--campaign-id", "{campaign_id}", "--arm-id", "{arm_id}",
        "--run-id", "{run_id}", "--seed", "{seed}",
        "--dataset-dir", "{repo_root}/datasets", "--output-dir", "{result_dir}",
    ]


def distributed_command(manifest: dict[str, Any], arm: dict[str, Any], image_tag: str) -> list[str]:
    return [
        "python3", "{repo_root}/experiments/10-day-campaign/run_arm.py",
        *common_arguments(),
        "--construction", arm["construction"], "--controller", arm["controller"],
        "--local-search", arm["local_search"],
        "--run-timeout-seconds", "{run_timeout_seconds}",
        "--finalization-reserve-seconds", "300", "--startup-timeout-seconds", "300",
        "--max-generations", "2147483647", "--rcl-cutoff", "30", "--sample-size", "5",
        "--relieff-sample-size", str(manifest["feature_selection"]["relieff_sample_size"]),
        "--neighborhood-iterations", "100", "--local-search-iterations", "100",
        "--max-accepted-improvements", str(manifest["stopping"]["maximum_accepted_improvements"]),
        "--minimum-improvement", str(manifest["stopping"]["minimum_improvement"]),
        "--image-tag", image_tag,
        "--evaluator-image", f"gfshield-campaign-evaluator:{image_tag}",
        "--feature-count", "51",
        *resource_arguments(), *dataset_arguments(manifest),
    ]


def monolith_command(manifest: dict[str, Any], arm: dict[str, Any], image_tag: str) -> list[str]:
    monolith = "monolith1" if arm["architecture"] == "monolith1-graspy2" else "monolith2"
    return [
        "python3", "{repo_root}/experiments/10-day-campaign/run_monolith.py",
        "--monolith", monolith, *common_arguments(),
        "--image-tag", image_tag,
        "--run-timeout-seconds", "{run_timeout_seconds}",
        "--finalization-reserve-seconds", "300",
        "--max-accepted-improvements", str(manifest["stopping"]["maximum_accepted_improvements"]),
        "--minimum-improvement", str(manifest["stopping"]["minimum_improvement"]),
        *resource_arguments(),
        "--dataset-hash", manifest["dataset"]["source_sha256"],
    ]


def baseline_command(manifest: dict[str, Any], image_tag: str) -> list[str]:
    return [
        "python3", "{repo_root}/experiments/10-day-campaign/run_baseline.py",
        *common_arguments(),
        "--evaluator-image", f"gfshield-campaign-evaluator:{image_tag}",
        "--feature-count", "51", *resource_arguments(), *dataset_arguments(manifest),
    ]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--pilot-report", type=Path, required=True)
    parser.add_argument("--resilience-report", type=Path, required=True)
    parser.add_argument("--image-tag", required=True)
    parser.add_argument(
        "--image-source-commit",
        help=(
            "Git commit used to build the local images. Defaults to HEAD; pass the "
            "pilot build commit when campaign-only code changed after image creation."
        ),
    )
    parser.add_argument("--campaign-tag", default="experiment-10d-v1")
    parser.add_argument("--resolved-compose", type=Path)
    parser.add_argument("--host-provenance", type=Path)
    args = parser.parse_args()
    repo_root = Path(__file__).resolve().parents[2]
    if args.resolved_compose is None:
        args.resolved_compose = args.manifest.with_name("frozen-compose.yaml")
    if args.host_provenance is None:
        args.host_provenance = args.manifest.with_name("host-provenance.json")
    if checked("git", "status", "--porcelain", cwd=repo_root):
        raise RuntimeError("refusing to freeze a manifest from a dirty worktree")
    pilot = json.loads(args.pilot_report.read_text(encoding="utf-8"))
    if pilot.get("approved") is not True:
        raise RuntimeError("formal pilot report is not approved")
    if pilot.get("image_tag") != args.image_tag:
        raise RuntimeError("formal pilots used a different image tag")
    resilience = json.loads(args.resilience_report.read_text(encoding="utf-8"))
    if resilience.get("approved") is not True:
        raise RuntimeError("resilience pilot report is not approved")
    if resilience.get("formal_pilot_sha256") != sha256_file(args.pilot_report):
        raise RuntimeError("resilience report does not attest this formal pilot report")
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    source_commit = checked(
        "git", "rev-parse", args.image_source_commit or "HEAD", cwd=repo_root
    )
    # `git branch --show-current` is unavailable on the target server's older
    # Git release; symbolic-ref provides the same attached-branch value.
    branch = checked("git", "symbolic-ref", "--quiet", "--short", "HEAD", cwd=repo_root)
    images = image_metadata(args.image_tag)
    compose_text = resolved_compose(repo_root, args.image_tag)
    args.resolved_compose.write_text(compose_text, encoding="utf-8", newline="\n")
    provenance = host_provenance()
    atomic_json(args.host_provenance, provenance)
    for arm in manifest["arms"]:
        arm["command"] = (
            distributed_command(manifest, arm, args.image_tag)
            if arm["architecture"] == "distributed"
            else monolith_command(manifest, arm, args.image_tag)
        )
        arm["ready"] = True
    manifest["baseline"]["command"] = baseline_command(manifest, args.image_tag)
    manifest["baseline"]["ready"] = True
    manifest["classifier"] = {
        "name": "Weka J48",
        "version": "weka-stable 3.8.6",
        "parameters": {"confidence_factor": 0.25, "minimum_instances_per_leaf": 2, "pruned": True},
        "primary_metric": "macro_f1",
        "metric_scale": "0_to_1",
    }
    manifest["resources"] = {
        "cpuset": "8-15", "numa_node": "1", "aggregate_cpus": 8,
        "aggregate_memory_bytes": 16 * 1024**3,
        "swap_accounting": "unsupported_by_host_kernel; memory limit enforced without swap limit",
    }
    manifest["git"] = {
        "image_source_commit": source_commit,
        "image_source_branch": branch,
        "campaign_tag": args.campaign_tag,
        "campaign_tag_commit_recorded_at_launch": True,
    }
    manifest["images"] = images
    manifest["compose_evidence"] = {
        "source_path": "experiments/10-day-campaign/docker-compose.campaign.yml",
        "source_sha256": sha256_file(
            repo_root / "experiments/10-day-campaign/docker-compose.campaign.yml"
        ),
        "resolved_path": str(args.resolved_compose.resolve()),
        "resolved_sha256": sha256_file(args.resolved_compose),
        "per_run_resolved_compose": "resolved-compose.yaml in every distributed run directory",
    }
    manifest["host_evidence"] = {
        "path": str(args.host_provenance.resolve()),
        "sha256": sha256_file(args.host_provenance),
        "captured_utc": provenance["captured_utc"],
    }
    manifest["pilot_evidence"] = {
        "approved": True,
        "report_sha256": sha256_file(args.pilot_report),
        "report_path_on_target": str(args.pilot_report.resolve()),
        "image_tag": args.image_tag,
        "finished_utc": pilot.get("finished_utc"),
        "case_count": len(pilot.get("cases") or {}),
    }
    manifest["resilience_evidence"] = {
        "approved": True,
        "report_sha256": sha256_file(args.resilience_report),
        "report_path_on_target": str(args.resilience_report.resolve()),
        "generated_utc": resilience.get("generated_utc"),
        "checks": resilience.get("checks"),
    }
    manifest["frozen_utc"] = datetime.now(timezone.utc).isoformat()
    manifest["readiness_blockers"] = []
    manifest["ready"] = True
    atomic_json(args.manifest, manifest)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
