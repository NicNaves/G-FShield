package graspfs.rcl.rf.service;

import graspfs.rcl.rf.dto.DataSolution;
import graspfs.rcl.rf.producer.KafkaSolutionsProducer;
import graspfs.rcl.rf.util.MachineLearningUtils;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import weka.classifiers.AbstractClassifier;
import weka.classifiers.bayes.NaiveBayes;
import weka.classifiers.trees.J48;
import weka.classifiers.trees.RandomForest;
import weka.core.Instances;

import java.io.BufferedWriter;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileWriter;
import java.io.IOException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Random;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicBoolean;

@Service
@RequiredArgsConstructor
public class RelieFAsyncService {

    private static final Logger logger = LoggerFactory.getLogger(RelieFAsyncService.class);
    private static final String ALGORITHM_NAME = "RELIEF";
    private static final String METRICS_FILE_PREFIX = "/metrics/RelieF_METRICS_";
    private static final String DATASET_BASE_PATH = "/datasets/";
    private static final String METRICS_HEADER = "solutionFeatures;f1Score;accuracy;precision;recall;runnigTime(ms);cpuUsage(%);memoryUsage(MB);memoryUsagePercent(%);classifier;trainingFileName;testingFileName";
    private static final AtomicBoolean metricsHeaderReady = new AtomicBoolean(false);
    private static final Object metricsFileLock = new Object();

