import copy
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

REPO = Path(__file__).resolve().parents[3]
SPEC = importlib.util.spec_from_file_location(
    "performance_optimization", REPO / "experiments/architecture-causal-campaign/run_performance_optimization.py")
RUNNER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(RUNNER)


class PerformanceOptimizationTest(unittest.TestCase):
    def setUp(self):
        self.protocol = json.loads((REPO / "experiments/performance-v12/protocol.json").read_text("utf-8"))

    def test_formal_factorial_has_99_cells_and_no_pilot_seed(self):
        rows = RUNNER.schedule(self.protocol)
        self.assertEqual(99, len(rows))
        self.assertEqual(99, len(set(rows)))
        self.assertNotIn(127, self.protocol["seeds"])
        self.assertEqual(9, len(RUNNER.schedule(self.protocol, 127)))
        self.assertEqual(864000, self.protocol["maximum_seconds"])
        arms = self.protocol["arms"][1:]
        self.assertEqual(8, len({(a["pipeline_workers"], a["neighborhood_parallelism"], a["memoization"]) for a in arms}))

    def test_each_factor_is_passed_to_runner_with_fixed_resources(self):
        for arm in self.protocol["arms"]:
            command = RUNNER.command_for(self.protocol, REPO, Path("output"), arm["id"], 127, "run", "v12")
            self.assertEqual("6", command[command.index("--aggregate-cpus") + 1])
            self.assertEqual("12g", command[command.index("--aggregate-memory") + 1])
            if arm["architecture"] == "distributed":
                self.assertEqual(str(arm["pipeline_workers"]), command[command.index("--pipeline-workers") + 1])
                self.assertEqual(str(arm["neighborhood_parallelism"]), command[command.index("--iwssr-neighborhood-parallelism") + 1])
                self.assertEqual(arm["memoization"], "--iwssr-evaluation-memoization" in command)

    def test_invalid_arm_or_resource_budget_fails_before_external_commands(self):
        for change in ("factor", "budget", "seed", "order"):
            protocol = copy.deepcopy(self.protocol)
            if change == "factor":
                protocol["arms"][1]["neighborhood_parallelism"] = 9
            elif change == "budget":
                protocol["resources"]["aggregate_cpu_ceiling"] = 7
            elif change == "seed":
                protocol["seeds"][0] = 127
            else:
                protocol["order_design"]["orders"][0] *= 2
            with mock.patch.object(RUNNER.base, "checked", side_effect=AssertionError("unexpected external command")):
                with self.assertRaises(RuntimeError):
                    RUNNER.validate_inputs(protocol, REPO, "tag", "image")

    def test_latin_square_balances_first_nine_seed_positions(self):
        orders = self.protocol["order_design"]["orders"]
        for position in range(9):
            self.assertEqual(set(RUNNER.EXPECTED_ARMS), {order[position] for order in orders})

    def test_result_gate_rejects_unclassified_counts_and_wrong_compose(self):
        arm = self.protocol["arms"][2]
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            path = root / "final-result.json"
            result = {
                "campaign_id": self.protocol["campaign_id"],
                "arm_id": "matched-rf-vnd-iwssr-" + arm["id"],
                "run_id": "pilot-run", "seed": 127,
                "classifier": "Weka J48", "classifier_version": "weka-stable 3.8.6",
                "feature_selector": "relieff", "neighborhood_controller": "vnd", "local_search": "iwssr",
                "dataset_hash": self.protocol["dataset"]["source_sha256"],
                "train_hash": self.protocol["dataset"]["train_sha256"],
                "validation_hash": self.protocol["dataset"]["validation_sha256"],
                "test_hash": self.protocol["dataset"]["test_sha256"],
                "candidate_count": 3, "test_f1_macro": 0.9, "status": "completed",
                "local_search_trained_evaluation_count": 1, "local_search_memoized_evaluation_count": 1,
                "local_search_unclassified_evaluation_count": 0, "local_search_evaluation_count": 2,
                "iwssr_neighborhood_parallelism": 1, "iwssr_evaluation_memoization": True,
            }
            (root / "resource-samples.jsonl").write_text('{}\n', encoding="utf-8")
            compose = root / "resolved-compose.yaml"
            compose.write_text("IWSSR_EVALUATION_MEMOIZATION_ENABLED: true\n"
                               "IWSSR_NEIGHBORHOOD_PARALLELISM: 1\n"
                               "KAFKA_LISTENER_CONCURRENCY: 1\nKAFKA_NUM_PARTITIONS: 1\n", encoding="utf-8")
            def valid():
                path.write_text(json.dumps(result), encoding="utf-8")
                return RUNNER.valid_result(path, self.protocol, arm["id"], 127, "pilot-run")
            self.assertTrue(valid())
            result["local_search_unclassified_evaluation_count"] = 1
            self.assertFalse(valid())
            result["local_search_unclassified_evaluation_count"] = 0
            result["test_f1_macro"] = float("nan")
            self.assertFalse(valid())
            result["test_f1_macro"] = 0.9
            compose.write_text("IWSSR_NEIGHBORHOOD_PARALLELISM: 3\n", encoding="utf-8")
            self.assertFalse(valid())

    def test_incomplete_pilot_cannot_launch_formal_campaign(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "state.json"
            path.write_text(json.dumps({"state": "RUNNING", "completed": []}), encoding="utf-8")
            with self.assertRaises(RuntimeError):
                RUNNER.audit_pilot(path, REPO / "experiments/performance-v12/protocol.json", REPO, "v12")


if __name__ == "__main__":
    unittest.main()
