package br.com.graspfs.ls.iwssr.service;

import br.com.graspfs.ls.iwssr.dto.DataSolution;
import br.com.graspfs.ls.iwssr.dto.EvaluationResult;
import br.com.graspfs.ls.iwssr.enuns.LocalSearch;
import br.com.graspfs.ls.iwssr.machinelearning.MachineLearning;
import br.com.graspfs.ls.iwssr.producer.KafkaSolutionsProducer;
import br.com.graspfs.ls.iwssr.util.MachineLearningUtils;
import br.com.graspfs.ls.iwssr.util.SystemMetricsUtils.MetricsCollector;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.stereotype.Service;
import weka.classifiers.AbstractClassifier;
import weka.classifiers.bayes.NaiveBayes;
import weka.classifiers.trees.J48;
import weka.classifiers.trees.RandomForest;
import weka.core.Instances;

import java.io.BufferedWriter;
import java.io.FileWriter;
import java.nio.charset.StandardCharsets;
import java.nio.ByteBuffer;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CancellationException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

@Service
@Slf4j
public class IwssrService implements DisposableBean {

    @Autowired
    private KafkaSolutionsProducer kafkaSolutionsProducer;

    @Value("${datasets.base.path:/datasets/}")
    private String datasetsBasePath;

    @Value("${iwssr.metrics.file:/metrics/IWSSR_METRICS.csv}")
    private String metricsFileName;

    @Value("${local.search.progress.mode:improvement}")
    private String progressMode;

    @Value("${local.search.progress.every-n:10}")
    private int progressEveryN;

    @Value("${iwssr.evaluation.memoization.enabled:false}")
    private boolean evaluationMemoizationEnabled;

    @Value("${iwssr.evaluation.memoization.max-entries:50000}")
    private int evaluationMemoizationMaximumEntries;

    @Value("${iwssr.neighborhood.parallelism:1}")
    private int neighborhoodParallelism;

    @Value("${iwssr.progress.early.enabled:false}")
    private boolean earlyProgressEnabled;

    @Value("${iwssr.training.max.concurrent:0}")
    private int trainingMaximumConcurrent;

    private volatile TrainingLimiter trainingLimiter;

    private final Object metricsLock = new Object();
    private final Object optimizationLock = new Object();
    private BufferedWriter metricsWriter;
    private volatile EvaluationMemoizer evaluationMemoizer;
    private volatile ExecutorService neighborhoodExecutor;

    public void doIwssr(DataSolution seed) throws Exception {
        long startedAt = System.nanoTime();
        DataSolution data = updateSolution(seed);
        normalizeFeaturePartition(data);
        data.setLocalSearch(LocalSearch.IWSSR);
        data.setIterationLocalSearch(data.getIterationLocalSearch() + 1);
        int configuredMaxIterations = resolveMaxIterations(data);
        log.info(
                "dls start search=IWSSR seedId={} neighborhood={} maxIterations={} featureCount={} training={} testing={}",
                data.getSeedId(),
                data.getNeighborhood(),
                configuredMaxIterations,
                data.getSolutionFeatures() != null ? data.getSolutionFeatures().size() : 0,
                data.getTrainingFileName(),
                data.getTestingFileName()
        );

        Instances trainingDataset = MachineLearningUtils.lerDataset(
                Path.of(datasetsBasePath, data.getTrainingFileName()),
                Boolean.TRUE.equals(data.getUseTrainingCache()));
        Instances testingDataset = MachineLearningUtils.lerDataset(
                Path.of(datasetsBasePath, data.getTestingFileName()),
                Boolean.TRUE.equals(data.getUseTrainingCache()));
        AbstractClassifier classifier = getClassifier(data.getClassfier());

        ensureMetricsWriter();
        DataSolution bestSolution = incrementalWrapperSequencialSearch(
                data, trainingDataset, testingDataset, classifier);
        bestSolution = updateSolution(resetDataSolution(seed, bestSolution));
        bestSolution.setStage("local_search_best");
        stampEventTime(bestSolution);
        log.info(
                "dls completed search=IWSSR seedId={} bestF1={} iterationLocalSearch={} elapsedMs={}",
                bestSolution.getSeedId(),
                bestSolution.getF1Score(),
                bestSolution.getIterationLocalSearch(),
                (System.nanoTime() - startedAt) / 1_000_000L
        );
        kafkaSolutionsProducer.send(bestSolution);
    }

