package br.com.graspfs.rcl.gr.controller;

import br.com.graspfs.rcl.gr.producer.KafkaSolutionsProducer;
import br.com.graspfs.rcl.gr.service.GainRationAsyncService;
import br.com.graspfs.rcl.gr.service.GainRationService;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/gr")
@RequiredArgsConstructor
public class GainRationController {

    private static final Logger logger = LoggerFactory.getLogger(GainRationController.class);

    private final KafkaSolutionsProducer gainRationProducer;
    private final GainRationService gainRationService;
    private final GainRationAsyncService gainRationAsyncService;

    private static volatile boolean isFirstTime = true;

    @PostMapping
    public ResponseEntity<Map<String, String>> processGainRation(
        @RequestParam("maxGenerations") int maxGenerations,
        @RequestParam("rclCutoff") int rclCutoff,
        @RequestParam("sampleSize") int sampleSize,
        @RequestParam("datasetTrainingName") String trainingFileName,
        @RequestParam("datasetTestingName") String testingFileName,
        @RequestParam(value = "classifier", defaultValue = "J48") String classifierName,
        @RequestParam(value = "useTrainingCache", defaultValue = "false") boolean useTrainingCache,
        @RequestParam(value = "neighborhoodStrategy", required = false) String neighborhoodStrategy,
        @RequestParam(value = "localSearches", required = false) String localSearches,
        @RequestParam(value = "neighborhoodMaxIterations", required = false) Integer neighborhoodMaxIterations,
        @RequestParam(value = "bitFlipMaxIterations", required = false) Integer bitFlipMaxIterations,
        @RequestParam(value = "iwssMaxIterations", required = false) Integer iwssMaxIterations,
        @RequestParam(value = "iwssrMaxIterations", required = false) Integer iwssrMaxIterations
    ) {
        String requestId = "GR-" + UUID.randomUUID();
        logger.info(
            "Received GR requestId={} train={} test={} classifier={} useTrainingCache={} maxGenerations={} rclCutoff={} sampleSize={} neighborhood={} localSearches={}",
            requestId, trainingFileName, testingFileName, classifierName, useTrainingCache, maxGenerations, rclCutoff,
            sampleSize, neighborhoodStrategy, localSearches
        );

        gainRationAsyncService.processAsync(
            maxGenerations, rclCutoff, sampleSize,
            trainingFileName, testingFileName, classifierName, useTrainingCache, neighborhoodStrategy, localSearches,
            neighborhoodMaxIterations, bitFlipMaxIterations, iwssMaxIterations, iwssrMaxIterations,
            gainRationProducer, gainRationService, isFirstTime, requestId
        );

        isFirstTime = false;

        return ResponseEntity.status(HttpStatus.ACCEPTED)
                .body(Map.of("message", "Processamento assincrono iniciado.", "requestId", requestId));
    }
}
