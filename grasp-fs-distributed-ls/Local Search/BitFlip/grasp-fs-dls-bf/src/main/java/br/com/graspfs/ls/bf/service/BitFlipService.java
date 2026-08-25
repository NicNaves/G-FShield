package br.com.graspfs.ls.bf.service;

import br.com.graspfs.ls.bf.dto.DataSolution;
import br.com.graspfs.ls.bf.dto.EvaluationResult;
import br.com.graspfs.ls.bf.enuns.LocalSearch;
import br.com.graspfs.ls.bf.machinelearning.MachineLearning;
import br.com.graspfs.ls.bf.producer.KafkaSolutionsProducer;
import br.com.graspfs.ls.bf.util.MachineLearningUtils;
import br.com.graspfs.ls.bf.util.SystemMetricsUtils.MetricsCollector;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import weka.classifiers.AbstractClassifier;
import weka.classifiers.bayes.NaiveBayes;
import weka.classifiers.trees.J48;
import weka.classifiers.trees.RandomForest;
import weka.core.Instances;

import java.io.BufferedWriter;
import java.io.FileInputStream;
import java.io.FileWriter;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Random;
import java.util.UUID;

@Component
@Slf4j
public class BitFlipService {

    @Autowired
    private KafkaSolutionsProducer kafkaSolutionsProducer;

    @Value("${bitflip.max.iterations:100}")
    private int maxIterations;

    @Value("${bitflip.metrics.file:/metrics/BIT-FLIP_METRICS.csv}")
    private String metricsFileName;

    @Value("${local.search.progress.mode:improvement}")
    private String progressMode;

    @Value("${local.search.progress.every-n:10}")
    private int progressEveryN;

    public void doBitFlip(DataSolution data) throws Exception {
        long startedAt = System.nanoTime();
        data = updateSolution(data);
        normalizeFeaturePartition(data);
        data.setLocalSearch(LocalSearch.BIT_FLIP);
        int configuredMaxIterations = resolveMaxIterations(data);
        log.info(
                "dls start search=BIT_FLIP seedId={} neighborhood={} maxIterations={} featureCount={} training={} testing={}",
                data.getSeedId(),
                data.getNeighborhood(),
                configuredMaxIterations,
                data.getSolutionFeatures() != null ? data.getSolutionFeatures().size() : 0,
                data.getTrainingFileName(),
                data.getTestingFileName()
        );

        boolean shouldWriteHeader = shouldWriteMetricsHeader();

        try (BufferedWriter writer = new BufferedWriter(new FileWriter(metricsFileName, true))) {
            if (shouldWriteHeader) {
                escreverCabecalhoCSV(writer);
            }
            DataSolution bestSolution = flipFeatures(data, writer);

            bestSolution.setIterationLocalSearch(data.getIterationLocalSearch() + 1);
            bestSolution.setNeighborhood(data.getNeighborhood());
            bestSolution.setIterationNeighborhood(data.getIterationNeighborhood());
            bestSolution.setSeedId(data.getSeedId());
            bestSolution.setLocalSearch(LocalSearch.BIT_FLIP);
            bestSolution.setStage("local_search_best");
            stampEventTime(bestSolution);

            log.info(
                    "dls completed search=BIT_FLIP seedId={} bestF1={} iterationLocalSearch={} elapsedMs={}",
                    bestSolution.getSeedId(),
                    bestSolution.getF1Score(),
                    bestSolution.getIterationLocalSearch(),
                    (System.nanoTime() - startedAt) / 1_000_000L
            );

            kafkaSolutionsProducer.send(bestSolution);
        }
    }

    private void escreverCabecalhoCSV(BufferedWriter writer) throws IOException {
        writer.write("solutionFeatures;f1Score;accuracy;precision;recall;neighborhood;iterationNeighborhood;localSearch;iterationLocalSearch;runnigTime(ms);cpuUsage(%);memoryUsage(MB);memoryUsagePercent(%);classifier;trainingFileName;testingFileName");
        writer.newLine();
    }