    public DataSolution incrementalWrapperSequencialSearch(
            DataSolution dataSolution,
            Instances trainingDataset,
            Instances testingDataset,
            AbstractClassifier classifier
    ) throws Exception {
        dataSolution.setIterationLocalSearch(dataSolution.getIterationLocalSearch() + 1);
        // Keep detached snapshots because add/replace moves mutate the same feature lists repeatedly.
        DataSolution bestSolution = updateSolution(dataSolution);
        DataSolution localSolutionAdd = updateSolution(dataSolution);
        DataSolution localSolutionReplace = updateSolution(dataSolution);
        double lastPublishedBestF1 = Double.NEGATIVE_INFINITY;
        EarlyProgress progress = new EarlyProgress(scoreOf(dataSolution));

        int n = resolveMaxIterations(localSolutionAdd);
        String dataIdentity = evaluationMemoizationEnabled
                ? datasetIdentity(trainingDataset) + ":" + datasetIdentity(testingDataset)
                : "disabled";

        for (int i = 0;
             i < n && !deadlineReached(localSolutionAdd) && !localSolutionAdd.getRclfeatures().isEmpty();
             i++) {
            localSolutionAdd.setIterationLocalSearch(i);
            try {
                localSolutionAdd = updateSolution(addMovement(
                        localSolutionAdd, trainingDataset, testingDataset, classifier, dataIdentity, progress));
                localSolutionReplace = updateSolution(replaceMovement(
                        localSolutionAdd, trainingDataset, testingDataset, classifier, dataIdentity, progress));
            } catch (CancellationException cancelled) {
                break;
            }
            if (!earlyProgressEnabled) lastPublishedBestF1 = publishProgressIfNeeded(
                    updateSolution(localSolutionReplace),
                    i,
                    n,
                    lastPublishedBestF1
            );

            if (localSolutionReplace.getF1Score() > bestSolution.getF1Score()) {
                bestSolution = updateSolution(localSolutionReplace);
            }
        }

        log.info(
                "dls best snapshot search=IWSSR seedId={} bestF1={} iterationLocalSearch={}",
                bestSolution.getSeedId(),
                bestSolution.getF1Score(),
                bestSolution.getIterationLocalSearch()
        );
        return bestSolution;
    }

    private DataSolution addMovement(
            DataSolution solution,
            Instances trainingDataset,
            Instances testingDataset,
            AbstractClassifier classifier,
            String dataIdentity,
            EarlyProgress progress
    ) throws Exception {
        long startTime = System.nanoTime();

        if (solution.getRclfeatures().isEmpty()) {
            throw new IllegalStateException("IWSSR cannot add a feature from an empty RCL");
        }
        Integer feature = solution.getRclfeatures().remove(0);
        if (!solution.getSolutionFeatures().contains(feature)) {
            solution.getSolutionFeatures().add(feature);
        }

        MetricsCollector collector = new MetricsCollector();
        collector.startCollecting();
        EvaluationMemoizer.EvaluationOutcome outcome;
        try {
            outcome = evaluateWithDataset(solution, trainingDataset, testingDataset, classifier, dataIdentity);
        } finally {
            collector.stopCollectingAndAwait();
        }
        EvaluationResult scores = outcome.result();

        long endTime = System.nanoTime();

        applyScores(solution, scores);
        solution.setRunnigTime((endTime - startTime) / 1_000_000L);
        stampCandidate(solution, "iwssr-add");
        progress.publish(solution);

        logMetrics(solution, collector, outcome);
        return solution;
    }

