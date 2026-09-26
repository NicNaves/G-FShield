#!/usr/bin/env python3
"""Offline v13 analysis; raw artifacts and frozen execution checkout stay unchanged."""
from __future__ import annotations

import argparse
import ast
import hashlib
import json
import math
import platform
import re
from datetime import datetime
from pathlib import Path

import numpy as np

SEED = 20260923
BOOTSTRAPS = 20000
ARMS = ["monolith", "distributed-e0-b0", "distributed-e0-b3",
        "distributed-e1-b0", "distributed-e1-b3"]
THRESHOLD = 0.945
HORIZON = 2700.0
STAMP = re.compile(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)")
INTERNAL = re.compile(
    r"(?:rcl generation ready|dls iteration search=IWSSR).*?"
    r"f1=([-+0-9.Ee]+).*?features=(\[[^]]*\]).*?campaignElapsedMs=(\d+)")
CONFIRMED = re.compile(r"verify confirmed best solution .*?f1=([-+0-9.Ee]+).*?partition=(\d+) offset=(\d+)")
ADMISSION = re.compile(r"dls training admission limit=(\d+) active=(\d+) peakActive=(\d+)")
EARLY = re.compile(r"dls early progress .*?evaluationCompletedUtc=(\S+) submittedUtc=(\S+)")


def sha(path):
    h = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for part in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(part)
    return h.hexdigest()


def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def jsonl(path):
    with Path(path).open(encoding="utf-8") as handle:
        for line in handle:
            if line.strip():
                yield json.loads(line)


def seconds(value):
    # Python 3.10 cannot parse Docker nanosecond fractional seconds directly.
    value = re.sub(r"\.(\d+)(?=Z|[+-]\d\d:\d\d$)",
                   lambda m: "." + m[1][:6].ljust(6, "0"), value)
    return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()


def canonical(features, one_based=False):
    values = tuple(sorted(int(v) - int(one_based) for v in features))
    if not values or len(values) != len(set(values)) or min(values) < 0 or max(values) >= 51:
        raise ValueError("invalid feature subset")
    return values


def yield_metrics(events, horizon=HORIZON, threshold=THRESHOLD):
    """Events: (elapsed_seconds, F1, canonical subset), no clamping late/negative events."""
    seen, qualified = {}, {}
    for t, score, features in events:
        if not math.isfinite(t) or not math.isfinite(score) or not 0 <= score <= 1:
            raise ValueError("non-finite or invalid event")
        if not 0 <= t <= horizon:
            continue
        seen[features] = min(seen.get(features, math.inf), t)
        if score >= threshold:
            qualified[features] = min(qualified.get(features, math.inf), t)
    first = min(qualified.values(), default=None)
    return {
        "unique_subsets": len(seen), "qualified_subsets": len(qualified),
        "auc": sum(horizon - t for t in qualified.values()) / horizon,
        "reached": bool(qualified), "first_seconds": first,
        "first_seconds_censored": horizon if first is None else first,
    }


def exact_sign_flip(values):
    values = np.asarray(values, dtype=float)
    if not np.all(np.isfinite(values)):
        raise ValueError("non-finite contrast")
    values = values[values != 0]  # Zero effects multiply numerator and denominator equally.
    if len(values) == 0:
        return 1.0
    if len(values) > 20:
        raise ValueError("exact enumeration capped at 20 seeds")
    target = abs(float(values.sum()))
    total = 1 << len(values)
    exceed = 0
    for start in range(0, total, 16384):
        codes = np.arange(start, min(total, start + 16384), dtype=np.uint64)
        signs = 2 * ((codes[:, None] >> np.arange(len(values), dtype=np.uint64)) & 1).astype(float) - 1
        sums = signs @ values
        exceed += int(np.count_nonzero(np.abs(sums) >= target - 1e-12))
    return exceed / total  # Exact distribution: no Monte Carlo +1 adjustment.


def bootstrap(values):
    values = np.asarray(values, dtype=float)
    rng = np.random.default_rng(SEED)
    means = rng.choice(values, size=(BOOTSTRAPS, len(values)), replace=True).mean(axis=1)
    return {
        "mean": float(values.mean()), "median": float(np.median(values)),
        "ci95": [float(v) for v in np.quantile(means, [0.025, 0.975])],
        "lower_one_sided95": float(np.quantile(means, 0.05)),
        "positive_seeds": int((values > 0).sum()), "negative_seeds": int((values < 0).sum()),
        "tied_seeds": int((values == 0).sum()),
    }


