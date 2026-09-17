# Concurrent-load campaign status

Last updated: 2026-09-17.

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

## Exploratory stop and optimization follow-up

On 2026-09-16 the user capped this first campaign at the first balanced 100-cell
block (five seeds, two scenarios, five loads, and two architectures). An external
watcher stops the supervisor only after the 100th valid artifact and records the
state as `STOPPED_AT_TARGET`. The resulting n=5 comparisons are exploratory and
must not be reported as the originally planned confirmatory 30-seed analysis.

The baseline stopped at 2026-09-16 04:33:08 UTC with exactly 100 valid cells in
100 attempts. The supervisor briefly started the next monolith batch before the
watcher signal arrived; its 16 containers were removed, and that incomplete batch
is excluded from the frozen 100-cell state.

The follow-up adds 50 distributed-only cells for `rebalanced` and 50 for
`scaled-rcl`, reusing the checksum-frozen matching monolith cells. Both retain
the 6 CPU/12 GiB aggregate budget. The protocol, success gate, runner and
analysis are stored alongside this status file.

The scaled-RCL systems pilot completed one valid load-4 cell with four RCL
replicas and no infrastructure error. It is excluded from the study results. The
optimized campaign started at 2026-09-16 04:47:16 UTC from commit `a6f216e259ca`
using image tag `concurrent-opt-a6f216e` and supervisor PID 18640. It runs 50
`rebalanced` cells followed by 50 `scaled-rcl` cells. Per-request replica index,
ephemeral host port, and launch offset are persisted in `request_launches`.
An independent watcher (PID 11318) waits for supervisor PID 18640, verifies
`CAMPAIGN_TARGET_COMPLETED`, and then runs the containerized optimized analysis
from commit `45735d343add`. It skips analysis if the study ends incompletely.

## Completed rebalanced profile

The `rebalanced` profile finished at 2026-09-16 22:30:19 UTC with 50 valid
cells in 50 attempts and no infrastructure error. Its descriptive medians versus
the checksum-frozen monolith were tied at loads 1 and 2, 3 versus 4 qualified
jobs at load 4, 2 versus 8 at load 8, and 3 versus 16 at load 16 in both
scenarios. Thus, rebalance alone improved the original distributed high-load
outcome from zero to some completed/qualified jobs but did not achieve throughput
parity with the monolith.

At loads 8 and 16, the rebalanced profile used fewer estimated CPU core-seconds
and less peak memory than the parallel monolith containers, while taking longer
to reach the quality thresholds and producing fewer qualified jobs. These are
resource/performance trade-offs, not evidence of architectural superiority.
The `scaled-rcl` profile subsequently completed and is summarized below.

## Completed optimized study

The optimized campaign finished at 2026-09-17 16:32:07 UTC. Both profiles
reached `CAMPAIGN_TARGET_COMPLETED`: `rebalanced` completed 50 valid cells in
50 attempts and `scaled-rcl` completed 50 valid cells in 50 attempts, with no
retry or infrastructure error. The campaign therefore contains all 100 planned
optimized cells. The supervisor and watcher exited normally and no experiment
container remained running.

The checksum-verified automatic analysis is stored on the experimental server
under `optimization-v1-analysis`. Its provenance records analysis commit
`45735d343add704163acda56bf62faceb3e03f0a`, baseline-state SHA-256
`2e2c8e8dc8497b88e808302460c54930bc5df51219b36558be467bbc09547422`,
and optimized-study-manifest SHA-256
`b0c5ca58d364a7d839f4512eb5d34b207b1112d5bf2a4b5b58aff7d848eb03f60`.

For the primary response, `scaled-rcl` versus the matched monolith yielded the
following descriptive medians of qualified jobs. In fabrication the counts were
1 versus 1, 2 versus 2, 2 versus 4, 3 versus 8, and 3 versus 16 at loads 1, 2,
4, 8, and 16. In suspension they were 1 versus 1, 1 versus 2, 2 versus 4,
2 versus 8, and 3 versus 16. The profile therefore did not reach parity with
the monolith and did not dominate `rebalanced`; it only raised the original
distributed high-load median from zero to between two and three qualified jobs.

Time to the quality threshold was also longer for the distributed profiles.
At loads 8 and 16, several distributed observations reached the 1,080-second
selection-window censoring limit, whereas the matched monolith medians remained
below that limit. Lower aggregate CPU core-seconds and peak memory at some high
loads coincided with substantially fewer qualified outputs. Consequently these
resource values cannot be interpreted as greater efficiency at equivalent
useful work.

This five-seed study is exploratory. It supports the engineering conclusion
that resource rebalancing and RCL replication partially alleviate the original
construction bottleneck, but it does not support claims that G-FShield is
globally faster, more resource-efficient, or experimentally superior to the
monolith. Architectural advantages such as separation of responsibilities,
independent deployment, observability, and component-level scaling must be
presented as design properties or capabilities, not as performance superiority.

## Frozen baseline exploratory analysis

The checksum-verified analysis was generated at
`formal-v1-analysis-exploratory` with analysis commit `344aa0b1e83f`. Across the
five paired seeds, median qualified-job counts were tied at loads 1 and 2, close
or tied at load 4, and adverse to the original distributed profile at loads 8
and 16. At the two highest loads, the distributed median was zero while the
monolith medians were 8 and 16 qualified jobs. This is the baseline engineering
finding that motivated the resource rebalance and RCL replication; it is not a
claim about the optimized profiles.

Primary and throughput outcomes retain all five pairs. One fabrication/load-16
monolith cell lost usable CPU/RAM sampling for 13 of its 16 job containers, so
that resource comparison has four finite pairs. No value was imputed; the
reduced `paired_count` is explicit in `paired-comparisons.csv`.

Do not update the dissertations with a claim of architectural superiority until
the optimized study has finished and its checksum-verified analysis is available.
Report null or adverse results as such.
