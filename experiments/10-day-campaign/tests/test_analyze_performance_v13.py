import importlib.util
import itertools
import json
import tempfile
import unittest
from pathlib import Path
import numpy as np

REPO = Path(__file__).resolve().parents[3]
SPEC = importlib.util.spec_from_file_location("analysis_v13",
    REPO / "experiments/architecture-causal-campaign/analyze_performance_v13.py")
A = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(A)


class AnalysisV13Test(unittest.TestCase):
    def test_exact_p_matches_exhaustive_small_reference(self):
        for values in ([1, 2, 3], [-2, 1, 0, 4], [0, 0], [1, -1]):
            sums = [abs(sum(s * v for s, v in zip(signs, values)))
                    for signs in itertools.product((-1, 1), repeat=len(values))]
            expected = sum(s >= abs(sum(values)) - 1e-12 for s in sums) / len(sums)
            self.assertAlmostEqual(expected, A.exact_sign_flip(values))
        self.assertAlmostEqual(0.25, A.exact_sign_flip([1, 1, 1]))

    def test_factorial_main_effects_and_interaction(self):
        values = A.factorial([1, 2], [4, 5], [3, 4], [10, 11])
        np.testing.assert_array_equal([4, 4], values["early_publication"])
        np.testing.assert_array_equal([5, 5], values["training_limit"])
        np.testing.assert_array_equal([4, 4], values["interaction_exploratory"])

    def test_holm_is_monotone_and_capped(self):
        self.assertEqual({"a": 0.04, "b": 0.2}, A.holm({"a": 0.02, "b": 0.2}))
        self.assertEqual({"a": 1.0, "b": 1.0}, A.holm({"a": 0.8, "b": 0.9}))

    def test_yield_deduplicates_and_uses_first_qualified_not_first_seen(self):
        events = [(10, .9, (1,)), (20, .95, (1,)), (30, .96, (1,)),
                  (40, .95, (2,)), (101, 1, (3,)), (-1, 1, (4,))]
        result = A.yield_metrics(events, 100)
        self.assertEqual(2, result["unique_subsets"])
        self.assertEqual(2, result["qualified_subsets"])
        self.assertAlmostEqual(1.4, result["auc"])
        self.assertEqual(20, result["first_seconds"])

    def test_failure_is_censored_not_zero(self):
        result = A.yield_metrics([(12, .9, (1,))], 100)
        self.assertIsNone(result["first_seconds"])
        self.assertEqual(100, result["first_seconds_censored"])
        self.assertFalse(result["reached"])

    def test_integration_clips_and_interpolates(self):
        result = A.integrate([(0, 0, 1), (10, 2, 3), (20, 4, 5)], 5, 15)
        self.assertAlmostEqual(20 / 3600, result["cpu_hours_observed"])
        self.assertAlmostEqual(30 / 3600, result["gib_hours_observed"])
        self.assertEqual(1, result["coverage_fraction"])

    def test_integration_does_not_extrapolate_or_bridge_missing_samples(self):
        result = A.integrate([(5, 2, 1), (10, 2, 1), (15, None, None),
                              (20, 2, 1), (25, 2, 1)], 0, 30)
        self.assertEqual(10, result["coverage_seconds"])
        self.assertEqual(20, result["uncovered_seconds"])
        self.assertAlmostEqual(20 / 3600, result["cpu_hours_observed"])
        empty = A.integrate([(0, 2, 1), (200, 2, 1)], 0, 200)
        self.assertEqual(0, empty["coverage_seconds"])
        self.assertIsNone(empty["mean_cpu_cores_covered"])

    def test_duplicate_sample_times_rejected(self):
        with self.assertRaises(ValueError):
            A.integrate([(0, 1, 1), (0, 1, 1)], 0, 10)

    def test_nanoseconds_and_memory_units(self):
        self.assertEqual(A.seconds("2026-09-26T12:00:00.123456789Z"),
                         A.seconds("2026-09-26T12:00:00.123456+00:00"))
        self.assertEqual(1, A.quantity_gib("1024MiB"))
        self.assertAlmostEqual(1000**3 / 1024**3, A.quantity_gib("1GB"))

    def test_feature_numbering_and_rejections(self):
        self.assertEqual((0, 2), A.canonical([3, 1], True))
        with self.assertRaises(ValueError):
            A.canonical([1, 1])
        with self.assertRaises(ValueError):
            A.canonical([0], True)

    def test_hash_verification_detects_tampering(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            artifact = root / "data.json"
            artifact.write_text("{}", encoding="utf-8")
            manifest = root / "checksums.sha256"
            manifest.write_text(A.sha(artifact) + "  data.json\n", encoding="utf-8")
            cell = {"checksums_sha256": A.sha(manifest)}
            self.assertEqual(1, A.verify_run(cell, root))
            artifact.write_text("changed", encoding="utf-8")
            with self.assertRaises(ValueError):
                A.verify_run(cell, root)

    def test_resource_sampler_missing_container_is_not_zero(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "samples.jsonl"
            samples = [
                {"timestamp_utc": "2026-09-26T00:00:00Z", "stats": []},
                {"timestamp_utc": "2026-09-26T00:00:10Z",
                 "stats": [{"CPUPerc": "100%", "MemUsage": "1GiB / 12GiB", "Name": "m"}]},
            ]
            path.write_text("\n".join(json.dumps(s) for s in samples), encoding="utf-8")
            points, invalid, background = A.resource_points(path, "monolith")
            self.assertEqual(1, invalid)
            self.assertEqual((None, None), points[0][1:])
            self.assertEqual((1, 1), points[1][1:])
            self.assertIsNone(background)
