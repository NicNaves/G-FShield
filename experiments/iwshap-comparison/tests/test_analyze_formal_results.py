import importlib.util
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "analyze_formal_results.py"
SPEC = importlib.util.spec_from_file_location("analyze_formal_results", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class FormalAnalysisTests(unittest.TestCase):
    def test_result_path_is_remapped_from_recorded_campaign_root(self):
        with tempfile.TemporaryDirectory() as temporary:
            campaign = Path(temporary) / "campaign"
            result = campaign / "scenario" / "distributed" / "final-result.json"
            result.parent.mkdir(parents=True)
            result.write_text("{}", encoding="utf-8")
            resolved = MODULE.resolve_result_path(
                campaign / "state.json",
                {"result_path": "/host/archive/campaign/scenario/distributed/final-result.json"},
            )
        self.assertEqual(result, resolved)

    def test_anytime_target_is_censored_and_auc_is_bounded(self):
        result = MODULE.anytime_at_target([(2.0, 0.4), (5.0, 0.8)], 0.7, 10.0)
        self.assertTrue(result["baseline_target_reached"])
        self.assertEqual(5.0, result["time_to_baseline_seconds_censored"])
        self.assertAlmostEqual(0.52, result["anytime_auc_normalized"])
        censored = MODULE.anytime_at_target([(2.0, 0.4)], 0.7, 10.0)
        self.assertFalse(censored["baseline_target_reached"])
        self.assertEqual(10.0, censored["time_to_baseline_seconds_censored"])

    def test_monolith_stage_counts_reconcile_with_candidate_count(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "construcao_relieff_vnd.csv").write_text(
                "params\nheader\none\ntwo\n", encoding="utf-8"
            )
            (root / "iwssr_relieff_vnd.csv").write_text(
                "params\nheader\none\ntwo\nthree\n", encoding="utf-8"
            )
            counts = MODULE.stage_counts(root, "monolith", {"candidate_count": 5})
        self.assertEqual((2, 3), counts)


if __name__ == "__main__":
    unittest.main()
