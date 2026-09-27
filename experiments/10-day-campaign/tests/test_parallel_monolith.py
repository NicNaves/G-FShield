import ast
import base64
import copy
import importlib.util
import io
import json
import time
import tempfile
from datetime import datetime, timezone
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

REPO = Path(__file__).resolve().parents[3]
SOURCE = REPO / 'experiments/monoliths/monolith2-graspy/main.py'


def declarations(*names):
    nodes = [n for n in ast.parse(SOURCE.read_text(encoding='utf-8')).body
             if isinstance(n, (ast.ClassDef, ast.FunctionDef)) and n.name in names]
    return compile(ast.Module(body=nodes, type_ignores=[]), str(SOURCE), 'exec')


class ParallelMonolithTest(unittest.TestCase):
    def client(self, lines):
        namespace = {'time': SimpleNamespace(monotonic=lambda: 10), 'base64': base64}
        exec(declarations('WekaEvaluatorClient'), namespace)
        client = namespace['WekaEvaluatorClient'].__new__(namespace['WekaEvaluatorClient'])
        client.workers, client.peak_active = 3, 1
        client.process = SimpleNamespace(stdin=io.StringIO())
        client._readline = iter(lines).__next__
        return client

    def test_batch_streams_completions_but_reduces_in_submission_order(self):
        client = self.client(['BATCH_RESULT\t1\ttrue\tOK\t.9\t.9\t.9\t.9\t.9\t.9\t.9',
                              'BATCH_RESULT\t0\ttrue\tOK\t.8\t.8\t.8\t.8\t.8\t.8\t.8', 'BATCH_DONE\t3'])
        completed = []
        results = client.evaluate_many([[0], [1]], 20, lambda f, m, ok: completed.append((f, ok)))
        self.assertEqual([([1], True), ([0], True)], completed)
        self.assertEqual([.8, .9], [m['f1'] for m in results])
        self.assertIn('batch-validation\t10000\t0;1', client.process.stdin.getvalue())

    def test_late_and_skipped_results_not_used_for_reduction(self):
        client = self.client(['BATCH_RESULT\t0\tfalse\tOK\t.99\t.99\t.99\t.99\t.99\t.99\t.99',
                              'BATCH_SKIP\t1', 'BATCH_DONE\t2'])
        completed = []
        self.assertEqual([None, None], client.evaluate_many([[0], [1]], 20, lambda f, m, ok: completed.append(ok)))
        self.assertEqual([False], completed)

    def test_failed_batch_is_drained_then_rejected(self):
        client = self.client(['BATCH_ERROR\t0\tbad classifier', 'BATCH_SKIP\t1', 'BATCH_DONE\t1'])
        with self.assertRaisesRegex(RuntimeError, 'failed batch'):
            client.evaluate_many([[0], [1]], 20, lambda *args: None)
        with self.assertRaises(StopIteration):
            client._readline()

    def test_duplicate_missing_and_excess_concurrency_rejected(self):
        for lines in (['BATCH_SKIP\t0', 'BATCH_SKIP\t0'], ['BATCH_DONE\t1'],
                      ['BATCH_SKIP\t0', 'BATCH_DONE\t4']):
            with self.subTest(lines=lines), self.assertRaises(RuntimeError):
                self.client(lines).evaluate_many([[0]], 20, lambda *args: None)

    def test_iwssr_ordered_tie_and_full_search_equivalence(self):
        def metrics(features):
            score = .9 if len(features) == 1 else .5
            return {'f1': score, 'acc': score, 'prec': score, 'rec': score}
        results = []
        for workers in (1, 3):
            namespace = {'time': time, 'stop_requested': lambda: False,
                         'evaluate_subset': lambda *a: metrics(a[-2]),
                         'record_global_best': lambda *a: None, 'record_candidate_evaluation': lambda *a: None,
                         'get_system_metrics': lambda enabled: (0, 0, 0), 'CANDIDATE_COUNT': 0,
                         'NEIGHBORHOOD_PARALLELISM': workers, 'RUN_DEADLINE': time.monotonic() + 30}
            def batch(subsets, deadline, completed):
                for features in reversed(subsets):
                    completed(features, metrics(features), True)
                return [metrics(features) for features in subsets]
            namespace['WEKA_EVALUATOR'] = SimpleNamespace(evaluate_many=batch)
            exec(declarations('java_iwssr_once'), namespace)
            results.append(namespace['java_iwssr_once']([0], [1, 2], None, None, None, None,
                'J48', 2, SimpleNamespace(writerow=lambda row: None), 'VND', 1,
                'train', 'validation', 'seed', False, {'f1': .4}))
        self.assertEqual(results[0], results[1])
        self.assertEqual([1], results[0][0])  # First removal wins the equal-F1 tie, not completion order.

    def test_strict_global_snapshot_rejects_late_and_copies_features(self):
        clock = SimpleNamespace(monotonic=lambda: 10)
        namespace = {'time': clock, 'STRICT_SELECTION_DEADLINE': True, 'RUN_DEADLINE': 20,
                     'RUN_STARTED_MONOTONIC': 0, 'OBSERVED_BEST_F1': float('-inf'),
                     'OBSERVED_BEST_SNAPSHOT': None, 'VALIDATION_THRESHOLDS': (.945,),
                     'VALIDATION_TARGET_TIMES_MS': {}, 'CANDIDATE_COUNT': 1, 'ACCEPTED_IMPROVEMENTS': 0,
                     'datetime': datetime, 'timezone': timezone, 'json': json,
                     'os': SimpleNamespace(fsync=lambda *a: None), 'open': mock.mock_open()}
        exec(declarations('record_global_best'), namespace)
        features = [0, 1]
        namespace['record_global_best'](features, {'f1': .9, 'prec': .9, 'rec': .9, 'acc': .9}, 'seed')
        features.append(2)
        self.assertEqual([0, 1], namespace['OBSERVED_BEST_SNAPSHOT'][0])
        clock.monotonic = lambda: 21
        namespace['record_global_best']([2], {'f1': .99, 'prec': .99, 'rec': .99, 'acc': .99}, 'seed')
        self.assertEqual(.9, namespace['OBSERVED_BEST_F1'])
        self.assertEqual({}, namespace['VALIDATION_TARGET_TIMES_MS'])

    def test_protocol_has_balanced_fresh_80_cells_and_no_auto_release(self):
        protocol = json.loads((REPO / 'experiments/performance-v14/protocol.json').read_text())
        self.assertEqual(list(range(200, 220)), protocol['seeds'])
        ids = {a['id'] for a in protocol['arms']}
        self.assertEqual(4, len(ids))
        for i in range(4):
            self.assertEqual(ids, {order[i] for order in protocol['order_design']['orders']})
        self.assertFalse(protocol['automatic_release']['enabled'])
        self.assertLessEqual(protocol['maximum_seconds'], 864000)

    def test_v14_runner_passes_controls_and_rejects_wrong_factors(self):
        spec = importlib.util.spec_from_file_location('v14_runner_test', REPO / 'experiments/architecture-causal-campaign/run_performance_optimization.py')
        runner = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(runner)
        with tempfile.TemporaryDirectory() as temporary:
            parent = Path(temporary) / 'state.json'
            parent.write_text(json.dumps({'campaign_id': 'v14', 'deadline_utc': '2026-10-07T00:26:32+00:00'}))
            self.assertEqual(datetime(2026, 10, 7, 0, 26, 32, tzinfo=timezone.utc), runner.inherited_deadline(parent, 'v14'))
            with self.assertRaises(RuntimeError):
                runner.inherited_deadline(parent, 'other')
            parent.write_text(json.dumps({'campaign_id': 'v14', 'deadline_utc': '2026-10-07T00:26:32'}))
            with self.assertRaises(RuntimeError):
                runner.inherited_deadline(parent, 'v14')
        protocol = json.loads((REPO / 'experiments/performance-v14/protocol.json').read_text())
        self.assertEqual(80, len(runner.schedule(protocol)))
        for arm in protocol['arms']:
            command = runner.command_for(protocol, REPO, Path('out'), arm['id'], 199, 'run', 'tag')
            if arm['architecture'] == 'monolith':
                self.assertIn('--strict-selection-deadline', command)
                self.assertEqual(str(arm['neighborhood_parallelism']), command[command.index('--neighborhood-parallelism') + 1])
            else:
                self.assertNotIn('--iwssr-early-progress', command)
                self.assertEqual('3', command[command.index('--iwssr-training-max-concurrent') + 1])
        invalid = copy.deepcopy(protocol)
        invalid['arms'][1]['memoization'] = True
        with mock.patch.object(runner.base, 'checked', side_effect=AssertionError('external call')):
            with self.assertRaises(RuntimeError):
                runner.validate_inputs(invalid, REPO, 'tag', 'image')


if __name__ == '__main__':
    unittest.main()
