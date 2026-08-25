import unittest
from pathlib import Path


REPO = Path(__file__).resolve().parents[3]
MONOLITHS = (
    REPO / "experiments/monoliths/monolith1-graspy2/main.py",
    REPO / "experiments/monoliths/monolith2-graspy/main.py",
)


class MonolithContractTest(unittest.TestCase):
    def test_campaign_monoliths_use_monotonic_elapsed_time(self):
        for path in MONOLITHS:
            source = path.read_text(encoding="utf-8")
            self.assertNotIn("time.time()", source, path)
            self.assertIn("time.monotonic()", source, path)

    def test_campaign_monoliths_emit_the_common_j48_contract(self):
        for path in MONOLITHS:
            source = path.read_text(encoding="utf-8")
            self.assertIn('"classifier": "Weka J48"', source, path)
            self.assertIn('"weka-stable 3.8.6"', source, path)
            self.assertIn('"confidence_factor": 0.25', source, path)
            self.assertIn('"minimum_instances_per_leaf": 2', source, path)

    def test_java_wall_clock_is_used_only_for_cross_process_utc_deadlines(self):
        roots = (
            REPO / "grasp-fs-rcl-generator/Features Selection",
            REPO / "grasp-fs-distributed-ls/Local Search",
            REPO / "grasp-fs-distributed-ls/Neighborhood",
            REPO / "grasp-fs-distributed-ls/Verify",
        )
        for root in roots:
            for path in root.rglob("*.java"):
                for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
                    if "System.currentTimeMillis()" in line:
                        self.assertTrue(
                            "deadline" in line.lower() or "configured" in line.lower(),
                            f"{path}:{number}",
                        )

    def test_baseline_handles_sigterm_and_removes_its_container(self):
        baseline = (
            REPO / "experiments/10-day-campaign/run_baseline.py"
        ).read_text(encoding="utf-8")
        self.assertIn("signal.signal(signal.SIGTERM, handle_termination)", baseline)
        self.assertIn(
            'subprocess.run(["docker", "rm", "-f", container]', baseline
        )


if __name__ == "__main__":
    unittest.main()
