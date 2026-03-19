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
import java.util.ArrayList;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicBoolean;

@Service
@RequiredArgsConstructor
public class RelieFAsyncService {

    private static final Logger logger = LoggerFactory.getLogger(RelieFAsyncService.class);
    private static final String ALGORITHM_NAME = "RELIEF";
    private static final String METRICS_FILE_NAME = "/metrics/RelieF_METRICS.csv";
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
            String neighborhoodStrategy,
            String localSearches,
            Integer neighborhoodMaxIterations,
            Integer bitFlipMaxIterations,
            Integer iwssMaxIterations,
            Integer iwssrMaxIterations,
            KafkaSolutionsProducer reliefProducer,
            RelieFService relieFService,
            boolean isFirstTime,
            String requestId
    ) {
        long requestStartedAt = System.currentTimeMillis();
        try {
            logger.info("rcl async start algorithm={} requestId={}", ALGORITHM_NAME, requestId);

            Instances trainingDataset = loadDataset(trainingFileName, "training", requestId);
            Instances testingDataset = loadDataset(testingFileName, "testing", requestId);

            AbstractClassifier classifier = resolveClassifier(classifierName);
            logger.info(
                    "rcl classifier ready algorithm={} requestId={} classifier={}",
                    ALGORITHM_NAME,
                    requestId,
                    classifier.getClass().getSimpleName()
            );

            // This seed template is reused to create each stochastic generation sent to Kafka.
            DataSolution dataSolution = relieFService.doRelief(
                    trainingDataset, rclCutoff, classifier, trainingFileName, testingFileName
            );
            configureNeighborhood(dataSolution, neighborhoodStrategy, localSearches,
                    neighborhoodMaxIterations, bitFlipMaxIterations, iwssMaxIterations, iwssrMaxIterations);
            logger.info(
                    "rcl seed template ready algorithm={} requestId={} featureCount={} neighborhood={} enabledSearches={}",
                    ALGORITHM_NAME,
                    requestId,
                    dataSolution.getSolutionFeatures() != null ? dataSolution.getSolutionFeatures().size() : 0,
                    dataSolution.getNeighborhood(),
                    dataSolution.getEnabledLocalSearches()
            );

            ensureMetricsHeader(isFirstTime);
            logger.info("rcl metrics ready algorithm={} requestId={} file={}", ALGORITHM_NAME, requestId, METRICS_FILE_NAME);

            try (BufferedWriter writer = new BufferedWriter(new FileWriter(METRICS_FILE_NAME, true))) {
                for (int generation = 0; generation < maxGenerations; generation++) {
                    long generationStartedAt = System.currentTimeMillis();
                    DataSolution generatedSolution = relieFService.GenerationSolutions(
                            dataSolution,
                            sampleSize,
                            writer,
                            trainingDataset,
                            testingDataset,
                            classifier
                    );

                    logger.info(
                            "rcl generation ready algorithm={} requestId={} generation={} seedId={} featureCount={} rclSize={} neighborhood={} enabledSearches={} f1={}",
                            ALGORITHM_NAME,
                            requestId,
                            generation + 1,
                            generatedSolution.getSeedId(),
                            generatedSolution.getSolutionFeatures() != null ? generatedSolution.getSolutionFeatures().size() : 0,
                            generatedSolution.getRclfeatures() != null ? generatedSolution.getRclfeatures().size() : 0,
                            generatedSolution.getNeighborhood(),
                            generatedSolution.getEnabledLocalSearches(),
                            generatedSolution.getF1Score()
                    );
                    reliefProducer.send(generatedSolution);
                    logger.info(
                            "rcl generation published algorithm={} requestId={} generation={} seedId={} elapsedMs={}",
                            ALGORITHM_NAME,
                            requestId,
                            generation + 1,
                            generatedSolution.getSeedId(),
                            System.currentTimeMillis() - generationStartedAt
                    );
                }
            }

            logger.info(
                    "rcl async completed algorithm={} requestId={} elapsedMs={}",
                    ALGORITHM_NAME,
                    requestId,
                    System.currentTimeMillis() - requestStartedAt
            );
        } catch (Exception ex) {
            logger.error("rcl async failed algorithm={} requestId={}", ALGORITHM_NAME, requestId, ex);
        }
    }

    private Instances loadDataset(String fileName, String datasetType, String requestId) throws IOException {
        File datasetFile = new File(DATASET_BASE_PATH + fileName);
        logger.info(
                "rcl dataset loading algorithm={} requestId={} datasetType={} path={} sizeBytes={}",
                ALGORITHM_NAME,
                requestId,
                datasetType,
                datasetFile.getAbsolutePath(),
                datasetFile.length()
        );

        long startedAt = System.currentTimeMillis();
        try (FileInputStream inputStream = new FileInputStream(datasetFile)) {
            Instances dataset = MachineLearningUtils.lerDataset(inputStream);
            logger.info(
                    "rcl dataset loaded algorithm={} requestId={} datasetType={} rows={} attributes={} elapsedMs={}",
                    ALGORITHM_NAME,
                    requestId,
                    datasetType,
                    dataset.numInstances(),
                    dataset.numAttributes(),
                    System.currentTimeMillis() - startedAt
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
            Integer iwssrMaxIterations
    ) {
        dataSolution.setNeighborhood(resolveNeighborhoodStrategy(neighborhoodStrategy));
        dataSolution.setEnabledLocalSearches(resolveLocalSearches(localSearches));
        dataSolution.setNeighborhoodMaxIterations(neighborhoodMaxIterations);
        dataSolution.setBitFlipMaxIterations(bitFlipMaxIterations);
        dataSolution.setIwssMaxIterations(iwssMaxIterations);
        dataSolution.setIwssrMaxIterations(iwssrMaxIterations);
    }

    private void ensureMetricsHeader(boolean isFirstRun) throws IOException {
        if (metricsHeaderReady.get() && !isFirstRun) {
            return;
        }

        synchronized (metricsFileLock) {
            File metricsFile = new File(METRICS_FILE_NAME);
            boolean needsHeader = !metricsFile.exists() || metricsFile.length() == 0;

            if (needsHeader) {
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
