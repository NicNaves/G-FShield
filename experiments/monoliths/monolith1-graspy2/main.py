#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Monolithic Python replica of the GRASP feature-selection flow (sem liac-arff).

Registra no CSV:
- featureSelector, localSearch
- phase (initial | search), generation, iteration
Cabeçalho:
solutionFeatures;f1Score;accuracy;precision;recall;runningTime(ms);cpuUsage(%);memoryUsage(MB);memoryUsagePercent(%);classifier;featureSelector;localSearch;phase;generation;iteration;trainingFileName;testingFileName
"""

import argparse
import atexit
import base64
import hashlib
import json
import math
import os
import random
import subprocess
import threading
import time
import csv
import re
from collections import Counter
from datetime import datetime, timezone
from typing import List, Tuple

import numpy as np
import pandas as pd
import sklearn

try:
    import psutil
except Exception:
    psutil = None

from sklearn.tree import DecisionTreeClassifier
from sklearn.ensemble import RandomForestClassifier
from sklearn.naive_bayes import GaussianNB
from sklearn.metrics import f1_score, precision_score, recall_score, accuracy_score

CSV_HEADER = (
    "solutionFeatures;f1Score;accuracy;precision;recall;runningTime(ms);cpuUsage(%);"
    "memoryUsage(MB);memoryUsagePercent(%);classifier;featureSelector;localSearch;phase;"
    "generation;iteration;trainingFileName;testingFileName"
)

WEKA_EVALUATOR = None
WEKA_SPLIT_BY_OBJECT_ID = {}


class WekaEvaluatorClient:
    def __init__(self, jar, training, validation, testing):
        self.process = subprocess.Popen(
            ["java", "-jar", jar, "--train", training,
             "--validation", validation, "--test", testing],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            text=True,
            bufsize=1,
        )
        ready = self.process.stdout.readline().strip()
        if ready != "READY\tweka-stable-3.8.6\tJ48-default":
            raise RuntimeError(f"Weka evaluator did not become ready: {ready}")
        atexit.register(self.close)

    def evaluate(self, split, features):
        self.process.stdin.write(
            f"{split}\t{','.join(str(feature) for feature in features)}\n"
        )
        self.process.stdin.flush()
        response = self.process.stdout.readline().strip().split("\t")
        if not response or response[0] != "OK":
            raise RuntimeError("Weka evaluation failed: " + "\t".join(response))
        values = [float(value) for value in response[1:8]]
        labels = []
        per_class = {}
        confusion_matrix = []
        if len(response) >= 12:
            labels = [
                base64.urlsafe_b64decode(value + "=" * (-len(value) % 4)).decode("utf-8")
                for value in response[9].split(",") if value
            ]
            per_class_rows = [
                [float(value) for value in row.split(",")]
                for row in response[10].split(";") if row
            ]
            confusion_matrix = [
                [float(value) for value in row.split(",")]
                for row in response[11].split(";") if row
            ]
            per_class = {
                label: {"f1": row[0], "precision": row[1], "recall": row[2]}
                for label, row in zip(labels, per_class_rows)
            }
        return {
            "f1": values[0], "f1_weighted": values[1],
            "precision": values[2], "precision_weighted": values[3],
            "recall": values[4], "recall_weighted": values[5],
            "accuracy": values[6],
            "class_labels": labels,
            "per_class_metrics": per_class,
            "confusion_matrix": confusion_matrix,
        }

    def close(self):
        if self.process.poll() is None:
            try:
                self.process.stdin.write("QUIT\n")
                self.process.stdin.flush()
                self.process.wait(timeout=10)
            except Exception:
                self.process.terminate()

# ================================
# Leitura ARFF/CSV
# ================================

def _clean_df(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df.columns = [str(c).strip() for c in df.columns]
    df.replace({"?": np.nan}, inplace=True)
    return df

def _load_arff_simple(path: str) -> pd.DataFrame:
    """Leitor ARFF simples (sem liac-arff), compatível com Weka comum."""
    attr_names, data_rows, in_data = [], [], False
    with open(path, 'r', encoding='utf-8') as f:
        for raw in f:
            line = raw.strip()
            if not line or line.startswith('%'):
                continue
            low = line.lower()
            if not in_data:
                if low.startswith('@attribute'):
                    m = re.match(r"@attribute\s+('.*?'|\".*?\"|[^\s]+)\s+.+", line, flags=re.I)
                    if m:
                        name = m.group(1).strip("\"'")
                        attr_names.append(name)
                elif low.startswith('@data'):
                    in_data = True
            else:
                row = next(csv.reader([line]))
                row = [None if (v is None or v.strip() == '?') else v.strip() for v in row]
                if len(row) < len(attr_names):
                    row += [None] * (len(attr_names) - len(row))
                data_rows.append(row[:len(attr_names)])
    return _clean_df(pd.DataFrame(data_rows, columns=attr_names))

def read_dataset(path: str) -> pd.DataFrame:
    if path.lower().endswith('.arff'):
        return _load_arff_simple(path)
    try:
        return _clean_df(pd.read_csv(path))
    except Exception:
        return _clean_df(pd.read_csv(path, sep=';'))

# ================================
# Util – label resiliente
# ================================

def resolve_label_column(df: pd.DataFrame, user_label: str | None) -> str:
    cols = list(df.columns)
    if user_label and user_label in df.columns:
        return user_label
    if user_label:
        wanted = user_label.strip().lower()
        for c in cols:
            if c.strip().lower() == wanted:
                return c
        raise KeyError(f"Coluna de rótulo '{user_label}' não encontrada. Disponíveis: {cols}")
    return cols[-1]  # fallback: última coluna

# ================================
# Pré-processamento
# ================================

def ensure_numeric_train_test(train_df: pd.DataFrame, test_df: pd.DataFrame, feature_cols: List[str]):
    Xtr = train_df[feature_cols].copy()
    Xte = test_df[feature_cols].copy()
    for c in feature_cols:
        if pd.api.types.is_numeric_dtype(Xtr[c]):
            med = pd.to_numeric(Xtr[c], errors='coerce').median()
            Xtr[c] = pd.to_numeric(Xtr[c], errors='coerce').fillna(med)
            Xte[c] = pd.to_numeric(Xte[c], errors='coerce').fillna(med)
        else:
            tr_str = Xtr[c].astype('string')
            codes, uniques = pd.factorize(tr_str, sort=False)
            Xtr[c] = codes
            map_dict = {u: i for i, u in enumerate(uniques)}
            Xte[c] = Xte[c].astype('string').map(map_dict).fillna(-1).astype(int)
    return Xtr.values, Xte.values

# ================================
# Scorers
# ================================

def discretize_series(s: pd.Series, bins=10) -> List[int]:
    s_num = pd.to_numeric(s, errors='coerce')
    frac_numeric = s_num.notna().mean()
    if frac_numeric >= 0.5:
        cats = pd.cut(s_num, bins=bins, labels=False, duplicates='drop')
        return cats.fillna(-1).astype('int').tolist()
    codes, _ = pd.factorize(s.astype('string'), sort=False)
    return pd.Series(codes).fillna(-1).astype(int).tolist()

def entropy(labels: List[int]) -> float:
    total = len(labels)
    if total == 0:
        return 0.0
    counts = Counter(labels)
    return -sum((c/total) * math.log2(c/total) for c in counts.values() if c > 0)

def information_gain(feature: List[int], labels: List[int]) -> float:
    H_y = entropy(labels)
    total = len(labels)
    vals = {}
    for f, y in zip(feature, labels):
        vals.setdefault(f, []).append(y)
    cond_ent = sum((len(v)/total) * entropy(v) for v in vals.values())
    return H_y - cond_ent

def intrinsic_value(feature: List[int]) -> float:
    total = len(feature)
    counts = Counter(feature)
    return -sum((c/total) * math.log2(c/total) for c in counts.values() if c > 0)

def score_infogain(df: pd.DataFrame, label_col: str):
    yb = discretize_series(df[label_col])
    scores = []
    for col in df.columns:
        if col == label_col:
            continue
        xb = discretize_series(df[col])
        ig = information_gain(xb, yb)
        scores.append((col, ig))
    return sorted(scores, key=lambda x: x[1], reverse=True)

def score_gainratio(df: pd.DataFrame, label_col: str):
    yb = discretize_series(df[label_col])
    scores = []
    for col in df.columns:
        if col == label_col:
            continue
        xb = discretize_series(df[col])
        ig = information_gain(xb, yb)
        iv = intrinsic_value(xb)
        gr = ig/iv if iv > 0 else 0.0
        scores.append((col, gr))
    return sorted(scores, key=lambda x: x[1], reverse=True)

# ================================
# Métricas CPU/Mem (bug _stop corrigido)
# ================================

class MetricsCollector(threading.Thread):
    def __init__(self, interval=0.05):
        super().__init__()
        self.interval = interval
        self._stop_evt = threading.Event()  # << corrigido
        self.cpu, self.mem, self.mem_pct = [], [], []
        self.proc = psutil.Process(os.getpid()) if psutil else None

    def run(self):
        if self.proc:
            self.proc.cpu_percent(None)
        while not self._stop_evt.is_set():
            if self.proc:
                self.cpu.append(self.proc.cpu_percent(None))
                m = self.proc.memory_info()
                self.mem.append(m.rss/(1024*1024))
                self.mem_pct.append(self.proc.memory_percent())
            time.sleep(self.interval)

    def stop(self):
        self._stop_evt.set()

    def avg_cpu(self): return float(np.mean(self.cpu)) if self.cpu else 0.0
    def avg_mem(self): return float(np.mean(self.mem)) if self.mem else 0.0
    def avg_mem_percent(self): return float(np.mean(self.mem_pct)) if self.mem_pct else 0.0

# ================================
# Avaliação / logging
# ================================

def evaluate_solution(features, train_df, test_df, label_col, classifier):
    if classifier.lower() == 'j48':
        split = WEKA_SPLIT_BY_OBJECT_ID.get(id(test_df))
        if WEKA_EVALUATOR is None or split is None:
            raise RuntimeError("Weka evaluator or split mapping is not initialized")
        feature_indices = [int(train_df.columns.get_loc(feature)) for feature in features]
        return WEKA_EVALUATOR.evaluate(split, feature_indices)
    train_df = train_df.dropna(subset=[label_col])
    test_df = test_df.dropna(subset=[label_col])
    Xtr, Xte = ensure_numeric_train_test(train_df, test_df, features)
    ytr, yte = train_df[label_col].values, test_df[label_col].values
    name = classifier.lower()
    if name in ('cart','decisiontree','dt'):
        clf = DecisionTreeClassifier(random_state=0)
    elif name in ('nb','naivebayes'):
        clf = GaussianNB()
    elif name in ('rf','randomforest'):
        clf = RandomForestClassifier(random_state=0)
    else:
        raise ValueError(f"Unsupported classifier {classifier}")
    clf.fit(Xtr, ytr)
    preds = clf.predict(Xte)
    return dict(
        f1 = float(f1_score(yte, preds, average='macro')),
        f1_weighted = float(f1_score(yte, preds, average='weighted')),
        precision = float(precision_score(yte, preds, average='macro', zero_division=0)),
        precision_weighted = float(precision_score(yte, preds, average='weighted', zero_division=0)),
        recall = float(recall_score(yte, preds, average='macro', zero_division=0)),
        recall_weighted = float(recall_score(yte, preds, average='weighted', zero_division=0)),
        accuracy = float(accuracy_score(yte, preds))
    )


def sha256_file(path: str) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()

def write_metrics(writer, feats, metrics, elapsed, mc,
                  clf, feature_selector, local_search, phase, generation, iteration,
                  tr, te):
    line = [
        str(feats),
        f"{metrics['f1']:.4f}",
        f"{metrics['accuracy']:.4f}",
        f"{metrics['precision']:.4f}",
        f"{metrics['recall']:.4f}",
        str(elapsed),
        f"{mc.avg_cpu():.4f}",
        f"{mc.avg_mem():.4f}",
        f"{mc.avg_mem_percent():.4f}",
        clf,
        feature_selector,
        local_search,
        phase,
        str(generation),
        str(iteration),
        tr,
        te
    ]
    writer.write(";".join(line) + "\n")

# ================================
# Busca local
# ================================

def initial_solution_from_ranking(ranked, sample_size, rcl_cutoff, seed=None):
    cols = [c for c,_ in ranked]
    sol = cols[:sample_size]
    pool = [c for c in cols[sample_size:] if c not in sol]
    rcl = pool[:rcl_cutoff]
    return sol, rcl

def bitflip_search(data, train, validation, label, clf, iters, writer,
                   feature_selector, local_search, generation, rng, deadline,
                   minimum_improvement):
    sol = list(data['solutionFeatures'])
    rcl = list(data['rclfeatures'])
    best = sol.copy()
    best_m = evaluate_solution(sol, train, validation, label, clf)
    data['candidate_count'] += 1

    for it in range(1, iters+1):
        if not rcl or time.monotonic() >= deadline:
            break
        inx = rng.randrange(len(rcl))
        outx = rng.randrange(len(sol))
        new = sol.copy()
        new[outx] = rcl[inx]

        start = time.time()
        mc = MetricsCollector(); mc.start()
        try:
            m = evaluate_solution(new, train, validation, label, clf)
        finally:
            mc.stop(); mc.join()
        data['candidate_count'] += 1
        elapsed = int((time.time() - start) * 1000)

        write_metrics(writer, new, m, elapsed, mc,
                      clf, feature_selector, local_search, "search", generation, it,
                      data['trainingFileName'], data['testingFileName'])

        if m['f1'] >= best_m['f1'] + minimum_improvement:
            old = sol[outx]
            best, best_m = new, m
            sol = new
            rcl[inx] = old
            data['accepted_improvements'] += 1
            if data['accepted_improvements'] >= data['max_accepted_improvements']:
                break
    return best, best_m

# ================================
# Main
# ================================

def main():
    p = argparse.ArgumentParser()
    p.add_argument('--training', required=True)
    p.add_argument('--validation', required=True)
    p.add_argument('--testing', required=True)
    p.add_argument('--label-col', default=None)
    p.add_argument('--max-generations', type=int, default=5)
    p.add_argument('--rcl-cutoff', type=int, default=10)
    p.add_argument('--sample-size', type=int, default=5)
    p.add_argument('--feature-selector', choices=['gainratio','infogain'], default='gainratio')
    p.add_argument('--local-search', choices=['bitflip'], default='bitflip')
    p.add_argument('--classifier', choices=['cart','j48','nb','rf'], default='cart')
    p.add_argument('--metrics-file', default='metrics/GainRatio_METRICS.csv')
    p.add_argument('--seed', type=int, default=0)
    p.add_argument('--max-iterations-local', type=int, default=50)
    p.add_argument('--run-timeout-seconds', type=int, default=7200)
    p.add_argument('--final-evaluation-reserve-seconds', type=int, default=300)
    p.add_argument('--max-accepted-improvements', type=int, default=500)
    p.add_argument('--minimum-improvement', type=float, default=0.0001)
    p.add_argument('--campaign-id', required=True)
    p.add_argument('--arm-id', required=True)
    p.add_argument('--run-id', required=True)
    p.add_argument('--final-metrics-file', default='metrics/final-result.json')
    p.add_argument('--dataset-hash', default='')
    p.add_argument('--weka-evaluator-jar', default='/app/common-weka-evaluator.jar')
    a = p.parse_args()

    # The per-run budget covers the complete application lifecycle, including
    # dataset loading, feature ranking, and evaluator startup.
    started_monotonic = time.monotonic()
    selection_seconds = max(
        1,
        a.run_timeout_seconds - a.final_evaluation_reserve_seconds,
    )
    deadline = started_monotonic + selection_seconds

    random.seed(a.seed); np.random.seed(a.seed)
    out_dir = os.path.dirname(a.metrics_file)
    if out_dir: os.makedirs(out_dir, exist_ok=True)

    train = read_dataset(a.training)
    validation = read_dataset(a.validation)
    test = read_dataset(a.testing)
    global WEKA_EVALUATOR, WEKA_SPLIT_BY_OBJECT_ID
    WEKA_SPLIT_BY_OBJECT_ID = {id(validation): "validation", id(test): "test"}
    if a.classifier == "j48":
        WEKA_EVALUATOR = WekaEvaluatorClient(
            a.weka_evaluator_jar, a.training, a.validation, a.testing
        )
    label = resolve_label_column(train, a.label_col)

    ranked = score_gainratio(train, label) if a.feature_selector == 'gainratio' else score_infogain(train, label)
    cols = [c for c,_ in ranked]
    if a.sample_size >= len(cols):
        raise ValueError("sample-size deve ser menor que o número de features")

    sol, rcl = initial_solution_from_ranking(ranked, a.sample_size, a.rcl_cutoff, a.seed)
    data = {
        'solutionFeatures': sol,
        'rclfeatures': rcl,
        'trainingFileName': a.training,
        # Legacy CSV column name; search metrics use validation, not holdout test.
        'testingFileName': a.validation,
        'classifier': a.classifier,
        'seed': a.seed,
        'accepted_improvements': 0,
        'candidate_count': 1,
        'max_accepted_improvements': a.max_accepted_improvements,
    }
    rng = random.Random(a.seed)

    first_write = not os.path.exists(a.metrics_file) or os.path.getsize(a.metrics_file) == 0
    with open(a.metrics_file, 'a', encoding='utf-8', newline='') as mf:
        if first_write:
            mf.write(CSV_HEADER + '\n')

        # avaliação inicial
        start = time.perf_counter()
        mc = MetricsCollector(); mc.start()
        try:
            met = evaluate_solution(sol, train, validation, label, a.classifier)
        finally:
            mc.stop(); mc.join()
        elapsed = int((time.perf_counter() - start) * 1000)

        write_metrics(
            mf, sol, met, elapsed, mc,
            a.classifier, a.feature_selector, a.local_search,
            "initial", 0, 0,
            a.training, a.validation
        )

        # gerações
        best = sol
        bm = met
        stop_reason = "max_generations"
        for g in range(1, a.max_generations + 1):
            if time.monotonic() >= deadline:
                stop_reason = "run_timeout"
                break
            if data['accepted_improvements'] >= data['max_accepted_improvements']:
                stop_reason = "accepted_improvement_limit"
                break
            best, bm = bitflip_search(
                data, train, validation, label, a.classifier, a.max_iterations_local, mf,
                a.feature_selector, a.local_search, g, rng, deadline,
                a.minimum_improvement
            )
            data['solutionFeatures'] = best
            rem = [c for c in cols if c not in best]
            data['rclfeatures'] = rem[:a.rcl_cutoff]
            print(f"Generation {g}: F1={bm['f1']:.4f} Features={best}")

    # Consume the untouched test split only once, after model selection.
    test_started = time.perf_counter()
    test_metrics = evaluate_solution(best, train, test, label, a.classifier)
    test_elapsed_ms = int((time.perf_counter() - test_started) * 1000)
    train_hash = sha256_file(a.training)
    validation_hash = sha256_file(a.validation)
    test_hash = sha256_file(a.testing)
    dataset_hash = a.dataset_hash or hashlib.sha256(
        f"{train_hash}:{validation_hash}:{test_hash}".encode("ascii")
    ).hexdigest()
    elapsed_ms = int((time.monotonic() - started_monotonic) * 1000)
    if data['accepted_improvements'] >= data['max_accepted_improvements']:
        stop_reason = "accepted_improvement_limit"
    elif time.monotonic() >= deadline:
        stop_reason = "run_timeout"
    candidate_id = hashlib.sha256(
        f"{a.run_id}:{','.join(map(str, best))}".encode("utf-8")
    ).hexdigest()
    result = {
        "campaign_id": a.campaign_id,
        "arm_id": a.arm_id,
        "run_id": a.run_id,
        "seed": a.seed,
        "candidate_id": candidate_id,
        "parent_id": None,
        "request_id": f"{a.run_id}-monolith",
        "stage": "end_to_end",
        "algorithm": "GRASP-FS monolith1-graspy2",
        "feature_selector": a.feature_selector,
        "neighborhood_controller": None,
        "local_search": a.local_search,
        "classifier": a.classifier.upper(),
        "classifier_version": (
            "weka-stable 3.8.6" if a.classifier == "j48"
            else f"scikit-learn {sklearn.__version__}"
        ),
        "classifier_parameters": (
            {"weka_options": "J48 defaults"} if a.classifier == "j48"
            else {"random_state": 0}
        ),
        "dataset_hash": dataset_hash,
        "train_hash": train_hash,
        "validation_hash": validation_hash,
        "test_hash": test_hash,
        "selected_features": sorted(cols.index(feature) for feature in best),
        "subset_size": len(best),
        "dimensionality_reduction_percent": 100.0 * (1.0 - len(best) / len(cols)),
        "validation_f1_macro": bm["f1"],
        "validation_f1_weighted": bm["f1_weighted"],
        "validation_precision_macro": bm["precision"],
        "validation_precision_weighted": bm["precision_weighted"],
        "validation_recall_macro": bm["recall"],
        "validation_recall_weighted": bm["recall_weighted"],
        "test_f1_macro": test_metrics["f1"],
        "test_f1_weighted": test_metrics["f1_weighted"],
        "test_precision_macro": test_metrics["precision"],
        "test_recall_macro": test_metrics["recall"],
        "accuracy": test_metrics["accuracy"],
        "class_labels": test_metrics.get("class_labels", []),
        "validation_per_class_metrics": bm.get("per_class_metrics", {}),
        "validation_confusion_matrix": bm.get("confusion_matrix", []),
        "test_per_class_metrics": test_metrics.get("per_class_metrics", {}),
        "test_confusion_matrix": test_metrics.get("confusion_matrix", []),
        "candidate_time_ms": None,
        "classifier_time_ms": test_elapsed_ms,
        "run_elapsed_ms": elapsed_ms,
        "end_to_end_time_ms": elapsed_ms,
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "monotonic_elapsed_ms": elapsed_ms,
        "candidate_count": data['candidate_count'],
        "accepted_improvement_count": data['accepted_improvements'],
        "process_cpu_percent": None,
        "container_cpu_percent": None,
        "host_cpu_percent": None,
        "process_rss_mb": None,
        "container_memory_mb": None,
        "host_memory_mb": None,
        "cpu_throttled_seconds": None,
        "disk_read_bytes": None,
        "disk_write_bytes": None,
        "network_rx_bytes": None,
        "network_tx_bytes": None,
        "kafka_lag": None,
        "restart_count": None,
        "stop_reason": stop_reason,
        "status": "timeout" if stop_reason == "run_timeout" else "completed",
        "error_code": None,
    }
    final_path = os.path.abspath(a.final_metrics_file)
    final_dir = os.path.dirname(final_path)
    if final_dir:
        os.makedirs(final_dir, exist_ok=True)
    temporary_path = final_path + ".tmp"
    with open(temporary_path, "w", encoding="utf-8") as handle:
        json.dump(result, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")
    os.replace(temporary_path, final_path)

if __name__ == '__main__':
    main()