    private DataSolution replaceMovement(
            DataSolution solution,
            Instances trainingDataset,
            Instances testingDataset,
            AbstractClassifier classifier,
            String dataIdentity,
            EarlyProgress progress
    ) throws Exception {
        DataSolution bestReplace = updateSolution(solution);
        int replacementCount = solution.getSolutionFeatures().size();
        if (replacementCount == 0) {
            return bestReplace;
        }

        if (effectiveNeighborhoodParallelism(replacementCount) == 1) {
            for (int i = 0; i < replacementCount && !deadlineReached(solution); i++) {
                ReplacementEvaluation replacement = evaluateReplacement(
                        solution, i, trainingDataset, testingDataset, classifier, dataIdentity, progress);
                bestReplace = chooseBetterReplacement(bestReplace, replacement);
            }
            return bestReplace;
        }

        List<Callable<ReplacementEvaluation>> tasks = new ArrayList<>();
        for (int i = 0; i < replacementCount && !deadlineReached(solution); i++) {
            int replacementIndex = i;
            DataSolution snapshot = updateSolution(solution);
            tasks.add(() -> evaluateReplacement(
                    snapshot,
                    replacementIndex,
                    trainingDataset,
                    testingDataset,
                    (AbstractClassifier) AbstractClassifier.makeCopy(classifier), dataIdentity, progress));
        }

        List<Future<ReplacementEvaluation>> futures;
        Long deadlineEpochMs = solution.getDeadlineEpochMs();
        if (deadlineEpochMs != null) {
            long remainingMs = Math.max(1L, deadlineEpochMs - System.currentTimeMillis());
            futures = neighborhoodExecutor().invokeAll(tasks, remainingMs, TimeUnit.MILLISECONDS);
        } else {
            futures = neighborhoodExecutor().invokeAll(tasks);
        }

        // Futures are returned in submission order. This preserves the original
        // deterministic tie rule even when evaluations finish out of order.
        for (Future<ReplacementEvaluation> future : futures) {
            if (future.isCancelled()) {
                continue;
            }
            try {
                bestReplace = chooseBetterReplacement(bestReplace, future.get());
            } catch (CancellationException ignored) {
                // A deadline cancellation is an expected bounded-search outcome.
            } catch (ExecutionException error) {
                Throwable cause = error.getCause();
                if (cause instanceof CancellationException) {
                    continue;
                }
                if (cause instanceof Exception exception) {
                    throw exception;
                }
                if (cause instanceof Error fatal) {
                    throw fatal;
                }
                throw new IllegalStateException("parallel replacement evaluation failed", cause);
            }
        }

        return bestReplace;
    }

    private ReplacementEvaluation evaluateReplacement(
            DataSolution solution,
            int replacementIndex,
            Instances trainingDataset,
            Instances testingDataset,
            AbstractClassifier classifier,
            String dataIdentity,
            EarlyProgress progress
    ) throws Exception {
        if (Thread.currentThread().isInterrupted() || deadlineReached(solution)) {
            throw new CancellationException("replacement evaluation deadline reached");
        }
        MetricsCollector collector = new MetricsCollector();
        collector.startCollecting();
        long startTime = System.nanoTime();

        DataSolution replaced = updateSolution(solution);
        replaced.getSolutionFeatures().remove(replacementIndex);
        EvaluationMemoizer.EvaluationOutcome outcome;
        try {
            outcome = evaluateWithDataset(replaced, trainingDataset, testingDataset, classifier, dataIdentity);
        } finally {
            collector.stopCollectingAndAwait();
        }
        applyScores(replaced, outcome.result());
        replaced.setRunnigTime((System.nanoTime() - startTime) / 1_000_000L);
        stampCandidate(replaced, "iwssr-replace-" + replacementIndex);
        progress.publish(replaced);

        logMetrics(replaced, collector, outcome);
        return new ReplacementEvaluation(replacementIndex, replaced, outcome);
    }

    private DataSolution chooseBetterReplacement(
            DataSolution currentBest,
            ReplacementEvaluation replacement
    ) {
        DataSolution candidate = replacement.solution();
        if (candidate.getF1Score() > currentBest.getF1Score()) {
            log.debug(
                    "dls replacement improved search=IWSSR seedId={} replacementIndex={} f1={} evaluationSource={}",
                    candidate.getSeedId(),
                    replacement.index(),
                    candidate.getF1Score(),
                    replacement.outcome().memoized() ? "memoized" : "trained"
            );
            return updateSolution(candidate);
        }
        return currentBest;
    }

    private EvaluationMemoizer.EvaluationOutcome evaluateWithDataset(
            DataSolution solution,
            Instances training,
            Instances testing,
            AbstractClassifier classifier,
            String dataIdentity
    ) throws Exception {
        EvaluationMemoizer.EvaluationKey key = EvaluationMemoizer.key(
                solution.getRunId(),
                solution.getTrainingFileName() + ":" + dataIdentity,
                solution.getTestingFileName() + ":" + dataIdentity,
                classifier.getClass().getName() + " " + String.join(" ", classifier.getOptions()),
                solution.getSeed(),
                solution.getSolutionFeatures());
        return evaluationMemoizer().evaluate(
                key,
                () -> trainingLimiter().evaluate(solution.getDeadlineEpochMs(),
                        () -> {
                            TrainingLimiter limiter = trainingLimiter();
                            log.info("dls training admission limit={} active={} peakActive={}",
                                    trainingMaximumConcurrent, limiter.active(), limiter.peak());
                            return MachineLearning.evaluateSolution(
                        new ArrayList<>(solution.getSolutionFeatures()),
                        training,
                        testing,
                        classifier);
                        }));
    }

