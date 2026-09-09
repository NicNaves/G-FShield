import importlib.util
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "analyze_results.py"
SPEC = importlib.util.spec_from_file_location("analyze_results", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class AnalyzeResultsTests(unittest.TestCase):
    def test_historical_rows_do_not_present_positive_f1_as_macro_f1(self):
        manifest = {
            "scenarios": [{
                "scenario": "fabrication",
                "features": 688,
                "iwshap_log_scope": "historical scope",
                "iwshap_log": {
                    "baseline": {"f1_positive_class": 0.79},
                    "best": {
                        "f1_positive_class": 0.78,
                        "feature_count": 4,
                        "reported_fit_predict_seconds": 0.5,
                        "cumulative_reported_fit_predict_seconds_to_first_best": 5.4,
                    },
                    "evaluated_rounds": 688,
                },
            }]
        }
        rows = MODULE.historical_rows(manifest)
        self.assertEqual(rows[0]["f1_positive"], 0.79)
        self.assertIsNone(rows[0]["f1_macro"])
        self.assertAlmostEqual(rows[1]["reduction_percent"], 99.4186046512)
        self.assertEqual(rows[1]["end_to_end_time_ms"], 5400.0)


if __name__ == "__main__":
    unittest.main()
