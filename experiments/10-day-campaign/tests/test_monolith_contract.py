import unittest
from pathlib import Path


REPO = Path(__file__).resolve().parents[3]
MONOLITHS = (
    REPO / "experiments/monoliths/monolith1-graspy2/main.py",
    REPO / "experiments/monoliths/monolith2-graspy/main.py",
)


class MonolithContractTest(unittest.TestCase):
    def test_campaign_monoliths_use_monotonic_elapsed_time(self):
        for path in MONOLITHS:
            source = path.read_text(encoding="utf-8")
            self.assertNotIn("time.time()", source, path)
            self.assertIn("time.monotonic()", source, path)

    def test_campaign_monoliths_emit_the_common_j48_contract(self):
        for path in MONOLITHS:
            source = path.read_text(encoding="utf-8")
            self.assertIn('"classifier": "Weka J48"', source, path)
            self.assertIn('"weka-stable 3.8.6"', source, path)
            self.assertIn('"confidence_factor": 0.25', source, path)
            self.assertIn('"minimum_instances_per_leaf": 2', source, path)


if __name__ == "__main__":
    unittest.main()
