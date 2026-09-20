package br.com.graspfs.ls.iwssr.service;

import br.com.graspfs.ls.iwssr.dto.EvaluationResult;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.HexFormat;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Objects;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Exact, run-scoped memoization of deterministic feature-subset evaluations.
 *
 * <p>The key deliberately includes the run, immutable data files, classifier,
 * classifier seed and canonical feature subset. A different data window or
 * random seed is therefore always trained again. Failed evaluations are never
 * retained. The stored score is copied on both ingress and egress so callers
 * cannot mutate a cached result.</p>
 */
public final class EvaluationMemoizer {

    @FunctionalInterface
    public interface CheckedEvaluation {
        EvaluationResult evaluate() throws Exception;
    }

    public record EvaluationKey(
            String runId,
            String trainingFile,
            String validationFile,
            String classifier,
            Integer classifierSeed,
            List<Integer> canonicalFeatures
    ) {
        public EvaluationKey {
            runId = normalized(runId);
            trainingFile = normalized(trainingFile);
            validationFile = normalized(validationFile);
            classifier = normalized(classifier);
            if (!classifier.contains(" ")) {
                classifier = classifier.toUpperCase(Locale.ROOT);
            }
            canonicalFeatures = canonicalFeatures == null ? List.of() : canonicalFeatures.stream()
                    .filter(Objects::nonNull).distinct().sorted().toList();
        }

        private static String normalized(String value) {
            return value == null ? "" : value.trim();
        }
    }

    public record EvaluationOutcome(
            EvaluationResult result,
            boolean memoized,
            String keyId
    ) {
    }

    private final boolean enabled;
    private final int maximumEntries;
    private final ConcurrentMap<EvaluationKey, CompletableFuture<EvaluationResult>> results =
            new ConcurrentHashMap<>();
    private final AtomicLong trainedEvaluations = new AtomicLong();
    private final AtomicLong memoizedEvaluations = new AtomicLong();
    private final AtomicLong capacityBypasses = new AtomicLong();

    public EvaluationMemoizer(boolean enabled, int maximumEntries) {
        if (maximumEntries <= 0) {
            throw new IllegalArgumentException("maximumEntries must be positive");
        }
        this.enabled = enabled;
        this.maximumEntries = maximumEntries;
    }

    public EvaluationOutcome evaluate(EvaluationKey key, CheckedEvaluation evaluation) throws Exception {
        Objects.requireNonNull(key, "key");
        Objects.requireNonNull(evaluation, "evaluation");

        if (!enabled) {
            trainedEvaluations.incrementAndGet();
            return new EvaluationOutcome(copy(evaluation.evaluate()), false, keyId(key));
        }

        if (key.runId().isBlank() || key.trainingFile().isBlank()
                || key.validationFile().isBlank() || key.classifier().isBlank()) {
            throw new IllegalArgumentException("memoization requires run and dataset identity");
        }

        CompletableFuture<EvaluationResult> created = new CompletableFuture<>();
        CompletableFuture<EvaluationResult> existing;
        boolean bypass;
        // Reserve capacity atomically, but never hold this lock while training/waiting.
        synchronized (results) {
            existing = results.get(key);
            bypass = existing == null && results.size() >= maximumEntries;
            if (existing == null && !bypass) {
                results.put(key, created);
            }
        }
        if (bypass) {
            capacityBypasses.incrementAndGet();
            trainedEvaluations.incrementAndGet();
            return new EvaluationOutcome(copy(evaluation.evaluate()), false, keyId(key));
        }
        if (existing == null) {
            trainedEvaluations.incrementAndGet();
            try {
                EvaluationResult result = copy(evaluation.evaluate());
                created.complete(result);
                return new EvaluationOutcome(copy(result), false, keyId(key));
            } catch (Exception | Error error) {
                results.remove(key, created);
                created.completeExceptionally(error);
                throw error;
            }
        }

        try {
            EvaluationResult result = copy(existing.get());
            memoizedEvaluations.incrementAndGet();
            return new EvaluationOutcome(result, true, keyId(key));
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw error;
        } catch (ExecutionException error) {
            Throwable cause = error.getCause();
            if (cause instanceof Exception exception) {
                throw exception;
            }
            if (cause instanceof Error fatal) {
                throw fatal;
            }
            throw new IllegalStateException("memoized evaluation failed", cause);
        }
    }

    public static EvaluationKey key(
            String runId,
            String trainingFile,
            String validationFile,
            String classifier,
            Integer classifierSeed,
            Collection<Integer> features
    ) {
        ArrayList<Integer> canonical = new ArrayList<>(features == null ? List.of() : features);
        canonical.removeIf(Objects::isNull);
        Collections.sort(canonical);
        List<Integer> distinct = canonical.stream().distinct().toList();
        return new EvaluationKey(
                runId, trainingFile, validationFile, classifier, classifierSeed, distinct);
    }

    public long trainedEvaluations() {
        return trainedEvaluations.get();
    }

    public long memoizedEvaluations() {
        return memoizedEvaluations.get();
    }

    public long capacityBypasses() {
        return capacityBypasses.get();
    }

    public int cachedEntries() {
        return results.size();
    }

    private static String keyId(EvaluationKey key) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(key.toString().getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException error) {
            throw new IllegalStateException("SHA-256 unavailable", error);
        }
    }

    private static EvaluationResult copy(EvaluationResult result) {
        Objects.requireNonNull(result, "evaluation result");
        return new EvaluationResult(
                result.getF1Score(),
                result.getPrecision(),
                result.getRecall(),
                result.getAccuracy());
    }
}
