import argparse
import gzip
import hashlib
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "campaign_supervisor.py"
sys.path.insert(0, str(ROOT))
SPEC = importlib.util.spec_from_file_location("campaign_supervisor", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
SUPERVISOR = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SUPERVISOR)


class CampaignSupervisorTest(unittest.TestCase):
    def test_log_rotation_compresses_exact_content_and_writes_checksum(self):
        with tempfile.TemporaryDirectory() as directory:
            log = Path(directory) / "campaign.log"
            original = b"abcdefgh" * 1024
            log.write_bytes(original)
            archive = SUPERVISOR.rotate_log(log, 100)
            self.assertIsNotNone(archive)
            self.assertFalse(log.exists())
            assert archive is not None
            with gzip.open(archive, "rb") as handle:
                self.assertEqual(original, handle.read())
            checksum = archive.with_suffix(archive.suffix + ".sha256").read_text("ascii")
            self.assertIn(hashlib.sha256(original).hexdigest(), checksum)
            self.assertIn(hashlib.sha256(archive.read_bytes()).hexdigest(), checksum)

    def test_small_log_is_not_rotated(self):
        with tempfile.TemporaryDirectory() as directory:
            log = Path(directory) / "campaign.log"
            log.write_bytes(b"small")
            self.assertIsNone(SUPERVISOR.rotate_log(log, 100))
            self.assertEqual(b"small", log.read_bytes())

    def test_exited_orchestrator_is_replaced_before_restart_limit(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            manifest = root / "manifest.json"
            state = root / "campaign-state.json"
            supervisor_state = root / "supervisor-state.json"
            log = root / "campaign.log"
            output = root / "output"
            manifest.write_text(
                json.dumps(
                    {
                        "campaign_id": "restart-test",
                        "campaign": {"maximum_seconds": 240 * 60 * 60},
                    }
                ),
                encoding="utf-8",
            )
            created = []

            class ExitedProcess:
                def __init__(self, returncode):
                    self.pid = 1000 + len(created)
                    self.returncode = returncode

                def poll(self):
                    return self.returncode

            def fake_popen(*_args, **_kwargs):
                process = ExitedProcess(23 if not created else 0)
                created.append(process)
                if len(created) == 2:
                    SUPERVISOR.atomic_json(
                        state,
                        {
                            "campaign_id": "restart-test",
                            "campaign_deadline_utc": "2099-01-01T00:00:00+00:00",
                            "state": "CAMPAIGN_COMPLETED",
                        },
                    )
                return process

            args = argparse.Namespace(
                manifest=manifest,
                state=state,
                supervisor_state=supervisor_state,
                log=log,
                output_root=output,
                minimum_free_disk_bytes=1,
                poll_seconds=1,
                grace_seconds=1,
                maximum_restarts=1,
                restart_delay_seconds=1,
                log_rotation_bytes=1024,
            )
            output.mkdir()
            with mock.patch.object(
                SUPERVISOR.subprocess, "Popen", side_effect=fake_popen
            ), mock.patch.object(SUPERVISOR.time, "sleep", return_value=None):
                self.assertEqual(0, SUPERVISOR.supervise(args))

            self.assertEqual(2, len(created))
            persisted = json.loads(supervisor_state.read_text(encoding="utf-8"))
            self.assertEqual(1, persisted["restart_count"])
            self.assertEqual("CAMPAIGN_COMPLETED", persisted["state"])

    def test_termination_reaches_the_separate_active_run_group(self):
        with tempfile.TemporaryDirectory() as directory:
            state_path = Path(directory) / "campaign-state.json"
            SUPERVISOR.atomic_json(
                state_path,
                {
                    "campaign_id": "termination-test",
                    "active_run": {"pid": 4321, "run_id": "active-run"},
                },
            )

            def fake_recover(state, path, _grace_seconds):
                state.pop("active_run")
                state.setdefault("recovery_events", []).append(
                    {"action": "sigterm_orphan"}
                )
                SUPERVISOR.atomic_json(path, state)

            child = mock.Mock()
            with mock.patch.object(
                SUPERVISOR, "terminate_group", return_value="sigterm"
            ), mock.patch.object(
                SUPERVISOR, "recover_orphan", side_effect=fake_recover
            ):
                actions = SUPERVISOR.terminate_campaign(child, state_path, 300)

            self.assertEqual(("sigterm", "sigterm_orphan"), actions)
            persisted = json.loads(state_path.read_text(encoding="utf-8"))
            self.assertNotIn("active_run", persisted)


if __name__ == "__main__":
    unittest.main()
