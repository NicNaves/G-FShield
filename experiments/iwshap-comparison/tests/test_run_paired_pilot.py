import importlib.util
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace


SCRIPT = Path(__file__).resolve().parents[1] / "run_paired_pilot.py"
SPEC = importlib.util.spec_from_file_location("run_paired_pilot", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class PairedPilotTests(unittest.TestCase):
    def test_commands_match_algorithm_and_resources(self):
        scenario = {
            "scenario": "fabrication",
            "features": 688,
            "split_index": {"sha256": "dataset"},
            "splits": {
                split: {"full_arff": {"sha256": split}}
                for split in ("train", "validation", "test")
            },
        }
        with tempfile.TemporaryDirectory() as temporary:
            args = SimpleNamespace(
                seed=7, data_root=Path(temporary), run_timeout_seconds=1200,
                finalization_reserve_seconds=120, max_accepted_improvements=50,
                minimum_improvement=0.0001, image_tag="tag", cpuset="8-15",
                numa_node="1", aggregate_cpus=6.0, aggregate_memory="12g",
                monolith_runner=Path("mono.py"), distributed_runner=Path("dist.py"),
                pipeline_workers=3, startup_timeout_seconds=300,
                evaluator_image="evaluator:tag",
                campaign_id="test-campaign", run_prefix="test-run",
            )
            distributed, _ = MODULE.command_for(
                args, scenario, "distributed", Path(temporary) / "d"
            )
            monolith, _ = MODULE.command_for(
                args, scenario, "monolith", Path(temporary) / "m"
            )
        distributed_text = " ".join(str(value) for value in distributed)
        monolith_text = " ".join(str(value) for value in monolith)
        self.assertIn("--construction relieff", distributed_text)
        self.assertIn("--campaign-id test-campaign", distributed_text)
        self.assertIn("test-run-fabrication-distributed-s7", distributed_text)
        self.assertIn("--controller vnd", distributed_text)
        self.assertIn("--enabled-local-searches iwssr", distributed_text)
        self.assertIn("--pipeline-workers 3", distributed_text)
        self.assertIn("--aggregate-cpus 6.0", distributed_text)
        self.assertIn("--aggregate-memory 12g", distributed_text)
        self.assertIn("--matched-architecture", monolith)
        self.assertIn("--aggregate-cpus 6.0", monolith_text)
        self.assertIn("--aggregate-memory 12g", monolith_text)


if __name__ == "__main__":
    unittest.main()
