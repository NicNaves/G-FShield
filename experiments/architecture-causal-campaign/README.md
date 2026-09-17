# Causal architecture campaign

This campaign compares the distributed and monolithic deployments with the
same feature selector, RCL construction, random seed stream, local-search
transition rules, classifier, objective, data split, wall-clock limit, and
aggregate resource ceiling (six CPU cores and 12 GiB on CPUs 8--15). The
distributed ceiling is the sum of the six active component limits; the
monolith receives that same aggregate ceiling. Within that budget, the
distributed arm uses three Kafka partitions and three IWSSR consumers so
different constructed candidates can advance concurrently; the monolith keeps
the original sequential control flow. It is designed to test an architectural effect;
it does not assume that the distributed deployment will win.

The 30 seeds form paired blocks. Execution order alternates between
distributed-first and monolith-first to limit thermal and temporal drift. The
primary outcome is the request-to-candidate time at which an internally
evaluated candidate first reaches validation macro-F1 0.94, censored at the
2,700-second selection deadline. The distributed clock and resource sampler
start only after the services are ready and immediately before the request;
deployment/cold-start time is retained as a separate descriptive measure.
Candidates completed during shutdown after the selection deadline are excluded,
and unfinished phase intervals are right-censored at their last observed event.
Candidate throughput and estimated CPU/memory costs use the measured selection
duration, excluding the separate held-out final-evaluation interval.
Candidate-level instrumentation is used in both arms, so
the result does not favor the distributed arm merely because it publishes
intermediate solutions to Kafka. Held-out
macro-F1 is a non-inferiority guardrail evaluated only after validation-only
model selection. Candidate throughput, resource-normalized costs, anytime
quality, and measured overlap between construction and local search are
secondary outcomes.

The mechanistic claim is tested from timestamped phase intervals. In the
distributed arm, Kafka permits the RCL generator to start the next construction
while IWSSR processes an earlier candidate. The matched monolith explicitly
finishes each construction and its complete local search before starting the
next construction. The analysis reports the percentage of local-search time
that actually overlaps construction; it does not infer overlap merely from the
source-code structure.

Before the formal launch:

1. build the modified distributed, evaluator, and monolith images from a clean
   tagged commit;
2. run one short pair with `--pilot-seed 42` and inspect algorithm-parity and
   artifact checks;
3. start the full campaign in `tmux` with the immutable Git tag and image tag;
4. preserve the generated frozen manifest, state, raw results, logs, resource
   samples, and checksum manifests outside Git.

Example formal launch on the target host:

```sh
python3 experiments/architecture-causal-campaign/run_campaign.py \
  --protocol experiments/architecture-causal-campaign/protocol.json \
  --campaign-tag experiment-architecture-causal-v9 \
  --image-tag causal-COMMIT \
  --state experiments/architecture-causal-campaign/state/campaign-state.json \
  --results experiments/architecture-causal-campaign/results
```

The supervisor is resumable. A cell is complete only when its result identity,
common metric contract, candidate count, hashes, and checksum manifest pass.
The pilot defaults to 900 seconds per arm with a 300-second final-evaluation
reserve and must use state/results directories separate from the formal run.

## Pipeline ablation v11 (100 cells)

The v11 campaign isolates two architectural effects under the same aggregate
six-CPU/12-GiB ceiling: stage overlap (distributed-w1 versus monolith) and
additional consumer concurrency (distributed-w4 versus distributed-w1).
It uses 25 previously unused seeds (102--126), four arms, a four-treatment
Williams execution order, a 2,700-second selection window per cell, and an
immutable ten-day campaign deadline.

The primary outcome is the per-seed linear slope of normalized quality-yield
AUC against log2 of the worker count for distributed-w1, distributed-w2, and
distributed-w4. Quality-yield AUC integrates the cumulative number of distinct
subsets reaching validation macro-F1 >= 0.945 over the selection window. The
claim additionally requires a nondecreasing mean dose response, held-out
macro-F1 noninferiority for distributed-w4 versus the monolith, and measured
construction/local-search overlap.

Pilot command:

    python3 experiments/architecture-causal-campaign/run_pipeline_ablation.py \
      --protocol experiments/architecture-causal-campaign/protocol-pipeline-ablation-v11.json \
      --campaign-tag experiment-pipeline-ablation-v11 \
      --image-tag pipeline-ablation-COMMIT \
      --pilot-seed 41 \
      --pilot-run-timeout-seconds 900 \
      --pilot-finalization-reserve-seconds 300 \
      --state /home/idscps/nicolas/experiment-artifacts/pipeline-ablation/pilot-v11/state.json \
      --results /home/idscps/nicolas/experiment-artifacts/pipeline-ablation/pilot-v11/results

The formal state and results must use a separate directory. The formal runner
is resumable and accepts a cell only after identity, metric, trace, and checksum
validation.
