import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


SCRIPT = Path(__file__).resolve().parents[1] / "analyze_concurrent_results.py"
SPEC = importlib.util.spec_from_file_location("analyze_concurrent_results", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class StopAfterComparison(Exception):
    pass


class AnalyzeConcurrentResultsCliTest(unittest.TestCase):
    def test_secondary_resource_metric_preserves_incomplete_pair_count(self):
        rows = []
        for seed in range(1, 6):
            for architecture in ("distributed", "monolith"):
                value = float(seed)
                rows.append({
                    "scenario": "fabrication",
                    "concurrency": 16,
                    "batch_seed": seed,
                    "architecture": architecture,
                    "qualified_job_count": value,
                    "completed_job_count": value,
                    "median_time_to_quality_seconds_censored": value,
                    "local_search_evaluations_per_second": value,
                    "median_test_f1_macro": value,
                    "estimated_cpu_core_seconds": (
                        float("nan") if seed == 5 and architecture == "monolith" else value
                    ),
                    "memory_mib_peak": value,
                })
        comparisons = MODULE.paired_comparisons(MODULE.pd.DataFrame(rows), expected_pairs=5)
        resource = comparisons[comparisons.metric == "estimated_cpu_core_seconds"].iloc[0]
        primary = comparisons[comparisons.metric == "qualified_job_count"].iloc[0]
        self.assertEqual(resource.paired_count, 4)
        self.assertEqual(primary.paired_count, 5)
    def test_expected_pairs_is_forwarded_to_all_validations(self):
        with tempfile.TemporaryDirectory() as directory:
            arguments = [
                str(SCRIPT),
                "--state", str(Path(directory) / "state.json"),
                "--output", str(Path(directory) / "analysis"),
                "--expected-pairs", "5",
                "--exploratory",
            ]
            frame = object()
            with patch.object(sys, "argv", arguments), patch.object(
                MODULE, "load_batches", return_value=frame
            ) as load_batches, patch.object(
                MODULE, "paired_comparisons", side_effect=StopAfterComparison
            ) as paired_comparisons:
                with self.assertRaises(StopAfterComparison):
                    MODULE.main()
            self.assertEqual(load_batches.call_args.args[2], 5)
            self.assertIs(paired_comparisons.call_args.args[0], frame)
            self.assertEqual(paired_comparisons.call_args.args[1], 5)


if __name__ == "__main__":
    unittest.main()