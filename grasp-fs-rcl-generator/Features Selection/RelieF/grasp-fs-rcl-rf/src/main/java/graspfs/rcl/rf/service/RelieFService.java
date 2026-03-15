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
import weka.attributeSelection.ReliefFAttributeEval;
import weka.classifiers.AbstractClassifier;
import weka.core.Instances;

import java.io.BufferedWriter;
import java.util.ArrayList;
import java.util.Locale;
import java.util.Random;
import java.util.UUID;

@Service
public class RelieFService {

    private final Logger logger = LoggerFactory.getLogger(RelieFService.class);

    public void rankFeatures(DataSolution solution, Instances trainingDataset, int rclCutoff) throws Exception {
        try {
            long rankingStartedAt = System.currentTimeMillis();
            ArrayList<FeatureAvaliada> allFeatures = new ArrayList<>();
            ReliefFAttributeEval evaluator = new ReliefFAttributeEval();
            evaluator.buildEvaluator(trainingDataset);
            logger.info(
                    "RF evaluator ready rows={} attributes={} elapsedMs={}",
                    trainingDataset.numInstances(),
                    trainingDataset.numAttributes(),
                    System.currentTimeMillis() - rankingStartedAt
            );

            for (int i = 0; i < trainingDataset.numAttributes(); i++) {
                double rfRatio = evaluator.evaluateAttribute(i);
                allFeatures.add(new FeatureAvaliada(rfRatio, i + 1));

                if ((i + 1) % 10 == 0 || i + 1 == trainingDataset.numAttributes()) {
                    logger.info(
                            "RF ranking progress evaluatedAttributes={}/{} elapsedMs={}",
                            i + 1,
                            trainingDataset.numAttributes(),
                            System.currentTimeMillis() - rankingStartedAt
                    );
                }
            }

            allFeatures.sort((f1, f2) -> Double.compare(f2.getValorFeature(), f1.getValorFeature()));

            ArrayList<Integer> rclFeatures = new ArrayList<>();
            for (int i = 0; i < Math.min(rclCutoff, allFeatures.size()); i++) {
                rclFeatures.add(allFeatures.get(i).getIndiceFeature());
            }

            solution.setRclfeatures(rclFeatures);
            logger.info(
                    "RCL features definidas count={} cutoff={} elapsedMs={}",
                    rclFeatures.size(),
                    rclCutoff,
                    System.currentTimeMillis() - rankingStartedAt
            );

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

        DataSolution candidate = DataSolution.builder()
                .seedId(UUID.randomUUID())
                .solutionFeatures(new ArrayList<>())
                .rclfeatures(rcl.getRclfeatures() != null ? new ArrayList<>(rcl.getRclfeatures()) : new ArrayList<>())
                .neighborhood(rcl.getNeighborhood())
                .enabledLocalSearches(rcl.getEnabledLocalSearches() != null ? new ArrayList<>(rcl.getEnabledLocalSearches()) : new ArrayList<>())
                .neighborhoodMaxIterations(rcl.getNeighborhoodMaxIterations())
                .bitFlipMaxIterations(rcl.getBitFlipMaxIterations())
                .iwssMaxIterations(rcl.getIwssMaxIterations())
                .iwssrMaxIterations(rcl.getIwssrMaxIterations())
                .iterationNeighborhood(rcl.getIterationNeighborhood())
                .classfier(rcl.getClassfier())
                .rclAlgorithm(rcl.getRclAlgorithm())
                .localSearch(rcl.getLocalSearch())
                .runnigTime(rcl.getRunnigTime())
                .iterationLocalSearch(rcl.getIterationLocalSearch())
                .trainingFileName(rcl.getTrainingFileName())
                .testingFileName(rcl.getTestingFileName())
                .build();

        Random random = new Random();
        long startTime = System.currentTimeMillis();

        ArrayList<Integer> rclFeatures = new ArrayList<>(candidate.getRclfeatures());
        ArrayList<Integer> solutionFeatures = new ArrayList<>();

        for (int i = 0; i < cutoff && !rclFeatures.isEmpty(); i++) {
            int index = random.nextInt(rclFeatures.size());
            solutionFeatures.add(rclFeatures.remove(index));
        }

        candidate.setSolutionFeatures(solutionFeatures);

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

        candidate.setF1Score(result.getF1Score());
        candidate.setAccuracy(result.getAccuracy());
        candidate.setPrecision(result.getPrecision());
        candidate.setRecall(result.getRecall());
        candidate.setRunnigTime(System.currentTimeMillis() - startTime);

        logger.info("SoluÃ§Ã£o gerada - RCL: {} | SoluÃ§Ã£o: {} | F1: {}",
                candidate.getRclfeatures(), solutionFeatures, candidate.getF1Score());

        float avgCpu = collector.getAvgCpu();
        float avgMemory = collector.getAvgMemory();
        float avgMemoryPercent = collector.getAvgMemoryPercent();
        candidate.setCpuUsage(Float.isFinite(avgCpu) ? avgCpu : 0.0F);
        candidate.setMemoryUsage(Float.isFinite(avgMemory) ? avgMemory : 0.0F);
        candidate.setMemoryUsagePercent(Float.isFinite(avgMemoryPercent) ? avgMemoryPercent : 0.0F);

        String solutionStr = solutionFeatures.toString().replaceAll("[\\r\\n;]", ",");
        String f1 = String.format(Locale.US, "%.4f", candidate.getF1Score());
        String acc = String.format(Locale.US, "%.4f", candidate.getAccuracy());
        String prec = String.format(Locale.US, "%.4f", candidate.getPrecision());
        String rec = String.format(Locale.US, "%.4f", candidate.getRecall());
        String time = String.valueOf(candidate.getRunnigTime());
        String cpu = Float.isFinite(avgCpu) ? String.format(Locale.US, "%.4f", avgCpu) : "0.0000";
        String mem = Float.isFinite(avgMemory) ? String.format(Locale.US, "%.4f", avgMemory) : "0.0000";
        String memPct = Float.isFinite(avgMemoryPercent) ? String.format(Locale.US, "%.4f", avgMemoryPercent) : "0.0000";

        writer.write(String.join(";",
            solutionStr, f1, acc, prec, rec, time, cpu, mem, memPct,
            candidate.getClassfier(), candidate.getTrainingFileName(), candidate.getTestingFileName()
        ));
        writer.newLine();

        return candidate;
    }
}
