"""Real J48 checks: set GFS_WEKA_JAR to the freshly built Java 17+ evaluator jar."""
import ast
import atexit
import base64
import os
import queue
import select
import subprocess
import tempfile
import threading
import time
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]


@unittest.skipUnless(os.environ.get('GFS_WEKA_JAR'), 'requires freshly built evaluator JAR')
class ParallelWekaIntegrationTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        data = Path(self.temporary.name) / 'synthetic.arff'
        rows = ['@relation synthetic', '@attribute a numeric', '@attribute b numeric',
                '@attribute c numeric', '@attribute class {normal,attack}', '@data']
        rows += [f'{i%7},{i%11},{i%13},' + ('attack' if i%7>3 else 'normal') for i in range(700)]
        data.write_text('\n'.join(rows) + '\n', encoding='utf-8')
        source = REPO / 'experiments/monoliths/monolith2-graspy/main.py'
        tree = ast.parse(source.read_text(encoding='utf-8'))
        node = next(n for n in tree.body if isinstance(n, ast.ClassDef) and n.name == 'WekaEvaluatorClient')
        namespace = dict(globals())
        exec(compile(ast.Module(body=[node], type_ignores=[]), str(source), 'exec'), namespace)
        self.client = namespace['WekaEvaluatorClient'](os.environ['GFS_WEKA_JAR'], str(data), str(data), str(data), time.monotonic()+90, workers=3)
        self.addCleanup(self.client.close)

    def test_parallel_scores_equal_serial_and_no_memoization(self):
        subsets = [[0, 1], [0, 2], [1, 2]]
        serial = [self.client.evaluate('validation', f) for f in subsets]
        events = []
        parallel = self.client.evaluate_many(subsets, time.monotonic()+30, lambda f,m,ok: events.append((f,ok)))
        self.assertEqual(serial, parallel)
        self.assertEqual(3, len(events))
        self.assertTrue(all(ok for _,ok in events))
        self.assertGreater(self.client.peak_active, 1)
        self.assertLessEqual(self.client.peak_active, 3)
        repeated = []
        self.client.evaluate_many([[0,1],[0,1]], time.monotonic()+30, lambda *args: repeated.append(args))
        self.assertEqual(2, len(repeated))

    def test_zero_budget_skips_everything_and_next_command_remains_valid(self):
        events = []
        results = self.client.evaluate_many([[0,1],[0,2]], time.monotonic()-1, lambda *args: events.append(args))
        self.assertEqual([None, None], results)
        self.assertEqual([], events)
        self.assertGreaterEqual(self.client.evaluate('test', [0,1])['f1'], 0)


if __name__ == '__main__':
    unittest.main()
