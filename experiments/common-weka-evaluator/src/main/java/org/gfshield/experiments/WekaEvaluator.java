package org.gfshield.experiments;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.PrintWriter;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.IntStream;
import weka.attributeSelection.ReliefFAttributeEval;
import weka.classifiers.Evaluation;
import weka.classifiers.trees.J48;
import weka.core.Instances;
import weka.core.converters.ConverterUtils.DataSource;
import weka.filters.Filter;
import weka.filters.unsupervised.attribute.Remove;

/** Persistent line-oriented J48 evaluator shared by both Python monoliths. */
public final class WekaEvaluator {
    private WekaEvaluator() {}

    public static void main(String[] args) throws Exception {
        Map<String, String> paths = parseArguments(args);
        Instances training = load(paths.get("train"));
        Map<String, Instances> evaluationSets = new HashMap<>();
        evaluationSets.put("validation", load(paths.get("validation")));
        evaluationSets.put("test", load(paths.get("test")));

        BufferedReader input = new BufferedReader(new InputStreamReader(System.in));
        PrintWriter output = new PrintWriter(System.out, true);
        output.println("READY\tweka-stable-3.8.6\tJ48-default");

        String line;
        while ((line = input.readLine()) != null) {
            if (line.equals("QUIT")) {
                return;
            }
            try {
                String[] fields = line.split("\\t", -1);
                if (fields.length == 3 && fields[0].equals("rank-relieff")) {
                    int sampleSize = Integer.parseInt(fields[1]);
                    int seed = Integer.parseInt(fields[2]);
                    long started = System.nanoTime();
                    int[] ranking = rankReliefF(training, sampleSize, seed);
                    long elapsedMs = (System.nanoTime() - started) / 1_000_000L;
                    output.printf(
                            Locale.ROOT,
                            "RANK_OK\t%s\t%d%n",
                            Arrays.stream(ranking)
                                    .mapToObj(Integer::toString)
                                    .reduce((left, right) -> left + "," + right)
                                    .orElse(""),
                            elapsedMs);
                    continue;
                }
                if (fields.length != 2 || !evaluationSets.containsKey(fields[0])) {
                    throw new IllegalArgumentException(
                            "expected validation|test<TAB>zero-based-features or "
                                    + "rank-relieff<TAB>sample-size<TAB>seed");
                }
                int[] features = fields[1].isBlank()
                        ? new int[0]
                        : Arrays.stream(fields[1].split(",")).mapToInt(Integer::parseInt).toArray();
                long started = System.nanoTime();
                Metrics metrics = evaluate(training, evaluationSets.get(fields[0]), features);
                long elapsedMs = (System.nanoTime() - started) / 1_000_000L;
                output.printf(
                        Locale.ROOT,
                        "OK\t%.12f\t%.12f\t%.12f\t%.12f\t%.12f\t%.12f\t%.12f\t%d\t%s\t%s\t%s%n",
                        metrics.f1Macro, metrics.f1Weighted,
                        metrics.precisionMacro, metrics.precisionWeighted,
                        metrics.recallMacro, metrics.recallWeighted,
                        metrics.accuracy, elapsedMs,
                        encodeLabels(metrics.classLabels),
                        encodeRows(metrics.perClass),
                        encodeRows(metrics.confusionMatrix));
            } catch (Exception error) {
                String message = error.getMessage() == null ? error.getClass().getName() : error.getMessage();
                output.println("ERROR\t" + message.replace('\t', ' ').replace('\n', ' '));
            }
        }
    }

    private static Map<String, String> parseArguments(String[] args) {
        Map<String, String> values = new HashMap<>();
        for (int index = 0; index + 1 < args.length; index += 2) {
            values.put(args[index].replaceFirst("^--", ""), args[index + 1]);
        }
        for (String required : new String[] {"train", "validation", "test"}) {
            if (!values.containsKey(required)) {
                throw new IllegalArgumentException("missing --" + required);
            }
        }
        return values;
    }

    private static Instances load(String path) throws Exception {
        Instances instances = DataSource.read(path);
        instances.setClassIndex(instances.numAttributes() - 1);
        return instances;
    }

