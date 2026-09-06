import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


REPO = Path(__file__).resolve().parents[3]
ROOT = REPO / "experiments/architecture-causal-campaign"
SPEC = importlib.util.spec_from_file_location(
    "quality_yield_analysis", ROOT / "analyze_quality_yield.py"
)
assert SPEC is not None and SPEC.loader is not None
ANALYSIS = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ANALYSIS)


class QualityYieldTest(unittest.TestCase):
    def test_protocol_uses_disjoint_confirmation_seeds(self):
        original = json.loads((ROOT / "protocol.json").read_text(encoding="utf-8"))
        confirmation = json.loads(
            (ROOT / "protocol-quality-yield-v10.json").read_text(encoding="utf-8")
        )
        self.assertEqual(30, len(confirmation["seeds"]))
        self.assertFalse(set(original["seeds"]) & set(confirmation["seeds"]))
        self.assertEqual(
            0.945,
            confirmation["hypotheses"]["quality_threshold_validation_macro_f1"],
        )

    def test_distributed_trace_normalizes_one_based_features_and_deadline(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "compose.log").write_text(
                'x | {"message":"dls iteration search=IWSSR f1=0.946 '
                'featureCount=3 features=[3, 1, 2] campaignElapsedMs=2500"}\n'
                'x | {"message":"rcl generation ready f1=0.950 '
                'features=[4, 5] campaignElapsedMs=4001"}\n',
                encoding="utf-8",
            )
            rows = ANALYSIS.distributed_candidates(
                root,
                {"measurement_start_offset_ms": 1000, "selection_duration_ms": 3000},
            )
            self.assertEqual(1, len(rows))
            self.assertEqual((0, 1, 2), rows[0]["features"])
            self.assertEqual(1500.0, rows[0]["elapsed_ms"])

    def test_quality_yield_counts_distinct_subsets(self):
        rows = [
            {"features": (0, 1), "f1": 0.946, "elapsed_ms": 1000},
            {"features": (0, 1), "f1": 0.947, "elapsed_ms": 2000},
            {"features": (0, 2), "f1": 0.944, "elapsed_ms": 3000},
            {"features": (0, 3), "f1": 0.948, "elapsed_ms": 4000},
        ]
        metrics = ANALYSIS.yield_metrics(rows, 10.0)
        self.assertEqual(3, metrics["unique_candidate_count"])
        self.assertEqual(2, metrics["distinct_qualified_count"])
        self.assertEqual(1.0, metrics["time_to_first_qualified_seconds_censored"])


if __name__ == "__main__":
    unittest.main()
