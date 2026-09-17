# Independent quality-yield confirmation (v10)

The preregistered campaign completed all 60 valid arms (30 paired seeds,
72--101) without retry. It compares the distributed and sequential
implementations of the same RF--VND--IWSSR algorithm under a 2,700-second
selection deadline and a common aggregate ceiling of six CPUs and 12 GiB.

The primary outcome was the paired difference in the number of distinct
feature subsets with validation macro-F1 at least 0.945. G-FShield had median
1.0 and the monolith 0.0. The prespecified paired mean difference was +0.933
subsets per run (95% bootstrap CI 0.233 to 1.667), with 13 wins, 12 ties, five
losses, and one-sided paired permutation p=0.010135.

The held-out-quality guardrail was satisfied: its one-sided 95% lower bound
was -0.003791, above the -0.005 margin. Median construction/local-search
overlap was 99.37% for G-FShield and 0% for the monolith. The result supports a
bounded architectural advantage in high-quality-solution yield, not universal
superiority, lower latency, or resource efficiency.

Provenance:

- analysis-code commit: ba35c26ac;
- state SHA-256:
  301229f7e46f67d093d5c43d36a134346c1b1e136b1dace53700b0e6438f34c8;
- analysis seed: 20260906;
- permutation repetitions: 200,000;
- bootstrap repetitions: 20,000;
- source artifacts on server:
  /home/idscps/nicolas/experiment-artifacts/architecture-quality-yield/formal-v10-analysis.

The candidate-trace validator checks every persisted monolith trace row against
candidate_count but excludes post-deadline completions from outcome metrics,
as required by the frozen protocol.
