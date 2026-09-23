package br.com.graspfs.ls.iwssr.service;

import java.util.concurrent.Callable;
import java.util.concurrent.CancellationException;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

/** Process-wide admission for actual training, not memoized lookups. */
final class TrainingLimiter {
    private final Semaphore permits;
    private final AtomicInteger active = new AtomicInteger();
    private final AtomicInteger peak = new AtomicInteger();
    private final AtomicLong waitingNanos = new AtomicLong();

    TrainingLimiter(int maximum) {
        if (maximum < 0) throw new IllegalArgumentException("negative training limit");
        permits = maximum == 0 ? null : new Semaphore(maximum, true);
    }

    <T> T evaluate(Long deadlineEpochMs, Callable<T> training) throws Exception {
        checkDeadline(deadlineEpochMs);
        boolean acquired = false;
        long started = System.nanoTime();
        try {
            if (permits != null) {
                if (deadlineEpochMs == null) {
                    permits.acquire();
                    acquired = true;
                } else {
                    acquired = permits.tryAcquire(
                            Math.max(0, deadlineEpochMs - System.currentTimeMillis()),
                            TimeUnit.MILLISECONDS);
                    if (!acquired) throw new CancellationException("training admission deadline");
                }
            }
            waitingNanos.addAndGet(System.nanoTime() - started);
            checkDeadline(deadlineEpochMs);
            int running = active.incrementAndGet();
            peak.accumulateAndGet(running, Math::max);
            try {
                return training.call();
            } finally {
                active.decrementAndGet();
            }
        } finally {
            if (acquired) permits.release();
        }
    }

    private static void checkDeadline(Long deadline) {
        if (Thread.currentThread().isInterrupted()
                || (deadline != null && System.currentTimeMillis() >= deadline)) {
            throw new CancellationException("training deadline or interruption");
        }
    }

    int active() { return active.get(); }
    int peak() { return peak.get(); }
    long waitingNanos() { return waitingNanos.get(); }
}
