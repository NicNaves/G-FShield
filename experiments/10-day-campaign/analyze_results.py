#!/usr/bin/env python3
"""Aggregate the frozen ten-day campaign without altering raw artifacts."""

from __future__ import annotations

import argparse
import csv
import hashlib
import itertools
import json
import math
import re
from collections import Counter
from pathlib import Path
from typing import Any, Iterable

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd


CAMPAIGN_ID = "gfshield-10d-2026-v1"
EXPECTED_SEEDS = list(range(42, 50))
EXPECTED_VALID_RUNS = 27 * len(EXPECTED_SEEDS)
TARGET_F1 = 0.95
BOOTSTRAP_REPETITIONS = 20_000
BOOTSTRAP_SEED = 20260902
CPU_BUDGET_CORES = 8.0
MEMORY_BUDGET_MIB = 16 * 1024.0

SELECTOR_LABEL = {"ig": "IG", "gr": "GR", "su": "SU", "relieff": "RF"}
SEARCH_LABEL = {"bitflip": "BF", "iwss": "IWSS", "iwssr": "IWSSR"}
ARCHITECTURE_LABEL = {
    "distributed": "G-FShield",
    "monolith1": "Monolith 1",
    "monolith2": "Monolith 2",
    "baseline": "All features",
}
COLORS = {
    "distributed": "#2563EB",
    "monolith1": "#D97706",
    "monolith2": "#7C3AED",
    "baseline": "#475569",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--snapshot-root", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--skip-resources", action="store_true")
    parser.add_argument("--verify-checksums", action="store_true")
    return parser.parse_args()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def local_result_path(snapshot: Path, server_path: str) -> Path:
    marker = "/experiments/10-day-campaign/results/"
    if marker not in server_path:
        raise ValueError(f"Unexpected result path: {server_path}")
    return snapshot / "results" / Path(server_path.split(marker, 1)[1])


def architecture(arm_id: str) -> str:
    if arm_id.startswith("distributed-"):
        return "distributed"
    if arm_id.startswith("monolith1-"):
        return "monolith1"
    if arm_id.startswith("monolith2-"):
        return "monolith2"
    if arm_id == "baseline-all-features":
        return "baseline"
    raise ValueError(f"Unknown arm: {arm_id}")


def arm_code(arm_id: str) -> str:
    kind = architecture(arm_id)
    if kind == "baseline":
        return "ALL-51"
    if kind == "monolith1":
        return "M1-GR-BF"
    if kind == "monolith2":
        return "M2-GR-IWSS"
    _, selector, controller, search = arm_id.split("-")
    return f"{SELECTOR_LABEL[selector]}-{controller.upper()}-{SEARCH_LABEL[search]}"


def canonical_subset(features: Any) -> str:
    if not isinstance(features, list):
        return ""
    return ",".join(str(value) for value in sorted(set(features), key=str))


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    rows = []
    with path.open(encoding="utf-8") as handle:
        for line in handle:
            if line.strip():
                rows.append(json.loads(line))
    return rows


def count_internal_metric_rows(run_dir: Path) -> int:
    count = 0
    for path in run_dir.rglob("*.csv"):
        with path.open(encoding="utf-8", errors="replace", newline="") as handle:
            sample = handle.read(4096)
            handle.seek(0)
            delimiter = ";" if sample.count(";") > sample.count(",") else ","
            for row in csv.reader(handle, delimiter=delimiter):
                if not row or not any(cell.strip() for cell in row):
                    continue
                first = row[0].strip().lower()
                if first in {"solutionfeatures", "timestamp", "metric"}:
                    continue
                count += 1
    return count


def best_message_metrics(run_dir: Path) -> dict[str, Any]:
    messages = read_jsonl(run_dir / "best-solution-messages.jsonl")
    valid = [
        row for row in messages
        if isinstance(row.get("f1Score"), (int, float))
        and isinstance(row.get("monotonicElapsedMs"), (int, float))
    ]
    target = [row for row in valid if float(row["f1Score"]) >= TARGET_F1]
    subsets = {canonical_subset(row.get("solutionFeatures")) for row in valid}
    subsets.discard("")
    return {
        "best_message_count": len(valid),
        "best_message_unique_subsets": len(subsets),
        "internal_best_f1": max((float(row["f1Score"]) for row in valid), default=math.nan),
        "internal_time_to_target_ms": min(
            (float(row["monotonicElapsedMs"]) for row in target), default=math.nan
        ),
        "internal_target_reached": bool(target),
    }


