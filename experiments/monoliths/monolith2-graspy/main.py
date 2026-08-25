#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import argparse
import atexit
import base64
import hashlib
import json
import os
import time
import random
import subprocess
import uuid
from datetime import datetime, timezone
from typing import List, Tuple, Iterable, Optional

import numpy as np
import pandas as pd
import psutil
import sklearn

from sklearn import set_config
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder
from sklearn.metrics import f1_score, precision_score, recall_score, accuracy_score
from sklearn.tree import DecisionTreeClassifier
from sklearn.naive_bayes import GaussianNB
from sklearn.ensemble import RandomForestClassifier

# Força saída NumPy
set_config(transform_output="default")

try:
    import arff  # liac-arff
except Exception:
    arff = None


RUN_DEADLINE = float("inf")
MAX_ACCEPTED_IMPROVEMENTS = 0
MINIMUM_IMPROVEMENT = 0.0001
ACCEPTED_IMPROVEMENTS = 0
CANDIDATE_COUNT = 0
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
            "prec": values[2], "prec_weighted": values[3],
            "rec": values[4], "rec_weighted": values[5],
            "acc": values[6],
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


def stop_requested() -> bool:
    return (
        time.monotonic() >= RUN_DEADLINE
        or ACCEPTED_IMPROVEMENTS >= MAX_ACCEPTED_IMPROVEMENTS
    )


def sha256_file(path: str) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


# =============================================================================
# CSV writer com buffer, flush e (opcional) fsync
# =============================================================================
class FlushCSV:
    def __init__(self, fh, delimiter=";", do_fsync=False, flush_every=50):
        import csv as _csv
        self._fh = fh
        self._w = _csv.writer(fh, delimiter=delimiter, lineterminator="\n")
        self._do_fsync = do_fsync
        self._flush_every = max(1, int(flush_every))
        self._pending = 0

    def writerow(self, row):
        self._w.writerow(row)
        self._pending += 1
        if self._pending >= self._flush_every:
            self.flush()

    def flush(self):
        if self._pending <= 0:
            return
        self._fh.flush()
        if self._do_fsync:
            try:
                os.fsync(self._fh.fileno())
            except OSError:
                pass
        self._pending = 0


# =============================================================================
# Utils: I/O
# =============================================================================
def read_arff(path: str) -> pd.DataFrame:
    if arff is None:
        raise RuntimeError("liac-arff não está instalado. Faça: pip install liac-arff")
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        data = arff.load(f)
    cols = [a[0] for a in data["attributes"]]
    df = pd.DataFrame(data["data"], columns=cols)
    return df


def load_dataset(path: str) -> pd.DataFrame:
    ext = os.path.splitext(path)[1].lower()
    if ext == ".arff":
        return read_arff(path)
    return pd.read_csv(path)


def split_xy(df: pd.DataFrame):
    X = df.iloc[:, :-1].copy()
    y = df.iloc[:, -1].copy()
    return X, y


# =============================================================================
# Métricas de sistema (opcional)
# =============================================================================
def get_system_metrics(enabled: bool):
    if not enabled:
        return ("", "", "")
    cpu_pct = psutil.cpu_percent(interval=0.0)  # sem espera
    mem_info = psutil.Process(os.getpid()).memory_info()
    mem_mb = mem_info.rss / (1024 * 1024)
    mem_pct = psutil.virtual_memory().percent
    return (f"{cpu_pct:.4f}", f"{mem_mb:.3f}", f"{mem_pct:.3f}")


# =============================================================================
# Pré-processamento
# =============================================================================
def _ohe_compat():
    try:
        return OneHotEncoder(handle_unknown="ignore", sparse_output=False)
    except TypeError:
        return OneHotEncoder(handle_unknown="ignore", sparse=False)

def build_preprocessor_by_index(X_subset: pd.DataFrame) -> ColumnTransformer:
    n = X_subset.shape[1]
    num_idx = [i for i in range(n) if pd.api.types.is_numeric_dtype(X_subset.iloc[:, i])]
    cat_idx = [i for i in range(n) if i not in num_idx]

    transformers = []
    if cat_idx:
        transformers.append(("cat", _ohe_compat(), cat_idx))
    if num_idx:
        transformers.append(("num", "passthrough", num_idx))

    pre = ColumnTransformer(
        transformers=transformers,
        remainder="drop",
        verbose_feature_names_out=False,
        n_jobs=None,
    )
    try:
        pre.set_output(transform="default")
    except Exception:
        pass
    return pre