def holm(pvalues):
    result, running = {}, 0.0
    ordered = sorted(pvalues, key=pvalues.get)
    for i, key in enumerate(ordered):
        running = max(running, min(1.0, (len(ordered) - i) * pvalues[key]))
        result[key] = running
    return result


def factorial(e00, e03, e10, e13):
    a, b, c, d = (np.asarray(v, dtype=float) for v in (e00, e03, e10, e13))
    return {"early_publication": ((c + d) - (a + b)) / 2,
            "training_limit": ((b + d) - (a + c)) / 2,
            "interaction_exploratory": (d - b) - (c - a)}


def integrate(points, start, end, maximum_gap=120.0):
    """Trapezoidal integration on bracketed covered intervals, without extrapolation."""
    ordered = sorted(points)
    if any(ordered[i][0] >= ordered[i + 1][0] for i in range(len(ordered) - 1)):
        raise ValueError("duplicate or reversed sample timestamps")
    cpu_seconds = gib_seconds = covered = 0.0
    gaps = []
    for left, right in zip(ordered, ordered[1:]):
        t0, cpu0, ram0 = left
        t1, cpu1, ram1 = right
        lo, hi = max(start, t0), min(end, t1)
        if hi <= lo:
            continue
        gap = t1 - t0
        gaps.append(gap)
        if gap > maximum_gap or any(v is None for v in (cpu0, ram0, cpu1, ram1)):
            continue
        fraction0, fraction1 = (lo - t0) / gap, (hi - t0) / gap
        ca, cb = cpu0 + fraction0 * (cpu1 - cpu0), cpu0 + fraction1 * (cpu1 - cpu0)
        ra, rb = ram0 + fraction0 * (ram1 - ram0), ram0 + fraction1 * (ram1 - ram0)
        cpu_seconds += (ca + cb) / 2 * (hi - lo)
        gib_seconds += (ra + rb) / 2 * (hi - lo)
        covered += hi - lo
    return {"cpu_hours_observed": cpu_seconds / 3600, "gib_hours_observed": gib_seconds / 3600,
            "coverage_seconds": covered, "coverage_fraction": covered / (end - start),
            "uncovered_seconds": (end - start) - covered,
            "mean_cpu_cores_covered": cpu_seconds / covered if covered else None,
            "mean_ram_gib_covered": gib_seconds / covered if covered else None,
            "maximum_gap_seconds": max(gaps, default=None)}


def quantity_gib(text):
    value, unit = re.fullmatch(r"\s*([0-9.]+)\s*([A-Za-z]+)\s*", text).groups()
    factors = {"B": 1, "kB": 1000, "KB": 1000, "MB": 1000**2, "GB": 1000**3,
               "KiB": 1024, "MiB": 1024**2, "GiB": 1024**3, "TiB": 1024**4}
    return float(value) * factors[unit] / 1024**3


def resource_points(path, architecture):
    points, bad, background = [], 0, []
    expected = 1 if architecture == "monolith" else 6
    expected_services = {"grasp-fs-rcl-relieff", "grasp-fs-dls-iwssr", "grasp-fs-dls-vnd",
                         "grasp-fs-dls-verify", "kafka", "zookeeper"}
    for sample in jsonl(path):
        stamp = seconds(sample["timestamp_utc"])
        stats = sample.get("stats", [])
        try:
            if len(stats) != expected:
                raise ValueError("incomplete container sample")
            if architecture != "monolith" and any(
                    sum(str(item.get("Name", "")).endswith("-" + service + "-1") for item in stats) != 1
                    for service in expected_services):
                raise ValueError("wrong service set")
            cpu = sum(float(item["CPUPerc"].rstrip("%")) / 100 for item in stats)
            ram = sum(quantity_gib(item["MemUsage"].split("/")[0]) for item in stats)
            if not math.isfinite(cpu) or not math.isfinite(ram) or cpu < 0 or ram < 0:
                raise ValueError("invalid resource value")
            points.append((stamp, cpu, ram))
            names = {item.get("Name") for item in stats}
            others = sample.get("all_container_stats")
            if others is not None:
                background.append(sum(float(v["CPUPerc"].rstrip("%")) / 100
                                      for v in others if v.get("Name") not in names))
        except (ValueError, KeyError, TypeError, AttributeError):
            bad += 1
            points.append((stamp, None, None))  # Missing is not zero, and is not bridged.
    return points, bad, float(np.median(background)) if background else None


