package br.com.graspfs.rcl.gr.controller;

import br.com.graspfs.rcl.gr.producer.KafkaSolutionsProducer;
import br.com.graspfs.rcl.gr.service.GainRationAsyncService;
import br.com.graspfs.rcl.gr.service.GainRationService;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/gr")
@RequiredArgsConstructor
public class GainRationController {

    private static final Logger logger = LoggerFactory.getLogger(GainRationController.class);

    private final KafkaSolutionsProducer gainRationProducer;
    private final GainRationService gainRationService;
    private final GainRationAsyncService gainRationAsyncService;

    private boolean isFirstTime = true;

    @PostMapping
    public ResponseEntity<Map<String, String>> processGainRation(
        @RequestParam("maxGenerations") int maxGenerations,
        @RequestParam("rclCutoff") int rclCutoff,
        @RequestParam("sampleSize") int sampleSize,
        @RequestParam("datasetTrainingName") String trainingFileName,
        @RequestParam("datasetTestingName") String testingFileName,
        @RequestParam(value = "classifier", defaultValue = "J48") String classifierName
    ) {
        gainRationAsyncService.processAsync(
            maxGenerations, rclCutoff, sampleSize,
            trainingFileName, testingFileName, classifierName,
            gainRationProducer, gainRationService, isFirstTime
        );

        return ResponseEntity.status(HttpStatus.ACCEPTED)
                .body(Map.of("message", "Processamento assíncrono iniciado."));
    }
}
