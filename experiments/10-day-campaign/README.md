# Ten-day experimental campaign

This directory contains the reproducibility boundary for a maximum 240-hour
campaign. Preparation and pilot runs happen before the official clock starts.

The requested matrix has 24 distributed configurations and two monolithic
comparators. A distributed arm is one construction method, VND or RVND, and
one of Bit-Flip, IWSS, or IWSSR. Each of the 26 arms receives exactly eight
hours; the protocol formula therefore caps each independent run at one hour.
With one enabled neighborhood, VND and RVND are degenerate controller cases;
the campaign preserves them as separate requested arms and flags this fact in
the analysis instead of silently collapsing the matrix. Eight hours are
reserved for the all-features baseline and 24 hours for transitions and final
consolidation.

The checked-in `manifest.yaml` is JSON syntax, which is valid YAML 1.2 and can
be parsed with Python's standard `json` module. `ready: false` is deliberate:
the campaign must not start until the common Weka J48 implementation, resolved
commands, target resource budget, pilot, clean commit, and image digests have
all been frozen.

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
