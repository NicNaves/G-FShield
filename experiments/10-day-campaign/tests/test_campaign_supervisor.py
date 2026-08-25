import gzip
import hashlib
import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path


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


if __name__ == "__main__":
    unittest.main()
