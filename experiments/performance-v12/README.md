# G-FShield performance v12

This branch isolates exact evaluation memoization and parallel IWSSR replacement
evaluation. Defaults remain memoization OFF and neighborhood parallelism 1.
Each distinct admitted key is trained; concurrent requests for the same admitted
key share its result. At capacity, unseen keys are evaluated uncached. Failures
are removed. Entries are process-local and cannot match a different run ID.

Keys include run ID, dataset names and SHA-256 of the actual in-memory training
and validation content, classifier class/options, seed and canonical subset.
Dataset fingerprints include exact double values, weights and schema; they are
computed once per local-search invocation. Their overhead is included in wall
time and resource measurements. No cached verdict is used for new live traffic.
Datasets within an invocation must be immutable. Kafka campaign containers mount
the frozen data read-only and are recreated for each run.

Parallel replacement tasks use independent copies of the configured classifier,
detached candidate snapshots, and ordered result reduction to preserve strict
greater-than tie-breaking. Worker count is bounded independently of Kafka consumer
count. Cancellation interrupts pending work, but Weka may finish an in-flight
training call despite interruption; Docker/process supervision remains the hard
deadline boundary. Late results are excluded by the measurement cutoff.

## Protocol

`protocol.json` contains eight distributed arms from the full 2x2x2 factorial:
pipeline consumers 1/3, neighborhood workers 1/3, memoization OFF/ON. The ninth
arm is the matched monolith2. All arms use ReliefF, VND, IWSSR and Weka J48,
the same hashed split, CPU affinity 8-15, NUMA node 1, and an aggregate ceiling
of 6 CPUs/12 GiB. Kafka and ZooKeeper are included in distributed limits.

Pilot: seed 127, all nine arms, 900 seconds per cell including 300 seconds for
finalization (600 seconds selection). Using the full factorial in the pilot
also exercises the three intermediate combinations. Formal: seeds 128-138,
99 cells, 3000 seconds per cell including 300 seconds for finalization.
The immutable campaign cap is 864000 seconds (10 days), including retries.
A cell is not started if the remaining cap cannot cover its supervisor budget.
The cyclic Latin square balances positions across the first nine seeds; the
last two seeds are incomplete blocks and carryover is not fully balanced.

Pilot validation is technical. It must not select configurations using test F1.
Report all formal arms, including regressions. Interpret the three main effects
separately and account for interactions. One pilot seed cannot establish
statistical superiority. The -0.005 quality margin needs an uncertainty interval;
a nonsignificant difference is not proof of noninferiority.

## Checks and launch (Linux experimental host)

Run from a clean dedicated checkout of `experiment/performance-v12`. Keep output
outside the checkout. First confirm v11 state is CAMPAIGN_COMPLETED, and inspect
remaining workloads. The runner checks that state and refuses active campaign
containers; it does not stop the previous campaign. Background application
containers still require the same documented isolation policy as v11.

```sh
python3 -m unittest discover -s experiments/10-day-campaign/tests -p 'test_*.py'
cd 'grasp-fs-distributed-ls/Local Search/IWSSR/grasp-fs-dls-iwr'
./mvnw test
cd -
COMMIT=$(git rev-parse HEAD)
IMAGE_TAG="performance-v12-$(git rev-parse --short HEAD)"
sh experiments/architecture-causal-campaign/build_images.sh "$IMAGE_TAG"
python3 experiments/architecture-causal-campaign/run_performance_optimization.py \
  --protocol experiments/performance-v12/protocol.json \
  --campaign-tag "$COMMIT" --image-tag "$IMAGE_TAG" \
  --previous-state /home/idscps/nicolas/experiment-artifacts/pipeline-ablation/formal-v11/state.json \
  --pilot-seed 127 \
  --state /home/idscps/nicolas/experiment-artifacts/performance-v12/pilot/state.json \
  --results /home/idscps/nicolas/experiment-artifacts/performance-v12/pilot/results
```

After technical audit of the pilot, use the same code and images, replace
`--pilot-seed 127` with `--pilot-state .../performance-v12/pilot/state.json`,
and use separate `.../performance-v12/formal/` state/results paths. The runner
revalidates pilot artifacts, hashes, image IDs, source commit, effective factors
in resolved Compose, and complete trained/memoized counts before formal launch.
Any source change after the pilot requires a new pilot.

Every launch writes `frozen-manifest.json` with the commit, source/effective
protocol hashes, dataset hashes, image IDs, Docker version, CPU and memory
inventory. Results include resolved Compose and per-cell checksums. These
runtime artifacts have not been fabricated as part of preparation.

## Metrics and limitations

Separate completed training evaluations from completed memoized requests.
`candidate_count` retains compatibility and includes both; it is neither a
unique-subset count nor an end-to-end solution count. Memoizer lifetime counters
include attempted training calls; deadline-filtered log counters include only
completed evaluations. Entries bypassed at capacity may be evaluated repeatedly.

For architecture comparisons use synchronized Docker resource samples, not
per-candidate CPU/RAM fields: those sample a shared JVM/container and overlap
between parallel tasks. Per-worker exclusive CPU and complete queue waiting,
idle time, discarded work and recovery/restart accounting remain to be audited
or instrumented. Do not report unavailable measurements as zero.

Reuse the quality-yield definitions from v11, but its analysis script has
four-arm assumptions; a v12 factorial analyzer is still required before formal
inference. Analyze F1, precision, recall, dimensionality reduction, unique
qualified subsets, time to threshold (right-censor failures), CPU-hours and
GiB-hours on the same 2700-second horizon. Holdout scores are inspected only
after selection. No v12 speedup, resource saving or superiority is established
by the synthetic equivalence unit tests.
