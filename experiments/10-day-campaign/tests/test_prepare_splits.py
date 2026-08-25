import csv
import json
import subprocess
import sys
import tempfile
import unittest
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "prepare_splits.py"


def labels(path: Path):
    values = []
    in_data = False
    with path.open(encoding="utf-8") as handle:
        for line in handle:
            if not in_data:
                in_data = line.strip().lower().startswith("@data")
                continue
            if line.strip():
                values.append(next(csv.reader([line]))[-1].strip())
    return values


class PrepareSplitsTest(unittest.TestCase):
    def test_stratified_deterministic_split(self):
        source_text = """@relation sample
@attribute value numeric
@attribute class {A,B}
@data
""" + "".join(f"{index},{'A' if index < 20 else 'B'}\n" for index in range(40))

        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "sample.arff"
            first = root / "first"
            second = root / "second"
            source.write_text(source_text, encoding="utf-8")

            for destination in (first, second):
                subprocess.run(
                    [
                        sys.executable,
                        str(SCRIPT),
                        "--input",
                        str(source),
                        "--output-dir",
                        str(destination),
                        "--seed",
                        "42",
                    ],
                    check=True,
                    capture_output=True,
                    text=True,
                )

            manifest = json.loads((first / "split-manifest.json").read_text(encoding="utf-8"))
            self.assertEqual(24, manifest["splits"]["train"]["records"])
            self.assertEqual(8, manifest["splits"]["validation"]["records"])
            self.assertEqual(8, manifest["splits"]["test"]["records"])
            self.assertEqual(Counter({"A": 12, "B": 12}), Counter(labels(first / "erenoall-train.arff")))
            self.assertEqual(
                (first / "erenoall-train.arff").read_bytes(),
                (second / "erenoall-train.arff").read_bytes(),
            )
            self.assertEqual(
                (first / "split-indices.csv").read_bytes(),
                (second / "split-indices.csv").read_bytes(),
            )


if __name__ == "__main__":
    unittest.main()
