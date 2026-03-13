package graspfs.rcl.rf.service;

import graspfs.rcl.rf.dto.DataSolution;
import graspfs.rcl.rf.dto.EvaluationResult;
import graspfs.rcl.rf.dto.FeatureAvaliada;
import graspfs.rcl.rf.machinelearning.MachineLearning;
import graspfs.rcl.rf.util.SelectionFeaturesUtils;
import graspfs.rcl.rf.util.SystemMetricsUtils.MetricsCollector;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import weka.classifiers.AbstractClassifier;
import weka.core.Instances;

import java.io.BufferedWriter;
import java.util.ArrayList;
import java.util.Locale;
import java.util.Random;

@Service
public class RelieFService {

    private final Logger logger = LoggerFactory.getLogger(RelieFService.class);

    public void rankFeatures(DataSolution solution, Instances trainingDataset, int rclCutoff) throws Exception {
        try {
            ArrayList<FeatureAvaliada> allFeatures = new ArrayList<>();
            for (int i = 0; i < trainingDataset.numAttributes(); i++) {
                double rfRatio = SelectionFeaturesUtils.calcularaRF(trainingDataset, i);
                allFeatures.add(new FeatureAvaliada(rfRatio, i + 1));
            }

            allFeatures.sort((f1, f2) -> Double.compare(f2.getValorFeature(), f1.getValorFeature()));

            ArrayList<Integer> rclFeatures = new ArrayList<>();
            for (int i = 0; i < Math.min(rclCutoff, allFeatures.size()); i++) {
                rclFeatures.add(allFeatures.get(i).getIndiceFeature());
            }

            solution.setRclfeatures(rclFeatures);
            logger.info("RCL features definidas: {}", rclFeatures);

        } catch (RuntimeException ex) {
            logger.error("Erro ao calcular rfRatio: {}", ex.getMessage());
            throw new Exception("Erro ao calcular o ranking das features com rfRatio.");
        }
    }

    public DataSolution doRelief(Instances trainingDataset, int rclCutoff, AbstractClassifier classifier, String trainingFileName, String testingFileName) throws Exception {
        String classifierName = classifier.getClass().getSimpleName();
        DataSolution initialSolution = SelectionFeaturesUtils.createData(classifierName, trainingFileName, testingFileName);
        initialSolution.setRclAlgorithm("RF");
        rankFeatures(initialSolution, trainingDataset, rclCutoff);
        return initialSolution;
    }

    public DataSolution GenerationSolutions(DataSolution rcl, int cutoff, BufferedWriter writer,
                                            Instances trainingDataset, Instances testingDataset,
                                            AbstractClassifier classifier) throws Exception {

        Random random = new Random();
        long startTime = System.currentTimeMillis();

        ArrayList<Integer> rclFeatures = new ArrayList<>(rcl.getRclfeatures());
        ArrayList<Integer> solutionFeatures = new ArrayList<>();

        for (int i = 0; i < cutoff && !rclFeatures.isEmpty(); i++) {
            int index = random.nextInt(rclFeatures.size());
            solutionFeatures.add(rclFeatures.remove(index));
        }

        rcl.setSolutionFeatures(solutionFeatures);

        // Inicia coleta de métricas
        MetricsCollector collector = new MetricsCollector();
        Thread monitor = new Thread(collector);
        monitor.start();

        EvaluationResult result = MachineLearning.evaluateSolution(
                new ArrayList<>(solutionFeatures),
                new Instances(trainingDataset),
                new Instances(testingDataset),
                classifier
        );

        collector.stop();
        monitor.join();

        rcl.setF1Score(result.getF1Score());
        rcl.setAccuracy(result.getAccuracy());
        rcl.setPrecision(result.getPrecision());
        rcl.setRecall(result.getRecall());
        rcl.setRunnigTime(System.currentTimeMillis() - startTime);

        logger.info("Solução gerada - RCL: {} | Solução: {} | F1: {}",
                rcl.getRclfeatures(), solutionFeatures, rcl.getF1Score());

        // Coleta de métricas formatadas
        float avgCpu = collector.getAvgCpu();
        float avgMemory = collector.getAvgMemory();
        float avgMemoryPercent = collector.getAvgMemoryPercent();
        rcl.setCpuUsage(Float.isFinite(avgCpu) ? avgCpu : 0.0F);
        rcl.setMemoryUsage(Float.isFinite(avgMemory) ? avgMemory : 0.0F);
        rcl.setMemoryUsagePercent(Float.isFinite(avgMemoryPercent) ? avgMemoryPercent : 0.0F);

        String solutionStr = solutionFeatures.toString().replaceAll("[\\r\\n;]", ",");
        String f1 = String.format(Locale.US, "%.4f", rcl.getF1Score());
        String acc = String.format(Locale.US, "%.4f", rcl.getAccuracy());
        String prec = String.format(Locale.US, "%.4f", rcl.getPrecision());
        String rec = String.format(Locale.US, "%.4f", rcl.getRecall());
        String time = String.valueOf(rcl.getRunnigTime());
        String cpu = Float.isFinite(avgCpu) ? String.format(Locale.US, "%.4f", avgCpu) : "0.0000";
        String mem = Float.isFinite(avgMemory) ? String.format(Locale.US, "%.4f", avgMemory) : "0.0000";
        String memPct = Float.isFinite(avgMemoryPercent) ? String.format(Locale.US, "%.4f", avgMemoryPercent) : "0.0000";

        // Escreve a linha no CSV
        writer.write(String.join(";",
            solutionStr, f1, acc, prec, rec, time, cpu, mem, memPct,
            rcl.getClassfier(), rcl.getTrainingFileName(), rcl.getTestingFileName()
        ));
        writer.newLine();

        return rcl;
    }
}
