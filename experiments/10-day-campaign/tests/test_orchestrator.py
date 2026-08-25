import json
import subprocess
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "orchestrator.py"
MANIFEST = ROOT / "manifest.yaml"


class OrchestratorPreflightTest(unittest.TestCase):
    def test_development_manifest_has_valid_time_shape(self):
        result = subprocess.run(
            [sys.executable, str(SCRIPT), "--manifest", str(MANIFEST), "--development-preflight"],
            capture_output=True,
            text=True,
        )
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)

    def test_official_preflight_rejects_unfrozen_manifest(self):
        result = subprocess.run(
            [sys.executable, str(SCRIPT), "--manifest", str(MANIFEST), "--preflight"],
            capture_output=True,
            text=True,
        )
        self.assertEqual(2, result.returncode)
        self.assertIn("not frozen and runnable", result.stdout)

    def test_manifest_is_json_and_valid_yaml_shape(self):
        manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
        self.assertEqual(26, len(manifest["arms"]))
        self.assertTrue(all(8 * 60 * 60 == arm["window_seconds"] for arm in manifest["arms"]))
        self.assertTrue(all(60 * 60 == arm["run_timeout_seconds"] for arm in manifest["arms"]))
        self.assertEqual(240 * 60 * 60, manifest["campaign"]["maximum_seconds"])


if __name__ == "__main__":
    unittest.main()