QUANTITY_UNITS = {
    "B": 1.0,
    "kB": 1000.0,
    "KB": 1000.0,
    "MB": 1000.0**2,
    "GB": 1000.0**3,
    "TB": 1000.0**4,
    "KiB": 1024.0,
    "MiB": 1024.0**2,
    "GiB": 1024.0**3,
    "TiB": 1024.0**4,
}


def quantity_bytes(value: str) -> float:
    match = re.fullmatch(r"\s*([0-9.]+)\s*([A-Za-z]+)\s*", value or "")
    if not match:
        return math.nan
    return float(match.group(1)) * QUANTITY_UNITS.get(match.group(2), math.nan)


def extract_json_value(line: str, key: str) -> Any:
    token = json.dumps(key) + ": "
    start = line.find(token)
    if start < 0:
        return None
    start += len(token)
    decoder = json.JSONDecoder()
    value, _ = decoder.raw_decode(line[start:])
    return value


def parse_resource_samples(path: Path) -> dict[str, float]:
    if not path.exists():
        return {}
    cpu_cores = []
    memory_mib = []
    pids = []
    network_rx = []
    network_tx = []
    disk_read = []
    disk_write = []
    with path.open(encoding="utf-8", errors="replace") as handle:
        for line in handle:
            stats = extract_json_value(line, "stats")
            if not isinstance(stats, list) or not stats:
                continue
            cpu_total = 0.0
            memory_total = 0.0
            pid_total = 0.0
            rx_total = tx_total = read_total = write_total = 0.0
            for item in stats:
                try:
                    cpu_total += float(str(item.get("CPUPerc", "0")).rstrip("%")) / 100.0
                except ValueError:
                    pass
                memory_used = str(item.get("MemUsage", "")).split("/", 1)[0].strip()
                value = quantity_bytes(memory_used)
                if math.isfinite(value):
                    memory_total += value / 1024.0**2
                try:
                    pid_total += float(item.get("PIDs", 0))
                except (TypeError, ValueError):
                    pass
                for field, destination in (("NetIO", ("rx", "tx")), ("BlockIO", ("read", "write"))):
                    parts = str(item.get(field, "")).split("/", 1)
                    if len(parts) != 2:
                        continue
                    left, right = quantity_bytes(parts[0]), quantity_bytes(parts[1])
                    if field == "NetIO":
                        rx_total += 0.0 if not math.isfinite(left) else left
                        tx_total += 0.0 if not math.isfinite(right) else right
                    else:
                        read_total += 0.0 if not math.isfinite(left) else left
                        write_total += 0.0 if not math.isfinite(right) else right
            cpu_cores.append(cpu_total)
            memory_mib.append(memory_total)
            pids.append(pid_total)
            network_rx.append(rx_total)
            network_tx.append(tx_total)
            disk_read.append(read_total)
            disk_write.append(write_total)
    if not cpu_cores:
        return {}
    return {
        "resource_sample_count": len(cpu_cores),
        "cpu_cores_median": float(np.median(cpu_cores)),
        "cpu_cores_q1": float(np.quantile(cpu_cores, 0.25)),
        "cpu_cores_q3": float(np.quantile(cpu_cores, 0.75)),
        "cpu_cores_peak": float(np.max(cpu_cores)),
        "cpu_budget_utilization_median_percent": float(np.median(cpu_cores)) / CPU_BUDGET_CORES * 100,
        "memory_mib_median": float(np.median(memory_mib)),
        "memory_mib_q1": float(np.quantile(memory_mib, 0.25)),
        "memory_mib_q3": float(np.quantile(memory_mib, 0.75)),
        "memory_mib_peak": float(np.max(memory_mib)),
        "memory_budget_utilization_peak_percent": float(np.max(memory_mib)) / MEMORY_BUDGET_MIB * 100,
        "pids_median": float(np.median(pids)),
        "network_rx_final_mib": float(np.max(network_rx)) / 1024.0**2,
        "network_tx_final_mib": float(np.max(network_tx)) / 1024.0**2,
        "disk_read_final_mib": float(np.max(disk_read)) / 1024.0**2,
        "disk_write_final_mib": float(np.max(disk_write)) / 1024.0**2,
    }


