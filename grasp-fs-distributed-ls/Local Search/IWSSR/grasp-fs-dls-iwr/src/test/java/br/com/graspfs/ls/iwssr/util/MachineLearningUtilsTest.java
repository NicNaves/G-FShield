package br.com.graspfs.ls.iwssr.util;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.io.StringReader;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
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
}
