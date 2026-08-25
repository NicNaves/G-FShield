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
import org.springframework.stereotype.Service;
import weka.classifiers.AbstractClassifier;
import weka.classifiers.bayes.NaiveBayes;
import weka.classifiers.trees.J48;
import weka.classifiers.trees.RandomForest;
import weka.core.Instances;

import java.io.BufferedWriter;
import java.io.FileInputStream;
import java.io.FileWriter;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.UUID;

@Service
@Slf4j
public class IwssrService {

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

    private BufferedWriter writer;
    private boolean firstTime = true;

    public void doIwssr(DataSolution seed) throws Exception {
        long startedAt = System.currentTimeMillis();
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
                new FileInputStream(datasetsBasePath + data.getTestingFileName()));
        AbstractClassifier classifier = getClassifier(data.getClassfier());

        try (BufferedWriter writer = new BufferedWriter(new FileWriter(metricsFileName, true))) {
            this.writer = writer;
            if (firstTime) {
                writer.write("solutionFeatures;f1Score;accuracy;precision;recall;neighborhood;iterationNeighborhood;localSearch;iterationLocalSearch;runnigTime(ms);cpuUsage(%);memoryUsage(MB);memoryUsagePercent(%);classifier;trainingFileName;testingFileName");
                writer.newLine();
                firstTime = false;
            }

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
                    System.currentTimeMillis() - startedAt
            );
            kafkaSolutionsProducer.send(bestSolution);
        }
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

        int n = resolveMaxIterations(localSolutionAdd);

        for (int i = 0;
             i < n && !deadlineReached(localSolutionAdd) && !localSolutionAdd.getRclfeatures().isEmpty();
             i++) {
            localSolutionAdd.setIterationLocalSearch(i);
            localSolutionAdd = updateSolution(addMovement(
                    localSolutionAdd, trainingDataset, testingDataset, classifier));
            localSolutionReplace = updateSolution(replaceMovement(
                    localSolutionAdd, trainingDataset, testingDataset, classifier));
            lastPublishedBestF1 = publishProgressIfNeeded(
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
            AbstractClassifier classifier
    ) throws Exception {
        MetricsCollector collector = new MetricsCollector();
        collector.startCollecting();

        long startTime = System.currentTimeMillis();

        if (solution.getRclfeatures().isEmpty()) {
            throw new IllegalStateException("IWSSR cannot add a feature from an empty RCL");
        }
        Integer feature = solution.getRclfeatures().remove(0);
        if (!solution.getSolutionFeatures().contains(feature)) {
            solution.getSolutionFeatures().add(feature);
        }

        EvaluationResult scores = evaluateWithDataset(solution, trainingDataset, testingDataset, classifier);

        long endTime = System.currentTimeMillis();

        solution.setF1Score(scores.getF1Score());
        solution.setAccuracy(scores.getAccuracy());
        solution.setPrecision(scores.getPrecision());
        solution.setRecall(scores.getRecall());
        solution.setRunnigTime(endTime - startTime);
        stampCandidate(solution, "iwssr-add");

        collector.stopCollectingAndAwait();

        logMetrics(solution, collector);
        return solution;
    }

    private DataSolution replaceMovement(
            DataSolution solution,
            Instances trainingDataset,
            Instances testingDataset,
            AbstractClassifier classifier
    ) throws Exception {
        DataSolution bestReplace = updateSolution(solution);

        for (int i = 0; i < solution.getSolutionFeatures().size() && !deadlineReached(solution); i++) {
            MetricsCollector collector = new MetricsCollector();
            collector.startCollecting();

            long startTime = System.currentTimeMillis();

            DataSolution replaced = updateSolution(solution);
            replaced.getSolutionFeatures().remove(i);

            EvaluationResult scores = evaluateWithDataset(replaced, trainingDataset, testingDataset, classifier);

            long endTime = System.currentTimeMillis();

            replaced.setF1Score(scores.getF1Score());
            replaced.setAccuracy(scores.getAccuracy());
            replaced.setPrecision(scores.getPrecision());
            replaced.setRecall(scores.getRecall());
            replaced.setRunnigTime(endTime - startTime);
            stampCandidate(replaced, "iwssr-replace-" + i);

            collector.stopCollectingAndAwait();

            logMetrics(replaced, collector);

            if (scores.getF1Score() > bestReplace.getF1Score()) {
                bestReplace = updateSolution(replaced);
                log.debug("dls replacement improved search=IWSSR seedId={} f1={}", replaced.getSeedId(), scores.getF1Score());
            }
        }

        return bestReplace;
    }

    private EvaluationResult evaluateWithDataset(
            DataSolution solution,
            Instances training,
            Instances testing,
            AbstractClassifier classifier
    ) throws Exception {
        return MachineLearning.evaluateSolution(
                new ArrayList<>(solution.getSolutionFeatures()),
                new Instances(training),
                new Instances(testing),
                classifier
        );
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

    private void logMetrics(DataSolution solution, MetricsCollector collector) throws Exception {
        float avgCpu = collector.getAvgCpu();
        float avgMemory = collector.getAvgMemory();
        float avgMemoryPercent = collector.getAvgMemoryPercent();

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
                "dls iteration search=IWSSR seedId={} iteration={} f1={} featureCount={}",
                solution.getSeedId(),
                solution.getIterationLocalSearch(),
                solution.getF1Score(),
                solution.getSolutionFeatures().size()
        );

        writer.write(String.join(";",
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
                solution.getTestingFileName()
        ));
        writer.newLine();
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