# =============================================================================
# Classificadores
# =============================================================================
def get_classifier(name: str):
    name = name.upper()
    if name == "J48":
        raise ValueError(
            "J48 is the Weka implementation and cannot be mapped silently to "
            "sklearn.tree.DecisionTreeClassifier; use CART outside the paired "
            "campaign or configure the common Weka evaluator"
        )
    if name in ("CART", "DT"):
        return DecisionTreeClassifier(random_state=0)
    if name in ("NB", "NAIVEBAYES"):
        return GaussianNB()
    if name in ("RF", "RANDOMFOREST"):
        return RandomForestClassifier(n_estimators=200, random_state=0)
    raise ValueError(f"classificador não suportado: {name}")


# =============================================================================
# Avaliação (SEM CACHE de pipeline)
# =============================================================================
def evaluate_subset(X_train, y_train, X_test, y_test, feat_idx0b: List[int], clf_name: str):
    global CANDIDATE_COUNT
    CANDIDATE_COUNT += 1
    if not feat_idx0b:
        return {"f1": 0.0, "acc": 0.0, "prec": 0.0, "rec": 0.0}
    if clf_name.upper() == "J48":
        split = WEKA_SPLIT_BY_OBJECT_ID.get(id(X_test))
        if WEKA_EVALUATOR is None or split is None:
            raise RuntimeError("Weka evaluator or split mapping is not initialized")
        return WEKA_EVALUATOR.evaluate(split, feat_idx0b)
    Xtr = X_train.iloc[:, feat_idx0b]
    Xte = X_test.iloc[:, feat_idx0b]

    pre = build_preprocessor_by_index(Xtr)
    clf = get_classifier(clf_name)
    model = Pipeline([("prep", pre), ("clf", clf)])
    try:
        model.set_output(transform="default")
    except Exception:
        pass

    model.fit(Xtr, y_train)
    y_pred = model.predict(Xte)

    return {
        "f1": f1_score(y_test, y_pred, average="macro", zero_division=0),
        "f1_weighted": f1_score(y_test, y_pred, average="weighted", zero_division=0),
        "acc": accuracy_score(y_test, y_pred),
        "prec": precision_score(y_test, y_pred, average="macro", zero_division=0),
        "prec_weighted": precision_score(y_test, y_pred, average="weighted", zero_division=0),
        "rec": recall_score(y_test, y_pred, average="macro", zero_division=0),
        "rec_weighted": recall_score(y_test, y_pred, average="weighted", zero_division=0),
    }


# =============================================================================
# FS (IG / GR / SU)
# =============================================================================
def _entropy_from_series(s: pd.Series, n_bins: int = 10) -> float:
    if pd.api.types.is_numeric_dtype(s):
        try:
            cats = pd.qcut(s, q=min(n_bins, max(2, s.nunique())), duplicates="drop")
        except Exception:
            cats = s.astype("category")
    else:
        cats = s.astype("category")
    counts = cats.value_counts(dropna=False).to_numpy(dtype=float)
    p = counts / counts.sum()
    p = p[p > 0]
    return float(-(p * np.log2(p)).sum())


def _mutual_info(X: pd.DataFrame, y: pd.Series) -> np.ndarray:
    from sklearn.feature_selection import mutual_info_classif
    X_ = X.copy()
    for i in range(X_.shape[1]):
        if not pd.api.types.is_numeric_dtype(X_.iloc[:, i]):
            X_.iloc[:, i] = X_.iloc[:, i].astype("category").cat.codes
    y_codes = y.astype("category").cat.codes
    discrete_mask = [not pd.api.types.is_numeric_dtype(X.iloc[:, i]) or X.iloc[:, i].nunique() < 10 for i in range(X.shape[1])]
    return mutual_info_classif(X_.to_numpy(), y_codes, discrete_features=discrete_mask, random_state=0)


def rank_features(X: pd.DataFrame, y: pd.Series, fs_algo: str) -> List[Tuple[int, float]]:
    fs = fs_algo.lower()
    mi = _mutual_info(X, y)
    if fs == "ig":
        scores = mi
    elif fs == "gr":
        ent = np.array([_entropy_from_series(X.iloc[:, i]) for i in range(X.shape[1])], dtype=float)
        ent[ent == 0] = 1e-12
        scores = mi / ent
    elif fs == "su":
        Hy = _entropy_from_series(y.astype("category").cat.codes)
        Hx = np.array([_entropy_from_series(X.iloc[:, i]) for i in range(X.shape[1])], dtype=float)
        Hx[Hx == 0] = 1e-12
        denom = Hx + (Hy if Hy > 0 else 1e-12)
        scores = 2.0 * mi / denom
    else:
        raise ValueError("fs_algo inválido (use su|ig|gr)")
    ranked = sorted([(i, float(scores[i])) for i in range(X.shape[1])], key=lambda t: t[1], reverse=True)
    return ranked