    @Async
    public void processAsync(
            int maxGenerations,
            int rclCutoff,
            int sampleSize,
            String trainingFileName,
            String testingFileName,
            String classifierName,
            boolean useTrainingCache,
            String neighborhoodStrategy,
            String localSearches,
            Integer neighborhoodMaxIterations,
            Integer bitFlipMaxIterations,
            Integer iwssMaxIterations,
            Integer iwssrMaxIterations,
            KafkaSolutionsProducer reliefProducer,
            RelieFService relieFService,
            boolean isFirstTime,
            String requestId,
            String runId,
            int randomSeed,
            long deadlineEpochMs
    ) {
        long requestStartedAt = System.nanoTime();
        long requestStartedMonotonic = System.nanoTime();
        long campaignStartedMonotonic = environmentLong("CAMPAIGN_START_MONOTONIC_NS", requestStartedMonotonic);
        int reliefSampleSize = positiveEnvironmentInt("CAMPAIGN_RELIEFF_SAMPLE_SIZE", 1000);
        Random campaignRandom = new Random(randomSeed);
        try {
            logger.info("rcl async start algorithm={} requestId={}", ALGORITHM_NAME, requestId);

            Instances trainingDataset = loadDataset(trainingFileName, "training", requestId, useTrainingCache);
            Instances testingDataset = loadDataset(testingFileName, "testing", requestId, useTrainingCache);

            AbstractClassifier classifier = resolveClassifier(classifierName);
            logger.info(
                    "rcl classifier ready algorithm={} requestId={} classifier={}",
                    ALGORITHM_NAME,
                    requestId,
                    classifier.getClass().getSimpleName()
            );

            // This seed template is reused to create each stochastic generation sent to Kafka.
            DataSolution dataSolution = relieFService.doRelief(
                    trainingDataset, rclCutoff, classifier, trainingFileName, testingFileName,
                    reliefSampleSize, randomSeed
            );
            configureNeighborhood(dataSolution, neighborhoodStrategy, localSearches,
                    neighborhoodMaxIterations, bitFlipMaxIterations, iwssMaxIterations, iwssrMaxIterations, useTrainingCache);
            dataSolution.setCampaignId(environment("CAMPAIGN_ID", "unassigned"));
            dataSolution.setArmId(environment("CAMPAIGN_ARM_ID", "unassigned"));
            dataSolution.setRunId(runId);
            dataSolution.setRequestId(requestId);
            dataSolution.setSeed(randomSeed);
            dataSolution.setDeadlineEpochMs(deadlineEpochMs);
            dataSolution.setParentId(requestId);
            logger.info(
                    "rcl seed template ready algorithm={} requestId={} featureCount={} neighborhood={} enabledSearches={}",
                    ALGORITHM_NAME,
                    requestId,
                    dataSolution.getSolutionFeatures() != null ? dataSolution.getSolutionFeatures().size() : 0,
                    dataSolution.getNeighborhood(),
                    dataSolution.getEnabledLocalSearches()
            );

            File metricsFile = metricsFile(requestId);
            ensureMetricsHeader(metricsFile);
            logger.info("rcl metrics ready algorithm={} requestId={} file={}", ALGORITHM_NAME, requestId, metricsFile);

            try (BufferedWriter writer = new BufferedWriter(new FileWriter(metricsFile, true))) {
                for (int generation = 0;
                     generation < maxGenerations && System.currentTimeMillis() < deadlineEpochMs;
                     generation++) {
                    long generationStartedAt = System.nanoTime();
                    DataSolution generatedSolution = relieFService.GenerationSolutions(
                            dataSolution,
                            sampleSize,
                            writer,
                            trainingDataset,
                            testingDataset,
                            classifier,
                            campaignRandom
                    );
                    generatedSolution.setCandidateId(generatedSolution.getSeedId().toString());
                    generatedSolution.setStage("initial_solution");
                    generatedSolution.setTimestampUtc(Instant.now().toString());
                    generatedSolution.setMonotonicElapsedMs(
                            Math.max(0L, System.nanoTime() - campaignStartedMonotonic) / 1_000_000L);

                    logger.info(
                            "rcl generation ready algorithm={} requestId={} generation={} seedId={} featureCount={} rclSize={} neighborhood={} enabledSearches={} f1={} features={} campaignElapsedMs={}",
                            ALGORITHM_NAME,
                            requestId,
                            generation + 1,
                            generatedSolution.getSeedId(),
                            generatedSolution.getSolutionFeatures() != null ? generatedSolution.getSolutionFeatures().size() : 0,
                            generatedSolution.getRclfeatures() != null ? generatedSolution.getRclfeatures().size() : 0,
                            generatedSolution.getNeighborhood(),
                            generatedSolution.getEnabledLocalSearches(),
                            generatedSolution.getF1Score(),
                            generatedSolution.getSolutionFeatures(),
                            generatedSolution.getMonotonicElapsedMs()
                    );
                    reliefProducer.send(generatedSolution);
                    logger.info(
                            "rcl generation published algorithm={} requestId={} generation={} seedId={} elapsedMs={}",
                            ALGORITHM_NAME,
                            requestId,
                            generation + 1,
                            generatedSolution.getSeedId(),
                            (System.nanoTime() - generationStartedAt) / 1_000_000L
                    );
                }
            }

            logger.info(
                    "rcl async completed algorithm={} requestId={} elapsedMs={}",
                    ALGORITHM_NAME,
                    requestId,
                    (System.nanoTime() - requestStartedAt) / 1_000_000L
            );
        } catch (Exception ex) {
            logger.error("rcl async failed algorithm={} requestId={}", ALGORITHM_NAME, requestId, ex);
        }
    }

    private String environment(String name, String fallback) {
        String value = System.getenv(name);
        return value == null || value.isBlank() ? fallback : value;
    }

    private long environmentLong(String name, long fallback) {
        try {
            return Long.parseLong(environment(name, Long.toString(fallback)));
        } catch (NumberFormatException ignored) {
            return fallback;
        }
    }

    private int positiveEnvironmentInt(String name, int fallback) {
        long value = environmentLong(name, fallback);
        if (value <= 0 || value > Integer.MAX_VALUE) {
            throw new IllegalArgumentException(name + " must be a positive 32-bit integer");
        }
        return (int) value;
    }