def verify_run(cell, directory):
    manifest = directory / "checksums.sha256"
    if sha(manifest) != cell["checksums_sha256"]:
        raise ValueError("checksum manifest changed")
    count = 0
    for line in manifest.read_text().splitlines():
        digest, relative = line.split("  ", 1)
        path = (directory / relative).resolve()
        if not path.is_relative_to(directory.resolve()) or sha(path) != digest:
            raise ValueError(f"artifact checksum mismatch: {path}")
        count += 1
    return count


def collect_run(cell, directory, protocol):
    result = read_json(directory / "final-result.json")
    if result["run_id"] != cell["run_id"] or result["seed"] != cell["seed"]:
        raise ValueError("result identity mismatch")
    for field in ("train", "validation", "test"):
        if result[field + "_hash"] != protocol["dataset"][field + "_sha256"]:
            raise ValueError("dataset identity mismatch")
    distributed = cell["architecture"] == "distributed"
    internal, published, confirmed = [], [], []
    early_lags, admissions = [], []
    late_count = 0
    if distributed:
        origin = seconds(result["measurement_started_utc"])
        origin_spread = 0.0
        offset = result["measurement_start_offset_ms"] / 1000
        for event in jsonl(directory / "best-solution-messages.jsonl"):
            if event.get("runId") != cell["run_id"]:
                raise ValueError("foreign run message")
            published.append((float(event["monotonicElapsedMs"]) / 1000 - offset,
                              float(event["f1Score"]), canonical(event["solutionFeatures"], True)))
        for line in (directory / "compose.log").read_text(encoding="utf-8").splitlines():
            match = INTERNAL.search(line)
            if match:
                t = float(match[3]) / 1000 - offset
                internal.append((t, float(match[1]), canonical(ast.literal_eval(match[2]), True)))
            match = CONFIRMED.search(line)
            stamp = STAMP.search(line)
            if match and stamp:
                confirmed.append((seconds(stamp[0]) - origin, float(match[1])))
            match = EARLY.search(line)
            if match:
                stamps = [STAMP.search(match[i]) for i in (1, 2)]
                if all(stamps):
                    early_lags.append(seconds(stamps[1][0]) - seconds(stamps[0][0]))
            match = ADMISSION.search(line)
            if match:
                admissions.append(tuple(map(int, match.groups())))
        deadline_internal = [v for v in internal if 0 <= v[0] <= HORIZON]
        if len(deadline_internal) != result["candidate_count"]:
            raise ValueError(f"internal trace count mismatch {directory}")
        if result["local_search_unclassified_evaluation_count"] != 0:
            raise ValueError("unclassified evaluations")
        trained = result["construction_evaluation_count"] + result["local_search_trained_evaluation_count"]
        memoized = result["local_search_memoized_evaluation_count"]
        if trained + memoized != result["candidate_count"] or memoized != 0:
            raise ValueError("v13 no-memoization counter mismatch")
        definition = next(a for a in protocol["arms"] if a["id"] == cell["arm"])
        if (result["iwssr_early_progress"] is not definition["early_progress"]
                or result["iwssr_training_max_concurrent"] != definition["training_limit"]):
            raise ValueError("factor identity mismatch")
        if not admissions or any(a[0] != definition["training_limit"] or
                (definition["training_limit"] and a[2] > definition["training_limit"]) for a in admissions):
            raise ValueError("training admission invariant violated")
        confirmed_times = [t for t, f in confirmed if 0 <= t <= HORIZON and f >= THRESHOLD]
        confirmed_first = min(confirmed_times, default=None)
    else:
        raw = list(jsonl(directory / "all-candidate-trace.jsonl"))
        if len(raw) != result["candidate_count"]:
            raise ValueError("monolith raw trace count mismatch")
        origins = [seconds(e["timestamp_utc"]) - e["monotonic_elapsed_ms"] / 1000 for e in raw]
        origin = float(np.median(origins))
        origin_spread = max(origins) - min(origins)
        for event in raw:
            internal.append((event["monotonic_elapsed_ms"] / 1000, event["validation_f1_macro"],
                             canonical(event["selected_features"])))
        for event in jsonl(directory / "best-solution-trace.jsonl"):
            published.append((event["monotonic_elapsed_ms"] / 1000, event["validation_f1_macro"],
                              canonical(event["selected_features"])))
        deadline_internal = [v for v in internal if 0 <= v[0] <= HORIZON]
        trained, memoized, confirmed_first = len(deadline_internal), 0, None
    late_count = sum(t > HORIZON for t, _, _ in internal)
    primary = yield_metrics(published)
    internal_yield = yield_metrics(internal)
    points, bad, background = resource_points(directory / "resource-samples.jsonl", cell["architecture"])
    resources = integrate(points, origin, origin + HORIZON)
    strict_resources = integrate(points, origin, origin + HORIZON, maximum_gap=60)
    first = primary["first_seconds"]
    # F1 round-trip through float fields may affect borderline threshold classifications.
    borderline = sum(abs(f - THRESHOLD) <= 1e-7 for t, f, _ in published if 0 <= t <= HORIZON)
    row = {
        "arm": cell["arm"], "seed": cell["seed"], "run_id": cell["run_id"],
        "published_auc": primary["auc"], "published_unique_subsets": primary["unique_subsets"],
        "published_qualified_subsets": primary["qualified_subsets"],
        "publication_event_reached": primary["reached"],
        "publication_event_first_seconds": first,
        "publication_event_first_seconds_censored": primary["first_seconds_censored"],
        "consumer_confirmed_first_seconds": confirmed_first,
        "consumer_confirmed_first_seconds_censored": (
            HORIZON if confirmed_first is None else confirmed_first) if distributed else None,
        "consumer_confirmed_reached": confirmed_first is not None if distributed else None,
        "internal_unique_subsets": internal_yield["unique_subsets"],
        "internal_qualified_subsets": internal_yield["qualified_subsets"],
        "internal_auc_exploratory": internal_yield["auc"],
        "internal_completed_within_horizon": len(deadline_internal), "late_internal_completions": late_count,
        "trained_completed_within_horizon": trained, "memoized_completed_within_horizon": memoized,
        "evaluations_per_second": len(deadline_internal) / HORIZON,
        "early_publication_count": len(early_lags),
        "early_submit_delay_median_ms": 1000 * float(np.median(early_lags)) if early_lags else None,
        "admission_peak": max((a[2] for a in admissions), default=None),
        "origin_utc_seconds": origin, "origin_estimate_spread_ms": origin_spread * 1000,
        "resource_invalid_samples": bad, "resource_samples": len(points),
        "background_cpu_cores_median": background,
        "borderline_published_f1_count": borderline,
        "coverage_fraction_gap60_sensitivity": strict_resources["coverage_fraction"],
        "cpu_hours_gap60_sensitivity": strict_resources["cpu_hours_observed"],
        "end_to_end_seconds": result.get("end_to_end_time_ms", result.get("monotonic_elapsed_ms")) / 1000,
        "cold_start_end_to_end_seconds": result.get("cold_start_end_to_end_time_ms", 0) / 1000 if distributed else None,
        **resources,
    }
    for name in ("test_f1_macro", "validation_f1_macro", "test_precision_macro", "test_recall_macro",
                 "subset_size", "dimensionality_reduction_percent"):
        row[name] = result[name]
    return row


