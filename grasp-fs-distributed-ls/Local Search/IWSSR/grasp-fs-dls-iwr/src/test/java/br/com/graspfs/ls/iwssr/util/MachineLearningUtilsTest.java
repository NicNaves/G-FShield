package br.com.graspfs.ls.iwssr.util;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotSame;

import java.io.StringReader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.Executors;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import weka.core.Instances;

class MachineLearningUtilsTest {

    @Test
    void selectsOneBasedFeaturesInBulkAndKeepsClassLast() throws Exception {
        Instances source = new Instances(new StringReader(
                "@relation sample\n"
                + "@attribute first numeric\n"
                + "@attribute second numeric\n"
                + "@attribute third numeric\n"
                + "@attribute class {0,1}\n"
                + "@data\n1,2,3,0\n4,5,6,1\n"));
        source.setClassIndex(source.numAttributes() - 1);

        Instances selected = MachineLearningUtils.selecionaFeatures(
                source, new ArrayList<>(List.of(3, 1, 3)));

        assertEquals(3, selected.numAttributes());
        assertEquals("first", selected.attribute(0).name());
        assertEquals("third", selected.attribute(1).name());
        assertEquals("class", selected.attribute(2).name());
        assertEquals(1.0, selected.instance(0).value(0));
        assertEquals(3.0, selected.instance(0).value(1));
        assertEquals(0.0, selected.instance(0).classValue());
        assertEquals(4, source.numAttributes(), "the cached source must remain unchanged");
    }
    @Test
    void concurrentCachedLoadsReturnDetachedDatasets(@TempDir Path temporary) throws Exception {
        Path dataset = temporary.resolve("sample.arff");
        Files.writeString(dataset,
                "@relation sample\n"
                + "@attribute first numeric\n"
                + "@attribute second numeric\n"
                + "@attribute class {0,1}\n"
                + "@data\n1,2,0\n3,4,1\n");
        var executor = Executors.newFixedThreadPool(8);
        try {
            var futures = new ArrayList<java.util.concurrent.Future<Instances>>();
            for (int index = 0; index < 32; index++) {
                futures.add(executor.submit(() -> MachineLearningUtils.lerDataset(dataset, true)));
            }
            Instances first = futures.get(0).get();
            for (var future : futures) {
                Instances loaded = future.get();
                assertEquals(3, loaded.numAttributes());
                if (loaded != first) {
                    assertNotSame(first, loaded);
                }
            }
            first.deleteAttributeAt(0);
            assertEquals(3, MachineLearningUtils.lerDataset(dataset, true).numAttributes());
        } finally {
            executor.shutdownNow();
        }
    }
}
