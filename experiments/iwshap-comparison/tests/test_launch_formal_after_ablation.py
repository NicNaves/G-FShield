import importlib.util
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "launch_formal_after_ablation.py"
SPEC = importlib.util.spec_from_file_location("launch_formal_after_ablation", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class FormalGateTests(unittest.TestCase):
    def test_phase_counts_are_separate_and_respect_cutoff(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "compose.log"
            path.write_text(
                "rcl generation ready campaignElapsedMs=100\n"
                "dls iteration search=IWSSR campaignElapsedMs=150\n"
                "rcl generation ready campaignElapsedMs=201\n",
                encoding="utf-8",
            )
            self.assertEqual(
                {"construction": 1, "local_search": 1},
                MODULE.phase_counts(path, 200),
            )


if __name__ == "__main__":
    unittest.main()