    private TrainingLimiter trainingLimiter() {
        TrainingLimiter current = trainingLimiter;
        if (current != null) return current;
        synchronized (optimizationLock) {
            if (trainingLimiter == null) {
                trainingLimiter = new TrainingLimiter(trainingMaximumConcurrent);
                log.info("dls runtime options earlyProgress={} trainingLimit={}",
                        earlyProgressEnabled, trainingMaximumConcurrent);
            }
            return trainingLimiter;
        }
    }

    /** Per-search high-water mark; publishing never changes ordered search reduction. */
    private final class EarlyProgress {
        private double best;
        EarlyProgress(double initial) { best = initial; }

        synchronized void publish(DataSolution candidate) {
            if (!earlyProgressEnabled || "off".equalsIgnoreCase(progressMode)
                    || deadlineReached(candidate) || Thread.currentThread().isInterrupted()
                    || !Double.isFinite(scoreOf(candidate)) || scoreOf(candidate) <= best) return;
            DataSolution snapshot = updateSolution(candidate);
            snapshot.setStage("local_search_progress");
            // Retain the evaluation completion timestamp and candidate identity.
            kafkaSolutionsProducer.sendProgress(snapshot);
            best = scoreOf(candidate);
            log.info("dls early progress seedId={} candidateId={} f1={} evaluationCompletedUtc={} submittedUtc={}",
                    snapshot.getSeedId(), snapshot.getCandidateId(), best,
                    snapshot.getTimestampUtc(), Instant.now());
        }
    }

