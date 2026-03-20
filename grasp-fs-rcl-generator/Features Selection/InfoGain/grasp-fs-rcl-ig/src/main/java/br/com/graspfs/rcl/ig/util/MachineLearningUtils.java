package br.com.graspfs.rcl.ig.util;

import weka.classifiers.AbstractClassifier;
import weka.core.Instance;
import weka.core.Instances;
import weka.core.converters.ArffLoader;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.logging.Logger;

public class MachineLearningUtils {

    private static final Logger LOGGER = Logger.getLogger(MachineLearningUtils.class.getName());
    private static final Map<String, Instances> TRAINING_DATASET_CACHE = new ConcurrentHashMap<>();

    public static double normalClass = 0;

    public static double testarInstancia(AbstractClassifier classificador, Instance amostra) throws Exception {
        return classificador.classifyInstance(amostra);
    }

    public static AbstractClassifier construir(Instances treinamento, AbstractClassifier classificador) throws Exception {
        classificador.buildClassifier(treinamento);
        return classificador;
    }

    public static Instances lerDataset(InputStream inputStream) throws IOException {
        return readDataset(inputStream);
    }

    public static Instances lerDataset(Path datasetPath, boolean useCache) throws IOException {
        Path normalizedPath = datasetPath.toAbsolutePath().normalize();

        if (!useCache) {
            try (InputStream inputStream = Files.newInputStream(normalizedPath)) {
                return readDataset(inputStream);
            }
        }

        String cacheKey = buildCacheKey(normalizedPath);
        pruneStaleEntries(normalizedPath, cacheKey);

        Instances cachedDataset = TRAINING_DATASET_CACHE.get(cacheKey);
        if (cachedDataset != null) {
            LOGGER.info("Reutilizando dataset de treino em cache: " + normalizedPath);
            return new Instances(cachedDataset);
        }

        try (InputStream inputStream = Files.newInputStream(normalizedPath)) {
            Instances loadedDataset = readDataset(inputStream);
            TRAINING_DATASET_CACHE.put(cacheKey, new Instances(loadedDataset));
            LOGGER.info("Dataset de treino armazenado em cache: " + normalizedPath);
            return loadedDataset;
        }
    }

    private static void pruneStaleEntries(Path datasetPath, String currentCacheKey) {
        String prefix = datasetPath.toString() + "|";
        TRAINING_DATASET_CACHE.keySet().removeIf((key) -> key.startsWith(prefix) && !key.equals(currentCacheKey));
    }

    private static String buildCacheKey(Path datasetPath) throws IOException {
        return datasetPath + "|" + Files.size(datasetPath) + "|" + Files.getLastModifiedTime(datasetPath).toMillis();
    }

    private static Instances readDataset(InputStream inputStream) throws IOException {
        LOGGER.info("Iniciando leitura incremental do dataset ARFF...");

        ArffLoader loader = new ArffLoader();
        loader.setSource(inputStream);

        Instances structure = loader.getStructure();
        structure.setClassIndex(structure.numAttributes() - 1);
        LOGGER.info("Estrutura carregada: " + structure.numAttributes() + " atributos.");

        List<Instance> instancias = new ArrayList<>();
        int count = 0;

        Instance instance;
        while ((instance = loader.getNextInstance(structure)) != null) {
            instancias.add(instance);
            count++;

            if (count % 1000 == 0) {
                LOGGER.info("Instancias carregadas ate agora: " + count);
            }
        }

        Instances dataFinal = new Instances(structure, count);
        for (Instance inst : instancias) {
            dataFinal.add(inst);
        }

        LOGGER.info("Leitura concluida. Total de instancias: " + count);
        return dataFinal;
    }

    public static Instances selecionaFeatures(Instances amostras, ArrayList<Integer> features) {
        int totalFeatures = amostras.numAttributes();

        Collections.sort(features);

        if (totalFeatures <= features.size()) {
            System.err.println("O numero de features precisa ser maior que o filtro.");
            System.out.println("Reduzindo de " + totalFeatures + " para " + features.size() + " features.");
            throw new RuntimeException("O numero de features no dataset e menor ou igual ao numero selecionado.");
        }

        boolean[] manter = new boolean[totalFeatures];
        for (int f : features) {
            if (f - 1 >= 0 && f - 1 < totalFeatures - 1) {
                manter[f - 1] = true;
            }
        }

        manter[totalFeatures - 1] = true;

        for (int i = totalFeatures - 1; i >= 0; i--) {
            if (!manter[i]) {
                amostras.deleteAttributeAt(i);
            }
        }

        amostras.setClassIndex(amostras.numAttributes() - 1);
        return amostras;
    }

    public static double classificarInstancias(AbstractClassifier classificador, Instances teste) {
        float vp = 0;
        float vn = 0;
        float fp = 0;
        float fn = 0;

        for (int i = 0; i < teste.size(); i++) {
            try {
                Instance testando = teste.instance(i);
                double resultado = MachineLearningUtils.testarInstancia(classificador, testando);
                double esperado = testando.classValue();
                if (resultado == esperado) {
                    if (resultado == normalClass) {
                        vn = vn + 1;
                    } else {
                        vp = vp + 1;
                    }
                } else if (resultado == normalClass) {
                    fn = fn + 1;
                } else {
                    fp = fp + 1;
                }
            } catch (ArrayIndexOutOfBoundsException a) {
                System.err.println("Erro: " + a.getLocalizedMessage());
                System.err.println("DICA: Tem certeza que o numero de classes esta definido corretamente?");
                throw new RuntimeException("Erro ao classificar instancia: indice invalido", a);
            } catch (Exception e) {
                System.err.println("Erro: " + e.getLocalizedMessage());
                throw new RuntimeException("Erro ao classificar instancia", e);
            }
        }

        float recall = (vp + fn) == 0 ? 0 : (vp * 100) / (vp + fn);
        float precision = (vp + fp) == 0 ? 0 : (vp * 100) / (vp + fp);
        float f1score = (recall + precision) == 0 ? 0 : 2 * (recall * precision) / (recall + precision);

        return f1score;
    }

    public static void printResults(Instances datasetTestes, float totalNano, float vp, float vn, float fp, float fn) {
        System.out.println(" ### Tempo de Processamento ###");
        System.out.println("     - Tempo total de processamento: " + totalNano + " microssegundos ");
        System.out.println("     - Tempo de processamento por amostra: " + totalNano / datasetTestes.size() + " microssegundos");
        System.out.println(" ### Desempenho na classificacao");

        float acuracia = (vp + vn) * 100 / (vp + vn + fp + fn);
        float recall = (vp * 100) / (vp + fn);
        float precision = (vp * 100) / (vp + fp);
        float f1score = 2 * (recall * precision) / (recall + precision);

        System.out.println("########################################################");
        System.out.println("     - VP: " + vp + ", VN: " + vn + ", FP: " + fp + ", FN: " + fn);
        System.out.println("     - F1-Score: " + f1score + "%");
        System.out.println("     - Recall: " + recall + "%");
        System.out.println("     - Precision: " + precision + "%");
        System.out.println("     - Accuracy: " + acuracia + "%");
    }
}
