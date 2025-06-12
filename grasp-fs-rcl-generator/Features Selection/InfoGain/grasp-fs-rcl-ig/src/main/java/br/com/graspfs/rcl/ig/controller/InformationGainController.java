package br.com.graspfs.rcl.ig.controller;

import br.com.graspfs.rcl.ig.producer.KafkaSolutionsProducer;
import br.com.graspfs.rcl.ig.service.InformationGainAsyncService;
import br.com.graspfs.rcl.ig.service.InformationGainService;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/ig")
@RequiredArgsConstructor
public class InformationGainController {

    private static final Logger logger = LoggerFactory.getLogger(InformationGainController.class);

    private final KafkaSolutionsProducer informationGainProducer;
    private final InformationGainService informationGainService;
    private final InformationGainAsyncService informationGainAsyncService;

    private static volatile boolean isFirstTime = true;

    @PostMapping
    public ResponseEntity<Map<String, String>> processInfoGain(
        @RequestParam("maxGenerations") int maxGenerations,
        @RequestParam("rclCutoff") int rclCutoff,
        @RequestParam("sampleSize") int sampleSize,
        @RequestParam("datasetTrainingName") String trainingFileName,
        @RequestParam("datasetTestingName") String testingFileName,
        @RequestParam(value = "classifier", defaultValue = "J48") String classifierName
    ) {
        informationGainAsyncService.processAsync(
            maxGenerations, rclCutoff, sampleSize,
            trainingFileName, testingFileName, classifierName,
            informationGainProducer, informationGainService, isFirstTime
        );

        isFirstTime = false;

        return ResponseEntity.status(HttpStatus.ACCEPTED)
                .body(Map.of("message", "Processamento assíncrono iniciado."));
    }
}
