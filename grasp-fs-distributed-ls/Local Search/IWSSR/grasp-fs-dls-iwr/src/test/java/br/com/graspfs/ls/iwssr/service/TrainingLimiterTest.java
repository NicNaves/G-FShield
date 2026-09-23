package br.com.graspfs.ls.iwssr.service;

import org.junit.jupiter.api.Test;
import java.util.ArrayList;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import static org.junit.jupiter.api.Assertions.*;

class TrainingLimiterTest {
    @Test void concurrentCallsRespectSharedLimit() throws Exception {
        var limiter = new TrainingLimiter(2);
        var pool = Executors.newFixedThreadPool(6);
        var entered = new CountDownLatch(2);
        var release = new CountDownLatch(1);
        var futures = new ArrayList<Future<Integer>>();
        try {
            for (int i = 0; i < 6; i++) futures.add(pool.submit(() ->
                    limiter.evaluate(null, () -> {
                        entered.countDown();
                        if (!release.await(5, TimeUnit.SECONDS)) throw new TimeoutException();
                        return 7;
                    })));
            assertTrue(entered.await(5, TimeUnit.SECONDS));
            assertEquals(2, limiter.active());
            release.countDown();
            for (var future : futures) assertEquals(7, future.get(5, TimeUnit.SECONDS));
            assertEquals(2, limiter.peak());
            assertEquals(0, limiter.active());
        } finally {
            release.countDown();
            pool.shutdownNow();
        }
    }

    @Test void waitingTaskExpiresWithoutTrainingAndFailureReleasesPermit() throws Exception {
        var limiter = new TrainingLimiter(1);
        var pool = Executors.newSingleThreadExecutor();
        var entered = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        var trained = new AtomicBoolean();
        try {
            var holder = pool.submit(() -> limiter.evaluate(null, () -> {
                entered.countDown();
                if (!release.await(5, TimeUnit.SECONDS)) throw new TimeoutException();
                return 1;
            }));
            assertTrue(entered.await(5, TimeUnit.SECONDS));
            assertThrows(CancellationException.class, () ->
                    limiter.evaluate(System.currentTimeMillis() + 50, () -> { trained.set(true); return 2; })); // deadline
            assertFalse(trained.get());
            release.countDown();
            holder.get(5, TimeUnit.SECONDS);
            assertThrows(IllegalStateException.class, () ->
                    limiter.evaluate(null, () -> { throw new IllegalStateException("test"); }));
            assertEquals(3, limiter.evaluate(System.currentTimeMillis() + 1000, () -> 3)); // deadline
            assertEquals(0, limiter.active());
        } finally {
            release.countDown();
            pool.shutdownNow();
        }
    }

    @Test void interruptedThreadCannotStartTraining() {
        var limiter = new TrainingLimiter(1);
        Thread.currentThread().interrupt();
        try {
            assertThrows(CancellationException.class, () -> limiter.evaluate(null, () -> 1));
            assertEquals(0, limiter.peak());
        } finally { Thread.interrupted(); }
    }
}