    private static Instances select(Instances source, int[] zeroBasedFeatures) throws Exception {
        int classIndex = source.classIndex();
        int[] selected = IntStream.concat(
                Arrays.stream(zeroBasedFeatures).distinct().sorted(),
                IntStream.of(classIndex)).toArray();
        for (int feature : zeroBasedFeatures) {
            if (feature < 0 || feature >= classIndex) {
                throw new IllegalArgumentException("feature out of range: " + feature);
            }
        }
        Remove filter = new Remove();
        filter.setAttributeIndicesArray(selected);
        filter.setInvertSelection(true);
        filter.setInputFormat(source);
        Instances reduced = Filter.useFilter(source, filter);
        reduced.setClassIndex(reduced.numAttributes() - 1);
        return reduced;
    }

    private static int[] rankReliefF(Instances training, int sampleSize, int seed) throws Exception {
        if (sampleSize <= 0) {
            throw new IllegalArgumentException("ReliefF sample size must be positive");
        }
        ReliefFAttributeEval evaluator = new ReliefFAttributeEval();
        evaluator.setSampleSize(sampleSize);
        evaluator.setSeed(seed);
        evaluator.buildEvaluator(training);

        List<FeatureScore> scores = new ArrayList<>();
        for (int feature = 0; feature < training.classIndex(); feature++) {
            scores.add(new FeatureScore(feature, evaluator.evaluateAttribute(feature)));
        }
        scores.sort(Comparator
                .comparingDouble(FeatureScore::score)
                .reversed()
                .thenComparingInt(FeatureScore::feature));
        return scores.stream().mapToInt(FeatureScore::feature).toArray();
    }

    private static Metrics evaluate(Instances training, Instances evaluationSet, int[] features) throws Exception {
        if (features.length == 0) {
            throw new IllegalArgumentException("at least one feature is required");
        }
        Instances reducedTraining = select(training, features);
        Instances reducedEvaluation = select(evaluationSet, features);
        J48 classifier = new J48();
        classifier.buildClassifier(reducedTraining);
        Evaluation evaluation = new Evaluation(reducedTraining);
        evaluation.evaluateModel(classifier, reducedEvaluation);

        int classes = reducedEvaluation.numClasses();
        double f1 = 0.0;
        double precision = 0.0;
        double recall = 0.0;
        double[][] perClass = new double[classes][3];
        String[] classLabels = new String[classes];
        for (int classIndex = 0; classIndex < classes; classIndex++) {
            double classF1 = finiteOrZero(evaluation.fMeasure(classIndex));
            double classPrecision = finiteOrZero(evaluation.precision(classIndex));
            double classRecall = finiteOrZero(evaluation.recall(classIndex));
            f1 += classF1;
            precision += classPrecision;
            recall += classRecall;
            classLabels[classIndex] = reducedEvaluation.classAttribute().value(classIndex);
            perClass[classIndex] = new double[] {classF1, classPrecision, classRecall};
        }
        return new Metrics(
                f1 / classes,
                finiteOrZero(evaluation.weightedFMeasure()),
                precision / classes,
                finiteOrZero(evaluation.weightedPrecision()),
                recall / classes,
                finiteOrZero(evaluation.weightedRecall()),
                evaluation.pctCorrect() / 100.0,
                classLabels,
                perClass,
                evaluation.confusionMatrix());
    }

    private static String encodeLabels(String[] labels) {
        return Arrays.stream(labels)
                .map(label -> Base64.getUrlEncoder().withoutPadding().encodeToString(
                        label.getBytes(StandardCharsets.UTF_8)))
                .reduce((left, right) -> left + "," + right)
                .orElse("");
    }

    private static String encodeRows(double[][] rows) {
        return Arrays.stream(rows)
                .map(row -> Arrays.stream(row)
                        .mapToObj(value -> String.format(Locale.ROOT, "%.12f", value))
                        .reduce((left, right) -> left + "," + right)
                        .orElse(""))
                .reduce((left, right) -> left + ";" + right)
                .orElse("");
    }

    private static double finiteOrZero(double value) {
        return Double.isFinite(value) ? value : 0.0;
    }

    private record Metrics(
            double f1Macro,
            double f1Weighted,
            double precisionMacro,
            double precisionWeighted,
            double recallMacro,
            double recallWeighted,
            double accuracy,
            String[] classLabels,
            double[][] perClass,
            double[][] confusionMatrix) {}

    private record FeatureScore(int feature, double score) {}
}
