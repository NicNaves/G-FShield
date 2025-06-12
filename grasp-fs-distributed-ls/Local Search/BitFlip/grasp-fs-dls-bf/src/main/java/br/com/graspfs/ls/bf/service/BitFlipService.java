package br.com.graspfs.ls.bf.service;

import br.com.graspfs.ls.bf.dto.DataSolution;
import br.com.graspfs.ls.bf.dto.EvaluationResult;
import br.com.graspfs.ls.bf.enuns.LocalSearch;
import br.com.graspfs.ls.bf.machinelearning.MachineLearning;
import br.com.graspfs.ls.bf.producer.KafkaSolutionsProducer;
import br.com.graspfs.ls.bf.util.MachineLearningUtils;
import br.com.graspfs.ls.bf.util.PrintSolution;
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
import java.util.ArrayList;
import java.util.Locale;
import java.util.Random;

@Component
@Slf4j
public class BitFlipService {

    @Autowired
    private KafkaSolutionsProducer kafkaSolutionsProducer;

    @Value("${bitflip.max.iterations:100}")
    private int maxIterations;

    @Value("${bitflip.metrics.file:/metrics/BIT-FLIP_METRICS.csv}")
    private String metricsFileName;

    public void doBitFlip(DataSolution data) throws Exception {
        data.setLocalSearch(LocalSearch.BIT_FLIP);

        try (BufferedWriter writer = new BufferedWriter(new FileWriter(metricsFileName, true))) {
            escreverCabecalhoCSV(writer);
            DataSolution bestSolution = flipFeatures(data, writer);

            bestSolution.setIterationLocalSearch(data.getIterationLocalSearch() + 1);
            bestSolution.setNeighborhood(data.getNeighborhood());
            bestSolution.setIterationNeighborhood(data.getIterationNeighborhood());
            bestSolution.setSeedId(data.getSeedId());
            bestSolution.setLocalSearch(LocalSearch.BIT_FLIP);

            log.info("✅ Melhor solução: F1={} Tempo={} Features={} Iteração={}",
                    bestSolution.getF1Score(), bestSolution.getRunnigTime(),
                    bestSolution.getSolutionFeatures(), bestSolution.getIterationLocalSearch());

            kafkaSolutionsProducer.send(bestSolution);
        }
    }

    private void escreverCabecalhoCSV(BufferedWriter writer) throws IOException {
        writer.write("solutionFeatures;f1Score;accuracy;precision;recall;neighborhood;iterationNeighborhood;localSearch;iterationLocalSearch;runnigTime(ms);cpuUsage(%);memoryUsage(MB);memoryUsagePercent(%);classifier;trainingFileName;testingFileName");
        writer.newLine();
    }

    private DataSolution flipFeatures(DataSolution solution, BufferedWriter writer) throws Exception {
        Random random = new Random();
        int i = 0;

        Instances trainingDataset = MachineLearningUtils.lerDataset(
                new FileInputStream("/datasets/" + solution.getTrainingFileName()));
        Instances testingDataset = MachineLearningUtils.lerDataset(
                new FileInputStream("/datasets/" + solution.getTestingFileName()));

        AbstractClassifier classifier = getClassifier(solution.getClassfier());
        DataSolution bestSolution = updateSolution(solution);

        while (i < maxIterations) {
            int valueIndex = random.nextInt(solution.getRclfeatures().size());
            int positionReplace = random.nextInt(solution.getSolutionFeatures().size());

            solution.getSolutionFeatures().add(solution.getRclfeatures().remove(valueIndex));
            solution.getRclfeatures().add(solution.getSolutionFeatures().remove(positionReplace));
            solution.setIterationLocalSearch(solution.getIterationLocalSearch() + 1);

            long startTime = System.currentTimeMillis();

            MetricsCollector collector = new MetricsCollector();
            Thread monitor = new Thread(collector);
            monitor.start();

            EvaluationResult Scores = MachineLearning.evaluateSolution(
                    new ArrayList<>(solution.getSolutionFeatures()),
                    new Instances(trainingDataset),
                    new Instances(testingDataset),
                    classifier
            );

            collector.stop();
            monitor.join();

            solution.setF1Score(Scores.getF1Score());
            solution.setPrecision(Scores.getPrecision());
            solution.setAccuracy(Scores.getAccuracy());
            solution.setRecall(Scores.getRecall());
            solution.setRunnigTime(System.currentTimeMillis() - startTime); // ✅ Tempo de execução corrigido

            log.info("🌀 Iteração {}: F1={} Features={} ", i, Scores.getF1Score(), solution.getSolutionFeatures());
            PrintSolution.logSolution(solution);

            escreverLinhaCSV(writer, solution, collector);

            if (Scores.getF1Score() > bestSolution.getF1Score()) {
                bestSolution = updateSolution(solution);
            }

            i++;
        }

        return bestSolution;
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

    private DataSolution updateSolution(DataSolution s) {
        return DataSolution.builder()
                .seedId(s.getSeedId())
                .rclfeatures(new ArrayList<>(s.getRclfeatures()))
                .solutionFeatures(new ArrayList<>(s.getSolutionFeatures()))
                .neighborhood(s.getNeighborhood())
                .iterationNeighborhood(s.getIterationNeighborhood())
                .classfier(s.getClassfier())
                .trainingFileName(s.getTrainingFileName())
                .testingFileName(s.getTestingFileName())
                .localSearch(s.getLocalSearch())
                .f1Score(s.getF1Score())
                .accuracy(s.getAccuracy())
                .precision(s.getPrecision())
                .recall(s.getRecall())
                .runnigTime(s.getRunnigTime())
                .iterationLocalSearch(s.getIterationLocalSearch())
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
