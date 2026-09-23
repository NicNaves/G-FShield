import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


REPO = Path(__file__).resolve().parents[3]
CAMPAIGN_ROOT = REPO / "experiments/architecture-causal-campaign"
SPEC = importlib.util.spec_from_file_location("causal_campaign", CAMPAIGN_ROOT / "run_campaign.py")
assert SPEC is not None and SPEC.loader is not None
CAMPAIGN = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CAMPAIGN)
ANALYSIS_SPEC = importlib.util.spec_from_file_location(
    "causal_analysis", CAMPAIGN_ROOT / "analyze_results.py"
)
assert ANALYSIS_SPEC is not None and ANALYSIS_SPEC.loader is not None
ANALYSIS = importlib.util.module_from_spec(ANALYSIS_SPEC)
ANALYSIS_SPEC.loader.exec_module(ANALYSIS)


class CausalCampaignTest(unittest.TestCase):
    def setUp(self):
        self.protocol = json.loads((CAMPAIGN_ROOT / "protocol.json").read_text(encoding="utf-8"))

    def test_protocol_is_paired_and_within_ten_days(self):
        self.assertEqual(30, len(self.protocol["seeds"]))
        self.assertEqual(30, len(set(self.protocol["seeds"])))
        self.assertLessEqual(self.protocol["maximum_seconds"], 10 * 24 * 60 * 60)
        rows = CAMPAIGN.schedule(self.protocol)
        self.assertEqual(60, len(rows))
        for seed in self.protocol["seeds"]:
            self.assertEqual(
                {"distributed", "monolith"},
                {architecture for row_seed, architecture in rows if row_seed == seed},
            )
        limits = self.protocol["resources"]["distributed_component_ceiling_sum"]
        self.assertEqual(
            self.protocol["resources"]["aggregate_cpu_ceiling"],
            sum(component["cpu"] for component in limits.values()),
        )
        self.assertEqual(12, sum(component["memory_gib"] for component in limits.values()))

    def test_execution_order_is_balanced(self):
        rows = CAMPAIGN.schedule(self.protocol)
        first_by_seed = rows[::2]
        self.assertEqual(15, sum(architecture == "distributed" for _, architecture in first_by_seed))
        self.assertEqual(15, sum(architecture == "monolith" for _, architecture in first_by_seed))

    def test_dataset_paths_match_the_existing_campaign_mount_contract(self):
        paths = CAMPAIGN.dataset_paths(REPO)
        self.assertEqual(REPO / "datasets/campaign/erenoall-train.arff", paths["train"])
        self.assertEqual("datasets/campaign/split-manifest.json", self.protocol["dataset"]["split_manifest"])

    def test_commands_freeze_the_same_algorithm_and_resources(self):
        output = Path("/tmp/result")
        distributed = CAMPAIGN.common_arguments(
            self.protocol, REPO, output, "distributed", 42, "run-d", "tag",
        )
        monolith = CAMPAIGN.common_arguments(
            self.protocol, REPO, output, "monolith", 42, "run-m", "tag",
        )
        distributed_text = " ".join(distributed)
        monolith_text = " ".join(monolith)
        self.assertIn("--construction relieff", distributed_text)
        self.assertIn("--enabled-local-searches iwssr", distributed_text)
        self.assertIn("--pipeline-workers 3", distributed_text)
        self.assertIn("--use-training-cache", distributed_text)
        self.assertIn("--matched-architecture", monolith_text)
        for expected in ("--cpuset 8-15", "--aggregate-cpus 6", "--aggregate-memory 12g"):
            self.assertIn(expected, distributed_text)
            self.assertIn(expected, monolith_text)

    def test_interval_intersection_quantifies_pipeline_overlap(self):
        construction = [(0.0, 10.0), (12.0, 20.0)]
        local_search = [(8.0, 15.0), (18.0, 22.0)]
        self.assertAlmostEqual(
            7.0, ANALYSIS.intersection_duration(construction, local_search)
        )

    def test_monolith_phase_trace_has_zero_overlap_when_sequential(self):
        construction = [(0.0, 3.0), (8.0, 10.0)]
        local_search = [(3.0, 8.0), (10.0, 14.0)]
        self.assertEqual(
            0.0, ANALYSIS.intersection_duration(construction, local_search)
        )

    def test_timestamped_compose_log_reconstructs_distributed_overlap(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "compose.log"
            path.write_text(
                "rcl | 2026-09-03T12:00:10.000000000Z rcl generation published "
                "algorithm=RELIEF requestId=x generation=1 seedId=a elapsedMs=4000\n"
                "iwssr | 2026-09-03T12:00:12.000000000Z dls completed "
                "search=IWSSR seedId=a bestF1=0.94 iterationLocalSearch=1 elapsedMs=4000\n",
                encoding="utf-8",
            )
            construction, local_search = ANALYSIS.distributed_phase_intervals(path)
            self.assertAlmostEqual(2.0, ANALYSIS.intersection_duration(construction, local_search))

    def test_docker_timestamp_fraction_is_normalized_without_rounding(self):
        parse = ANALYSIS.docker_timestamp_seconds
        self.assertEqual(parse("2026-09-03T12:00:10.918101913Z"),
                         parse("2026-09-03T12:00:10.918101Z"))
        self.assertEqual(parse("2026-09-03T12:00:10.1Z"),
                         parse("2026-09-03T12:00:10.100000Z"))
        self.assertEqual(parse("2026-09-03T12:00:10Z"),
                         parse("2026-09-03T12:00:10.000000000Z"))

    def test_internal_candidate_trace_uses_common_monotonic_clock(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "compose.log"
            path.write_text(
                'rcl | {"message":"rcl generation ready algorithm=RELIEF f1=0.91 campaignElapsedMs=1200"}\n'
                'dls | {"message":"dls iteration search=IWSSR seedId=a iteration=1 f1=0.945 featureCount=6 campaignElapsedMs=2500"}\n',
                encoding="utf-8",
            )
            self.assertEqual(
                [(1.2, 0.91), (2.5, 0.945)], ANALYSIS.distributed_candidate_trace(path)
            )


if __name__ == "__main__":
    unittest.main()
