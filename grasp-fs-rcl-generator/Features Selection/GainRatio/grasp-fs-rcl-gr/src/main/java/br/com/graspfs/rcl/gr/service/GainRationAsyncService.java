package br.com.graspfs.rcl.gr.service;

import br.com.graspfs.rcl.gr.dto.DataSolution;
import br.com.graspfs.rcl.gr.producer.KafkaSolutionsProducer;
import br.com.graspfs.rcl.gr.util.MachineLearningUtils;
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

import java.io.*;

@Service
@RequiredArgsConstructor
public class GainRationAsyncService {

    private static final Logger logger = LoggerFactory.getLogger(GainRationAsyncService.class);
    private static final String METRICS_FILE_NAME = "/metrics/GainRation_METRICS.csv";
    private static final String DATASET_BASE_PATH = "/datasets/";

    @Async
    public void processAsync(
            int maxGenerations,
            int rclCutoff,
            int sampleSize,
            String trainingFileName,
            String testingFileName,
            String classifierName,
            KafkaSolutionsProducer gainRationProducer,
            GainRationService gainRationService,
            boolean isFirstTime
    ) {
        try {
            Instances trainingDataset = MachineLearningUtils.lerDataset(
                    new FileInputStream(DATASET_BASE_PATH + trainingFileName)
            );
            Instances testingDataset = MachineLearningUtils.lerDataset(
                    new FileInputStream(DATASET_BASE_PATH + testingFileName)
            );

            AbstractClassifier classifier = switch (classifierName.toUpperCase()) {
                case "J48" -> new J48();
                case "NB", "NAIVEBAYES" -> new NaiveBayes();
                case "RF", "RANDOMFOREST" -> new RandomForest();
                default -> throw new IllegalArgumentException("Classificador não suportado: " + classifierName);
            };

            DataSolution dataSolution = gainRationService.doGainRation(
                    trainingDataset, rclCutoff, classifier, trainingFileName, testingFileName
            );

            try (BufferedWriter writer = new BufferedWriter(new FileWriter(METRICS_FILE_NAME, true))) {
                if (isFirstTime) {
                writer.write("solutionFeatures;f1Score;accuracy;precision;recall;runnigTime(ms);cpuUsage(%);memoryUsage(MB);memoryUsagePercent(%);classifier;trainingFileName;testingFileName");
                    writer.newLine();
                }

                for (int generation = 0; generation < maxGenerations; generation++) {
                    gainRationService.GenerationSolutions(dataSolution, sampleSize, writer, trainingDataset, testingDataset, classifier);
                    gainRationProducer.send(dataSolution);
                    logger.info("Generation {} processada e enviada com sucesso.", generation + 1);
                }
            }

        } catch (Exception e) {
            logger.error("Erro no processamento assíncrono do GainRation", e);
        }
    }
}