def comparisons(rows):
    by_arm = {arm: sorted([r for r in rows if r["arm"] == arm], key=lambda r: r["seed"]) for arm in ARMS}
    def values(arm, metric):
        return np.array([r[metric] for r in by_arm[arm]], dtype=float)
    primary = factorial(*(values(a, "published_auc") for a in ARMS[1:]))
    results = {}
    for name, differences in primary.items():
        results[name] = bootstrap(differences)
        results[name]["paired_differences"] = differences.tolist()
        results[name]["exact_two_sided_p"] = exact_sign_flip(differences)
    adjusted = holm({k: results[k]["exact_two_sided_p"] for k in ("early_publication", "training_limit")})
    for name in adjusted:
        results[name]["holm_p"] = adjusted[name]
    guardrails = {}
    secondary = {}
    metrics = ("published_auc", "test_f1_macro", "evaluations_per_second", "cpu_hours_observed",
               "gib_hours_observed", "publication_event_first_seconds_censored")
    for arm in ARMS[2:]:
        diff = values(arm, "test_f1_macro") - values(ARMS[1], "test_f1_macro")
        guardrails[arm] = bootstrap(diff)
        guardrails[arm]["margin"] = -0.005
        guardrails[arm]["noninferiority_supported_individually"] = guardrails[arm]["lower_one_sided95"] > -0.005
    for arm in ARMS[1:]:
        secondary[arm] = {m: bootstrap(values(arm, m) - values("monolith", m)) for m in metrics}
    summaries = {}
    for arm, data in by_arm.items():
        summary = {"runs": len(data)}
        for field in rows[0]:
            if field in ("arm", "seed", "run_id"):
                continue
            vals = [row[field] for row in data if type(row[field]) in (int, float, bool)]
            if vals:
                summary[field] = {"n": len(vals), "mean": float(np.mean(vals)),
                                  "median": float(np.median(vals)), "min": float(min(vals)), "max": float(max(vals))}
        summary["publication_event_successes"] = sum(r["publication_event_reached"] for r in data)
        summary["consumer_confirmed_successes"] = sum(r["consumer_confirmed_reached"] is True for r in data) if arm != "monolith" else None
        summaries[arm] = summary
    return {"primary_factorial": results, "quality_guardrails": guardrails,
            "secondary_descriptive_vs_monolith": secondary, "arm_summaries": summaries}


