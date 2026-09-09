import importlib.util
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
SPEC = importlib.util.spec_from_file_location("run_paired_campaign", ROOT / "run_paired_campaign.py")
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class PairedCampaignTests(unittest.TestCase):
    def test_schedule_has_every_cell_and_balances_first_architecture(self):
        seeds = list(range(30))
        rows = MODULE.schedule(seeds, ["suspension", "fabrication"])
        self.assertEqual(len(rows), 120)
        self.assertEqual(len(set(rows)), 120)
        for scenario in ("suspension", "fabrication"):
            first = []
            for seed in seeds:
                pair = [row for row in rows if row[0] == seed and row[1] == scenario]
                first.append(pair[0][2])
            self.assertEqual(first.count("distributed"), 15)
            self.assertEqual(first.count("monolith"), 15)

    def test_seed_parser_requires_thirty_unique_values(self):
        with self.assertRaises(Exception):
            MODULE.parse_seeds("1,2,3")
        self.assertEqual(MODULE.parse_seeds(",".join(map(str, range(30)))), list(range(30)))


if __name__ == "__main__":
    unittest.main()
