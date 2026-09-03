import ast
import unittest
from pathlib import Path


REPO = Path(__file__).resolve().parents[3]
MONOLITH_PATH = REPO / "experiments/monoliths/monolith2-graspy/main.py"


def load_java_random():
    tree = ast.parse(MONOLITH_PATH.read_text(encoding="utf-8"))
    declaration = next(
        node for node in tree.body
        if isinstance(node, ast.ClassDef) and node.name == "JavaRandom"
    )
    namespace = {}
    exec(compile(ast.Module(body=[declaration], type_ignores=[]), str(MONOLITH_PATH), "exec"), namespace)
    return namespace["JavaRandom"]


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
        self.assertNotIn("private boolean firstTime", source)


if __name__ == "__main__":
    unittest.main()
