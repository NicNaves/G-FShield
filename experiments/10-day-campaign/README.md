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
