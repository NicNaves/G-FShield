package br.com.graspfs.ls.iwssr.util;

import weka.classifiers.AbstractClassifier;
import weka.core.Instance;
import weka.core.Instances;
import weka.filters.Filter;
import weka.filters.unsupervised.attribute.Remove;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.IntStream;

public class MachineLearningUtils {

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
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(inputStream))) {
            Instances data = new Instances(reader);
            data.setClassIndex(data.numAttributes() - 1);
            return data;
        }
    }

    public static Instances lerDataset(Path datasetPath, boolean useCache) throws IOException {
        Path normalizedPath = datasetPath.toAbsolutePath().normalize();

        if (!useCache) {
            try (InputStream inputStream = Files.newInputStream(normalizedPath)) {
                return lerDataset(inputStream);
            }
        }

        String cacheKey = buildCacheKey(normalizedPath);
        pruneStaleEntries(normalizedPath, cacheKey);

        Instances cachedDataset = TRAINING_DATASET_CACHE.get(cacheKey);
        if (cachedDataset != null) {
            return new Instances(cachedDataset);
        }

        try (InputStream inputStream = Files.newInputStream(normalizedPath)) {
            Instances loadedDataset = lerDataset(inputStream);
            TRAINING_DATASET_CACHE.put(cacheKey, new Instances(loadedDataset));
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

    public static Instances selecionaFeatures(Instances amostras, ArrayList<Integer> features) {
        int totalFeatures = amostras.numAttributes();

        if (totalFeatures <= features.size()) {
            System.err.println("O numero de features precisa ser maior que o filtro.");
            System.out.println("Reduzindo de " + totalFeatures + " para " + features.size() + " features.");
            throw new RuntimeException("O numero de features no dataset e menor ou igual ao numero selecionado.");
        }

        int classIndex = totalFeatures - 1;
        int[] selected = IntStream.concat(
                features.stream()
                        .mapToInt(feature -> feature - 1)
                        .filter(feature -> feature >= 0 && feature < classIndex)
                        .distinct()
                        .sorted(),
                IntStream.of(classIndex)
        ).toArray();
        try {
            Remove filter = new Remove();
            filter.setAttributeIndicesArray(selected);
            filter.setInvertSelection(true);
            filter.setInputFormat(amostras);
            Instances reduced = Filter.useFilter(amostras, filter);
            reduced.setClassIndex(reduced.numAttributes() - 1);
            return reduced;
        } catch (Exception error) {
            throw new IllegalStateException("Falha ao selecionar features em lote.", error);
        }
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