    private boolean shouldWriteMetricsHeader() throws IOException {
        Path metricsPath = Path.of(metricsFileName);
        return Files.notExists(metricsPath) || Files.size(metricsPath) == 0;
    }

    private DataSolution flipFeatures(DataSolution solution, BufferedWriter writer) throws Exception {
        Random random = new Random(solution.getSeed() != null ? solution.getSeed() : 0);
        int i = 0;
        double lastPublishedBestF1 = Double.NEGATIVE_INFINITY;
        int configuredMaxIterations = resolveMaxIterations(solution);

        Instances trainingDataset = MachineLearningUtils.lerDataset(
                Path.of("/datasets/", solution.getTrainingFileName()),
                Boolean.TRUE.equals(solution.getUseTrainingCache()));
        Instances testingDataset = MachineLearningUtils.lerDataset(
                new FileInputStream("/datasets/" + solution.getTestingFileName()));

        AbstractClassifier classifier = getClassifier(solution.getClassfier());
        // Keep a detached snapshot so later random swaps do not mutate the best-so-far result.
        DataSolution bestSolution = updateSolution(solution);

        while (i < configuredMaxIterations
                && !deadlineReached(solution)
                && !solution.getRclfeatures().isEmpty()
                && !solution.getSolutionFeatures().isEmpty()) {
            int valueIndex = random.nextInt(solution.getRclfeatures().size());
            int positionReplace = random.nextInt(solution.getSolutionFeatures().size());

            solution.getSolutionFeatures().add(solution.getRclfeatures().remove(valueIndex));
            solution.getRclfeatures().add(solution.getSolutionFeatures().remove(positionReplace));
            solution.setIterationLocalSearch(solution.getIterationLocalSearch() + 1);

            long startTime = System.nanoTime();

            MetricsCollector collector = new MetricsCollector();
            collector.startCollecting();

            EvaluationResult scores = MachineLearning.evaluateSolution(
                    new ArrayList<>(solution.getSolutionFeatures()),
                    new Instances(trainingDataset),
                    new Instances(testingDataset),
                    classifier
            );

            collector.stopCollectingAndAwait();

            solution.setF1Score(scores.getF1Score());
            solution.setPrecision(scores.getPrecision());
            solution.setAccuracy(scores.getAccuracy());
            solution.setRecall(scores.getRecall());
            solution.setRunnigTime((System.nanoTime() - startTime) / 1_000_000L);
            stampCandidate(solution, "bitflip-swap");

            log.info(
                    "dls iteration search=BIT_FLIP seedId={} iteration={}/{} f1={} featureCount={}",
                    solution.getSeedId(),
                    i + 1,
                    configuredMaxIterations,
                    scores.getF1Score(),
                    solution.getSolutionFeatures().size()
            );

            escreverLinhaCSV(writer, solution, collector);
            DataSolution progressSnapshot = updateSolution(solution);
            lastPublishedBestF1 = publishProgressIfNeeded(progressSnapshot, i, configuredMaxIterations, lastPublishedBestF1);

            if (scores.getF1Score() > bestSolution.getF1Score()) {
                bestSolution = updateSolution(solution);
            }

            i++;
        }

        return bestSolution;
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

    private void escreverLinhaCSV(BufferedWriter writer, DataSolution s, MetricsCollector collector) throws IOException {
        float avgCpu = collector.getAvgCpu();
        float avgMemory = collector.getAvgMemory();
        float avgMemoryPercent = collector.getAvgMemoryPercent();
        String f1Formatted = String.format(Locale.US, "%.4f", s.getF1Score());
        String accFormatted = String.format(Locale.US, "%.4f", s.getAccuracy());
        String precFormatted = String.format(Locale.US, "%.4f", s.getPrecision());
        String recFormatted = String.format(Locale.US, "%.4f", s.getRecall());
        String timeFormatted = String.format(Locale.US, "%d", s.getRunnigTime());
        String cpuFormatted = Float.isFinite(avgCpu) ? String.format(Locale.US, "%.4f", avgCpu) : "0.0000";
        String memFormatted = Float.isFinite(avgMemory) ? String.format(Locale.US, "%.4f", avgMemory) : "0.0000";
        String memPercentFormatted = Float.isFinite(avgMemoryPercent) ? String.format(Locale.US, "%.4f", avgMemoryPercent) : "0.0000";
        s.setCpuUsage(Float.isFinite(avgCpu) ? avgCpu : 0.0F);
        s.setMemoryUsage(Float.isFinite(avgMemory) ? avgMemory : 0.0F);
        s.setMemoryUsagePercent(Float.isFinite(avgMemoryPercent) ? avgMemoryPercent : 0.0F);

        writer.write(String.join(";",
                s.getSolutionFeatures().toString(),
                f1Formatted,
                accFormatted,
                precFormatted,
                recFormatted,
                String.valueOf(s.getNeighborhood()),
                String.valueOf(s.getIterationNeighborhood()),
                String.valueOf(s.getLocalSearch()),
                String.valueOf(s.getIterationLocalSearch()),
                timeFormatted,
                cpuFormatted,
                memFormatted,
                memPercentFormatted,
                s.getClassfier(),
                s.getTrainingFileName(),
                s.getTestingFileName()
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
                    "dls progress search=BIT_FLIP seedId={} iteration={} f1={} reason={}",
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

    private DataSolution updateSolution(DataSolution s) {
        // Kafka messages and neighborhood restarts must use immutable snapshots of the current state.
        return DataSolution.builder()
                .seedId(s.getSeedId())
                .campaignId(s.getCampaignId())
                .armId(s.getArmId())
                .runId(s.getRunId())
                .requestId(s.getRequestId())
                .candidateId(s.getCandidateId())
                .parentId(s.getParentId())
                .seed(s.getSeed())
                .deadlineEpochMs(s.getDeadlineEpochMs())
                .stage(s.getStage())
                .timestampUtc(s.getTimestampUtc())
                .monotonicElapsedMs(s.getMonotonicElapsedMs())
                .rclfeatures(new ArrayList<>(s.getRclfeatures()))
                .solutionFeatures(new ArrayList<>(s.getSolutionFeatures()))
                .neighborhood(s.getNeighborhood())
                .enabledLocalSearches(s.getEnabledLocalSearches() != null ? new ArrayList<>(s.getEnabledLocalSearches()) : new ArrayList<>())
                .neighborhoodMaxIterations(s.getNeighborhoodMaxIterations())
                .bitFlipMaxIterations(s.getBitFlipMaxIterations())
                .iwssMaxIterations(s.getIwssMaxIterations())
                .iwssrMaxIterations(s.getIwssrMaxIterations())
                .iterationNeighborhood(s.getIterationNeighborhood())
                .classfier(s.getClassfier())
                .rclAlgorithm(s.getRclAlgorithm())
                .trainingFileName(s.getTrainingFileName())
                .testingFileName(s.getTestingFileName())
                .useTrainingCache(s.getUseTrainingCache())
                .localSearch(s.getLocalSearch())
                .f1Score(s.getF1Score())
                .cpuUsage(s.getCpuUsage())
                .memoryUsage(s.getMemoryUsage())
                .memoryUsagePercent(s.getMemoryUsagePercent())
                .accuracy(s.getAccuracy())
                .precision(s.getPrecision())
                .recall(s.getRecall())
                .runnigTime(s.getRunnigTime())
                .iterationLocalSearch(s.getIterationLocalSearch())
                .build();
    }

    private boolean deadlineReached(DataSolution solution) {
        return solution.getDeadlineEpochMs() != null
                && System.currentTimeMillis() >= solution.getDeadlineEpochMs();
    }

    private int resolveMaxIterations(DataSolution solution) {
        Integer override = solution.getBitFlipMaxIterations();
        return override != null && override > 0 ? override : maxIterations;
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
