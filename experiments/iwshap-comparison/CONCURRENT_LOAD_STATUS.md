# Concurrent-load campaign status

Last updated: 2026-09-14.

This file preserves the operational context of the paired concurrent-load
experiment. It is a status record, not an inferential result.

## Frozen design

- Scenarios: X-CANIDS suspension and fabrication.
- Concurrent independent searches per batch: 1, 2, 4, 8, and 16.
- Paired batch seeds: 30 (`20260941` through `20260970`).
- Shared aggregate budget per architecture: 6 CPU, 12 GiB RAM, CPUs 8--15.
- Selection window: 1,080 seconds within a 1,200-second job limit.
- Global campaign limit: 10 days.
- Primary thresholds: validation macro-F1 0.78 (suspension) and 0.88
  (fabrication), fixed before the formal campaign.
- Primary response: paired batch count of jobs reaching the scenario threshold
  at loads 4, 8, and 16.
- Secondary responses: completion rate, jobs per second, IWSSR evaluations per
  second, resource use, and held-out macro-F1 non-inferiority (margin 0.01).
- Experimental unit: paired batch seed. Jobs inside a batch are not treated as
  independent replications.

The distributed condition uses one shared G-FShield stack. The monolithic
condition runs the requested number of isolated Monolith 2 containers, dividing
the same aggregate CPU and RAM budget equally between them. The order of
scenario, load, and architecture is counterbalanced. Analysis uses paired
sign-flip permutation tests, bootstrap confidence intervals, and Holm correction
within declared families.

## Pilot evidence

Pilot v1 found and led to correction of a dataset split-hash lookup defect. Its
measurements are excluded from inference.

Pilot v2 used suspension, load 2, a 420-second selection window, and batch seed
`20260972`. Both architectures completed two jobs and both jobs reached the
0.78 validation threshold. G-FShield held-out macro-F1 values were 0.789230 and
0.787927; Monolith 2 values were 0.803500 and 0.787927. This single diagnostic
batch does not establish superiority. It confirmed request isolation and
per-request provenance in the shared distributed stack.

Pilot v3 used the final instrumented images, suspension, load 16, the formal
1,080-second selection window, and batch seed `20260973`. Both artifacts were
valid and all containers respected the shared 6 CPU/12 GiB budget. G-FShield
admitted all 16 requests but produced no solution before the deadline; all 16
monolith jobs produced a solution and crossed the 0.78 validation threshold.
This diagnostic result identifies the single-CPU construction service as a
burst-load bottleneck. It is not part of the formal inferential sample.

## Formal-campaign gate

The gate was satisfied: pilot v3 created valid artifacts for both architectures,
all 16 requests were admitted, resource limits were enforced, and the absence
of distributed solutions was classified as a capacity outcome rather than an
instrumentation failure. The formal campaign `gfshield-concurrent-load-2026-v1`
started at 2026-09-14 19:41 UTC with a hard deadline at 2026-09-24 19:41 UTC.
Pilot outputs remain outside the formal analysis.

Do not update the dissertations with claims of architectural superiority until
all 30 paired batches per scenario and load have finished and checksum-verified
analysis artifacts have been generated. Report null or adverse results as such.
