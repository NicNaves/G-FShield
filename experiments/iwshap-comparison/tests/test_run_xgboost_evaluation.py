import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "run_xgboost_evaluation.py"
SPEC = importlib.util.spec_from_file_location("run_xgboost_evaluation", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class XGBoostEvaluationTests(unittest.TestCase):
    def test_result_path_is_remapped_from_recorded_campaign_root(self):
        with tempfile.TemporaryDirectory() as temporary:
            campaign = Path(temporary) / "campaign"
            result = campaign / "scenario" / "monolith" / "final-result.json"
            result.parent.mkdir(parents=True)
            result.write_text("{}", encoding="utf-8")
            resolved = MODULE.resolve_result_path(
                campaign / "state.json",
                {"result_path": "/host/archive/campaign/scenario/monolith/final-result.json"},
            )
        self.assertEqual(result, resolved)

    def test_arff_reader_preserves_order_and_missing_values(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "sample.arff"
            path.write_text(
                "@relation sample\n@attribute 'one feature' numeric\n"
                "@attribute second numeric\n@attribute class {0,1}\n"
                "@data\n1,?,0\n2,3,1\n",
                encoding="utf-8",
            )
            names, rows, labels = MODULE.read_arff(path)
        self.assertEqual(names, ["one feature", "second"])
        self.assertEqual(labels, [0, 1])
        self.assertNotEqual(rows[0][1], rows[0][1])
        self.assertEqual(rows[1], [2.0, 3.0])

    def test_formal_campaign_subsets_include_architecture_and_seed(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            result_path = root / "run" / "final-result.json"
            result_path.parent.mkdir()
            result_path.write_text(
                json.dumps({"selected_features": [2, 5]}), encoding="utf-8"
            )
            (root / "state.json").write_text(
                json.dumps({
                    "state": "CAMPAIGN_COMPLETED",
                    "completed": [{
                        "scenario": "suspension",
                        "architecture": "distributed",
                        "seed": 11,
                        "result_path": str(result_path),
                    }],
                }),
                encoding="utf-8",
            )
            variants = MODULE.paired_subsets(root, "suspension")
        self.assertEqual(
            [("distributed-seed-11", [2, 5], str(result_path))], variants
        )


if __name__ == "__main__":
    unittest.main()
