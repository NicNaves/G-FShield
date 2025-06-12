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
import java.util.ArrayList;
import java.util.Locale;

@Service
@Slf4j
public class IwssrService {

    @Autowired
    private KafkaSolutionsProducer kafkaSolutionsProducer;

    @Value("${datasets.base.path:/datasets/}")
    private String datasetsBasePath;

    @Value("${iwssr.metrics.file:/metrics/IWSSR_METRICS.csv}")
    private String metricsFileName;

    private BufferedWriter writer;
    private boolean firstTime = true;

    public void doIwssr(DataSolution seed) throws Exception {
        DataSolution data = updateSolution(seed);
        data.setLocalSearch(LocalSearch.IWSSR);
        data.setIterationLocalSearch(data.getIterationLocalSearch() + 1);

        try (BufferedWriter writer = new BufferedWriter(new FileWriter(metricsFileName, true))) {
            this.writer = writer;
            if (firstTime) {
                writer.write("solutionFeatures;f1Score;accuracy;precision;recall;neighborhood;iterationNeighborhood;localSearch;iterationLocalSearch;runnigTime(ms);cpuUsage(%);memoryUsage(MB);memoryUsagePercent(%);classifier;trainingFileName;testingFileName");
                writer.newLine();
                firstTime = false;
            }

            DataSolution bestSolution = incrementalWrapperSequencialSearch(data);
            bestSolution = updateSolution(resetDataSolution(seed, bestSolution));
            kafkaSolutionsProducer.send(bestSolution);
        }
    }

    public DataSolution incrementalWrapperSequencialSearch(DataSolution dataSolution) throws Exception {
        dataSolution.setIterationLocalSearch(dataSolution.getIterationLocalSearch() + 1);
        DataSolution bestSolution = updateSolution(dataSolution);
        DataSolution localSolutionAdd = updateSolution(dataSolution);
        DataSolution localSolutionReplace = updateSolution(dataSolution);

        int n = localSolutionAdd.getRclfeatures().size();

        for (int i = 0; i < n; i++) {
            localSolutionAdd.setIterationLocalSearch(i);
            localSolutionAdd = updateSolution(addMovement(localSolutionAdd));
            localSolutionReplace = updateSolution(replaceMovement(localSolutionAdd));

            if (localSolutionReplace.getF1Score() > bestSolution.getF1Score()) {
                bestSolution = updateSolution(localSolutionReplace);
            }
        }

        log.info("BESTSOLUTION FINAL: {}", bestSolution.getF1Score());
        return bestSolution;
    }

    private DataSolution addMovement(DataSolution solution) throws Exception {
        MetricsCollector collector = new MetricsCollector();
        Thread monitor = new Thread(collector);
        monitor.start();

        long startTime = System.currentTimeMillis();

        solution.getSolutionFeatures().add(solution.getRclfeatures().remove(0));

        EvaluationResult Scores = evaluateWithDataset(solution);

        long endTime = System.currentTimeMillis();

        solution.setF1Score(Scores.getF1Score());
        solution.setAccuracy(Scores.getAccuracy());
        solution.setPrecision(Scores.getPrecision());
        solution.setRecall(Scores.getRecall());
        solution.setRunnigTime(endTime - startTime);

        collector.stop();
        monitor.join();

        logMetrics(solution, collector);
        return solution;
    }

    private DataSolution replaceMovement(DataSolution solution) throws Exception {
        DataSolution bestReplace = updateSolution(solution);

        for (int i = 0; i < solution.getSolutionFeatures().size(); i++) {
            MetricsCollector collector = new MetricsCollector();
            Thread monitor = new Thread(collector);
            monitor.start();

            long startTime = System.currentTimeMillis();

            DataSolution replaced = updateSolution(solution);
            replaced.getSolutionFeatures().remove(i);

            EvaluationResult Scores = evaluateWithDataset(replaced);

            long endTime = System.currentTimeMillis();

            replaced.setF1Score(Scores.getF1Score());
            replaced.setAccuracy(Scores.getAccuracy());
            replaced.setPrecision(Scores.getPrecision());
            replaced.setRecall(Scores.getRecall());
            replaced.setRunnigTime(endTime - startTime);

            collector.stop();
            monitor.join();

            logMetrics(replaced, collector);

            if (Scores.getF1Score() > bestReplace.getF1Score()) {
                bestReplace = updateSolution(replaced);
                log.info("BESTSOLUTION : {} solution: {}", Scores.getF1Score(), bestReplace.getSolutionFeatures());
            }
        }

        return bestReplace;
    }

    private EvaluationResult evaluateWithDataset(DataSolution solution) throws Exception {
        Instances training = MachineLearningUtils.lerDataset(new FileInputStream(datasetsBasePath + solution.getTrainingFileName()));
        Instances testing = MachineLearningUtils.lerDataset(new FileInputStream(datasetsBasePath + solution.getTestingFileName()));
        AbstractClassifier classifier = getClassifier(solution.getClassfier());

        return MachineLearning.evaluateSolution(
                new ArrayList<>(solution.getSolutionFeatures()),
                new Instances(training),
                new Instances(testing),
                classifier
        );
    }

    public DataSolution resetDataSolution(DataSolution seed, DataSolution data) {
        int k = seed.getRclfeatures().size() + seed.getSolutionFeatures().size();
        ArrayList<Integer> novaRcl = new ArrayList<>();
        for (int i = 1; i <= k; i++) {
            if (!data.getSolutionFeatures().contains(i)) {
                novaRcl.add(i);
            }
        }
        data.setRclfeatures(novaRcl);
        return data;
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
