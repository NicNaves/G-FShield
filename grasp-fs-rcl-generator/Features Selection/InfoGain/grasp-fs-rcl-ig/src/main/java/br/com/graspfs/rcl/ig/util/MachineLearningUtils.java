package br.com.graspfs.rcl.ig.util;

import weka.classifiers.AbstractClassifier;
import weka.core.Instance;
import weka.core.Instances;
import weka.core.converters.ArffLoader;

import java.util.logging.Level;
import java.util.logging.Logger;
import java.io.*;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class MachineLearningUtils {
    
    private static final Logger LOGGER = Logger.getLogger(MachineLearningUtils.class.getName());

    public static double normalClass = 0; // isso aqui representa as classes com o valor N

    public static double testarInstancia(AbstractClassifier classificador, Instance amostra) throws Exception {
        return classificador.classifyInstance(amostra);
    }

    public static AbstractClassifier construir(Instances treinamento, AbstractClassifier classificador) throws Exception {
        classificador.buildClassifier(treinamento);
        return classificador;
    }

     public static Instances lerDataset(InputStream inputStream) throws IOException {
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
                    LOGGER.info("Instâncias carregadas até agora: " + count);
                }
            }

            // Cria objeto final com todas as instâncias
            Instances dataFinal = new Instances(structure, count);
            for (Instance inst : instancias) {
                dataFinal.add(inst);
            }

            LOGGER.info("Leitura concluída. Total de instâncias: " + count);
            return dataFinal;
        }
    


    public static Instances selecionaFeatures(Instances amostras, ArrayList<Integer> features) {
        int totalFeatures = amostras.numAttributes();
    
        Collections.sort(features);
    
        if (totalFeatures <= features.size()) {
            System.err.println("O número de features precisa ser maior que o filtro.");
            System.out.println("Reduzindo de " + totalFeatures + " para " + features.size() + " features.");
            throw new RuntimeException("O número de features no dataset é menor ou igual ao número selecionado.");
        }
    
        // Cria um array booleano para marcar quais atributos manter
        boolean[] manter = new boolean[totalFeatures];
        for (int f : features) {
            if (f - 1 >= 0 && f - 1 < totalFeatures - 1) { // garante que não marca a classe
                manter[f - 1] = true; // -1 porque features são base 1
            }
        }
    
        // Mantém a última coluna (classe)
        manter[totalFeatures - 1] = true;
    
        // Deleta do final para o início os atributos que não devem ser mantidos
        for (int i = totalFeatures - 1; i >= 0; i--) {
            if (!manter[i]) {
                amostras.deleteAttributeAt(i);
            }
        }
    
        amostras.setClassIndex(amostras.numAttributes() - 1);
        return amostras;
    }

    public static double classificarInstancias(AbstractClassifier classificador, Instances teste) {
        // Resultados
        float VP = 0; // quando o IDS diz que está acontecendo um ataque, e realmente está
        float VN = 0; // quando o IDS diz que NÃO está acontecendo um ataque, e realmente NÃO está
        float FP = 0; // quando o IDS diz que está acontecendo um ataque, PORÉM NÃO ESTÁ
        float FN = 0; // quando o IDS diz que NÃO está acontecendo um ataque, PORÉM ESTÁ!

        for (int i = 0; i < teste.size(); i++) { // percorre cada uma das amostras de teste
            try {
                Instance testando = teste.instance(i);
                double resultado = MachineLearningUtils.testarInstancia(classificador, testando);
                double esperado = testando.classValue();
                if (resultado == esperado) { // já sabemos que o resultado é verdadeiro
                    if (resultado == normalClass) {
                        VN = VN + 1; // O IDS diz que NÃO está acontecendo um ataque, e realmente NÃO está
                    } else {
                        VP = VP + 1; // o IDS diz que está acontecendo um ataque, e realmente está
                    }
                } else { // sabemos que é um "falso"
                    if (resultado == normalClass) {
                        FN = FN + 1; // o IDS diz que NÃO está acontecendo um ataque, PORÉM ESTÁ!
                    } else {
                        FP = FP + 1; // o IDS diz que está acontecendo um ataque, PORÉM NÃO ESTÁ
                    }
                }
            } catch (ArrayIndexOutOfBoundsException a) {
                System.err.println("Erro: " + a.getLocalizedMessage());
                System.err.println("DICA: Tem certeza que o número de classes está definido corretamente?");
                throw new RuntimeException("Erro ao classificar instância: índice inválido", a);
            } catch (Exception e) {
                System.err.println("Erro: " + e.getLocalizedMessage());
                throw new RuntimeException("Erro ao classificar instância", e);
            }
        }

        float recall = (VP + FN) == 0 ? 0 : (VP * 100) / (VP + FN);
        float precision = (VP + FP) == 0 ? 0 : (VP * 100) / (VP + FP);
        float f1score = (recall + precision) == 0 ? 0 : 2 * (recall * precision) / (recall + precision);

        return f1score;
    }

    public static void printResults(Instances datasetTestes, float totalNano, float VP, float VN, float FP, float FN) {

        System.out.println(" ### Tempo de Processamento ###");
        System.out.println("     - Tempo total de processamento: " + totalNano + " microssegundos ");
        System.out.println("     - Tempo de processamento por amostra: " + totalNano / datasetTestes.size() + " microssegundos");
        System.out.println(" ### Desempenho na classificação");

        float acuracia = (VP + VN) * 100 / (VP + VN + FP + FN); // quantos acertos o IDS teve
        float recall = (VP * 100) / (VP + FN); // quantas vezes eu acertei dentre as vezes REALMENTE ESTAVA acontecendo um ataque
        float precision = (VP * 100) / (VP + FP); // quantas vezes eu acertei dentre as vezes que eu DISSE que estava acontecendo
        float f1score = 2 * (recall * precision) / (recall + precision);

        System.out.println("########################################################");
        System.out.println("     - VP: " + VP + ", VN: " + VN + ", FP: " + FP + ", FN: " + FN);
        System.out.println("     - F1-Score: " + f1score + "%");
        System.out.println("     - Recall: " + recall + "%");
        System.out.println("     - Precision: " + precision + "%");
        System.out.println("     - Accuracy: " + acuracia + "%");
    }

}
