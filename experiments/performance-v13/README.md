# Performance v13: early progress and training admission

This campaign is separate from v12. It compares all four combinations of early
progress OFF/ON and IWSSR training admission unlimited/3, at fixed pipeline=3,
neighborhood=3, memoization OFF. Sequential matched monolith2 is the fifth arm.
All arms retain the 6 CPU / 12 GiB aggregate ceiling, including Kafka/ZooKeeper.

Early progress publishes improving completed add/replacement evaluations without
waiting for the replacement batch. It does not change ordered reduction or the
next search move. Snapshot submission is not broker acknowledgement; measure both
separately when timestamps are available. Late results cannot be published by the
new progress path. Defaults remain OFF and admission 0 (legacy unlimited).
The fair semaphore admits actual evaluations, not memoized waits, and releases
permits on errors. Deadlines/interruptions reject waiting work.

## Scheduled execution

Pilot: seed 149, five cells, 600 s selection + 300 s finalization per cell.
Formal: seeds 150-169, 100 cells, 2700 s selection + 300 s finalization.
One ten-day deadline covers both phases. One attempt per cell; a technical failure
stops the chain. Zero quality yield or low F1 does not prevent formal release.
All four configurations are retained, never chosen by held-out performance.

The explicit --chain-formal option audits the pilot, code, images, hashes, actual
Compose options and training admission telemetry before automatically releasing
formal execution. State/results use separate pilot/ and formal/ directories.
A shared campaign lock and active-container check prevent accidental overlap
with other runners using the same previous-state lock. Do not run two supervisors.

From a clean dedicated server checkout, after unit tests and image build:

```sh
python3 experiments/architecture-causal-campaign/run_performance_optimization.py \
  --protocol experiments/performance-v13/protocol.json \
  --campaign-tag COMMIT --image-tag IMAGE_TAG \
  --previous-state /home/idscps/nicolas/experiment-artifacts/pipeline-ablation/formal-v11/state.json \
  --pilot-seed 149 --chain-formal \
  --state /home/idscps/nicolas/experiment-artifacts/performance-v13/pilot/state.json \
  --results /home/idscps/nicolas/experiment-artifacts/performance-v13/pilot/results
```

Use tmux for persistent execution; record the actual commit/tag/session in STATUS.md.
The chain can resume at the same immutable commit. It re-audits pilot evidence,
keeps the original deadline, and does not relaunch completed cells.

## Analysis and boundaries

The protocol freezes two factorial main effects and their multiplicity correction.
Do not reuse v11's four-arm statistical conclusions. CPU/RAM must be integrated
from resource samples within the correct window, reporting missing coverage.
The campaign and offline factorial/resource analysis completed on 2026-09-26.
See [the results and interpretation](ANALISE_RESULTADOS.md) and
[generated evidence](evidence/analysis-20260926/REPORT.md).
The training-admission main effect was positive (Holm p=0.01171875); the early
publication main effect was not confirmed. Distributed throughput was higher
than the sequential monolith, with substantially greater CPU and memory cost.
This is not evidence of universal architectural superiority.

Analyzer: `experiments/architecture-causal-campaign/analyze_performance_v13.py`.
It verifies all 1,220 artifact checksums and emits run-level metrics, contrasts,
provenance and a Markdown report without changing raw data. It requires NumPy.

Changes to algorithms, projections/telemetry cost, multi-fidelity training,
multi-host execution, failures and a parallel-monolith baseline are NOT included.
They require separate controls and protocols. Prior v11/v12 artifacts are untouched.
