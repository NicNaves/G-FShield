import ast
import importlib.util
import tempfile
import unittest
from pathlib import Path


REPO = Path(__file__).resolve().parents[3]
MONOLITH_PATH = REPO / "experiments/monoliths/monolith2-graspy/main.py"
RUN_ARM_PATH = REPO / "experiments/10-day-campaign/run_arm.py"
CAUSAL_ANALYSIS_PATH = REPO / "experiments/architecture-causal-campaign/analyze_results.py"
RESULT_SCHEMA_PATH = REPO / "experiments/10-day-campaign/result-schema.json"


def load_java_random():
    tree = ast.parse(MONOLITH_PATH.read_text(encoding="utf-8"))
    declaration = next(
        node for node in tree.body
        if isinstance(node, ast.ClassDef) and node.name == "JavaRandom"
    )
    namespace = {}
    exec(compile(ast.Module(body=[declaration], type_ignores=[]), str(MONOLITH_PATH), "exec"), namespace)
    return namespace["JavaRandom"]


def load_causal_analysis():
    spec = importlib.util.spec_from_file_location("causal_analysis_test", CAUSAL_ANALYSIS_PATH)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def load_run_arm():
    spec = importlib.util.spec_from_file_location("run_arm_test", RUN_ARM_PATH)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class CausalParityTest(unittest.TestCase):
    def test_java_random_matches_documented_java_sequence(self):
        generator = load_java_random()(42)
        self.assertEqual([30, 63, 48, 84, 70], [generator.next_int(100) for _ in range(5)])

    def test_active_java_evaluators_compute_macro_f1(self):
        roots = (
            REPO / "grasp-fs-rcl-generator/Features Selection",
            REPO / "grasp-fs-distributed-ls/Local Search",
        )
        implementations = list(roots[0].rglob("machinelearning/MachineLearning.java"))
        implementations += list(roots[1].rglob("machinelearning/MachineLearning.java"))
        self.assertEqual(7, len(implementations))
        for path in implementations:
            source = path.read_text(encoding="utf-8")
            active = source.split("/* Disabled:", 1)[0] + source.split("*/", 1)[-1]
            self.assertIn("calculateMacroScore(evaluation", active, path)
            self.assertNotIn("calculateScore(testingDataset", active, path)

    def test_common_evaluator_exposes_seeded_relief_ranking(self):
        source = (
            REPO
            / "experiments/common-weka-evaluator/src/main/java/org/gfshield/experiments/WekaEvaluator.java"
        ).read_text(encoding="utf-8")
        self.assertIn('fields[0].equals("rank-relieff")', source)
        self.assertIn("evaluator.setSampleSize(sampleSize)", source)
        self.assertIn("evaluator.setSeed(seed)", source)

    def test_parallel_iwssr_has_synchronized_metrics_output(self):
        source = (
            REPO
            / "grasp-fs-distributed-ls/Local Search/IWSSR/grasp-fs-dls-iwr"
            / "src/main/java/br/com/graspfs/ls/iwssr/service/IwssrService.java"
        ).read_text(encoding="utf-8")
        self.assertIn("synchronized (metricsLock)", source)
        self.assertIn("campaignElapsedMs={}", source)
        self.assertIn("implements DisposableBean", source)
        self.assertIn("public void destroy() throws Exception", source)
        self.assertNotIn("jakarta.annotation", source)
        self.assertNotIn("private boolean firstTime", source)

    def test_relief_flushes_each_completed_candidate_metric(self):
        source = (
            REPO
            / "grasp-fs-rcl-generator/Features Selection/RelieF/grasp-fs-rcl-rf"
            / "src/main/java/graspfs/rcl/rf/service/RelieFService.java"
        ).read_text(encoding="utf-8")
        self.assertIn("writer.newLine();\n        // The supervisor", source)
        self.assertIn("writer.flush();", source)

    def test_distributed_measurement_starts_after_service_readiness(self):
        source = RUN_ARM_PATH.read_text(encoding="utf-8")
        readiness = source.index("wait_for_http_service(port, route, startup_deadline)")
        measurement = source.index("measurement_started_monotonic = time.monotonic()")
        request = source.index("with urllib.request.urlopen(request, timeout=30)")
        self.assertLess(readiness, measurement)
        self.assertLess(measurement, request)
        self.assertIn('"measurement_start_offset_ms"', source)
        self.assertIn('"cold_start_end_to_end_time_ms"', source)
        self.assertIn("cutoff_elapsed_ms = measurement_start_offset_ms + selection_elapsed_ms", source)
        schema = RESULT_SCHEMA_PATH.read_text(encoding="utf-8")
        self.assertIn('"measurement_definition"', schema)
        self.assertIn('"measurement_start_offset_ms"', schema)
        self.assertIn('"cold_start_end_to_end_time_ms"', schema)
        self.assertIn('"selection_finished_utc"', schema)
        self.assertIn('"selection_elapsed_ms"', schema)

    def test_pilot_analysis_requires_explicit_opt_in(self):
        source = CAUSAL_ANALYSIS_PATH.read_text(encoding="utf-8")
        self.assertIn('parser.add_argument(\n        "--allow-pilot"', source)
        self.assertIn('if allow_pilot:\n        accepted_states.add("PILOT_COMPLETED")', source)
        self.assertIn('"--results-root", type=Path', source)
        self.assertIn('/ completed["run_id"]\n                / "final-result.json"', source)

    def test_anytime_analysis_excludes_candidates_after_deadline(self):
        analysis = load_causal_analysis()
        metrics = analysis.anytime_metrics([(601.0, 0.99)], horizon=600.0)
        self.assertFalse(metrics["target_0_94_reached"])
        self.assertEqual(600.0, metrics["time_to_0_94_seconds_censored"])

    def test_runner_excludes_messages_and_candidates_after_deadline(self):
        run_arm = load_run_arm()
        messages = [
            {"monotonicElapsedMs": 600_000},
            {"monotonicElapsedMs": 600_001},
        ]
        self.assertEqual(
            1, len(run_arm.messages_before_deadline(messages, cutoff_elapsed_ms=600_000)),
        )
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "compose.log"
            path.write_text(
                "rcl generation ready campaignElapsedMs=600000\n"
                "dls iteration search=IWSSR campaignElapsedMs=600001\n",
                encoding="utf-8",
            )
            self.assertEqual(
                1, run_arm.internal_candidate_count_before_deadline(path, 600_000),
            )
            self.assertEqual(
                {
                    "construction": 1,
                    "local_search": 0,
                    "local_search_trained": 0,
                    "local_search_memoized": 0,
                    "local_search_unclassified": 0,
                    "total": 1,
                },
                run_arm.internal_evaluation_counts_before_deadline(path, 600_000),
            )

    def test_runner_distinguishes_trained_and_memoized_iwssr_decisions(self):
        run_arm = load_run_arm()
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "compose.log"
            path.write_text(
                "dls iteration search=IWSSR campaignElapsedMs=100 evaluationSource=trained evaluationKey=a\n"
                "dls iteration search=IWSSR campaignElapsedMs=200 evaluationSource=memoized evaluationKey=a\n"
                "dls iteration search=IWSSR campaignElapsedMs=300\n",
                encoding="utf-8",
            )
            self.assertEqual(
                {
                    "construction": 0,
                    "local_search": 3,
                    "local_search_trained": 1,
                    "local_search_memoized": 1,
                    "local_search_unclassified": 1,
                    "total": 3,
                },
                run_arm.internal_evaluation_counts_before_deadline(path, 600_000),
            )

    def test_incomplete_local_search_interval_closes_at_last_activity(self):
        analysis = load_causal_analysis()
        lines = [
            'x | 2026-01-01T00:00:00.000Z {"message":"dls start search=IWSSR seedId=a "}',
            'x | 2026-01-01T00:00:05.000Z {"message":"rcl generation published algorithm=RELIEF elapsedMs=5000"}',
            'x | 2026-01-01T00:00:10.000Z {"message":"dls iteration search=IWSSR seedId=a campaignElapsedMs=10000"}',
        ]
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "compose.log"
            path.write_text("\n".join(lines) + "\n", encoding="utf-8")
            construction, local_search = analysis.distributed_phase_intervals(path)
        self.assertEqual(5.0, analysis.interval_duration(construction))
        self.assertEqual(10.0, analysis.interval_duration(local_search))


if __name__ == "__main__":
    unittest.main()