def verify_run_artifacts(run: dict[str, Any], snapshot: Path) -> list[str]:
    errors = []
    manifest = local_result_path(snapshot, run["checksum_manifest_path"])
    result = local_result_path(snapshot, run["result_path"])
    if sha256(manifest) != run["checksum_manifest_sha256"]:
        errors.append(f"{run['run_id']}: checksum manifest differs from state")
    if sha256(result) != run["result_sha256"]:
        errors.append(f"{run['run_id']}: final result differs from state")
    for line in manifest.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        expected, relative = line.split(None, 1)
        path = manifest.parent / relative.strip()
        if not path.is_file():
            errors.append(f"{run['run_id']}: missing {relative.strip()}")
        elif sha256(path) != expected:
            errors.append(f"{run['run_id']}: checksum mismatch {relative.strip()}")
    return errors


def load_runs(snapshot: Path, resources: bool, verify: bool) -> tuple[pd.DataFrame, list[dict[str, Any]]]:
    state = json.loads((snapshot / "state" / "campaign-state.json").read_text(encoding="utf-8"))
    valid_attempts = [row for row in state["completed_runs"] if row.get("artifact_valid")]
    failed_attempts = [row for row in state["completed_runs"] if not row.get("artifact_valid")]
    if state.get("state") != "CAMPAIGN_COMPLETED":
        raise RuntimeError(f"Campaign state is {state.get('state')}")
    if len(valid_attempts) != EXPECTED_VALID_RUNS:
        raise RuntimeError(f"Expected {EXPECTED_VALID_RUNS} valid runs, found {len(valid_attempts)}")
    errors = []
    records = []
    for index, attempt in enumerate(valid_attempts, 1):
        result_path = local_result_path(snapshot, attempt["result_path"])
        run_dir = result_path.parent
        if verify:
            errors.extend(verify_run_artifacts(attempt, snapshot))
        result = json.loads(result_path.read_text(encoding="utf-8"))
        if result.get("campaign_id") != CAMPAIGN_ID:
            raise RuntimeError(f"Unexpected campaign in {result_path}")
        arm_id = result["arm_id"]
        kind = architecture(arm_id)
        message_metrics = best_message_metrics(run_dir)
        record = {
            "campaign_id": result["campaign_id"],
            "arm_id": arm_id,
            "arm_code": arm_code(arm_id),
            "architecture": kind,
            "architecture_label": ARCHITECTURE_LABEL[kind],
            "seed": int(result["seed"]),
            "feature_selector": result.get("feature_selector"),
            "neighborhood_controller": result.get("neighborhood_controller"),
            "local_search": result.get("local_search"),
            "status": result.get("status"),
            "stop_reason": result.get("stop_reason"),
            "validation_f1_macro": result.get("validation_f1_macro"),
            "validation_f1_weighted": result.get("validation_f1_weighted"),
            "validation_precision_macro": result.get("validation_precision_macro"),
            "validation_recall_macro": result.get("validation_recall_macro"),
            "test_f1_macro": result.get("test_f1_macro"),
            "test_f1_weighted": result.get("test_f1_weighted"),
            "test_precision_macro": result.get("test_precision_macro"),
            "test_recall_macro": result.get("test_recall_macro"),
            "accuracy": result.get("accuracy"),
            "subset_size": result.get("subset_size"),
            "dimensionality_reduction_percent": result.get("dimensionality_reduction_percent"),
            "selected_features": canonical_subset(result.get("selected_features")),
            "accepted_improvement_count": result.get("accepted_improvement_count"),
            "candidate_count": result.get("candidate_count"),
            "internal_metric_rows": count_internal_metric_rows(run_dir),
            "end_to_end_time_seconds": float(result.get("end_to_end_time_ms", 0)) / 1000.0,
            "classifier_time_seconds": float(result.get("classifier_time_ms", 0)) / 1000.0,
            "run_id": result.get("run_id"),
            "result_sha256": attempt["result_sha256"],
            **message_metrics,
        }
        if resources:
            record.update(parse_resource_samples(run_dir / "resource-samples.jsonl"))
        records.append(record)
        if index % 25 == 0:
            print(f"Loaded {index}/{len(valid_attempts)} valid runs", flush=True)
    if errors:
        raise RuntimeError("Artifact verification failed:\n" + "\n".join(errors[:20]))
    frame = pd.DataFrame(records).sort_values(["architecture", "arm_id", "seed"])
    expected = set(EXPECTED_SEEDS)
    missing = {
        arm: sorted(expected - set(group["seed"]))
        for arm, group in frame.groupby("arm_id")
        if set(group["seed"]) != expected
    }
    if missing:
        raise RuntimeError(f"Missing or duplicated seeds: {missing}")
    return frame, failed_attempts


