import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

import numpy as np


SCRIPT = Path(__file__).resolve().parents[1] / "analyze_results.py"
SPEC = importlib.util.spec_from_file_location("campaign_analysis", SCRIPT)
ANALYSIS = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(ANALYSIS)


class CampaignAnalysisTest(unittest.TestCase):
    def test_quantity_parser_handles_decimal_and_binary_units(self):
        self.assertEqual(1_500_000, ANALYSIS.quantity_bytes("1.5MB"))
        self.assertEqual(1.5 * 1024**3, ANALYSIS.quantity_bytes("1.5GiB"))

    def test_exact_sign_flip_and_holm_adjustment_are_bounded(self):
        differences = np.array([1.0] * 8)
        self.assertEqual(2 / 256, ANALYSIS.exact_sign_flip_p(differences))
        adjusted = ANALYSIS.holm_adjust([0.01, 0.04, 0.03])
        self.assertEqual([0.03, 0.06, 0.06], adjusted)

    def test_resource_parser_uses_only_the_scoped_stats_array(self):
        record = {
            "all_container_stats": [{"CPUPerc": "999.00%", "MemUsage": "60GiB / 64GiB"}],
            "stats": [
                {
                    "CPUPerc": "125.00%",
                    "MemUsage": "512MiB / 4GiB",
                    "PIDs": "20",
                    "NetIO": "10MB / 20MB",
                    "BlockIO": "1MiB / 2MiB",
                },
                {
                    "CPUPerc": "75.00%",
                    "MemUsage": "1GiB / 4GiB",
                    "PIDs": "10",
                    "NetIO": "5MB / 7MB",
                    "BlockIO": "3MiB / 4MiB",
                },
            ],
        }
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "samples.jsonl"
            path.write_text(json.dumps(record) + "\n", encoding="utf-8")
            metrics = ANALYSIS.parse_resource_samples(path)
        self.assertEqual(2.0, metrics["cpu_cores_median"])
        self.assertEqual(1536.0, metrics["memory_mib_peak"])
        self.assertEqual(30.0, metrics["pids_median"])


if __name__ == "__main__":
    unittest.main()
