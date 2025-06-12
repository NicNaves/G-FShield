package br.com.graspfs.ls.iwss.service;

import br.com.graspfs.ls.iwss.dto.DataSolution;
import br.com.graspfs.ls.iwss.dto.EvaluationResult;
import br.com.graspfs.ls.iwss.enuns.LocalSearch;
import br.com.graspfs.ls.iwss.machinelearning.MachineLearning;
import br.com.graspfs.ls.iwss.producer.KafkaSolutionsProducer;
import br.com.graspfs.ls.iwss.util.MachineLearningUtils;
import br.com.graspfs.ls.iwss.util.PrintSolution;
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
import java.util.ArrayList;
import java.util.Locale;

@Service
@Slf4j
public class IwssService {

    @Autowired
    private KafkaSolutionsProducer kafkaSolutionsProducer;

    @Value("${iwss.metrics.file:/metrics/IWSS_METRICS.csv}")
    private String metricsFileName;

    @Value("${datasets.base.path:/datasets/}")
    private String datasetsBasePath;

    private boolean firstTime = true;

    public void doIwss(DataSolution seed) throws Exception {
        DataSolution data = updateSolution(seed);
        data.setLocalSearch(LocalSearch.IWSS);

        try (BufferedWriter writer = new BufferedWriter(new FileWriter(metricsFileName, true))) {
            if (firstTime) {
                writer.write("solutionFeatures;f1Score;accuracy;precision;recall;neighborhood;iterationNeighborhood;localSearch;iterationLocalSearch;runnigTime(ms);cpuUsage(%);memoryUsage(MB);memoryUsagePercent(%);classifier;trainingFileName;testingFileName");
                writer.newLine();
                firstTime = false;
            }

            DataSolution bestSolution = incrementalWrapperSequencialSearch(data, writer);
            bestSolution = updateSolution(resetDataSolution(seed, bestSolution));
            kafkaSolutionsProducer.send(bestSolution);
        }
    }

    public DataSolution incrementalWrapperSequencialSearch(DataSolution dataSolution, BufferedWriter writer) throws Exception {
        DataSolution bestSolution = updateSolution(dataSolution);
        DataSolution localSolutionAdd = updateSolution(dataSolution);

        int n = localSolutionAdd.getRclfeatures().size();

        for (int i = 0; i < n; i++) {
            localSolutionAdd.setIterationLocalSearch(i);
            localSolutionAdd = updateSolution(addMovement(localSolutionAdd, writer));
            PrintSolution.logSolution(localSolutionAdd);

            if (localSolutionAdd.getF1Score() > bestSolution.getF1Score()) {
                bestSolution = updateSolution(localSolutionAdd);
            } else {
                log.info("Não houve melhoras!");
            }
        }

        return bestSolution;
    }

    private DataSolution addMovement(DataSolution solution, BufferedWriter writer) throws Exception {
        long startTime = System.currentTimeMillis();

        MetricsCollector collector = new MetricsCollector();
        Thread monitor = new Thread(collector);
        monitor.start();

        solution.getSolutionFeatures().add(solution.getRclfeatures().remove(0));

        Instances trainingDataset = MachineLearningUtils.lerDataset(
                new FileInputStream(datasetsBasePath + solution.getTrainingFileName()));
        Instances testingDataset = MachineLearningUtils.lerDataset(
                new FileInputStream(datasetsBasePath + solution.getTestingFileName()));

        AbstractClassifier classifier = getClassifier(solution.getClassfier());

        EvaluationResult Scores = MachineLearning.evaluateSolution(
                new ArrayList<>(solution.getSolutionFeatures()),
                new Instances(trainingDataset),
                new Instances(testingDataset),
                classifier);

        collector.stop();
        monitor.join();

        solution.setF1Score(Scores.getF1Score());
        solution.setAccuracy(Scores.getAccuracy());
        solution.setRecall(Scores.getRecall());
        solution.setPrecision(Scores.getPrecision());
        solution.setRunnigTime(System.currentTimeMillis() - startTime);  // ✅ tempo de execução ajustado

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

    public DataSolution resetDataSolution(DataSolution seed, DataSolution data) {
        int k = seed.getRclfeatures().size() + seed.getSolutionFeatures().size();
        ArrayList<Integer> rclfeatures = new ArrayList<>();

        for (int i = 1; i <= k; i++) {
            if (!data.getSolutionFeatures().contains(i)) {
                rclfeatures.add(i);
            }
        }

        data.setRclfeatures(rclfeatures);
        return data;
    }

    private DataSolution updateSolution(DataSolution solution) {
        return DataSolution.builder()
                .seedId(solution.getSeedId())
                .rclfeatures(new ArrayList<>(solution.getRclfeatures()))
                .solutionFeatures(new ArrayList<>(solution.getSolutionFeatures()))
                .iterationNeighborhood(solution.getIterationNeighborhood())
                .classfier(solution.getClassfier())
                .trainingFileName(solution.getTrainingFileName())
                .testingFileName(solution.getTestingFileName())
                .neighborhood(solution.getNeighborhood())
                .f1Score(solution.getF1Score())
                .accuracy(solution.getAccuracy())
                .recall(solution.getRecall())
                .precision(solution.getPrecision())
                .runnigTime(solution.getRunnigTime())
                .iterationLocalSearch(solution.getIterationLocalSearch())
                .localSearch(solution.getLocalSearch())
                .build();
    }

    private AbstractClassifier getClassifier(String name) {
        return switch (name.toUpperCase()) {
            case "J48" -> new J48();
            case "NB", "NAIVEBAYES" -> new NaiveBayes();
            case "RF", "RANDOMFOREST" -> new RandomForest();
            default -> throw new IllegalArgumentException("Classificador não suportado: " + name);
        };
    }
}
