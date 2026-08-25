import importlib.util
import json
import os
import re
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
        self.assertEqual(8, len(manifest["seeds"]))
        self.assertEqual(8, len(set(manifest["seeds"])))
        self.assertEqual(list(range(42, 50)), manifest["seeds"])
        self.assertEqual(10 * 1024**3, manifest["storage"]["minimum_free_bytes"])
        self.assertTrue(manifest["watchdog"]["external"])
        self.assertTrue(manifest["watchdog"]["deadline_is_immutable"])

    def test_compose_image_digests_have_sha256_length(self):
        compose = (ROOT / "docker-compose.campaign.yml").read_text(encoding="utf-8")
        digests = re.findall(r"@sha256:([0-9a-f]+)", compose)
        self.assertGreaterEqual(len(digests), 2)
        self.assertTrue(all(len(digest) == 64 for digest in digests))

    def test_preflight_rejects_missing_storage_reserve(self):
        manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
        manifest["storage"]["minimum_free_bytes"] = 0
        errors = ORCHESTRATOR.validate_manifest(manifest, require_ready=False)
        self.assertIn("storage threshold must reserve at least 10 GiB", errors)

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

    def test_result_artifact_identity_and_status_are_verified(self):
        with tempfile.TemporaryDirectory() as temporary:
            result_path = Path(temporary) / "final-result.json"
            result_path.write_text(
                json.dumps(
                    {
                        "campaign_id": "campaign",
                        "arm_id": "arm",
                        "run_id": "run",
                        "status": "timeout",
                        "stop_reason": "run_timeout",
                        **{
                            field: None
                            for field in json.loads(
                                (ROOT / "result-schema.json").read_text(encoding="utf-8")
                            )["required"]
                        },
                    }
                ),
                encoding="utf-8",
            )
            record = {}
            complete = json.loads(result_path.read_text(encoding="utf-8"))
            complete.update(
                {
                    "campaign_id": "campaign", "arm_id": "arm", "run_id": "run",
                    "status": "timeout", "stop_reason": "run_timeout", "stage": "end_to_end",
                    "selected_features": [0], "classifier": "Weka J48",
                    "classifier_version": "weka-stable 3.8.6",
                    "classifier_parameters": {
                        "confidence_factor": 0.25,
                        "minimum_instances_per_leaf": 2,
                        "pruned": True,
                    },
                }
            )
            for field in (
                "validation_f1_macro", "validation_f1_weighted",
                "validation_precision_macro", "validation_precision_weighted",
                "validation_recall_macro", "validation_recall_weighted",
                "test_f1_macro", "test_f1_weighted", "test_precision_macro",
                "test_recall_macro", "accuracy",
            ):
                complete[field] = 0.9
            for field in ("dataset_hash", "train_hash", "validation_hash", "test_hash"):
                complete[field] = "a" * 64
            result_path.write_text(json.dumps(complete), encoding="utf-8")
            self.assertTrue(
                ORCHESTRATOR.attach_result_artifact(
                    record, result_path, "campaign", "arm", "run"
                )
            )
            self.assertTrue(record["artifact_valid"])
            self.assertEqual("timeout", record["experimental_status"])

            invalid = {}
            self.assertFalse(
                ORCHESTRATOR.attach_result_artifact(
                    invalid, result_path, "campaign", "arm", "different-run"
                )
            )
            self.assertEqual("result identity mismatch", invalid["artifact_error"])


if __name__ == "__main__":
    unittest.main()
