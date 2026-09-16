import importlib.util
import sys
import unittest
from pathlib import Path

import pandas as pd

MODULE_PATH = Path(__file__).resolve().parents[1] / "analyze_optimized_concurrent_results.py"
sys.path.insert(0, str(MODULE_PATH.parent))
SPEC = importlib.util.spec_from_file_location("analyze_optimized_concurrent_results", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class OptimizedConcurrentAnalysisTest(unittest.TestCase):
    def test_three_profiles_are_paired_to_the_same_monolith(self):
        rows = []
        values = {"monolith": 4.0, "original": 0.0, "rebalanced": 3.0, "scaled-rcl": 4.0}
        for profile, qualified in values.items():
            for seed in range(5):
                rows.append({
                    "scenario": "suspension", "concurrency": 8, "batch_seed": seed,
                    "architecture": "monolith" if profile == "monolith" else "distributed",
                    "profile": profile, "qualified_job_count": qualified,
                    "completed_job_count": qualified,
                    "median_time_to_quality_seconds_censored": 10.0,
                    "local_search_evaluations_per_second": qualified,
                    "median_test_f1_macro": 0.8,
                    "estimated_cpu_core_seconds": 100.0,
                    "memory_mib_peak": 1000.0,
                })
        result = MODULE.comparisons(pd.DataFrame(rows))
        self.assertEqual(set(result.distributed_profile), set(MODULE.PROFILES))
        primary = result[result.metric == "qualified_job_count"].set_index("distributed_profile")
        self.assertEqual(primary.loc["original", "paired_median_difference_distributed_minus_monolith"], -4.0)
        self.assertEqual(primary.loc["scaled-rcl", "paired_median_difference_distributed_minus_monolith"], 0.0)


if __name__ == "__main__":
    unittest.main()