    static String datasetIdentity(Instances data) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        digest.update((data.classIndex() + "\n" + new Instances(data, 0))
                .getBytes(StandardCharsets.UTF_8));
        ByteBuffer values = ByteBuffer.allocate((data.numAttributes() + 1) * Double.BYTES);
        for (int i = 0; i < data.numInstances(); i++) {
            values.clear();
            values.putDouble(data.instance(i).weight());
            for (int j = 0; j < data.numAttributes(); j++) {
                values.putDouble(data.instance(i).value(j));
            }
            digest.update(values.array());
            digest.update(data.instance(i).toString().getBytes(StandardCharsets.UTF_8));
            digest.update((byte) '\n');
        }
        return HexFormat.of().formatHex(digest.digest());
    }

    private void applyScores(DataSolution solution, EvaluationResult scores) {
        solution.setF1Score(scores.getF1Score());
        solution.setAccuracy(scores.getAccuracy());
        solution.setPrecision(scores.getPrecision());
        solution.setRecall(scores.getRecall());
    }

    private record ReplacementEvaluation(
            int index,
            DataSolution solution,
            EvaluationMemoizer.EvaluationOutcome outcome
    ) {
    }

    public DataSolution resetDataSolution(DataSolution seed, DataSolution data) {
        LinkedHashSet<Integer> rankedCandidates = new LinkedHashSet<>(seed.getRclfeatures());
        rankedCandidates.removeAll(data.getSolutionFeatures());
        data.setRclfeatures(new ArrayList<>(rankedCandidates));
        normalizeFeaturePartition(data);
        return data;
    }

    private void normalizeFeaturePartition(DataSolution solution) {
        LinkedHashSet<Integer> selected = new LinkedHashSet<>(solution.getSolutionFeatures());
        LinkedHashSet<Integer> remaining = new LinkedHashSet<>(solution.getRclfeatures());
        remaining.removeAll(selected);
        solution.setSolutionFeatures(new ArrayList<>(selected));
        solution.setRclfeatures(new ArrayList<>(remaining));
    }

    private void stampCandidate(DataSolution solution, String movement) {
        String previousCandidate = solution.getCandidateId();
        String identity = String.join("|",
                String.valueOf(solution.getRunId()),
                movement,
                String.valueOf(solution.getNeighborhood()),
                String.valueOf(solution.getIterationNeighborhood()),
                String.valueOf(solution.getIterationLocalSearch()),
                solution.getSolutionFeatures().toString());
        solution.setParentId(previousCandidate);
        solution.setCandidateId(UUID.nameUUIDFromBytes(identity.getBytes(StandardCharsets.UTF_8)).toString());
        stampEventTime(solution);
    }

    private void stampEventTime(DataSolution solution) {
        long campaignStart = environmentLong("CAMPAIGN_START_MONOTONIC_NS", System.nanoTime());
        solution.setTimestampUtc(Instant.now().toString());
        solution.setMonotonicElapsedMs(Math.max(0L, System.nanoTime() - campaignStart) / 1_000_000L);
    }

    private long environmentLong(String name, long fallback) {
        try {
            String value = System.getenv(name);
            return value == null || value.isBlank() ? fallback : Long.parseLong(value);
        } catch (NumberFormatException ignored) {
            return fallback;
        }
    }

    private EvaluationMemoizer evaluationMemoizer() {
        EvaluationMemoizer current = evaluationMemoizer;
        if (current != null) {
            return current;
        }
        synchronized (optimizationLock) {
            if (evaluationMemoizer == null) {
                int maximumEntries = Math.max(1, evaluationMemoizationMaximumEntries);
                evaluationMemoizer = new EvaluationMemoizer(
                        evaluationMemoizationEnabled,
                        maximumEntries);
                log.info(
                        "dls evaluation memoization configured search=IWSSR enabled={} maximumEntries={}",
                        evaluationMemoizationEnabled,
                        maximumEntries);
            }
            return evaluationMemoizer;
        }
    }

    private int effectiveNeighborhoodParallelism(int workItems) {
        return Math.max(1, Math.min(Math.max(1, neighborhoodParallelism), workItems));
    }

    private ExecutorService neighborhoodExecutor() {
        ExecutorService current = neighborhoodExecutor;
        if (current != null) {
            return current;
        }
        synchronized (optimizationLock) {
            if (neighborhoodExecutor == null) {
                int parallelism = Math.max(1, neighborhoodParallelism);
                AtomicInteger threadIndex = new AtomicInteger();
                neighborhoodExecutor = Executors.newFixedThreadPool(parallelism, runnable -> {
                    Thread thread = new Thread(
                            runnable,
                            "iwssr-neighborhood-" + threadIndex.incrementAndGet());
                    thread.setDaemon(true);
                    return thread;
                });
                log.info(
                        "dls neighborhood executor configured search=IWSSR parallelism={}",
                        parallelism);
            }
            return neighborhoodExecutor;
        }
    }

    private void logMetrics(
            DataSolution solution,
            MetricsCollector collector,
            EvaluationMemoizer.EvaluationOutcome outcome
    ) throws Exception {
        float avgCpu = collector.getAvgCpu();
        float avgMemory = collector.getAvgMemory();
        float avgMemoryPercent = collector.getAvgMemoryPercent();
        String evaluationSource = outcome.memoized() ? "memoized" : "trained";

        String f1Formatted = String.format(Locale.US, "%.4f", solution.getF1Score());
        String accFormatted = String.format(Locale.US, "%.4f", solution.getAccuracy());
        String precFormatted = String.format(Locale.US, "%.4f", solution.getPrecision());
        String recFormatted = String.format(Locale.US, "%.4f", solution.getRecall());
        String timeFormatted = String.format(Locale.US, "%d", solution.getRunnigTime());

        String cpuFormatted = Float.isFinite(avgCpu) ? String.format(Locale.US, "%.4f", avgCpu) : "0.0000";
        String memFormatted = Float.isFinite(avgMemory) ? String.format(Locale.US, "%.4f", avgMemory) : "0.0000";
        String memPercentFormatted = Float.isFinite(avgMemoryPercent) ? String.format(Locale.US, "%.4f", avgMemoryPercent) : "0.0000";
        solution.setCpuUsage(Float.isFinite(avgCpu) ? avgCpu : 0.0F);
        solution.setMemoryUsage(Float.isFinite(avgMemory) ? avgMemory : 0.0F);
        solution.setMemoryUsagePercent(Float.isFinite(avgMemoryPercent) ? avgMemoryPercent : 0.0F);

        log.info(
                "dls iteration search=IWSSR seedId={} iteration={} f1={} featureCount={} features={} campaignElapsedMs={} evaluationSource={} evaluationKey={}",
                solution.getSeedId(),
                solution.getIterationLocalSearch(),
                solution.getF1Score(),
                solution.getSolutionFeatures().size(),
                solution.getSolutionFeatures(),
                solution.getMonotonicElapsedMs(),
                evaluationSource,
                outcome.keyId()
        );

        String row = String.join(";",
                solution.getSolutionFeatures().toString(),
                f1Formatted,
                accFormatted,
                precFormatted,
                recFormatted,
                String.valueOf(solution.getNeighborhood()),
                String.valueOf(solution.getIterationNeighborhood()),
                String.valueOf(solution.getLocalSearch()),
                String.valueOf(solution.getIterationLocalSearch()),
                timeFormatted,
                cpuFormatted,
                memFormatted,
                memPercentFormatted,
                solution.getClassfier(),
                solution.getTrainingFileName(),
                solution.getTestingFileName(),
                evaluationSource,
                outcome.keyId()
        );
        synchronized (metricsLock) {
            ensureMetricsWriterLocked();
            metricsWriter.write(row);
            metricsWriter.newLine();
            metricsWriter.flush();
        }
    }

    private void ensureMetricsWriter() throws Exception {
        synchronized (metricsLock) {
            ensureMetricsWriterLocked();
        }
    }

    private void ensureMetricsWriterLocked() throws Exception {
        if (metricsWriter != null) {
            return;
        }
        Path metricsPath = Path.of(metricsFileName);
        boolean writeHeader = !Files.exists(metricsPath) || Files.size(metricsPath) == 0L;
        metricsWriter = new BufferedWriter(new FileWriter(metricsFileName, true));
        if (writeHeader) {
            metricsWriter.write("solutionFeatures;f1Score;accuracy;precision;recall;neighborhood;iterationNeighborhood;localSearch;iterationLocalSearch;runnigTime(ms);cpuUsage(%);memoryUsage(MB);memoryUsagePercent(%);classifier;trainingFileName;testingFileName;evaluationSource;evaluationKey");
            metricsWriter.newLine();
            metricsWriter.flush();
        }
    }

    @Override
    public void destroy() throws Exception {
        ExecutorService executor = neighborhoodExecutor;
        if (executor != null) {
            executor.shutdownNow();
            executor.awaitTermination(10, TimeUnit.SECONDS);
        }
        EvaluationMemoizer memoizer = evaluationMemoizer;
        TrainingLimiter limiter = trainingLimiter;
        if (limiter != null) {
            log.info("dls training budget summary limit={} peakActive={} admissionWaitMs={} active={}",
                    trainingMaximumConcurrent, limiter.peak(),
                    limiter.waitingNanos() / 1_000_000L, limiter.active());
        }
        if (memoizer != null) {
            log.info(
                    "dls evaluation memoization summary search=IWSSR trained={} memoized={} capacityBypasses={} cachedEntries={}",
                    memoizer.trainedEvaluations(),
                    memoizer.memoizedEvaluations(),
                    memoizer.capacityBypasses(),
                    memoizer.cachedEntries());
        }
        synchronized (metricsLock) {
            if (metricsWriter != null) {
                metricsWriter.flush();
                metricsWriter.close();
                metricsWriter = null;
            }
        }
    }

    private double publishProgressIfNeeded(
            DataSolution snapshot,
            int iteration,
            int totalIterations,
            double lastPublishedBestF1
    ) {
        if (shouldPublishProgress(snapshot, iteration, totalIterations, lastPublishedBestF1)) {
            kafkaSolutionsProducer.sendProgress(snapshot);
            log.debug(
                    "dls progress search=IWSSR seedId={} iteration={} f1={} reason={}",
                    snapshot.getSeedId(),
                    snapshot.getIterationLocalSearch(),
                    snapshot.getF1Score(),
                    resolveProgressReason(snapshot, iteration, totalIterations, lastPublishedBestF1)
            );
        }

        return Math.max(lastPublishedBestF1, scoreOf(snapshot));
    }

    private boolean shouldPublishProgress(
            DataSolution snapshot,
            int iteration,
            int totalIterations,
            double lastPublishedBestF1
    ) {
        String mode = progressMode == null ? "improvement" : progressMode.trim().toLowerCase(Locale.ROOT);
        boolean firstIteration = iteration == 0;
        boolean lastIteration = iteration >= Math.max(totalIterations - 1, 0);
        boolean improved = scoreOf(snapshot) > lastPublishedBestF1;
        boolean sampledIteration = progressEveryN > 0 && ((iteration + 1) % progressEveryN == 0);

        return switch (mode) {
            case "off" -> false;
            case "full" -> true;
            case "sampled" -> firstIteration || lastIteration || improved || sampledIteration;
            default -> firstIteration || lastIteration || improved;
        };
    }

    private double scoreOf(DataSolution snapshot) {
        return snapshot.getF1Score() == null ? Double.NEGATIVE_INFINITY : snapshot.getF1Score();
    }

    private String resolveProgressReason(
            DataSolution snapshot,
            int iteration,
            int totalIterations,
            double lastPublishedBestF1
    ) {
        boolean firstIteration = iteration == 0;
        boolean lastIteration = iteration >= Math.max(totalIterations - 1, 0);
        boolean improved = scoreOf(snapshot) > lastPublishedBestF1;
        boolean sampledIteration = progressEveryN > 0 && ((iteration + 1) % progressEveryN == 0);

        if (firstIteration) {
            return "first";
        }

        if (lastIteration) {
            return "last";
        }

        if (improved) {
            return "improvement";
        }

        if (sampledIteration) {
            return "sampled";
        }

        return "progress";
    }

    private DataSolution updateSolution(DataSolution solution) {
        // Kafka messages and neighborhood restarts must use immutable snapshots of the current state.
        return DataSolution.builder()
                .seedId(solution.getSeedId())
                .campaignId(solution.getCampaignId())
                .armId(solution.getArmId())
                .runId(solution.getRunId())
                .requestId(solution.getRequestId())
                .candidateId(solution.getCandidateId())
                .parentId(solution.getParentId())
                .seed(solution.getSeed())
                .deadlineEpochMs(solution.getDeadlineEpochMs())
                .stage(solution.getStage())
                .timestampUtc(solution.getTimestampUtc())
                .monotonicElapsedMs(solution.getMonotonicElapsedMs())
                .rclfeatures(new ArrayList<>(solution.getRclfeatures()))
                .solutionFeatures(new ArrayList<>(solution.getSolutionFeatures()))
                .iterationNeighborhood(solution.getIterationNeighborhood())
                .enabledLocalSearches(solution.getEnabledLocalSearches() != null ? new ArrayList<>(solution.getEnabledLocalSearches()) : new ArrayList<>())
                .neighborhoodMaxIterations(solution.getNeighborhoodMaxIterations())
                .bitFlipMaxIterations(solution.getBitFlipMaxIterations())
                .iwssMaxIterations(solution.getIwssMaxIterations())
                .iwssrMaxIterations(solution.getIwssrMaxIterations())
                .classfier(solution.getClassfier())
                .rclAlgorithm(solution.getRclAlgorithm())
                .trainingFileName(solution.getTrainingFileName())
                .testingFileName(solution.getTestingFileName())
                .useTrainingCache(solution.getUseTrainingCache())
                .neighborhood(solution.getNeighborhood())
                .f1Score(solution.getF1Score())
                .cpuUsage(solution.getCpuUsage())
                .memoryUsage(solution.getMemoryUsage())
                .memoryUsagePercent(solution.getMemoryUsagePercent())
                .accuracy(solution.getAccuracy())
                .recall(solution.getRecall())
                .precision(solution.getPrecision())
                .runnigTime(solution.getRunnigTime())
                .iterationLocalSearch(solution.getIterationLocalSearch())
                .localSearch(solution.getLocalSearch())
                .build();
    }

    private boolean deadlineReached(DataSolution solution) {
        return solution.getDeadlineEpochMs() != null
                && System.currentTimeMillis() >= solution.getDeadlineEpochMs();
    }

    private int resolveMaxIterations(DataSolution solution) {
        int availableIterations = solution.getRclfeatures() != null ? solution.getRclfeatures().size() : 0;
        Integer override = solution.getIwssrMaxIterations();
        if (override != null && override > 0) {
            return Math.min(override, availableIterations);
        }

        return availableIterations;
    }

    private AbstractClassifier getClassifier(String name) {
        return switch (name.toUpperCase()) {
            case "J48" -> new J48();
            case "NB", "NAIVEBAYES" -> new NaiveBayes();
            case "RF", "RANDOMFOREST" -> new RandomForest();
            default -> throw new IllegalArgumentException("Classificador nao suportado: " + name);
        };
    }
}
