# Ten-day experimental campaign

This directory contains the reproducibility boundary for a maximum 240-hour
campaign. Preparation and pilot runs happen before the official clock starts.

The requested matrix has 24 distributed configurations and two monolithic
comparators. A distributed arm is one construction method, VND or RVND, and
one reproducible ordering of the Bit-Flip, IWSS, and IWSSR portfolio. The
`local_search` arm factor names the first VND neighborhood (or preferred RVND
neighborhood); all three operators remain enabled, so neither controller is a
singleton or degenerate case. Each of the 26 arms receives exactly eight
hours. Each independent run has an absolute 50-minute limit, including startup,
selection, controlled shutdown, validation, and the single holdout evaluation;
the final ten minutes of each arm window cover transitions and permit at least
eight attempts. Eight hours are reserved for the all-features baseline and 24
hours for campaign-level transitions and final consolidation.
The eight independent runs use the first eight seeds from the protocol's
fixed sequence: `42, 43, 44, 45, 46, 47, 48, 49`.

The checked-in `manifest.yaml` is JSON syntax, which is valid YAML 1.2 and can
be parsed with Python's standard `json` module. `ready: false` is deliberate:
the campaign must not start until the common Weka J48 implementation, resolved
commands, target resource budget, pilots, clean commit/tag, and every image
digest have all been frozen. The runner rejects empty, non-positive, or
duplicate feature subsets rather than silently normalizing them.

Generated datasets, state, checkpoints, logs, and results are ignored by Git.
Their SHA-256 hashes belong in the final manifest and report.

## Split preparation

```sh
python3 experiments/10-day-campaign/prepare_splits.py \
  --input datasets/erenoall.arff \
  --output-dir datasets/campaign-10d \
  --seed 20260825
```

## Manifest generation

```sh
python3 experiments/10-day-campaign/generate_manifest.py \
  --split-manifest datasets/campaign-10d/split-manifest.json \
  --output experiments/10-day-campaign/manifest.yaml
```

Generation does not make the campaign runnable. The pilot must remove every
readiness blocker and the preflight validator must pass before an official
start timestamp is written.

After the seven formal 30-minute cases finish, run the destructive resilience
checks separately so signal injection cannot contaminate scientific outputs:

The formal pilots use five iterations per local-search invocation so a complete
VND/RVND handoff can be observed within 30 minutes. The official frozen commands
retain 100 iterations and additionally persist best-so-far progress throughout
the bounded run; the pilot report records its iteration limit explicitly.
The pilot also uses a three-improvement cap to exercise the same stop-on-first
criterion used by the official 500-improvement or 50-minute bound.

```sh
python3 experiments/10-day-campaign/run_resilience_pilot.py \
  --pilot-report /path/to/formal-pilots/pilot-report.json \
  --output-dir /path/to/formal-pilots
```

Each formal pilot invocation uses a persisted unique namespace for campaign
and run identifiers. If an operator interrupts the pilot, its child process
group is terminated and recorded before the tmux session exits, preventing a
late cleanup from colliding with a replacement pilot.

Manifest freezing requires both the formal report and the resulting approved
`resilience-report.json`.
The freeze step also writes tracked `frozen-compose.yaml` and
`host-provenance.json` artifacts; their hashes are embedded in the manifest.
The host record deliberately excludes credentials and captures Docker/cgroup,
CPU, memory, operating-system, and concurrent-container context.

If campaign-control code was committed after the pilot images were built, pass
the exact pilot build commit separately so image and launcher provenance remain
truthful:

```sh
python3 experiments/10-day-campaign/freeze_manifest.py \
  --manifest experiments/10-day-campaign/manifest.yaml \
  --pilot-report /path/to/formal-pilots/pilot-report.json \
  --resilience-report /path/to/formal-pilots/resilience-report.json \
  --image-tag pilot-IMAGE_BUILD_COMMIT \
  --image-source-commit IMAGE_BUILD_COMMIT \
  --campaign-tag experiment-10d-v1
```

## Durable launch and external watchdog

The official process is launched through `campaign_supervisor.py`, not by
invoking the orchestrator directly. The supervisor preserves the first
deadline across restarts, stops the complete process group with SIGTERM and
then SIGKILL, explicitly reaches the active run's separate process group,
refuses low-disk execution, limits restart loops, and rotates its own log into
checksum-addressed gzip archives. Run it inside the documented
tmux session (or an equivalent user service):

```sh
python3 experiments/10-day-campaign/campaign_supervisor.py \
  --manifest experiments/10-day-campaign/manifest.yaml \
  --state experiments/10-day-campaign/state/campaign-state.json \
  --supervisor-state experiments/10-day-campaign/state/supervisor-state.json \
  --log experiments/10-day-campaign/logs/campaign-supervisor.log \
  --output-root experiments/10-day-campaign/results
```
