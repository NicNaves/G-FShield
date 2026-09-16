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
G-FShield campaign runner. `iwshap-selected/campaign/` uses the same filenames
for the historical IWSHAP subset under identical split membership, so the same
common final-evaluator runner can consume either directory without special cases.

The four common Weka references can then be run with an absolute per-evaluation
limit and resumable state:

```sh
python3 experiments/iwshap-comparison/run_common_baselines.py \
  --data-root /path/to/iwshap-comparison-data \
  --output-root /path/to/iwshap-common-baselines \
  --evaluation-timeout-seconds 1800
```

Before committing server time to the 30-seed campaign, run the resumable paired
pilot. It uses ReliefF + VND + IWSSR in both implementations, counterbalances
execution order across the two scenarios, allocates the same aggregate CPU and
memory, and enforces both per-cell and global wall-clock deadlines:

```sh
python3 experiments/iwshap-comparison/run_paired_pilot.py \
  --data-root /path/to/iwshap-comparison-data \
  --output-root /path/to/iwshap-paired-pilot \
  --run-timeout-seconds 1200 \
  --global-timeout-seconds 7200
```

The pilot is a systems check and effect-size estimate, not an inferential test.
Do not use its single seed to claim statistical superiority. A final campaign
must retain the ten-day global ceiling and use the preregistered paired seeds.
For an implementation ablation, `--architectures distributed` runs only the two
distributed cells; this mode is diagnostic and must not be described as a
paired architectural comparison.

`launch_formal_after_ablation.py` can monitor that diagnostic run and launch the
formal campaign only if both construction and completed IWSSR evaluation counts
increase over the pre-optimization reference in both scenarios. It writes the
machine-readable decision to `formal-campaign-gate.json`; this gate checks the
implementation fix, not the desired direction of the architectural result.

After a successful pilot, `run_paired_campaign.py` executes 30 paired seeds on
both scenarios (120 cells), counterbalances scenario and architecture order,
allows at most two attempts per cell, records image IDs and host information,
checks every input and output hash, and refuses a global deadline beyond ten
days. Its default per-cell budget is the same 20 minutes used by the pilot.

After all 120 cells are complete, verify every recorded checksum and produce the
scenario-aware paired analysis with:

```sh
python3 experiments/iwshap-comparison/analyze_formal_results.py \
  --state /path/to/formal-campaign/state.json \
  --baseline-root /path/to/iwshap-common-baselines \
  --output /path/to/formal-analysis
```

The analyzer keeps construction and IWSSR evaluation counts separate, treats
the execution/seed as the paired unit, reports bootstrap intervals and paired
permutation tests, and labels time to the pre-existing all-feature baseline as
descriptive because that target was not embedded in the frozen manifest.

Generate the traceable comparison table after either the common baselines or
the paired pilot has produced results:

```sh
python3 experiments/iwshap-comparison/analyze_results.py \
  --manifest /path/to/iwshap-comparison-data/audit-and-split-manifest.json \
  --baseline-root /path/to/iwshap-common-baselines \
  --paired-root /path/to/iwshap-paired-pilot \
  --output-dir /path/to/iwshap-analysis
```

The generated report keeps repository-log XGBoost measurements, controlled J48
re-evaluations, and the matched-architecture pilot in separate evidence strata.

For a classifier-controlled comparison closer to IWSHAP, run the frozen subsets
through `run_xgboost_evaluation.py` inside an environment pinned to XGBoost
2.0.3, scikit-learn 1.5.0, NumPy 1.26.4, and pandas 2.2.2. The script fixes the
XGBoost random state, limits its worker count, verifies every ARFF hash, and
reports macro and positive-class metrics separately. These runs evaluate frozen
subsets; they do not reproduce IWSHAP's selection procedure.

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
When `--paired-root` points to a completed formal campaign, the evaluator loads
all 60 frozen subsets per scenario and identifies each output by architecture
and seed. It refuses to use an incomplete formal state.

To reproduce the repository protocol itself, build the unmodified pinned checkout
and run it with bounded, recorded resources:

```sh
docker build -t sf24-iwshap:fb0d3093c124 /path/to/pinned/sf24-iwshap
python3 experiments/iwshap-comparison/run_original_iwshap.py \
  --source-root /path/to/pinned/sf24-iwshap \
  --output-root /path/to/iwshap-original-reproduction
```

This intentionally preserves the original 80/20 split (`random_state=42`),
pre-split categorical encoding, XGBoost defaults, and reuse of the 20% partition
during iterative selection. It is an artifact reproduction, not the unbiased
test used for the primary comparison.

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

## Offline runtime image build

If Maven Central is temporarily unavailable to Docker, package each modified
Java service with the host Maven cache and place it in the pinned runtime image
without downloading dependencies during `docker build`:

```sh
mvn -q package -DskipTests
docker build -f Dockerfile.prebuilt -t <immutable-experiment-tag> .
```

Run the targeted unit tests first, then record `mvn -version`, the Git commit,
the resulting JAR SHA-256, and the Docker image ID in the experiment manifest.
`Dockerfile.prebuilt` uses the same pinned Temurin digest as the regular
multi-stage Dockerfile.
## Exploratory concurrent-load optimization

The first concurrent-load campaign is intentionally capped at the first balanced
100-cell block: five batch seeds, two scenarios, five loads, and two
architectures. This is an exploratory engineering sample, not the originally
planned 30-seed confirmatory campaign.

After freezing that baseline, prepare the optimized images from the current
commit and run two distributed-only profiles. The matching monolith cells are
reused by checksum instead of being rerun:

```sh
python3 experiments/iwshap-comparison/run_optimized_concurrent_campaigns.py \
  --data-root /path/to/iwshap-comparison/data \
  --baseline-root /path/to/concurrent-load/formal-v1 \
  --output-root /path/to/concurrent-load/optimization-v1 \
  --image-tag <immutable-optimized-tag>
```

`rebalanced` assigns 3 CPU to the RCL and 1 CPU to IWSSR. `scaled-rcl` keeps the
same aggregate allocation but divides the RCL budget among as many as four
replicas and routes requests round-robin through ephemeral loopback ports. Both
profiles retain the total 6 CPU/12 GiB budget. Together they add 100 cells (50
per profile) across the same five seeds and factor combinations.

The exact exploratory protocol and success gate are frozen in
`concurrent-load-optimization-protocol-v1.json`. Do not merge these post-hoc
engineering results into the original confirmatory family. Use them to decide
whether a later, independently seeded confirmatory campaign is justified.