# =============================================================================
# Construção (ALEATÓRIA como no Java)
# =============================================================================
def construct_initial_solution(
    ranked: List[Tuple[int, float]],
    rcl_size: int,
    subset_size: int,
    Xtr, ytr, Xte, yte, clf_name: str,
    writer, classifier_name: str, train_name: str, test_name: str,
    seed_id: str, log_sys_metrics: bool
) -> Tuple[List[int], List[int]]:
    rcl = [i for i, _ in ranked[:max(1, rcl_size)]]
    universe = list(range(Xtr.shape[1]))

    if len(rcl) >= subset_size:
        S = sorted(random.sample(rcl, subset_size))
    else:
        S = rcl[:]
        faltam = subset_size - len(S)
        resto = [u for u in universe if u not in S]
        random.shuffle(resto)
        S.extend(resto[:faltam])
        S = sorted(S)

    R = [i for i in rcl if i not in S]

    t0 = time.perf_counter()
    met_S = evaluate_subset(Xtr, ytr, Xte, yte, S, clf_name)
    run_ms = int((time.perf_counter() - t0) * 1000.0)
    cpu, mem, memp = get_system_metrics(log_sys_metrics)
    writer.writerow([
        str(S),
        f"{met_S['f1']:.6f}",
        f"{met_S['acc']:.6f}",
        f"{met_S['prec']:.6f}",
        f"{met_S['rec']:.6f}",
        run_ms, cpu, mem, memp,
        classifier_name, train_name, test_name, seed_id
    ])
    return S, R


# =============================================================================
# Helpers
# =============================================================================
def _fix_cardinality(nei: List[int], universe: List[int], k: int) -> List[int]:
    nei = list(dict.fromkeys(nei))
    if len(nei) < k:
        free = [u for u in universe if u not in nei]
        random.shuffle(free)
        nei.extend(free[:(k - len(nei))])
    elif len(nei) > k:
        nei = nei[:k]
    return sorted(nei)


# =============================================================================
# Operadores
# =============================================================================
def op_iwss_stream(S, R, Xtr, ytr, Xte, yte, clf_name):
    if not S or not R:
        return
    t_start = time.perf_counter()
    base = evaluate_subset(Xtr, ytr, Xte, yte, S, clf_name)["f1"]
    universe = list(range(Xtr.shape[1]))
    k = len(S)

    best_gain, best = 0.0, None
    for i_pos, _ in enumerate(S):
        for r_idx, r in enumerate(R):
            if stop_requested():
                return
            cand = S[:]
            cand[i_pos] = r
            cand = _fix_cardinality(cand, universe, k)
            met = evaluate_subset(Xtr, ytr, Xte, yte, cand, clf_name)
            gain = met["f1"] - base
            if gain >= best_gain + MINIMUM_IMPROVEMENT:
                best_gain, best = gain, (cand, r_idx, i_pos, met)

    if best is not None:
        cand, r_idx, i_pos, met = best
        out = S[i_pos]
        R[r_idx] = out
        S[:] = sorted(cand)
        elapsed_ms = int((time.perf_counter() - t_start) * 1000.0)
        yield S[:], "IWSS", met, elapsed_ms


def op_iwssr_stream(S, R, Xtr, ytr, Xte, yte, clf_name, subset_size: Optional[int] = None):
    if not R:
        return
    universe = list(range(Xtr.shape[1]))
    k = len(S)
    improved = True

    while improved:
        if stop_requested():
            return
        improved = False
        t_start = time.perf_counter()
        base = evaluate_subset(Xtr, ytr, Xte, yte, S, clf_name)["f1"]

        if subset_size is not None and len(S) < subset_size and len(R) > 0:
            for r in list(R):
                if stop_requested():
                    return
                cand = sorted(S + [r])
                met = evaluate_subset(Xtr, ytr, Xte, yte, cand, clf_name)
                if met["f1"] >= base + MINIMUM_IMPROVEMENT:
                    S[:] = cand
                    try:
                        R.remove(r)
                    except ValueError:
                        pass
                    elapsed_ms = int((time.perf_counter() - t_start) * 1000.0)
                    yield S[:], "IWSSR_ADD", met, elapsed_ms
                    improved = True
                    k = len(S)
                    break
            if improved:
                continue

        for i_pos, _ in enumerate(S):
            for r_idx, r in enumerate(R):
                if stop_requested():
                    return
                cand = S[:]
                cand[i_pos] = r
                cand = _fix_cardinality(cand, universe, k)
                met = evaluate_subset(Xtr, ytr, Xte, yte, cand, clf_name)
                if met["f1"] >= base + MINIMUM_IMPROVEMENT:
                    out = S[i_pos]
                    S[:] = sorted(cand)
                    R[r_idx] = out
                    elapsed_ms = int((time.perf_counter() - t_start) * 1000.0)
                    yield S[:], "IWSSR_REP", met, elapsed_ms
                    improved = True
                    break
            if improved:
                break


