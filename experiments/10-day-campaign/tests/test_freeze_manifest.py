import importlib.util
import json
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


FREEZE = load_module("campaign_freeze_manifest", ROOT / "freeze_manifest.py")
ORCHESTRATOR = load_module("campaign_orchestrator_for_freeze", ROOT / "orchestrator.py")


class FrozenCommandTest(unittest.TestCase):
    def test_freeze_uses_git_command_supported_by_the_target_server(self):
        source = (ROOT / "freeze_manifest.py").read_text(encoding="utf-8")
        self.assertNotIn('"branch", "--show-current"', source)
        self.assertIn('"symbolic-ref", "--quiet", "--short", "HEAD"', source)

    def test_all_command_templates_resolve_with_orchestrator_context(self):
        manifest = json.loads((ROOT / "manifest.yaml").read_text(encoding="utf-8"))
        context = {
            "campaign_id": manifest["campaign_id"],
            "arm_id": "arm",
            "run_id": "run",
            "seed": 42,
            "run_timeout_seconds": 3000,
            "result_dir": "/results/run",
            "repo_root": "/repository",
        }
        for arm in manifest["arms"]:
            template = (
                FREEZE.distributed_command(manifest, arm, "image-tag")
                if arm["architecture"] == "distributed"
                else FREEZE.monolith_command(manifest, arm, "image-tag")
            )
            resolved = ORCHESTRATOR.format_command(template, context)
            self.assertFalse(any("{" in item or "}" in item for item in resolved))
            self.assertIn("/results/run", resolved)
        baseline = ORCHESTRATOR.format_command(
            FREEZE.baseline_command(manifest, "image-tag"), context
        )
        self.assertIn("/results/run", baseline)


if __name__ == "__main__":
    unittest.main()