    private Instances loadDataset(String fileName, String datasetType, String requestId, boolean useTrainingCache) throws IOException {
        File datasetFile = new File(DATASET_BASE_PATH + fileName);
        logger.info(
                "rcl dataset loading algorithm={} requestId={} datasetType={} path={} sizeBytes={} useTrainingCache={}",
                ALGORITHM_NAME,
                requestId,
                datasetType,
                datasetFile.getAbsolutePath(),
                datasetFile.length(),
                useTrainingCache
        );

        long startedAt = System.nanoTime();
        if (useTrainingCache) {
            Instances dataset = MachineLearningUtils.lerDataset(datasetFile.toPath(), true);
            logger.info(
                    "rcl dataset loaded algorithm={} requestId={} datasetType={} rows={} attributes={} elapsedMs={}",
                    ALGORITHM_NAME,
                    requestId,
                    datasetType,
                    dataset.numInstances(),
                    dataset.numAttributes(),
                    (System.nanoTime() - startedAt) / 1_000_000L
            );
            return dataset;
        }

        try (FileInputStream inputStream = new FileInputStream(datasetFile)) {
            Instances dataset = MachineLearningUtils.lerDataset(inputStream);
            logger.info(
                    "rcl dataset loaded algorithm={} requestId={} datasetType={} rows={} attributes={} elapsedMs={}",
                    ALGORITHM_NAME,
                    requestId,
                    datasetType,
                    dataset.numInstances(),
                    dataset.numAttributes(),
                    (System.nanoTime() - startedAt) / 1_000_000L
            );
            return dataset;
        }
    }

    private AbstractClassifier resolveClassifier(String classifierName) {
        return switch (classifierName.toUpperCase(Locale.ROOT)) {
            case "J48" -> new J48();
            case "NB", "NAIVEBAYES" -> new NaiveBayes();
            case "RF", "RANDOMFOREST" -> new RandomForest();
            default -> throw new IllegalArgumentException("Classificador nao suportado: " + classifierName);
        };
    }

    private void configureNeighborhood(
            DataSolution dataSolution,
            String neighborhoodStrategy,
            String localSearches,
            Integer neighborhoodMaxIterations,
            Integer bitFlipMaxIterations,
            Integer iwssMaxIterations,
            Integer iwssrMaxIterations,
            boolean useTrainingCache
    ) {
        dataSolution.setNeighborhood(resolveNeighborhoodStrategy(neighborhoodStrategy));
        dataSolution.setEnabledLocalSearches(resolveLocalSearches(localSearches));
        dataSolution.setNeighborhoodMaxIterations(neighborhoodMaxIterations);
        dataSolution.setBitFlipMaxIterations(bitFlipMaxIterations);
        dataSolution.setIwssMaxIterations(iwssMaxIterations);
        dataSolution.setIwssrMaxIterations(iwssrMaxIterations);
        dataSolution.setUseTrainingCache(useTrainingCache);
    }

    private File metricsFile(String requestId) {
        String safeRequestId = requestId.replaceAll("[^A-Za-z0-9_.-]", "_");
        return new File(METRICS_FILE_PREFIX + safeRequestId + ".csv");
    }

    private void ensureMetricsHeader(File metricsFile) throws IOException {
        synchronized (metricsFileLock) {
            if (!metricsFile.exists() || metricsFile.length() == 0) {
                try (BufferedWriter writer = new BufferedWriter(new FileWriter(metricsFile, true))) {
                    writer.write(METRICS_HEADER);
                    writer.newLine();
                }
            }
            metricsHeaderReady.set(true);
        }
    }

    private String resolveNeighborhoodStrategy(String neighborhoodStrategy) {
        if (neighborhoodStrategy == null || neighborhoodStrategy.isBlank()) {
            return null;
        }

        return neighborhoodStrategy.trim().toUpperCase(Locale.ROOT);
    }

    private ArrayList<String> resolveLocalSearches(String localSearches) {
        ArrayList<String> searches = new ArrayList<>();

        if (localSearches == null || localSearches.isBlank()) {
            return searches;
        }

        for (String search : localSearches.split(",")) {
            if (search != null && !search.isBlank()) {
                searches.add(search.trim().toUpperCase(Locale.ROOT));
            }
        }

        return searches;
    }
}
