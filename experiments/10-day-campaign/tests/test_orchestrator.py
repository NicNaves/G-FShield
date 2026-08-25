import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "orchestrator.py"
MANIFEST = ROOT / "manifest.yaml"
SPEC = importlib.util.spec_from_file_location("campaign_orchestrator", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
ORCHESTRATOR = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ORCHESTRATOR)


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
        self.assertTrue(all(50 * 60 == arm["run_timeout_seconds"] for arm in manifest["arms"]))
        self.assertEqual(240 * 60 * 60, manifest["campaign"]["maximum_seconds"])

    def test_preflight_rejects_schedule_that_cannot_attempt_eight_runs(self):
        manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
        manifest["arms"][0]["run_timeout_seconds"] = 60 * 60
        errors = ORCHESTRATOR.validate_manifest(manifest, require_ready=False)
        self.assertTrue(any("cannot attempt eight runs" in error for error in errors))

    def test_stale_lock_is_recovered_but_live_lock_is_preserved(self):
        with tempfile.TemporaryDirectory() as temporary:
            lock_path = Path(temporary) / "campaign.lock"
            lock_path.write_text("999999999\n", encoding="ascii")
            old = time.time() - 120
            os.utime(lock_path, (old, old))
            with ORCHESTRATOR.CampaignLock(lock_path):
                self.assertTrue(lock_path.exists())
            self.assertFalse(lock_path.exists())

            lock_path.write_text(f"{os.getpid()}\n", encoding="ascii")
            with self.assertRaises(RuntimeError):
                with ORCHESTRATOR.CampaignLock(lock_path):
                    pass


if __name__ == "__main__":
    unittest.main()
