package br.com.graspfs.ls.iwss.service;

import br.com.graspfs.ls.iwss.dto.DataSolution;
import br.com.graspfs.ls.iwss.dto.EvaluationResult;
import br.com.graspfs.ls.iwss.enuns.LocalSearch;
import br.com.graspfs.ls.iwss.machinelearning.MachineLearning;
import br.com.graspfs.ls.iwss.producer.KafkaSolutionsProducer;
import br.com.graspfs.ls.iwss.util.MachineLearningUtils;
import br.com.graspfs.ls.iwss.util.SystemMetricsUtils.MetricsCollector;
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
public class IwssService {

    @Autowired
    private KafkaSolutionsProducer kafkaSolutionsProducer;

    @Value("${iwss.metrics.file:/metrics/IWSS_METRICS.csv}")
    private String metricsFileName;

    @Value("${datasets.base.path:/datasets/}")
    private String datasetsBasePath;

    @Value("${local.search.progress.mode:improvement}")
    private String progressMode;

    @Value("${local.search.progress.every-n:10}")
    private int progressEveryN;

    private boolean firstTime = true;

    public void doIwss(DataSolution seed) throws Exception {
        long startedAt = System.currentTimeMillis();
        DataSolution data = updateSolution(seed);
        normalizeFeaturePartition(data);
        data.setLocalSearch(LocalSearch.IWSS);
        int configuredMaxIterations = resolveMaxIterations(data);
        log.info(
                "dls start search=IWSS seedId={} neighborhood={} maxIterations={} featureCount={} training={} testing={}",
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
            if (firstTime) {
                writer.write("solutionFeatures;f1Score;accuracy;precision;recall;neighborhood;iterationNeighborhood;localSearch;iterationLocalSearch;runnigTime(ms);cpuUsage(%);memoryUsage(MB);memoryUsagePercent(%);classifier;trainingFileName;testingFileName");
                writer.newLine();
                firstTime = false;
            }

            DataSolution bestSolution = incrementalWrapperSequencialSearch(
                    data, writer, trainingDataset, testingDataset, classifier);
            bestSolution = updateSolution(resetDataSolution(seed, bestSolution));
            bestSolution.setStage("local_search_best");
            stampEventTime(bestSolution);
            log.info(
                    "dls completed search=IWSS seedId={} bestF1={} iterationLocalSearch={} elapsedMs={}",
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
            BufferedWriter writer,
            Instances trainingDataset,
            Instances testingDataset,
            AbstractClassifier classifier
    ) throws Exception {
        // Keep a detached snapshot so add/remove movements do not mutate the best-so-far result.
        DataSolution bestSolution = updateSolution(dataSolution);
        DataSolution localSolutionAdd = updateSolution(dataSolution);
        double lastPublishedBestF1 = Double.NEGATIVE_INFINITY;

        int n = resolveMaxIterations(localSolutionAdd);

        for (int i = 0;
             i < n && !deadlineReached(localSolutionAdd) && !localSolutionAdd.getRclfeatures().isEmpty();
             i++) {
            localSolutionAdd.setIterationLocalSearch(i);
            localSolutionAdd = updateSolution(addMovement(
                    localSolutionAdd, writer, trainingDataset, testingDataset, classifier));
            lastPublishedBestF1 = publishProgressIfNeeded(
                    updateSolution(localSolutionAdd),
                    i,
                    n,
                    lastPublishedBestF1
            );

            if (localSolutionAdd.getF1Score() > bestSolution.getF1Score()) {
                bestSolution = updateSolution(localSolutionAdd);
            } else {
                log.debug(
                        "dls iteration search=IWSS seedId={} status=no_improvement iteration={}",
                        dataSolution.getSeedId(),
                        i + 1
                );
            }
        }

        return bestSolution;
    }

    private DataSolution addMovement(
            DataSolution solution,
            BufferedWriter writer,
            Instances trainingDataset,
            Instances testingDataset,
            AbstractClassifier classifier
    ) throws Exception {
        long startTime = System.currentTimeMillis();

        MetricsCollector collector = new MetricsCollector();
        collector.startCollecting();

        if (solution.getRclfeatures().isEmpty()) {
            throw new IllegalStateException("IWSS cannot add a feature from an empty RCL");
        }
        Integer feature = solution.getRclfeatures().remove(0);
        if (!solution.getSolutionFeatures().contains(feature)) {
            solution.getSolutionFeatures().add(feature);
        }

        EvaluationResult scores = MachineLearning.evaluateSolution(
                new ArrayList<>(solution.getSolutionFeatures()),
                new Instances(trainingDataset),
                new Instances(testingDataset),
                classifier
        );

        collector.stopCollectingAndAwait();

        solution.setF1Score(scores.getF1Score());
        solution.setAccuracy(scores.getAccuracy());
        solution.setRecall(scores.getRecall());
        solution.setPrecision(scores.getPrecision());
        solution.setRunnigTime(System.currentTimeMillis() - startTime);
        stampCandidate(solution, "iwss-add");

        log.info(
                "dls iteration search=IWSS seedId={} iteration={}/{} f1={} featureCount={}",
                solution.getSeedId(),
                solution.getIterationLocalSearch() + 1,
                resolveMaxIterations(solution),
                solution.getF1Score(),
                solution.getSolutionFeatures().size()
        );

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

        return solution;
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
                    "dls progress search=IWSS seedId={} iteration={} f1={} reason={}",
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
        Integer override = solution.getIwssMaxIterations();
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
