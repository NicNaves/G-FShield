# Causal architecture campaign analysis

- Complete paired seeds: 30.
- Distributed median test macro-F1: 0.945529.
- Monolith median test macro-F1: 0.944699.
- Paired median time-to-0.94 difference (distributed minus monolith): 422.740 s.
- Primary paired permutation p-value: 0.000794996.
- One-sided 95% bootstrap lower bound for paired mean held-out macro-F1 difference: -0.005615 (margin -0.005).
- Median utilized CPU cores: distributed 4.076; monolith 1.004.
- Median candidate throughput: distributed 0.1074/s; monolith 0.0739/s.
- Median estimated CPU-hours per candidate: distributed 0.010875; monolith 0.003821.
- Median local-search overlap: distributed 100.00%; monolith 0.00%.
- Conclusion: The prespecified evidence does not establish the architectural speed advantage.

A positive difference alone is not architectural proof. The conclusion must also consider
the prespecified effect direction, adjusted uncertainty, throughput, resource-normalized
costs, implementation-parity checks, and the single-host external-validity boundary.
