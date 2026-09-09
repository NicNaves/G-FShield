import importlib.util
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parents[1] / "prepare_datasets.py"
SPEC = importlib.util.spec_from_file_location("prepare_iwshap_datasets", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class PrepareDatasetsTests(unittest.TestCase):
    def test_identical_vectors_share_a_split(self):
        digest = MODULE.feature_digest(["1", "D", ""])
        self.assertEqual(
            MODULE.assigned_split(digest, 20260909),
            MODULE.assigned_split(digest, 20260909),
        )

    def test_arff_missing_and_categorical_encoding(self):
        self.assertEqual("?", MODULE.arff_value(""))
        self.assertEqual("?", MODULE.arff_value("NaN"))
        self.assertEqual("0", MODULE.arff_value("D", {"D": 0}))
        self.assertEqual("1.25", MODULE.arff_value("1.25"))

    def test_log_parser_distinguishes_time_to_best_from_single_fit(self):
        content = """Baseline: F1-Score=0.5, Recall=0.6, Precision=0.4
Rodada: 0
F1 Score: 0.4, Recall: 0.5, Precision: 0.3, Tempo: 1.25 segundos
Rodada: 1
F1 Score: 0.7, Recall: 0.8, Precision: 0.6, Tempo: 2.5 segundos
Melhores features finais:
 ['a', 'b']
Melhor F1 Score: 0.7
"""
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "log.txt"
            path.write_text(content, encoding="utf-8")
            parsed = MODULE.parse_log(path)
        self.assertEqual(2, parsed["evaluated_rounds"])
        self.assertEqual(1, parsed["best"]["first_best_round_zero_based"])
        self.assertEqual(2.5, parsed["best"]["reported_fit_predict_seconds"])
        self.assertEqual(
            3.75,
            parsed["best"]["cumulative_reported_fit_predict_seconds_to_first_best"],
        )


if __name__ == "__main__":
    unittest.main()
