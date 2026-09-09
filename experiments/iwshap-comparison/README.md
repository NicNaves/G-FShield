# IWSHAP external comparison

This experiment uses the public IWSHAP repository as a pinned external-validity
case for G-FShield. It deliberately separates three kinds of evidence:

1. **Published result:** numbers reported by Scherer et al. and by the repository
   logs. These are cited as prior-work results, never as measurements made here.
2. **Artifact reproduction:** execution of the original code with its 80/20,
   `random_state=42` protocol. This checks the artifact but is not the primary
   comparison because the same 20% partition guides feature selection and is
   reported as test performance.
3. **Leakage-resistant comparison:** selection uses train/validation only and the
   test set is evaluated once after the subset is frozen. Identical complete
   feature vectors cannot cross partitions.

## Why the supplied CSV is not the raw benchmark

`dataset_reduced_2024-07-04_13-59-15.csv` is the four-feature output of the
fabrication run. It has 20,000 rows but no `label` column. The user-linked
`Log_2024-06-25_13-20-41.txt` is a different, suspension run: it reports 16
selected features and F1 0.918619. It contains no input hash or row count, and
its result matches the full-paper experiment; it is therefore not assumed to
come from the 20,000-row demo files. The matching July log reports four features
and F1 0.787387. The preparation script validates the July relationship and can
reconstruct the missing labels because the reduced rows exactly preserve the
order of the pinned safe-plus-fabrication source concatenation.

## Data preparation

Do not commit the cloned source or generated datasets. The pinned repository has
no `LICENSE` file, so redistribution permission is not assumed.

```sh
git clone https://github.com/sf24-iwshap/sf24-iwshap.git /tmp/sf24-iwshap
git -C /tmp/sf24-iwshap checkout fb0d3093c12421d08ab3fb595d20c29ba2442e65
python3 experiments/iwshap-comparison/prepare_datasets.py \
  --source-root /tmp/sf24-iwshap \
  --output-root /path/to/iwshap-comparison-data \
  --split-seed 20260909
```

For each scenario, `campaign/` has the exact filenames consumed by the existing
G-FShield campaign runner. `iwshap-selected/` has the historical IWSHAP subset
under the same split membership for a common final evaluator.

## Preregistered comparison

Run suspension and fabrication as separate datasets. For each dataset:

- use the same pinned train/validation/test files for every method;
- run the distributed G-FShield arm and its matched sequential monolith with the
  same construction, controller, local search, seed, stopping rules, CPU set,
  aggregate CPU limit, memory limit, and final evaluator;
- include all-features and historical-IWSHAP-subset baselines;
- use at least 30 paired stochastic seeds for the architectural comparison;
- select subsets from validation metrics only and evaluate the untouched test
  partition once;
- report macro-F1 as the primary quality metric, then positive-class F1,
  precision, recall, dimensional reduction, time to target, throughput,
  CPU-seconds, peak RSS, and energy only if an actual energy sensor is available;
- externally re-evaluate every frozen subset with the same XGBoost version and
  parameters used by IWSHAP, while retaining the common Weka result as the
  architecture-controlled analysis.

The article's 784,744-instance balanced suspension experiment is not recreated
by the repository's 20,000-row demonstration CSVs. Results on the demo artifacts
must therefore be labelled as an artifact-scale external validation, not as a
reproduction of the full paper experiment.

## Claims this experiment can and cannot support

It can test whether G-FShield reaches competitive held-out quality, produces
useful subsets sooner, and increases candidate throughput on an external CAN
dataset. The paired distributed-versus-monolith arm isolates the architectural
effect under matched algorithmic conditions.

It cannot establish general superiority over IWSHAP from the historical log
alone. Differences in classifier, objective, partitioning, sample size, hardware,
and test reuse prevent a direct inferential comparison. Such a claim requires
the preregistered common-data/common-evaluator runs above.
