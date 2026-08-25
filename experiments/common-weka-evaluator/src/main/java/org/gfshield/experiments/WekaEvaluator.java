package org.gfshield.experiments;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.PrintWriter;
import java.util.Arrays;
import java.util.HashMap;
import java.util.Map;
import java.util.stream.IntStream;
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
                if (fields.length != 2 || !evaluationSets.containsKey(fields[0])) {
                    throw new IllegalArgumentException("expected: validation|test<TAB>zero-based-features");
                }
                int[] features = fields[1].isBlank()
                        ? new int[0]
                        : Arrays.stream(fields[1].split(",")).mapToInt(Integer::parseInt).toArray();
                long started = System.nanoTime();
                Metrics metrics = evaluate(training, evaluationSets.get(fields[0]), features);
                long elapsedMs = (System.nanoTime() - started) / 1_000_000L;
                output.printf(
                        "OK\t%.12f\t%.12f\t%.12f\t%.12f\t%.12f\t%.12f\t%.12f\t%d%n",
                        metrics.f1Macro, metrics.f1Weighted,
                        metrics.precisionMacro, metrics.precisionWeighted,
                        metrics.recallMacro, metrics.recallWeighted,
                        metrics.accuracy, elapsedMs);
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
        for (int classIndex = 0; classIndex < classes; classIndex++) {
            f1 += finiteOrZero(evaluation.fMeasure(classIndex));
            precision += finiteOrZero(evaluation.precision(classIndex));
            recall += finiteOrZero(evaluation.recall(classIndex));
        }
        return new Metrics(
                f1 / classes,
                finiteOrZero(evaluation.weightedFMeasure()),
                precision / classes,
                finiteOrZero(evaluation.weightedPrecision()),
                recall / classes,
                finiteOrZero(evaluation.weightedRecall()),
                evaluation.pctCorrect() / 100.0);
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
            double accuracy) {}
}
