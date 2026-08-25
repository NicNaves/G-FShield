import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "generate_manifest.py"


class GenerateManifestTest(unittest.TestCase):
    def test_complete_matrix_and_time_budget(self):
        split_manifest = {
            "seed": 7,
            "source": {"sha256": "source"},
            "splits": {
                "train": {"sha256": "train"},
                "validation": {"sha256": "validation"},
                "test": {"sha256": "test"},
            },
            "index": {"sha256": "index"},
        }
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            split_path = root / "split.json"
            output = root / "manifest.yaml"
            split_path.write_text(json.dumps(split_manifest), encoding="utf-8")
            subprocess.run(
                [
                    sys.executable,
                    str(SCRIPT),
                    "--split-manifest",
                    str(split_path),
                    "--output",
                    str(output),
                ],
                check=True,
            )
            manifest = json.loads(output.read_text(encoding="utf-8"))
            self.assertEqual(26, len(manifest["arms"]))
            self.assertEqual(
                208 * 60 * 60,
                sum(arm["window_seconds"] for arm in manifest["arms"]),
            )
            self.assertEqual(240 * 60 * 60, manifest["campaign"]["maximum_seconds"])
            self.assertFalse(manifest["ready"])
            self.assertTrue(all(not arm["ready"] for arm in manifest["arms"]))
            distributed = [
                arm for arm in manifest["arms"] if arm["architecture"] == "distributed"
            ]
            self.assertEqual(24, len(distributed))
            self.assertEqual(
                {"bitflip", "iwss", "iwssr"},
                {arm["local_search"] for arm in distributed},
            )
            self.assertTrue(all(arm["window_seconds"] == 8 * 60 * 60 for arm in distributed))
            self.assertTrue(all(arm["run_timeout_seconds"] == 50 * 60 for arm in distributed))
            for index, arm in enumerate(manifest["arms"]):
                self.assertEqual(index * 8 * 60 * 60, arm["planned_start_offset_seconds"])
                self.assertEqual((index + 1) * 8 * 60 * 60, arm["planned_end_offset_seconds"])


if __name__ == "__main__":
    unittest.main()
