import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


SCRIPT = Path(__file__).resolve().parents[1] / "analyze_concurrent_results.py"
SPEC = importlib.util.spec_from_file_location("analyze_concurrent_results", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class StopAfterLoad(Exception):
    pass


class AnalyzeConcurrentResultsCliTest(unittest.TestCase):
    def test_expected_pairs_is_forwarded_to_cell_validation(self):
        with tempfile.TemporaryDirectory() as directory:
            arguments = [
                str(SCRIPT),
                "--state", str(Path(directory) / "state.json"),
                "--output", str(Path(directory) / "analysis"),
                "--expected-pairs", "5",
                "--exploratory",
            ]
            with patch.object(sys, "argv", arguments), patch.object(
                MODULE, "load_batches", side_effect=StopAfterLoad
            ) as load_batches:
                with self.assertRaises(StopAfterLoad):
                    MODULE.main()
            self.assertEqual(load_batches.call_args.args[2], 5)


if __name__ == "__main__":
    unittest.main()