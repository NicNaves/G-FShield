# Formal IWSHAP architecture comparison

All values below use 30 paired seeds per scenario. Positive differences are
distributed minus monolith. Dataset-specific time targets equal the all-feature
validation baseline computed before this campaign; those time analyses are
descriptive because they were not embedded in the frozen campaign manifest.

## Suspension

- Validation baseline target: 0.717036.
- Median test macro-F1: distributed 0.790717; monolith 0.787396.
- Paired median macro-F1 difference: +0.000665 (95% bootstrap CI +0.000000 to +0.005313; Holm p=0.438598).
- Median anytime AUC: distributed 0.724464; monolith 0.733062 (Holm p=2.99999e-05).
- Median local-search throughput: distributed 8.580/s; monolith 3.698/s.
- Median estimated CPU core-seconds: distributed 3853.1; monolith 1100.7.
- Median peak RAM: distributed 3370.3 MiB; monolith 770.1 MiB.
- Median construction/local-search overlap: distributed 99.66%; monolith 0.00%.

## Fabrication

- Validation baseline target: 0.877356.
- Median test macro-F1: distributed 0.902245; monolith 0.900280.
- Paired median macro-F1 difference: +0.000000 (95% bootstrap CI +0.000000 to +0.003119; Holm p=1).
- Median anytime AUC: distributed 0.831286; monolith 0.839406 (Holm p=2.99999e-05).
- Median local-search throughput: distributed 8.302/s; monolith 3.678/s.
- Median estimated CPU core-seconds: distributed 3858.4; monolith 1096.9.
- Median peak RAM: distributed 3169.8 MiB; monolith 774.6 MiB.
- Median construction/local-search overlap: distributed 99.66%; monolith 0.00%.

## Interpretation constraint

The overlap measurement demonstrates concurrent pipeline execution. It does not
by itself prove lower latency or lower resource cost; those claims depend on their
own paired outcomes. IWSHAP historical/reproduction numbers remain a separate
evidence stratum until every frozen subset is evaluated by the common XGBoost setup.
