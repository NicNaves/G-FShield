import importlib.util
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "run_xgboost_evaluation.py"
SPEC = importlib.util.spec_from_file_location("run_xgboost_evaluation", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class XGBoostEvaluationTests(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main()
