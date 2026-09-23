import argparse
import copy
import importlib.util
import json
import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from unittest import mock

REPO = Path(__file__).resolve().parents[3]
SPEC = importlib.util.spec_from_file_location(
    "performance_v13", REPO / "experiments/architecture-causal-campaign/run_performance_optimization.py")
RUNNER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(RUNNER)


class PerformanceV13Test(unittest.TestCase):
    def setUp(self):
        self.protocol_path = REPO / "experiments/performance-v13/protocol.json"
        self.protocol = json.loads(self.protocol_path.read_text("utf-8"))

    def test_balanced_100_cells_and_separate_pilot(self):
        cells = RUNNER.schedule(self.protocol)
        self.assertEqual(100, len(cells))
        self.assertEqual(100, len(set(cells)))
        self.assertNotIn(149, self.protocol["seeds"])
        self.assertEqual(5, len(RUNNER.schedule(self.protocol, 149)))
        self.assertEqual(864000, self.protocol["maximum_seconds"])
        self.assertEqual(1, self.protocol["maximum_attempts_per_cell"])
        for position in range(5):
            observed = [order[position] for order in self.protocol["order_design"]["orders"]]
            self.assertEqual(set(RUNNER.V13_ARMS), set(observed))

    def test_flags_and_resources_for_each_arm(self):
        for arm in self.protocol["arms"]:
            command = RUNNER.command_for(self.protocol, REPO, Path("out"), arm["id"], 149, "run", "tag")
            self.assertEqual("6", command[command.index("--aggregate-cpus") + 1])
            self.assertEqual("12g", command[command.index("--aggregate-memory") + 1])
            if arm["architecture"] == "distributed":
                self.assertEqual(arm["early_progress"], "--iwssr-early-progress" in command)
                self.assertEqual(str(arm["training_limit"]), command[command.index("--iwssr-training-max-concurrent") + 1])
                self.assertNotIn("--iwssr-evaluation-memoization", command)

    def test_mismatched_factor_rejected_before_external_calls(self):
        for factor, value in (("training_limit", 9), ("early_progress", True),
                              ("neighborhood_parallelism", 1), ("memoization", True)):
            protocol = copy.deepcopy(self.protocol)
            protocol["arms"][1][factor] = value
            with mock.patch.object(RUNNER.base, "checked", side_effect=AssertionError("external call")):
                with self.assertRaises(RuntimeError):
                    RUNNER.validate_inputs(protocol, REPO, "tag", "image")

    def args(self, root):
        return argparse.Namespace(state=root / "pilot/state.json", results=root / "pilot/results",
                                  protocol=self.protocol_path, image_tag="v13", pilot_seed=149, chain_formal=True)

    def test_gate_requires_runtime_evidence_and_rejects_limit_violation(self):
        arm = self.protocol["arms"][-1]
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            result = {
                "campaign_id": self.protocol["campaign_id"], "arm_id": "matched-rf-vnd-iwssr-" + arm["id"],
                "run_id": "run", "seed": 149, "classifier": "Weka J48", "classifier_version": "weka-stable 3.8.6",
                "feature_selector": "relieff", "neighborhood_controller": "vnd", "local_search": "iwssr",
                "dataset_hash": self.protocol["dataset"]["source_sha256"],
                **{key + "_hash": self.protocol["dataset"][key + "_sha256"] for key in ("train", "validation", "test")},
                "local_search_trained_evaluation_count": 3, "local_search_memoized_evaluation_count": 0,
                "local_search_unclassified_evaluation_count": 0, "local_search_evaluation_count": 3,
                "iwssr_neighborhood_parallelism": 3, "iwssr_evaluation_memoization": False,
                "iwssr_early_progress": True, "iwssr_training_max_concurrent": 3,
                "candidate_count": 3, "test_f1_macro": 0.5, "status": "timeout",
            }
            path = root / "final-result.json"
            path.write_text(json.dumps(result), encoding="utf-8")
            (root / "resource-samples.jsonl").write_text("{}\n", encoding="utf-8")
            (root / "resolved-compose.yaml").write_text(
                "IWSSR_EVALUATION_MEMOIZATION_ENABLED: false\nIWSSR_NEIGHBORHOOD_PARALLELISM: 3\n"
                "KAFKA_LISTENER_CONCURRENCY: 3\nKAFKA_NUM_PARTITIONS: 3\n"
                "IWSSR_PROGRESS_EARLY_ENABLED: true\nIWSSR_TRAINING_MAX_CONCURRENT: 3\n", encoding="utf-8")
            def valid():
                return RUNNER.valid_result(path, self.protocol, arm["id"], 149, "run")
            self.assertFalse(valid())
            log = root / "compose.log"
            log.write_text("dls runtime options earlyProgress=true trainingLimit=3\n"
                           "dls training admission limit=3 active=1 peakActive=3\n", encoding="utf-8")
            self.assertTrue(valid())  # Low holdout F1 is NOT a rejection criterion.
            log.write_text("dls runtime options earlyProgress=true trainingLimit=3\n"
                           "dls training admission limit=3 active=4 peakActive=4\n", encoding="utf-8")
            self.assertFalse(valid())

    def test_failed_pilot_never_releases_formal(self):
        with tempfile.TemporaryDirectory() as directory:
            args = self.args(Path(directory))
            with mock.patch.object(RUNNER, "execute", return_value=4) as execute, mock.patch.object(RUNNER, "audit_pilot") as audit:
                self.assertEqual(4, RUNNER.execute_chain(args))
                self.assertEqual(1, execute.call_count)
                audit.assert_not_called()

    def test_failed_audit_never_releases_formal(self):
        with tempfile.TemporaryDirectory() as directory:
            args = self.args(Path(directory))
            with mock.patch.object(RUNNER, "execute", return_value=0) as execute, mock.patch.object(
                    RUNNER, "audit_pilot", side_effect=RuntimeError("checksum mismatch")):
                with self.assertRaises(RuntimeError):
                    RUNNER.execute_chain(args)
                self.assertEqual(1, execute.call_count)

    def test_successful_chain_keeps_original_global_deadline(self):
        with tempfile.TemporaryDirectory() as directory:
            args = self.args(Path(directory))
            args.state.parent.mkdir()
            deadline = "2026-10-03T04:00:00+00:00"
            args.state.write_text(json.dumps({"deadline_utc": deadline}), encoding="utf-8")
            with mock.patch.object(RUNNER, "execute", return_value=0) as execute, mock.patch.object(
                    RUNNER, "audit_pilot"), mock.patch.object(RUNNER.base, "checked", return_value=""):
                self.assertEqual(0, RUNNER.execute_chain(args))
                formal = execute.call_args_list[1].args[0]
                self.assertEqual(datetime.fromisoformat(deadline), formal.shared_deadline)
                self.assertIsNone(formal.pilot_seed)
                self.assertEqual(Path(directory) / "formal/state.json", formal.state)
                self.assertNotEqual(args.state, formal.state)

    def test_surviving_container_blocks_formal(self):
        with tempfile.TemporaryDirectory() as directory:
            args = self.args(Path(directory))
            args.state.parent.mkdir()
            args.state.write_text(json.dumps({"deadline_utc": "2026-10-03T04:00:00+00:00"}), encoding="utf-8")
            with mock.patch.object(RUNNER, "execute", return_value=0) as execute, mock.patch.object(
                    RUNNER, "audit_pilot"), mock.patch.object(RUNNER.base, "checked", return_value="gfshield-campaign-dls-iwssr:v13"):
                with self.assertRaises(RuntimeError):
                    RUNNER.execute_chain(args)
                self.assertEqual(1, execute.call_count)
