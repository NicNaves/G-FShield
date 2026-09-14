import argparse
import importlib.util
import tempfile
import unittest
import sys
from pathlib import Path

MODULE_PATH = Path(__file__).resolve().parents[1] / "run_concurrent_campaign.py"
sys.path.insert(0, str(MODULE_PATH.parent))
SPEC = importlib.util.spec_from_file_location("run_concurrent_campaign", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ConcurrentCampaignTest(unittest.TestCase):
    def test_derived_job_seeds_are_deterministic_and_unique(self):
        self.assertEqual(
            MODULE.derived_job_seeds(20260941, 4),
            [2026094101, 2026094102, 2026094103, 2026094104],
        )

    def test_memory_budget_conversion(self):
        self.assertEqual(MODULE.memory_mib("12g"), 12288)
        self.assertEqual(MODULE.memory_mib("768m"), 768)
        with self.assertRaises(ValueError):
            MODULE.memory_mib("12gb")

    def test_request_counts_are_isolated_by_request_and_deadline(self):
        jobs = [
            {"request_id": "request-a"},
            {"request_id": "request-b"},
        ]
        log = "\n".join([
            "rcl generation ready algorithm=RELIEF requestId=request-a generation=1 seedId=seed-a featureCount=2 campaignElapsedMs=100",
            "dls iteration search=IWSSR seedId=seed-a iteration=1 campaignElapsedMs=150",
            "rcl generation ready algorithm=RELIEF requestId=request-b generation=1 seedId=seed-b featureCount=2 campaignElapsedMs=200",
            "dls iteration search=IWSSR seedId=seed-b iteration=1 campaignElapsedMs=250",
            "dls iteration search=IWSSR seedId=seed-a iteration=2 campaignElapsedMs=999",
        ])
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "compose.log"
            path.write_text(log, encoding="utf-8")
            counts = MODULE.request_counts(path, jobs, 500)
        self.assertEqual(counts["request-a"], {"construction": 1, "local_search": 1})
        self.assertEqual(counts["request-b"], {"construction": 1, "local_search": 1})

    def test_schedule_has_one_paired_cell_per_factor_combination(self):
        args = argparse.Namespace(batch_seeds=[1, 2], loads=[1, 4])
        rows = MODULE.schedule(args, ["suspension", "fabrication"])
        self.assertEqual(len(rows), 2 * 2 * 2 * 2)
        cells = {(seed, scenario, load, architecture) for seed, scenario, load, architecture in rows}
        self.assertEqual(len(cells), len(rows))


if __name__ == "__main__":
    unittest.main()
