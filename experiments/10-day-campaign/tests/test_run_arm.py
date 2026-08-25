import base64
import importlib.util
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("campaign_run_arm", ROOT / "run_arm.py")
assert SPEC is not None and SPEC.loader is not None
RUN_ARM = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(RUN_ARM)


class RunArmResultTest(unittest.TestCase):
    def test_best_message_uses_documented_tie_breakers(self):
        messages = [
            {"f1Score": 0.95, "solutionFeatures": [1, 2, 3], "runnigTime": 10, "_raw_line": 1},
            {"f1Score": 0.95, "solutionFeatures": [1, 2], "runnigTime": 20, "_raw_line": 2},
            {"f1Score": 0.95, "solutionFeatures": [1, 3], "runnigTime": 15, "_raw_line": 3},
            {"f1Score": 0.94, "solutionFeatures": [1], "runnigTime": 1, "_raw_line": 4},
        ]
        self.assertIs(messages[2], RUN_ARM.best_message(messages))

    def test_parse_extended_evaluator_result(self):
        labels = [
            base64.urlsafe_b64encode(label.encode("utf-8")).decode("ascii").rstrip("=")
            for label in ("normal", "attack")
        ]
        line = "\t".join(
            [
                "OK", "0.9", "0.91", "0.92", "0.93", "0.94", "0.95", "0.96", "123",
                ",".join(labels), "0.8,0.81,0.82;0.9,0.91,0.92", "8,2;1,9",
            ]
        )
        parsed = RUN_ARM.parse_evaluator_line(line)
        self.assertEqual(["normal", "attack"], parsed["class_labels"])
        self.assertEqual(0.81, parsed["per_class_metrics"]["normal"]["precision"])
        self.assertEqual([[8.0, 2.0], [1.0, 9.0]], parsed["confusion_matrix"])

    def test_invalid_or_empty_candidates_are_rejected(self):
        messages = [
            {"f1Score": 1.1, "solutionFeatures": [1]},
            {"f1Score": 0.9, "solutionFeatures": []},
            {"f1Score": "not-a-number", "solutionFeatures": [1]},
            {"f1Score": 0.95, "solutionFeatures": [1, 1, 2]},
            {"f1Score": 0.95, "solutionFeatures": [0, 2]},
        ]
        self.assertIsNone(RUN_ARM.best_message(messages))


if __name__ == "__main__":
    unittest.main()