def op_bitflip_stream(S, R, Xtr, ytr, Xte, yte, clf_name, tries: int):
    if tries <= 0 or not S or not R:
        return
    t_start = time.perf_counter()

    base = evaluate_subset(Xtr, ytr, Xte, yte, S, clf_name)["f1"]
    universe = list(range(Xtr.shape[1]))
    k = len(S)

    idx_S = list(range(len(S)))
    idx_R = list(range(len(R)))
    random.shuffle(idx_S)
    random.shuffle(idx_R)

    attempts = 0
    for i_pos in idx_S:
        for r_idx in idx_R:
            if attempts >= tries or stop_requested():
                return
            attempts += 1
            cand = S[:]
            cand[i_pos] = R[r_idx]
            cand = _fix_cardinality(cand, universe, k)
            met = evaluate_subset(Xtr, ytr, Xte, yte, cand, clf_name)
            if met["f1"] >= base + MINIMUM_IMPROVEMENT:
                out = S[i_pos]
                S[:] = sorted(cand)
                R[r_idx] = out
                elapsed_ms = int((time.perf_counter() - t_start) * 1000.0)
                yield S[:], "BIT_FLIP", met, elapsed_ms
                return


# =============================================================================
# Neighborhood picker
# =============================================================================
def pick_operator(neighborhood: str, last_idx: int, op_names: List[str]) -> Tuple[int, str]:
    if not op_names:
        op_names = ["iwssr"]
    if neighborhood.lower() == "rvnd":
        name = random.choice(op_names)
        return op_names.index(name), name
    next_idx = (last_idx + 1) % len(op_names)
    return next_idx, op_names[next_idx]


# =============================================================================
# Logs: cabeçalhos
# =============================================================================
def ensure_logs_dir():
    os.makedirs("logs", exist_ok=True)

def construct_headers():
    return [
        "solutionFeatures","f1Score","accuracy","precision","recall",
        "runnigTime(ms)","cpuUsage(%)","memoryUsage(MB)","memoryUsagePercent(%)",
        "classifier","trainingFileName","testingFileName","seedId"
    ]

def ls_headers():
    return [
        "solutionFeatures","f1Score","accuracy","precision","recall",
        "neighborhood","iterationNeighborhood","localSearch","iterationLocalSearch",
        "runnigTime(ms)","cpuUsage(%)","memoryUsage(MB)","memoryUsagePercent(%)",
        "classifier","trainingFileName","testingFileName","seedId"
    ]