def bootstrap_median_ci(values: Iterable[float], salt: str) -> tuple[float, float]:
    array = np.asarray(list(values), dtype=float)
    seed = BOOTSTRAP_SEED + int(hashlib.sha256(salt.encode()).hexdigest()[:8], 16)
    rng = np.random.default_rng(seed)
    samples = rng.choice(array, size=(BOOTSTRAP_REPETITIONS, len(array)), replace=True)
    medians = np.median(samples, axis=1)
    return float(np.quantile(medians, 0.025)), float(np.quantile(medians, 0.975))


def configuration_summary(runs: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for arm_id, group in runs.groupby("arm_id", sort=False):
        test = group["test_f1_macro"].astype(float)
        validation = group["validation_f1_macro"].astype(float)
        low, high = bootstrap_median_ci(test, arm_id + ":test")
        target_times = group.loc[group["internal_target_reached"], "internal_time_to_target_ms"] / 1000.0
        row = {
            "arm_id": arm_id,
            "arm_code": group["arm_code"].iloc[0],
            "architecture": group["architecture"].iloc[0],
            "n_runs": len(group),
            "validation_f1_macro_median": validation.median(),
            "validation_f1_macro_q1": validation.quantile(0.25),
            "validation_f1_macro_q3": validation.quantile(0.75),
            "test_f1_macro_mean": test.mean(),
            "test_f1_macro_sd": test.std(ddof=1),
            "test_f1_macro_median": test.median(),
            "test_f1_macro_q1": test.quantile(0.25),
            "test_f1_macro_q3": test.quantile(0.75),
            "test_f1_macro_median_ci_low": low,
            "test_f1_macro_median_ci_high": high,
            "test_precision_macro_median": group["test_precision_macro"].median(),
            "test_recall_macro_median": group["test_recall_macro"].median(),
            "test_accuracy_median": group["accuracy"].median(),
            "subset_size_median": group["subset_size"].median(),
            "subset_size_q1": group["subset_size"].quantile(0.25),
            "subset_size_q3": group["subset_size"].quantile(0.75),
            "dimensionality_reduction_percent_median": group["dimensionality_reduction_percent"].median(),
            "unique_final_subsets": group["selected_features"].nunique(),
            "accepted_improvements_median": group["accepted_improvement_count"].median(),
            "internal_metric_rows_median": group["internal_metric_rows"].median(),
            "end_to_end_time_seconds_median": group["end_to_end_time_seconds"].median(),
            "internal_target_reached_runs": int(group["internal_target_reached"].sum()),
            "internal_time_to_target_seconds_median": target_times.median() if len(target_times) else math.nan,
        }
        for column in (
            "cpu_cores_median", "cpu_cores_peak", "cpu_budget_utilization_median_percent",
            "memory_mib_median", "memory_mib_peak", "memory_budget_utilization_peak_percent",
            "pids_median", "network_rx_final_mib", "network_tx_final_mib",
            "disk_read_final_mib", "disk_write_final_mib",
        ):
            if column in group:
                row[column + "_median"] = group[column].median()
                row[column + "_q1"] = group[column].quantile(0.25)
                row[column + "_q3"] = group[column].quantile(0.75)
        rows.append(row)
    return pd.DataFrame(rows).sort_values("test_f1_macro_median", ascending=False)


def average_ranks(values: np.ndarray) -> np.ndarray:
    return pd.Series(values).rank(method="average").to_numpy()


def paired_rank_biserial(differences: np.ndarray) -> float:
    differences = differences[np.abs(differences) > 1e-15]
    if len(differences) == 0:
        return 0.0
    ranks = average_ranks(np.abs(differences))
    denominator = ranks.sum()
    return float((ranks[differences > 0].sum() - ranks[differences < 0].sum()) / denominator)


def exact_sign_flip_p(differences: np.ndarray) -> float:
    differences = differences[np.abs(differences) > 1e-15]
    if len(differences) == 0:
        return 1.0
    observed = abs(float(np.mean(differences)))
    statistics = []
    for signs in itertools.product((-1.0, 1.0), repeat=len(differences)):
        statistics.append(abs(float(np.mean(differences * np.asarray(signs)))))
    return float(np.mean(np.asarray(statistics) >= observed - 1e-15))


def holm_adjust(p_values: list[float]) -> list[float]:
    order = np.argsort(p_values)
    adjusted = np.empty(len(p_values), dtype=float)
    running = 0.0
    total = len(p_values)
    for rank, index in enumerate(order):
        value = min(1.0, (total - rank) * p_values[index])
        running = max(running, value)
        adjusted[index] = running
    return adjusted.tolist()


def paired_comparisons(runs: pd.DataFrame) -> pd.DataFrame:
    distributed = sorted(runs.loc[runs["architecture"] == "distributed", "arm_id"].unique())
    comparators = ["baseline-all-features", "monolith1-gr-bitflip", "monolith2-gr-iwss"]
    rows = []
    for comparator in comparators:
        reference = runs[runs["arm_id"] == comparator].set_index("seed")
        family = []
        for arm in distributed:
            candidate = runs[runs["arm_id"] == arm].set_index("seed")
            differences = (
                candidate.loc[EXPECTED_SEEDS, "test_f1_macro"].to_numpy(dtype=float)
                - reference.loc[EXPECTED_SEEDS, "test_f1_macro"].to_numpy(dtype=float)
            )
            family.append({
                "arm_id": arm,
                "arm_code": arm_code(arm),
                "comparator": comparator,
                "comparator_code": arm_code(comparator),
                "paired_mean_difference": float(np.mean(differences)),
                "paired_median_difference": float(np.median(differences)),
                "wins": int(np.sum(differences > 0)),
                "ties": int(np.sum(np.abs(differences) <= 1e-15)),
                "losses": int(np.sum(differences < 0)),
                "rank_biserial": paired_rank_biserial(differences),
                "p_exact_unadjusted": exact_sign_flip_p(differences),
            })
        adjusted = holm_adjust([row["p_exact_unadjusted"] for row in family])
        for row, value in zip(family, adjusted):
            row["p_holm"] = value
            rows.append(row)
    return pd.DataFrame(rows)


def per_class_summary(runs: pd.DataFrame, snapshot: Path) -> pd.DataFrame:
    rows = []
    state = json.loads((snapshot / "state" / "campaign-state.json").read_text(encoding="utf-8"))
    valid = {row["run_id"]: row for row in state["completed_runs"] if row.get("artifact_valid")}
    for run in runs.itertuples(index=False):
        result_path = local_result_path(snapshot, valid[run.run_id]["result_path"])
        result = json.loads(result_path.read_text(encoding="utf-8"))
        for label, metrics in result.get("test_per_class_metrics", {}).items():
            rows.append({
                "arm_id": run.arm_id,
                "arm_code": run.arm_code,
                "architecture": run.architecture,
                "seed": run.seed,
                "class": label,
                "f1": metrics.get("f1"),
                "precision": metrics.get("precision"),
                "recall": metrics.get("recall"),
            })
    frame = pd.DataFrame(rows)
    return (
        frame.groupby(["arm_id", "arm_code", "architecture", "class"], as_index=False)
        .agg(f1_median=("f1", "median"), f1_q1=("f1", lambda x: x.quantile(0.25)),
             f1_q3=("f1", lambda x: x.quantile(0.75)), precision_median=("precision", "median"),
             recall_median=("recall", "median"))
    )


def save_figure(fig: plt.Figure, output: Path, stem: str) -> None:
    output.mkdir(parents=True, exist_ok=True)
    fig.savefig(output / f"{stem}.pdf", bbox_inches="tight")
    fig.savefig(output / f"{stem}.png", dpi=220, bbox_inches="tight")
    plt.close(fig)


def plot_results(
    runs: pd.DataFrame,
    summary: pd.DataFrame,
    classes: pd.DataFrame,
    output: Path,
    language: str,
) -> None:
    if language not in {"en", "pt"}:
        raise ValueError(f"Unsupported plot language: {language}")
    tr = {
        "en": {
            "test_title": "Held-out test performance across eight independent seeds",
            "test_x": "Test macro-F1",
            "heat_title": "Median held-out macro-F1 for G-FShield configurations",
            "heat_x": "Neighborhood controller and local search",
            "heat_y": "RCL ranking",
            "heat_cbar": "Median test macro-F1",
            "quality_title": "Quality-reduction trade-off (final solution per run)",
            "quality_x": "Median dimensionality reduction (%)",
            "quality_y": "Median test macro-F1",
            "resource_title": "Observed container resources under the common aggregate budget",
            "cpu_y": "Median CPU use (cores)",
            "cpu_budget": "8-core budget",
            "memory_y": "Peak memory per run (GiB)",
            "memory_budget": "16-GiB budget",
            "class_y": "Median per-class test F1",
            "class_title": "Held-out per-class performance of the validation-selected G-FShield configuration and comparators",
            "architecture": {"distributed": "G-FShield", "monolith1": "Monolith 1", "monolith2": "Monolith 2", "baseline": "All features"},
        },
        "pt": {
            "test_title": "Desempenho no teste reservado em oito sementes independentes",
            "test_x": "F1 macro no teste",
            "heat_title": "F1 macro mediano no teste das configurações G-FShield",
            "heat_x": "Controlador de vizinhança e busca local",
            "heat_y": "Ranking da RCL",
            "heat_cbar": "F1 macro mediano no teste",
            "quality_title": "Compromisso entre qualidade e redução (solução final por execução)",
            "quality_x": "Redução dimensional mediana (%)",
            "quality_y": "F1 macro mediano no teste",
            "resource_title": "Recursos observados dos contêineres sob o orçamento agregado comum",
            "cpu_y": "Uso mediano de CPU (núcleos)",
            "cpu_budget": "Orçamento de 8 núcleos",
            "memory_y": "Pico de memória por execução (GiB)",
            "memory_budget": "Orçamento de 16 GiB",
            "class_y": "F1 mediano por classe no teste",
            "class_title": "Desempenho por classe da configuração G-FShield escolhida na validação e dos comparadores",
            "architecture": {"distributed": "G-FShield", "monolith1": "Monólito 1", "monolith2": "Monólito 2", "baseline": "Todas as características"},
        },
    }[language]
    suffix = f"-{language}"
    plt.rcParams.update({"font.size": 9, "axes.titlesize": 11, "axes.labelsize": 10})
    ordered = summary.sort_values("test_f1_macro_median")
    data = [runs.loc[runs["arm_id"] == arm, "test_f1_macro"].to_numpy() for arm in ordered["arm_id"]]
    fig, ax = plt.subplots(figsize=(8.2, 10.5))
    boxes = ax.boxplot(data, orientation="horizontal", tick_labels=ordered["arm_code"], patch_artist=True,
                       showmeans=True, meanprops={"marker": "D", "markersize": 3,
                                                  "markerfacecolor": "white", "markeredgecolor": "black"})
    for patch, kind in zip(boxes["boxes"], ordered["architecture"]):
        patch.set_facecolor(COLORS[kind]); patch.set_alpha(0.78)
    ax.set_xlabel(tr["test_x"])
    ax.grid(axis="x", alpha=0.25)
    ax.set_xlim(min(runs["test_f1_macro"].min() - 0.01, 0.85), 1.0)
    ax.set_title(tr["test_title"])
    save_figure(fig, output, "campaign-test-f1" + suffix)

    distributed = summary[summary["architecture"] == "distributed"]
    selectors = ["IG", "GR", "SU", "RF"]
    combinations = ["VND-BF", "VND-IWSS", "VND-IWSSR", "RVND-BF", "RVND-IWSS", "RVND-IWSSR"]
    matrix = np.full((4, 6), np.nan)
    for _, row in distributed.iterrows():
        pieces = row["arm_code"].split("-", 1)
        matrix[selectors.index(pieces[0]), combinations.index(pieces[1])] = row["test_f1_macro_median"]
    fig, ax = plt.subplots(figsize=(10.2, 4.2))
    image = ax.imshow(matrix, cmap="viridis", aspect="auto", vmin=np.nanmin(matrix), vmax=np.nanmax(matrix))
    ax.set_xticks(range(6), combinations); ax.set_yticks(range(4), selectors)
    for i in range(4):
        for j in range(6):
            ax.text(j, i, f"{matrix[i,j]:.3f}", ha="center", va="center",
                    color="white" if matrix[i,j] < np.nanmedian(matrix) else "black")
    ax.set_xlabel(tr["heat_x"])
    ax.set_ylabel(tr["heat_y"])
    ax.set_title(tr["heat_title"])
    fig.colorbar(image, ax=ax, label=tr["heat_cbar"])
    save_figure(fig, output, "campaign-configuration-heatmap" + suffix)

    fig, ax = plt.subplots(figsize=(8.6, 5.5))
    for kind, group in summary.groupby("architecture"):
        ax.scatter(group["dimensionality_reduction_percent_median"], group["test_f1_macro_median"],
                   label=tr["architecture"][kind], color=COLORS[kind], s=55, alpha=0.85)
    selected_codes = {"RF-VND-IWSSR", "M1-GR-BF", "M2-GR-IWSS", "ALL-51"}
    offsets = {"RF-VND-IWSSR": (-72, 8), "M1-GR-BF": (-48, -18), "M2-GR-IWSS": (-55, 8), "ALL-51": (8, 2)}
    for _, row in summary[summary["arm_code"].isin(selected_codes)].iterrows():
        ax.annotate(row["arm_code"], (row["dimensionality_reduction_percent_median"],
                    row["test_f1_macro_median"]), xytext=offsets[row["arm_code"]],
                    textcoords="offset points", fontsize=8,
                    arrowprops={"arrowstyle": "-", "linewidth": 0.6, "color": "#555555"})
    ax.set_xlabel(tr["quality_x"])
    ax.set_ylabel(tr["quality_y"])
    ax.grid(alpha=0.25); ax.legend(frameon=False)
    ax.set_title(tr["quality_title"])
    save_figure(fig, output, "campaign-quality-reduction" + suffix)

    if "cpu_cores_median" in runs:
        kinds = ["distributed", "monolith1", "monolith2", "baseline"]
        labels = [tr["architecture"][kind] for kind in kinds]
        fig, axes = plt.subplots(1, 2, figsize=(10.5, 4.5))
        cpu = [runs.loc[runs["architecture"] == kind, "cpu_cores_median"].dropna() for kind in kinds]
        mem = [runs.loc[runs["architecture"] == kind, "memory_mib_peak"].dropna() / 1024.0 for kind in kinds]
        axes[0].boxplot(cpu, tick_labels=labels, patch_artist=True)
        axes[0].axhline(CPU_BUDGET_CORES, color="#DC2626", linestyle="--", linewidth=1, label=tr["cpu_budget"])
        axes[0].set_ylabel(tr["cpu_y"]); axes[0].tick_params(axis="x", rotation=20)
        axes[0].grid(axis="y", alpha=0.25); axes[0].legend(frameon=False)
        axes[1].boxplot(mem, tick_labels=labels, patch_artist=True)
        axes[1].axhline(16, color="#DC2626", linestyle="--", linewidth=1, label=tr["memory_budget"])
        axes[1].set_ylabel(tr["memory_y"]); axes[1].tick_params(axis="x", rotation=20)
        axes[1].grid(axis="y", alpha=0.25); axes[1].legend(frameon=False)
        fig.suptitle(tr["resource_title"])
        fig.tight_layout()
        save_figure(fig, output, "campaign-resources" + suffix)

    distributed_summary = summary[summary["architecture"] == "distributed"]
    best_arm = distributed_summary.loc[
        distributed_summary["validation_f1_macro_median"].idxmax(), "arm_id"
    ]
    selected = [best_arm, "monolith1-gr-bitflip", "monolith2-gr-iwss", "baseline-all-features"]
    subset = classes[classes["arm_id"].isin(selected)].copy()
    labels = list(dict.fromkeys(subset["class"]))
    x = np.arange(len(labels)); width = 0.2
    fig, ax = plt.subplots(figsize=(12, 5.5))
    for offset, arm in enumerate(selected):
        group = subset[subset["arm_id"] == arm].set_index("class")
        values = [group.loc[label, "f1_median"] for label in labels]
        ax.bar(x + (offset - 1.5) * width, values, width, label=arm_code(arm),
               color=COLORS[architecture(arm)], alpha=0.85)
    ax.set_xticks(x, [label.replace("_", "\n") for label in labels], rotation=0)
    ax.set_ylim(0, 1.02); ax.set_ylabel(tr["class_y"])
    ax.set_title(tr["class_title"])
    ax.legend(frameon=False, ncol=4); ax.grid(axis="y", alpha=0.25)
    fig.tight_layout()
    save_figure(fig, output, "campaign-per-class-f1" + suffix)


def write_report(output: Path, runs: pd.DataFrame, summary: pd.DataFrame,
                 comparisons: pd.DataFrame, failed: list[dict[str, Any]]) -> None:
    distributed_summary = summary[summary["architecture"] == "distributed"]
    best = distributed_summary.loc[
        distributed_summary["validation_f1_macro_median"].idxmax()
    ]
    baseline = summary[summary["arm_id"] == "baseline-all-features"].iloc[0]
    significant = int((comparisons["p_holm"] < 0.05).sum())
    report = [
        "# Ten-day campaign analysis",
        "",
        f"- Valid independent runs: {len(runs)} (27 arms x 8 seeds).",
        f"- Invalid attempts excluded: {len(failed)}; every missing seed was retried successfully.",
        f"- Validation-selected arm: `{best['arm_code']}` (`{best['arm_id']}`).",
        f"- Selected arm median test macro-F1: {best['test_f1_macro_median']:.6f} "
        f"(IQR {best['test_f1_macro_q1']:.6f}-{best['test_f1_macro_q3']:.6f}).",
        f"- All-features median test macro-F1: {baseline['test_f1_macro_median']:.6f}.",
        f"- Holm-adjusted exploratory paired comparisons below 0.05: {significant}.",
        "- The common final metric is Weka J48 macro-F1 on the untouched test split.",
        "- G-FShield's internal best-so-far score remains the legacy binary score; it is not interchangeable with final macro-F1.",
        "",
        "## Configuration summary",
        "",
        "| Arm | Median validation F1 | Median test F1 | Test IQR | Median |S| | Median reduction | Unique final subsets |",
        "|---|---:|---:|---:|---:|---:|---:|",
    ]
    for row in summary.itertuples(index=False):
        report.append(
            f"| {row.arm_code} | {row.validation_f1_macro_median:.4f} | {row.test_f1_macro_median:.4f} | "
            f"{row.test_f1_macro_q1:.4f}-{row.test_f1_macro_q3:.4f} | {row.subset_size_median:.1f} | "
            f"{row.dimensionality_reduction_percent_median:.1f}% | {row.unique_final_subsets} |"
        )
    (output / "analysis-report.md").write_text("\n".join(report) + "\n", encoding="utf-8")


def main() -> None:
    args = parse_args()
    snapshot = args.snapshot_root.resolve()
    output = args.output_dir.resolve()
    output.mkdir(parents=True, exist_ok=True)
    runs, failed = load_runs(snapshot, resources=not args.skip_resources, verify=args.verify_checksums)
    summary = configuration_summary(runs)
    comparisons = paired_comparisons(runs)
    classes = per_class_summary(runs, snapshot)
    runs.to_csv(output / "run-level-results.csv", index=False)
    summary.to_csv(output / "configuration-summary.csv", index=False)
    comparisons.to_csv(output / "paired-comparisons.csv", index=False)
    classes.to_csv(output / "per-class-summary.csv", index=False)
    (output / "failed-attempts.json").write_text(
        json.dumps(failed, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    provenance = {
        "campaign_id": CAMPAIGN_ID,
        "valid_runs": len(runs),
        "failed_attempts_excluded": len(failed),
        "expected_seeds": EXPECTED_SEEDS,
        "target_f1": TARGET_F1,
        "bootstrap_repetitions": BOOTSTRAP_REPETITIONS,
        "bootstrap_seed": BOOTSTRAP_SEED,
        "cpu_budget_cores": CPU_BUDGET_CORES,
        "memory_budget_mib": MEMORY_BUDGET_MIB,
        "manifest_sha256": sha256(snapshot / "manifest.yaml"),
        "campaign_state_sha256": sha256(snapshot / "state" / "campaign-state.json"),
    }
    (output / "analysis-provenance.json").write_text(
        json.dumps(provenance, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    plot_results(runs, summary, classes, output / "figures", "en")
    plot_results(runs, summary, classes, output / "figures", "pt")
    write_report(output, runs, summary, comparisons, failed)
    print(f"Analysis written to {output}")


if __name__ == "__main__":
    main()
