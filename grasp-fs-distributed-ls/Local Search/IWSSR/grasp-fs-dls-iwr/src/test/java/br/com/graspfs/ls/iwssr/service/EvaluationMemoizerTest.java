package br.com.graspfs.ls.iwssr.service;

import br.com.graspfs.ls.iwssr.dto.EvaluationResult;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertThrows;

class EvaluationMemoizerTest {

    @Test
    void canonicalizesFeatureOrderAndTrainsAnExactSubsetOnce() throws Exception {
        EvaluationMemoizer memoizer = new EvaluationMemoizer(true, 100);
        AtomicInteger calls = new AtomicInteger();

        var firstKey = EvaluationMemoizer.key(
                "run-1", "train.arff", "validation.arff", "J48", 42,
                List.of(9, 2, 9, 4));
        var sameKey = EvaluationMemoizer.key(
                "run-1", "train.arff", "validation.arff", "j48", 42,
                List.of(4, 9, 2));

        var first = memoizer.evaluate(firstKey, () -> result(calls.incrementAndGet()));
        var second = memoizer.evaluate(sameKey, () -> result(calls.incrementAndGet()));

        assertFalse(first.memoized());
        assertTrue(second.memoized());
        assertEquals(1, calls.get());
        assertEquals(first.result().getF1Score(), second.result().getF1Score());
        assertEquals(1, memoizer.trainedEvaluations());
        assertEquals(1, memoizer.memoizedEvaluations());
    }

    @Test
    void doesNotReuseAcrossRunsSeedsOrDataWindows() throws Exception {
        EvaluationMemoizer memoizer = new EvaluationMemoizer(true, 100);
        AtomicInteger calls = new AtomicInteger();

        for (var key : List.of(
                EvaluationMemoizer.key("run-1", "train-a", "validation", "J48", 42, List.of(1, 2)),
                EvaluationMemoizer.key("run-2", "train-a", "validation", "J48", 42, List.of(1, 2)),
                EvaluationMemoizer.key("run-1", "train-b", "validation", "J48", 42, List.of(1, 2)),
                EvaluationMemoizer.key("run-1", "train-a", "validation", "J48", 43, List.of(1, 2)))) {
            assertFalse(memoizer.evaluate(key, () -> result(calls.incrementAndGet())).memoized());
        }

        assertEquals(4, calls.get());
    }

    @Test
    void concurrentDuplicatesWaitForOneTraining() throws Exception {
        EvaluationMemoizer memoizer = new EvaluationMemoizer(true, 100);
        AtomicInteger calls = new AtomicInteger();
        var key = EvaluationMemoizer.key(
                "run-1", "train", "validation", "J48", 42, List.of(1, 2, 3));
        var executor = Executors.newFixedThreadPool(8);
        try {
            var tasks = java.util.stream.IntStream.range(0, 32)
                    .<java.util.concurrent.Callable<EvaluationMemoizer.EvaluationOutcome>>mapToObj(
                            ignored -> () -> memoizer.evaluate(key, () -> {
                                calls.incrementAndGet();
                                Thread.sleep(20);
                                return result(7);
                            }))
                    .toList();
            var outcomes = executor.invokeAll(tasks);
            for (var outcome : outcomes) {
                assertEquals(7.0F, outcome.get().result().getF1Score());
            }
        } finally {
            executor.shutdownNow();
        }

        assertEquals(1, calls.get());
        assertEquals(1, memoizer.trainedEvaluations());
        assertEquals(31, memoizer.memoizedEvaluations());
    }

    @Test
    void disabledMemoizationAlwaysTrains() throws Exception {
        EvaluationMemoizer memoizer = new EvaluationMemoizer(false, 100);
        AtomicInteger calls = new AtomicInteger();
        var key = EvaluationMemoizer.key("run", "train", "validation", "J48", 42, List.of(1));

        memoizer.evaluate(key, () -> result(calls.incrementAndGet()));
        memoizer.evaluate(key, () -> result(calls.incrementAndGet()));

        assertEquals(2, calls.get());
        assertEquals(0, memoizer.cachedEntries());
    }

    @Test
    void failuresAreRetriedAndResultsAreDefensivelyCopied() throws Exception {
        var memoizer = new EvaluationMemoizer(true, 1);
        var key = EvaluationMemoizer.key("run", "train", "val", "J48", 42, List.of(1));
        assertThrows(IllegalStateException.class,
                () -> memoizer.evaluate(key, () -> { throw new IllegalStateException("training failed"); }));
        assertEquals(0, memoizer.cachedEntries());
        var original = result(1);
        var first = memoizer.evaluate(key, () -> original);
        original.setF1Score(0);
        first.result().setPrecision(0);
        var second = memoizer.evaluate(key, () -> { throw new AssertionError("unexpected training"); });
        assertEquals(1.0F, second.result().getF1Score());
        assertEquals(1.0F, second.result().getPrecision());
        second.result().setRecall(0);
        assertEquals(1.0F, memoizer.evaluate(key, () -> result(0)).result().getRecall());
    }

    @Test
    void capacityIsStrictUnderConcurrentDistinctKeys() throws Exception {
        var memoizer = new EvaluationMemoizer(true, 3);
        var executor = Executors.newFixedThreadPool(16);
        try {
            var tasks = java.util.stream.IntStream.range(0, 128)
                    .<java.util.concurrent.Callable<EvaluationMemoizer.EvaluationOutcome>>mapToObj(
                            i -> () -> memoizer.evaluate(
                                    EvaluationMemoizer.key("run", "train", "val", "J48", 42, List.of(i)),
                                    () -> result(1))).toList();
            for (var future : executor.invokeAll(tasks)) {
                assertFalse(future.get().memoized());
            }
        } finally {
            executor.shutdownNow();
        }
        assertEquals(3, memoizer.cachedEntries());
        assertEquals(125, memoizer.capacityBypasses());
        assertEquals(128, memoizer.trainedEvaluations());
    }

    @Test
    void validationAndClassifierOptionsArePartOfIdentity() throws Exception {
        var memoizer = new EvaluationMemoizer(true, 10);
        for (var key : List.of(
                EvaluationMemoizer.key("run", "train", "val-a", "J48 -C 0.25", 42, List.of(1)),
                EvaluationMemoizer.key("run", "train", "val-b", "J48 -C 0.25", 42, List.of(1)),
                EvaluationMemoizer.key("run", "train", "val-a", "J48 -C 0.1", 42, List.of(1)),
                EvaluationMemoizer.key("run", "train", "val-a", "J48 -c 0.25", 42, List.of(1)))) {
            assertFalse(memoizer.evaluate(key, () -> result(1)).memoized());
        }
        assertEquals(4, memoizer.cachedEntries());
        assertThrows(IllegalArgumentException.class, () -> memoizer.evaluate(
                EvaluationMemoizer.key(null, "train", "val", "J48", 42, List.of(1)), () -> result(1)));
    }

    private static EvaluationResult result(int value) {
        return new EvaluationResult(value, value, value, value);
    }
}
