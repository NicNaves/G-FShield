package br.com.graspfs.rcl.ig.service;

import br.com.graspfs.rcl.ig.dto.DataSolution;
import br.com.graspfs.rcl.ig.producer.KafkaSolutionsProducer;
import br.com.graspfs.rcl.ig.util.MachineLearningUtils;
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
import java.util.concurrent.atomic.AtomicBoolean;

@Service
@RequiredArgsConstructor
public class InformationGainAsyncService {

    private static final Logger logger = LoggerFactory.getLogger(InformationGainAsyncService.class);
    private static final String METRICS_FILE_NAME = "/metrics/InformationGain_METRICS.csv";
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
            KafkaSolutionsProducer informationGainProducer,
            InformationGainService informationGainService,
            boolean isFirstRun,
            String requestId
    ) {
        long requestStartedAt = System.currentTimeMillis();
        try {
            logger.info("requestId={} Starting IG async processing", requestId);

            File trainingFile = new File(DATASET_BASE_PATH + trainingFileName);
            File testingFile = new File(DATASET_BASE_PATH + testingFileName);

            logger.info(
                    "requestId={} Loading training dataset path={} sizeBytes={}",
                    requestId, trainingFile.getAbsolutePath(), trainingFile.length()
            );
            long trainingReadStartedAt = System.currentTimeMillis();
            Instances trainingDataset = MachineLearningUtils.lerDataset(new FileInputStream(trainingFile));
            logger.info(
                    "requestId={} Training dataset loaded rows={} attributes={} elapsedMs={}",
                    requestId, trainingDataset.numInstances(), trainingDataset.numAttributes(),
                    System.currentTimeMillis() - trainingReadStartedAt
            );

            logger.info(
                    "requestId={} Loading testing dataset path={} sizeBytes={}",
                    requestId, testingFile.getAbsolutePath(), testingFile.length()
            );
            long testingReadStartedAt = System.currentTimeMillis();
            Instances testingDataset = MachineLearningUtils.lerDataset(new FileInputStream(testingFile));
            logger.info(
                    "requestId={} Testing dataset loaded rows={} attributes={} elapsedMs={}",
                    requestId, testingDataset.numInstances(), testingDataset.numAttributes(),
                    System.currentTimeMillis() - testingReadStartedAt
            );

            AbstractClassifier classifier = switch (classifierName.toUpperCase()) {
                case "J48" -> new J48();
                case "NB", "NAIVEBAYES" -> new NaiveBayes();
                case "RF", "RANDOMFOREST" -> new RandomForest();
                default -> throw new IllegalArgumentException("Classificador nao suportado: " + classifierName);
            };
            logger.info("requestId={} Classifier resolved classifier={}", requestId, classifier.getClass().getSimpleName());

            logger.info("requestId={} Building initial IG solution", requestId);
            DataSolution dataSolution = informationGainService.doIG(
                    trainingDataset, rclCutoff, classifier, trainingFileName, testingFileName
            );
            dataSolution.setNeighborhood(resolveNeighborhoodStrategy(neighborhoodStrategy));
            dataSolution.setEnabledLocalSearches(resolveLocalSearches(localSearches));
            logger.info(
                    "requestId={} Initial IG solution ready featureCount={} neighborhood={} localSearchCount={}",
                    requestId,
                    dataSolution.getSolutionFeatures() != null ? dataSolution.getSolutionFeatures().size() : 0,
                    dataSolution.getNeighborhood(),
                    dataSolution.getEnabledLocalSearches() != null ? dataSolution.getEnabledLocalSearches().size() : 0
            );

            ensureMetricsHeader(isFirstRun);
            logger.info("requestId={} Metrics header ready file={}", requestId, METRICS_FILE_NAME);

            try (BufferedWriter writer = new BufferedWriter(new FileWriter(METRICS_FILE_NAME, true))) {
                for (int generation = 0; generation < maxGenerations; generation++) {
                    long generationStartedAt = System.currentTimeMillis();
                    informationGainService.GenerationSolutions(
                            dataSolution,
                            sampleSize,
                            writer,
                            trainingDataset,
                            testingDataset,
                            classifier
                    );
                    informationGainProducer.send(dataSolution);
                    logger.info(
                            "requestId={} Generation {} processed and published elapsedMs={}",
                            requestId, generation + 1, System.currentTimeMillis() - generationStartedAt
                    );
                }
            }

            logger.info(
                    "requestId={} IG async processing finished totalElapsedMs={}",
                    requestId, System.currentTimeMillis() - requestStartedAt
            );

        } catch (Exception e) {
            logger.error("requestId={} Error during IG async processing", requestId, e);
        }
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

        return neighborhoodStrategy.trim().toUpperCase();
    }

    private ArrayList<String> resolveLocalSearches(String localSearches) {
        ArrayList<String> searches = new ArrayList<>();

        if (localSearches == null || localSearches.isBlank()) {
            return searches;
        }

        for (String search : localSearches.split(",")) {
            if (search != null && !search.isBlank()) {
                searches.add(search.trim().toUpperCase());
            }
        }

        return searches;
    }
}
