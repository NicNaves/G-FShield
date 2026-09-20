package br.com.graspfs.ls.iwssr.service;

import br.com.graspfs.ls.iwssr.dto.DataSolution;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.test.util.ReflectionTestUtils;
import weka.classifiers.trees.J48;
import weka.core.Instances;

import java.io.StringReader;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class IwssrOptimizationTest {
    @TempDir Path directory;

    private Instances dataset() throws Exception {
        StringBuilder arff = new StringBuilder("@relation test\n@attribute a numeric\n"
                + "@attribute b numeric\n@attribute c numeric\n@attribute class {normal,attack}\n@data\n");
        for (int i = 0; i < 24; i++) {
            arff.append(i).append(',').append(i % 3).append(',').append(i % 2)
                    .append(',').append(i < 12 ? "normal" : "attack").append('\n');
        }
        Instances data = new Instances(new StringReader(arff.toString()));
        data.setClassIndex(3);
        return data;
    }

    private DataSolution seed() {
        return DataSolution.builder().runId("test-run").seed(127).classfier("J48")
                .trainingFileName("train").testingFileName("validation")
                .solutionFeatures(new ArrayList<>(List.of(1)))
                .rclfeatures(new ArrayList<>(List.of(2, 3)))
                .iterationLocalSearch(0).iterationNeighborhood(0).iwssrMaxIterations(2)
                .f1Score(0F).accuracy(0F).precision(0F).recall(0F).build();
    }

    private IwssrService service(int parallelism, boolean memo) {
        var service = new IwssrService();
        ReflectionTestUtils.setField(service, "neighborhoodParallelism", parallelism);
        ReflectionTestUtils.setField(service, "evaluationMemoizationEnabled", memo);
        ReflectionTestUtils.setField(service, "evaluationMemoizationMaximumEntries", 100);
        ReflectionTestUtils.setField(service, "progressMode", "off");
        ReflectionTestUtils.setField(service, "metricsFileName",
                directory.resolve("p" + parallelism + "-memo" + memo + ".csv").toString());
        return service;
    }

    @Test
    void sequentialParallelAndMemoizedSearchHaveExactlyTheSameResult() throws Exception {
        Instances train = dataset();
        Instances validation = new Instances(train);
        String original = train.toString();
        DataSolution expected = null;
        for (int parallelism : List.of(1, 3)) {
            for (boolean memo : List.of(false, true)) {
                var service = service(parallelism, memo);
                try {
                    J48 classifier = new J48();
                    classifier.setMinNumObj(3);
                    for (int repeat = 0; repeat < 2; repeat++) {
                        var actual = service.incrementalWrapperSequencialSearch(
                                seed(), train, validation, classifier);
                        if (expected == null) expected = actual;
                        assertEquals(expected.getSolutionFeatures(), actual.getSolutionFeatures());
                        assertEquals(expected.getF1Score(), actual.getF1Score());
                        assertEquals(expected.getPrecision(), actual.getPrecision());
                        assertEquals(expected.getRecall(), actual.getRecall());
                        assertEquals(expected.getAccuracy(), actual.getAccuracy());
                    }
                    var memoizer = (EvaluationMemoizer) ReflectionTestUtils.getField(service, "evaluationMemoizer");
                    assertNotNull(memoizer);
                    assertTrue(memoizer.trainedEvaluations() > 0);
                    assertEquals(memo, memoizer.memoizedEvaluations() > 0);
                } finally {
                    service.destroy();
                }
            }
        }
        assertEquals(original, train.toString());
        assertEquals(original, validation.toString());
    }

    @Test
    void fingerprintDetectsChangesBelowArffDisplayPrecisionAndInWeights() throws Exception {
        var data = dataset();
        String original = IwssrService.datasetIdentity(data);
        assertEquals(original, IwssrService.datasetIdentity(new Instances(data)));
        data.instance(0).setValue(0, 1e-12);
        assertNotEquals(original, IwssrService.datasetIdentity(data));
        data.instance(0).setValue(0, 0);
        data.instance(0).setWeight(2);
        assertNotEquals(original, IwssrService.datasetIdentity(data));
    }

    @Test
    void expiredDeadlineDoesNotStartTraining() throws Exception {
        var service = service(3, false);
        try {
            var input = seed();
            input.setDeadlineEpochMs(System.currentTimeMillis() - 1);
            var result = service.incrementalWrapperSequencialSearch(input, dataset(), dataset(), new J48());
            assertEquals(input.getSolutionFeatures(), result.getSolutionFeatures());
            assertNull(ReflectionTestUtils.getField(service, "evaluationMemoizer"));
            assertNull(ReflectionTestUtils.getField(service, "neighborhoodExecutor"));
        } finally {
            service.destroy();
        }
    }
}