# =============================================================================
# Local Search Loop — loga aceitações e, opcionalmente, iterações NONE sem recomputar métricas
# =============================================================================
def local_search_loop(S0: List[int], R: List[int],
                      Xtr, ytr, Xte, yte, clf_name: str,
                      neighborhood: str, iters: int,
                      bitflip_writer, iwss_writer, iwssr_writer,
                      train_name: str, test_name: str, seed_id: str,
                      iterNeighborhood: int,
                      ls_ops: List[str],
                      bitflip_tries: int,
                      subset_size: int,
                      log_all_iters: bool,
                      log_sys_metrics: bool) -> List[int]:
    global ACCEPTED_IMPROVEMENTS
    S = S0[:]
    last_vnd_idx = -1
    op_names = [op.strip().lower() for op in ls_ops if op.strip()]
    if not op_names:
        op_names = ["iwssr"]

    # cache de métricas do estado atual (evita reavaliar em NONE)
    last_metrics = evaluate_subset(Xtr, ytr, Xte, yte, S, clf_name)

    for it in range(1, iters + 1):
        if stop_requested():
            break
        op_idx, op_choice = pick_operator(neighborhood, last_vnd_idx, op_names)
        if neighborhood.lower() == "vnd":
            last_vnd_idx = op_idx

        t_iter = time.perf_counter()
        if op_choice == "bitflip":
            gen = op_bitflip_stream(S, R, Xtr, ytr, Xte, yte, clf_name, tries=bitflip_tries)
            target_writer = bitflip_writer
            none_tag = "BIT_FLIP_NONE"
        elif op_choice == "iwss":
            gen = op_iwss_stream(S, R, Xtr, ytr, Xte, yte, clf_name)
            target_writer = iwss_writer
            none_tag = "IWSS_NONE"
        else:
            gen = op_iwssr_stream(S, R, Xtr, ytr, Xte, yte, clf_name, subset_size=subset_size)
            target_writer = iwssr_writer
            none_tag = "IWSSR_NONE"

        accepted_any = False
        for cand, tag, met, elapsed_ms in gen:
            accepted_any = True
            ACCEPTED_IMPROVEMENTS += 1
            S[:] = cand  # S já vem atualizado, mas garantimos
            last_metrics = met  # atualiza cache com as métricas aceitas
            cpu, mem, memp = get_system_metrics(log_sys_metrics)
            target_writer.writerow([
                str(cand),
                f"{met['f1']:.6f}", f"{met['acc']:.6f}", f"{met['prec']:.6f}", f"{met['rec']:.6f}",
                neighborhood, iterNeighborhood, tag, it,
                elapsed_ms, cpu, mem, memp,
                clf_name.upper(), train_name, test_name, seed_id
            ])

        if (not accepted_any) and log_all_iters:
            elapsed_ms = int((time.perf_counter() - t_iter) * 1000.0)
            cpu, mem, memp = get_system_metrics(log_sys_metrics)
            target_writer.writerow([
                str(S),
                f"{last_metrics['f1']:.6f}", f"{last_metrics['acc']:.6f}",
                f"{last_metrics['prec']:.6f}", f"{last_metrics['rec']:.6f}",
                neighborhood, iterNeighborhood, none_tag, it,
                elapsed_ms, cpu, mem, memp,
                clf_name.upper(), train_name, test_name, seed_id
            ])

        if neighborhood.lower() == "vnd" and accepted_any:
            last_vnd_idx = -1

    return S


# =============================================================================
# CLI
# =============================================================================
def parse_args():
    p = argparse.ArgumentParser(
        "GRASP-FS (SU/IG/GR) + Neighborhood (RVND/VND) + IWSS/IWSSR/BitFlip (logs otimizados)"
    )
    p.add_argument("-tr", "--train", required=True, help="CSV/ARFF (classe na última coluna)")
    p.add_argument("--validation", required=True, help="Dataset used only for model selection")
    p.add_argument("-ts", "--test", required=True, help="Untouched holdout dataset")
    p.add_argument("--classifier", choices=["CART", "J48", "NB", "RF"], default="CART")
    p.add_argument("--fs_algos", default="ig,gr,su", help="Lista: su,ig,gr")
    p.add_argument("--neighborhoods", default="vnd,rvnd", help="Lista: rvnd,vnd")
    p.add_argument("--ls_ops", default="iwss,iwssr,bitflip", help="bitflip,iwss,iwssr (ordem no VND)")

    p.add_argument("--rcl_size", type=int, default=30)
    p.add_argument("--subset_size", type=int, default=5)

    p.add_argument("--ls_iters", type=int, default=50, help="iterações por operador")
    p.add_argument("--bitflip_tries", type=int, default=100, help="tentativas por iteração no bitflip (0=desliga)")

    p.add_argument("--build_restarts", type=int, default=3000, help="soluções iniciais por FS×Neighborhood")

    # LOG TUNING
    p.add_argument("--delimiter", default=";", help="separador de colunas nos CSV (padrão ;)")
    p.add_argument("--fsync_logs", type=int, default=0, help="1=fsync por flush; 0=apenas flush (mais rápido)")
    p.add_argument("--log_flush_every", type=int, default=50, help="flush/fsync a cada N linhas (padrão 50)")
    p.add_argument("--log_all_iters", type=int, default=1, help="1=logar iterações sem melhoria (*_NONE)")
    p.add_argument("--log_sys_metrics", type=int, default=1, help="1=registrar CPU/Mem; 0=desligar (mais rápido)")

    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--run_timeout_seconds", type=int, default=7200)
    p.add_argument("--final_evaluation_reserve_seconds", type=int, default=300)
    p.add_argument("--max_accepted_improvements", type=int, default=500)
    p.add_argument("--minimum_improvement", type=float, default=0.0001)
    p.add_argument("--campaign_id", required=True)
    p.add_argument("--arm_id", required=True)
    p.add_argument("--run_id", required=True)
    p.add_argument("--final_metrics_file", default="logs/final-result.json")
    p.add_argument("--dataset_hash", default="")
    p.add_argument("--weka_evaluator_jar", default="/app/common-weka-evaluator.jar")
    return p.parse_args()


