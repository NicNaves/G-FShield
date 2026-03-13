package br.com.graspfs.rcl.gr.service;

import br.com.graspfs.rcl.gr.dto.DataSolution;
import br.com.graspfs.rcl.gr.dto.EvaluationResult;
import br.com.graspfs.rcl.gr.dto.FeatureAvaliada;
import br.com.graspfs.rcl.gr.machinelearning.MachineLearning;
import br.com.graspfs.rcl.gr.util.SelectionFeaturesUtils;
import br.com.graspfs.rcl.gr.util.SystemMetricsUtils.MetricsCollector;

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
public class GainRationService {

    private final Logger logger = LoggerFactory.getLogger(GainRationService.class);

    /**
     * Executa o ranking das features com base no GainRatio e define a RCL (Restricted Candidate List).
     */
    public void rankFeatures(DataSolution solution, Instances trainingDataset, int rclCutoff) throws Exception {
        try {
            ArrayList<FeatureAvaliada> allFeatures = new ArrayList<>();
            for (int i = 0; i < trainingDataset.numAttributes(); i++) {
                double grRatio = SelectionFeaturesUtils.calcularaGainRatio(trainingDataset, i);
                allFeatures.add(new FeatureAvaliada(grRatio, i + 1));
            }

            // Ordenar do maior para o menor
            allFeatures.sort((f1, f2) -> Double.compare(f2.getValorFeature(), f1.getValorFeature()));

            ArrayList<Integer> rclFeatures = new ArrayList<>();
            for (int i = 0; i < Math.min(rclCutoff, allFeatures.size()); i++) {
                rclFeatures.add(allFeatures.get(i).getIndiceFeature());
            }

            solution.setRclfeatures(rclFeatures);
            logger.info("RCL features definidas: {}", rclFeatures);

        } catch (RuntimeException ex) {
            logger.error("Erro ao calcular GainRatio: {}", ex.getMessage());
            throw new Exception("Erro ao calcular o ranking das features com GainRatio.");
        }
    }

    /**
     * Gera a solução inicial com base no dataset de treino, no valor de corte (RCL) e no classificador.
     */
    public DataSolution doGainRation(Instances trainingDataset, int rclCutoff, AbstractClassifier classifier, String trainingFileName, String testingFileName) throws Exception {
        String classifierName = classifier.getClass().getSimpleName();// pega nome do classificador
        DataSolution initialSolution = SelectionFeaturesUtils.createData(classifierName, trainingFileName, testingFileName); // criação da estrutura da solução
        initialSolution.setRclAlgorithm("GR");
        rankFeatures(initialSolution, trainingDataset, rclCutoff); // calcula a RCL
        return initialSolution; // a avaliação será feita após a geração das soluções
    }

    /**
     * Gera uma nova solução a partir da RCL e avalia com machine learning.
     */
    public DataSolution GenerationSolutions(DataSolution rcl, int cutoff, BufferedWriter writer,
                                            Instances trainingDataset, Instances testingDataset,
                                            AbstractClassifier classifier) throws Exception {
        Random random = new Random();
        long startTime = System.currentTimeMillis();

        ArrayList<Integer> rclFeatures = new ArrayList<>(rcl.getRclfeatures());
        ArrayList<Integer> solutionFeatures = new ArrayList<>();

        // Gera uma solução aleatória de tamanho "cutoff"
        for (int i = 0; i < cutoff && !rclFeatures.isEmpty(); i++) {
            int index = random.nextInt(rclFeatures.size());
            solutionFeatures.add(rclFeatures.remove(index));
        }

        rcl.setSolutionFeatures(solutionFeatures);

        // ⏱️ Inicia coleta de métricas em paralelo
        MetricsCollector collector = new MetricsCollector();
        Thread monitor = new Thread(collector);
        monitor.start();

        // Avalia a solução com os datasets fornecidos e o classificador escolhido
        EvaluationResult result = MachineLearning.evaluateSolution(
                new ArrayList<>(solutionFeatures),            // evita mutações
                new Instances(trainingDataset),               // cópia profunda do dataset
                new Instances(testingDataset),                // idem
                classifier                                     // classificador escolhido dinamicamente
        );


         // 🚫 Para a coleta
         collector.stop();
         monitor.join();

        rcl.setF1Score(result.getF1Score());
        rcl.setAccuracy(result.getAccuracy());
        rcl.setPrecision(result.getPrecision());
        rcl.setRecall(result.getRecall());

        rcl.setRunnigTime(System.currentTimeMillis() - startTime);
       

        logger.info("Solução gerada - RCL: {} | Solução: {} | F1: {}", rcl.getRclfeatures(), solutionFeatures, rcl.getF1Score());
        
        float avgCpu = collector.getAvgCpu();
        float avgMemory = collector.getAvgMemory();
        float avgMemoryPercent = collector.getAvgMemoryPercent();
        rcl.setCpuUsage(Float.isFinite(avgCpu) ? avgCpu : 0.0F);
        rcl.setMemoryUsage(Float.isFinite(avgMemory) ? avgMemory : 0.0F);
        rcl.setMemoryUsagePercent(Float.isFinite(avgMemoryPercent) ? avgMemoryPercent : 0.0F);
        String f1Formatted = String.format(Locale.US, "%.4f", rcl.getF1Score());
        String accFormatted = String.format(Locale.US, "%.4f", rcl.getAccuracy());
        String precFormatted = String.format(Locale.US, "%.4f", rcl.getPrecision());
        String recFormatted = String.format(Locale.US, "%.4f", rcl.getRecall());
        String timeFormatted = String.format(Locale.US, "%d", rcl.getRunnigTime());
        String cpuFormatted = Float.isFinite(avgCpu) ? String.format(Locale.US, "%.4f", avgCpu) : "0.0000";
        String memFormatted = Float.isFinite(avgMemory) ? String.format(Locale.US, "%.4f", avgMemory) : "0.0000";
        String memPercentFormatted = Float.isFinite(avgMemoryPercent) ? String.format(Locale.US, "%.4f", avgMemoryPercent) : "0.0000";

        // Escreve a métrica no arquivo CSV com precisão aprimorada
        writer.write(String.join(";",
            solutionFeatures.toString(),
            f1Formatted,
            accFormatted,
            precFormatted,
            recFormatted,
            timeFormatted,
            cpuFormatted,
            memFormatted,
            memPercentFormatted,
            rcl.getClassfier(),
            rcl.getTrainingFileName(),
            rcl.getTestingFileName()
        ));
        writer.newLine();

        return rcl;
    }
}

        
