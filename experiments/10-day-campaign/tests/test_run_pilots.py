import argparse
import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
SPEC = importlib.util.spec_from_file_location("campaign_run_pilots", ROOT / "run_pilots.py")
assert SPEC is not None and SPEC.loader is not None
PILOTS = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PILOTS)


class RunPilotsTest(unittest.TestCase):
    def test_namespace_is_propagated_to_campaign_and_run_identifiers(self):
        with tempfile.TemporaryDirectory() as temporary:
            args = argparse.Namespace(
                pilot_namespace="isolated-pilot",
                seed=42,
                dataset_dir=Path(temporary),
            )
            case = {"name": "pilot-distributed-ig-vnd-bitflip"}
            command = PILOTS.common_arguments(args, case, Path(temporary))
            self.assertIn("gfshield-formal-pilots-isolated-pilot", command)
            self.assertIn("isolated-pilot-pilot-distributed-ig-vnd-bitflip", command)


if __name__ == "__main__":
    unittest.main()