def markdown(result):
    summaries = result["arm_summaries"]
    lines = ["# Analise v13 - campanha completa", "",
             "100 execucoes; 20 sementes pareadas por configuracao. F1 na escala 0-1.",
             "e = publicacao antecipada; b = limite de avaliacoes simultaneas (0 = sem limite adicional).",
             "", "| Configuracao | AUC publicada media | Limiar atingido | F1 teste mediano | Avaliacoes/s medianas | CPU-h observadas medianas | GiB-h observadas medianas | Cobertura minima |",
             "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |"]
    for arm, s in summaries.items():
        lines.append(f"| {arm} | {s['published_auc']['mean']:.6f} | {s['publication_event_successes']}/20 | "
                     f"{s['test_f1_macro']['median']:.6f} | {s['evaluations_per_second']['median']:.5f} | "
                     f"{s['cpu_hours_observed']['median']:.4f} | {s['gib_hours_observed']['median']:.4f} | "
                     f"{100*s['coverage_fraction']['min']:.2f}% |")
    lines += ["", "## Efeitos primarios predefinidos", ""]
    for name, effect in result["primary_factorial"].items():
        lines.append(f"- {name}: diferenca media {effect['mean']:.6f}; IC95% {effect['ci95']}; "
                     f"p exato bilateral {effect['exact_two_sided_p']:.6g}; "
                     f"Holm {effect.get('holm_p', 'nao aplicado: interacao exploratoria')}.")
    lines += ["", "## Nao inferioridade de F1 versus e0-b0", ""]
    for arm, effect in result["quality_guardrails"].items():
        lines.append(f"- {arm}: limite inferior unilateral95% {effect['lower_one_sided95']:.6f}; "
                     f"margem -0,005; sustentada individualmente: {effect['noninferiority_supported_individually']}.")
    lines += ["", "## Definicoes e limitacoes", ""]
    lines += ["- " + item for item in result["limitations"]]
    lines += ["", "Dados por execucao: run-level.json. Contrastes e intervalos: analysis.json.",
              "Proveniencia, hashes, versoes e protocolo: provenance.json.",
              "Nenhum dado bruto foi alterado."]
    return "\n".join(lines) + "\n"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--state", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--results-root", type=Path)
    args = parser.parse_args()
    if args.output.exists():
        raise RuntimeError("refusing to overwrite analysis output; choose a new directory")
    state, frozen = read_json(args.state), read_json(args.state.with_name("frozen-manifest.json"))
    protocol = frozen["protocol"]
    if state["state"] != "CAMPAIGN_COMPLETED" or protocol["campaign_id"] != "gfshield-performance-2026-v13":
        raise RuntimeError("completed v13 campaign required")
    if protocol["measurement_window"]["selection_seconds"] != HORIZON or protocol["hypotheses"]["quality_threshold_validation_macro_f1"] != THRESHOLD:
        raise RuntimeError("frozen threshold/horizon mismatch")
    expected = {(a, s) for a in ARMS for s in range(150, 170)}
    observed = [(c["arm"], c["seed"]) for c in state["completed"]]
    if len(observed) != 100 or set(observed) != expected:
        raise RuntimeError("incomplete or duplicate paired design")
    rows, checked = [], 0
    for i, cell in enumerate(state["completed"]):
        directory = (args.results_root / cell["arm"] / f"seed-{cell['seed']}" / cell["run_id"]
                     if args.results_root else Path(cell["result_path"]).parent)
        checked += verify_run(cell, directory)
        rows.append(collect_run(cell, directory, protocol))
        if (i + 1) % 10 == 0:
            print(f"Verified and analyzed {i + 1}/100", flush=True)
    result = comparisons(rows)
    result["limitations"] = [
        "Metrica primaria usa apenas subconjuntos publicados em best-solution-messages/best-solution-trace; nao usa avaliacoes internas como substituto.",
        "Horario no JSON distribuido e evento do verificador, nao recebimento pelo cliente. Confirmacao de consumo Kafka e analisada separadamente pelos logs; nao comparar diretamente esse endpoint com escrita local do monolito.",
        "Falhas em atingir 0,945 permanecem censuradas em 2700 s; tempos censurados nao sao media apenas dos sucessos nem extrapolacao alem do prazo.",
        "CPU/GiB-h sao estimativas trapezoidais nas partes cobertas da janela, sem extrapolacao e sem substituir ausencias por zero. Lacunas acima de 120 s sao excluidas; ha sensibilidade a 60 s.",
        "Docker stats e amostrado, com timestamp capturado antes dos subprocessos; integral nao e contador cumulativo exato de CPU. Finalizacao/holdout sao excluidos por recorte temporal.",
        "Origem do monolito e estimada pela mediana de UTC menos tempo decorrido dos candidatos; dispersao dessa estimativa e reportada.",
        "Os dois testes primarios usam 20 sementes, enumeracao exata de sinais e Holm; intervalos bootstrap sao percentis de 20000 reamostragens pareadas. Interacao e contrastes com monolito sao exploratorios/descritivos.",
        "Nao inferioridade e avaliada individualmente, sem garantia simultanea para todas as configuracoes.",
        "Um host e uma divisao fixa dos dados; variabilidade entre datasets e monolito paralelo nao foram avaliados.",
        "Sementes replicam trajetorias aleatorias, nao hardware/dataset independentes. Teste de sinais assume permutabilidade/simetria sob a hipotese nula.",
        "Nenhuma configuracao foi omitida ou selecionada por F1 de teste. Casos proximos do limiar sao contabilizados para auditar arredondamento.",
    ]
    provenance = {
        "execution_commit": frozen["launch_commit"], "state_sha256": sha(args.state),
        "frozen_manifest_sha256": sha(args.state.with_name("frozen-manifest.json")),
        "analyzer_sha256": sha(Path(__file__)), "protocol": protocol,
        "python": platform.python_version(), "numpy": np.__version__,
        "artifact_checksums_verified": checked, "analysis_seed": SEED,
        "bootstrap_repetitions": BOOTSTRAPS,
        "primary_p_method": "exact two-sided sign flips, Holm across two main effects",
    }
    args.output.mkdir(parents=True)
    for name, value in (("run-level.json", rows), ("analysis.json", result), ("provenance.json", provenance)):
        (args.output / name).write_text(json.dumps(value, indent=2, ensure_ascii=False, allow_nan=False) + "\n", encoding="utf-8")
    (args.output / "REPORT.md").write_text(markdown(result), encoding="utf-8")
    print(json.dumps({"verified": checked, "primary": result["primary_factorial"]}, indent=2))


if __name__ == "__main__":
    main()