# =============================================================================
# Main
# =============================================================================
def main():
    global RUN_DEADLINE, MAX_ACCEPTED_IMPROVEMENTS, MINIMUM_IMPROVEMENT
    global WEKA_EVALUATOR, WEKA_SPLIT_BY_OBJECT_ID
    args = parse_args()
    random.seed(args.seed)
    np.random.seed(args.seed)
    run_started = time.monotonic()
    selection_seconds = max(
        1,
        args.run_timeout_seconds - args.final_evaluation_reserve_seconds,
    )
    RUN_DEADLINE = run_started + selection_seconds
    MAX_ACCEPTED_IMPROVEMENTS = args.max_accepted_improvements
    MINIMUM_IMPROVEMENT = args.minimum_improvement

    ensure_logs_dir()

    # params string (separado por ';' para fácil transposição)
    params_row = [
        "RUN_PARAMS",
        f"train={args.train}", f"validation={args.validation}", f"test={args.test}",
        f"classifier={args.classifier}",
        f"fs_algos={args.fs_algos}", f"neighborhoods={args.neighborhoods}",
        f"ls_ops={args.ls_ops}",
        f"rcl_size={args.rcl_size}", f"subset_size={args.subset_size}",
        f"ls_iters={args.ls_iters}", f"bitflip_tries={args.bitflip_tries}",
        f"build_restarts={args.build_restarts}",
        f"seed={args.seed}", f"fsync_logs={args.fsync_logs}",
        f"log_flush_every={args.log_flush_every}",
        f"log_all_iters={args.log_all_iters}",
        f"log_sys_metrics={args.log_sys_metrics}",
    ]

    # erro.log para exceções
    err_path = "logs/errors.log"
    err_fh = open(err_path, "a", encoding="utf-8", buffering=1)

    def log_error(msg: str):
        ts = time.strftime("%Y-%m-%d %H:%M:%S")
        err_fh.write(f"[{ts}] {msg}\n")
        err_fh.flush()
        try:
            os.fsync(err_fh.fileno())
        except OSError:
            pass

    # carga de dados
    train_df = load_dataset(args.train)
    validation_df = load_dataset(args.validation)
    test_df = load_dataset(args.test)

    X_train, y_train = split_xy(train_df)
    X_validation, y_validation = split_xy(validation_df)
    X_holdout, y_holdout = split_xy(test_df)

    # padroniza nomes
    X_train.columns = pd.Index([f"c{i}" for i in range(X_train.shape[1])], dtype=object)
    X_validation.columns = pd.Index([f"c{i}" for i in range(X_validation.shape[1])], dtype=object)
    X_holdout.columns = pd.Index([f"c{i}" for i in range(X_holdout.shape[1])], dtype=object)
    WEKA_SPLIT_BY_OBJECT_ID = {
        id(X_validation): "validation",
        id(X_holdout): "test",
    }
    if args.classifier == "J48":
        WEKA_EVALUATOR = WekaEvaluatorClient(
            args.weka_evaluator_jar, args.train, args.validation, args.test
        )

    n_feats = X_train.shape[1]
    rcl_size = max(1, min(args.rcl_size, n_feats))
    subset_size = max(1, min(args.subset_size, n_feats))

    fs_list  = [fs.strip().lower() for fs in args.fs_algos.split(",") if fs.strip()]
    ngh_list = [ng.strip().lower() for ng in args.neighborhoods.split(",") if ng.strip()]
    ops_list = [op.strip().lower() for op in args.ls_ops.split(",") if op.strip()]

    train_name = os.path.basename(args.train)
    validation_name = os.path.basename(args.validation)
    best_solution = None
    best_validation = None
    best_configuration = None

    for fs in fs_list:
        if stop_requested():
            break
        try:
            ranked = rank_features(X_train, y_train, fs)
        except Exception as e:
            log_error(f"FS={fs}: rank_features falhou: {e}")
            continue

        for ngh in ngh_list:
            if stop_requested():
                break
            # arquivos de log por combinação
            f_construct_path = f"logs/construcao_{fs}_{ngh}.csv"
            f_bitflip_path   = f"logs/bitflip_{fs}_{ngh}.csv"
            f_iwss_path      = f"logs/iwss_{fs}_{ngh}.csv"
            f_iwssr_path     = f"logs/iwssr_{fs}_{ngh}.csv"

            try:
                with open(f_construct_path, "w", encoding="utf-8", newline="", buffering=1) as f_construct, \
                     open(f_bitflip_path,   "w", encoding="utf-8", newline="", buffering=1) as f_bitflip, \
                     open(f_iwss_path,      "w", encoding="utf-8", newline="", buffering=1) as f_iwss, \
                     open(f_iwssr_path,     "w", encoding="utf-8", newline="", buffering=1) as f_iwssr:

                    fsync_on = bool(args.fsync_logs)
                    writer_kwargs = dict(
                        delimiter=args.delimiter,
                        do_fsync=fsync_on,
                        flush_every=args.log_flush_every
                    )

                    construct_writer = FlushCSV(f_construct, **writer_kwargs)
                    bitflip_writer   = FlushCSV(f_bitflip,   **writer_kwargs)
                    iwss_writer      = FlushCSV(f_iwss,      **writer_kwargs)
                    iwssr_writer     = FlushCSV(f_iwssr,     **writer_kwargs)

                    # Linha de parâmetros (facilita transposição)
                    construct_writer.writerow(params_row)
                    bitflip_writer.writerow(params_row)
                    iwss_writer.writerow(params_row)
                    iwssr_writer.writerow(params_row)

                    # Cabeçalhos
                    construct_writer.writerow(construct_headers())
                    bitflip_writer.writerow(ls_headers())
                    iwss_writer.writerow(ls_headers())
                    iwssr_writer.writerow(ls_headers())

                    # GRASP: N soluções iniciais por FS×Neighborhood
                    for b in range(1, args.build_restarts + 1):
                        if stop_requested():
                            break
                        seed_id = str(uuid.uuid4())

                        try:
                            # 1) construção
                            S0, R0 = construct_initial_solution(
                                ranked, rcl_size, subset_size,
                                X_train, y_train, X_validation, y_validation, args.classifier,
                                construct_writer, args.classifier.upper(), train_name, validation_name,
                                seed_id, bool(args.log_sys_metrics)
                            )

                            # 2) “microserviços” no monolito: cada operador parte da mesma S0
                            # The controller receives all neighborhoods together.
                            # Invoking it once per operator makes VND and RVND
                            # degenerate to the same single-neighborhood search.
                            candidate = local_search_loop(
                                S0[:], R0[:], X_train, y_train, X_validation, y_validation, args.classifier,
                                neighborhood=ngh, iters=args.ls_iters,
                                bitflip_writer=bitflip_writer, iwss_writer=iwss_writer, iwssr_writer=iwssr_writer,
                                train_name=train_name, test_name=validation_name, seed_id=seed_id,
                                iterNeighborhood=b,
                                ls_ops=ops_list,
                                bitflip_tries=args.bitflip_tries,
                                subset_size=subset_size,
                                log_all_iters=bool(args.log_all_iters),
                                log_sys_metrics=bool(args.log_sys_metrics)
                            )
                            validation_metrics = evaluate_subset(
                                X_train, y_train, X_validation, y_validation,
                                candidate, args.classifier
                            )
                            if (
                                best_validation is None
                                or validation_metrics["f1"] > best_validation["f1"]
                            ):
                                best_solution = candidate[:]
                                best_validation = validation_metrics
                                best_configuration = {
                                    "feature_selector": fs,
                                    "neighborhood_controller": ngh,
                                    "local_search": ops_list,
                                }

                        except Exception as e_build:
                            log_error(f"FS={fs} NGH={ngh} build #{b} falhou: {e_build}")
                            continue

                    # força flush final
                    construct_writer.flush()
                    bitflip_writer.flush()
                    iwss_writer.flush()
                    iwssr_writer.flush()

            except Exception as e_files:
                log_error(f"FS={fs} NGH={ngh}: falha abrindo/escrevendo CSVs: {e_files}")
                continue

    err_fh.close()

    if best_solution is None or best_validation is None or best_configuration is None:
        raise RuntimeError("No candidate completed before the selection deadline")

    # Evaluate the untouched holdout exactly once, after every selection choice.
    holdout_started = time.perf_counter()
    holdout_metrics = evaluate_subset(
        X_train, y_train, X_holdout, y_holdout,
        best_solution, args.classifier
    )
    classifier_time_ms = int((time.perf_counter() - holdout_started) * 1000)
    train_hash = sha256_file(args.train)
    validation_hash = sha256_file(args.validation)
    test_hash = sha256_file(args.test)
    if args.dataset_hash:
        dataset_hash = args.dataset_hash
    else:
        dataset_hash = hashlib.sha256(
            f"{train_hash}:{validation_hash}:{test_hash}".encode("ascii")
        ).hexdigest()

    elapsed_ms = int((time.monotonic() - run_started) * 1000)
    if ACCEPTED_IMPROVEMENTS >= MAX_ACCEPTED_IMPROVEMENTS:
        stop_reason = "accepted_improvement_limit"
    elif time.monotonic() >= RUN_DEADLINE:
        stop_reason = "run_timeout"
    else:
        stop_reason = "configured_search_exhausted"

    process = psutil.Process(os.getpid())
    candidate_id = hashlib.sha256(
        f"{args.run_id}:{','.join(map(str, best_solution))}".encode("utf-8")
    ).hexdigest()
    result = {
        "campaign_id": args.campaign_id,
        "arm_id": args.arm_id,
        "run_id": args.run_id,
        "seed": args.seed,
        "candidate_id": candidate_id,
        "parent_id": None,
        "request_id": f"{args.run_id}-monolith",
        "stage": "end_to_end",
        "algorithm": "GRASP-FS monolith2-graspy",
        "feature_selector": best_configuration["feature_selector"],
        "neighborhood_controller": best_configuration["neighborhood_controller"],
        "local_search": ",".join(best_configuration["local_search"]),
        "classifier": args.classifier.upper(),
        "classifier_version": (
            "weka-stable 3.8.6" if args.classifier == "J48"
            else f"scikit-learn {sklearn.__version__}"
        ),
        "classifier_parameters": (
            {"weka_options": "J48 defaults"} if args.classifier == "J48"
            else {"random_state": 0}
        ),
        "dataset_hash": dataset_hash,
        "train_hash": train_hash,
        "validation_hash": validation_hash,
        "test_hash": test_hash,
        "selected_features": best_solution,
        "subset_size": len(best_solution),
        "dimensionality_reduction_percent": 100.0 * (1.0 - len(best_solution) / n_feats),
        "validation_f1_macro": float(best_validation["f1"]),
        "validation_f1_weighted": float(best_validation["f1_weighted"]),
        "validation_precision_macro": float(best_validation["prec"]),
        "validation_precision_weighted": float(best_validation["prec_weighted"]),
        "validation_recall_macro": float(best_validation["rec"]),
        "validation_recall_weighted": float(best_validation["rec_weighted"]),
        "test_f1_macro": float(holdout_metrics["f1"]),
        "test_f1_weighted": float(holdout_metrics["f1_weighted"]),
        "test_precision_macro": float(holdout_metrics["prec"]),
        "test_recall_macro": float(holdout_metrics["rec"]),
        "accuracy": float(holdout_metrics["acc"]),
        "class_labels": holdout_metrics.get("class_labels", []),
        "validation_per_class_metrics": best_validation.get("per_class_metrics", {}),
        "validation_confusion_matrix": best_validation.get("confusion_matrix", []),
        "test_per_class_metrics": holdout_metrics.get("per_class_metrics", {}),
        "test_confusion_matrix": holdout_metrics.get("confusion_matrix", []),
        "candidate_time_ms": None,
        "classifier_time_ms": classifier_time_ms,
        "run_elapsed_ms": elapsed_ms,
        "end_to_end_time_ms": elapsed_ms,
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "monotonic_elapsed_ms": elapsed_ms,
        "candidate_count": CANDIDATE_COUNT,
        "accepted_improvement_count": ACCEPTED_IMPROVEMENTS,
        "process_cpu_percent": float(process.cpu_percent(interval=None)),
        "container_cpu_percent": None,
        "host_cpu_percent": None,
        "process_rss_mb": process.memory_info().rss / (1024 * 1024),
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
    output_path = os.path.abspath(args.final_metrics_file)
    output_dir = os.path.dirname(output_path)
    if output_dir:
        os.makedirs(output_dir, exist_ok=True)
    temporary_path = output_path + ".tmp"
    with open(temporary_path, "w", encoding="utf-8") as handle:
        json.dump(result, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")
    os.replace(temporary_path, output_path)


if __name__ == "__main__":
    main()
