import importlib.util
import json
import unittest
from pathlib import Path


REPO = Path(__file__).resolve().parents[3]
ROOT = REPO / "experiments/architecture-causal-campaign"


def load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


RUNNER = load("pipeline_ablation_runner", ROOT / "run_pipeline_ablation.py")
ANALYZER = load("pipeline_ablation_analyzer", ROOT / "analyze_pipeline_ablation.py")


class PipelineAblationTest(unittest.TestCase):
    def setUp(self):
        self.protocol = json.loads(
            (ROOT / "protocol-pipeline-ablation-v11.json").read_text(encoding="utf-8")
        )

    def test_protocol_has_one_hundred_cells_and_ten_day_cap(self):
        rows = RUNNER.schedule(self.protocol)
        self.assertEqual(100, len(rows))
        self.assertEqual(25, len(self.protocol["seeds"]))
        self.assertLessEqual(self.protocol["maximum_seconds"], 10 * 24 * 60 * 60)
        expected = set(RUNNER.EXPECTED_ARMS)
        for seed in self.protocol["seeds"]:
            self.assertEqual(expected, {arm for row_seed, arm in rows if row_seed == seed})

    def test_williams_orders_balance_the_first_twenty_four_seeds(self):
        rows = RUNNER.schedule(self.protocol)
        blocks = [rows[index:index + 4] for index in range(0, 24 * 4, 4)]
        for position in range(4):
            counts = {}
            for block in blocks:
                arm = block[position][1]
                counts[arm] = counts.get(arm, 0) + 1
            self.assertEqual({arm: 6 for arm in RUNNER.EXPECTED_ARMS}, counts)

    def test_worker_count_is_the_only_command_difference_between_distributed_arms(self):
        commands = {
            arm: RUNNER.command_for(
                self.protocol, REPO, Path("/tmp/result"), arm, 102, f"run-{arm}", "tag"
            )
            for arm in ("distributed-w1", "distributed-w2", "distributed-w4")
        }
        for arm, workers in (
            ("distributed-w1", "1"),
            ("distributed-w2", "2"),
            ("distributed-w4", "4"),
        ):
            text = " ".join(commands[arm])
            self.assertIn(f"--pipeline-workers {workers}", text)
            self.assertIn("--aggregate-cpus 6", text)
            self.assertIn("--aggregate-memory 12g", text)
            self.assertIn("--cpuset 8-15", text)

    def test_one_worker_receives_the_same_explicit_resource_ceiling(self):
        source = (
            REPO / "experiments/10-day-campaign/run_arm.py"
        ).read_text(encoding="utf-8")
        self.assertIn("if args.pipeline_workers >= 1:", source)
        self.assertNotIn("if args.pipeline_workers > 1:", source)

    def test_quality_yield_auc_integrates_first_qualified_time_per_subset(self):
        candidates = [
            {"elapsed_ms": 0, "f1": 0.946, "features": (1, 2)},
            {"elapsed_ms": 200, "f1": 0.947, "features": (1, 2)},
            {"elapsed_ms": 1350000, "f1": 0.945, "features": (3, 4)},
            {"elapsed_ms": 2000000, "f1": 0.940, "features": (5,)},
        ]
        metrics = ANALYZER.quality_yield_metrics(candidates, 2700.0)
        self.assertEqual(3, metrics["unique_candidate_count"])
        self.assertEqual(2, metrics["distinct_qualified_count"])
        self.assertAlmostEqual(1.5, metrics["quality_yield_auc_normalized"])
        self.assertEqual(0.0, metrics["time_to_first_qualified_seconds_censored"])

    def test_resource_limits_sum_to_common_ceiling(self):
        limits = self.protocol["resources"]["distributed_component_ceiling_sum"]
        self.assertEqual(
            self.protocol["resources"]["aggregate_cpu_ceiling"],
            sum(component["cpu"] for component in limits.values()),
        )
        self.assertEqual(
            12, sum(component["memory_gib"] for component in limits.values())
        )


if __name__ == "__main__":
    unittest.main()
