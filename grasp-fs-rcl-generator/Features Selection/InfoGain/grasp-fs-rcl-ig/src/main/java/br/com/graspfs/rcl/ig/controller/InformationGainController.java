package br.com.graspfs.rcl.ig.controller;

import br.com.graspfs.rcl.ig.producer.KafkaSolutionsProducer;
import br.com.graspfs.rcl.ig.service.InformationGainAsyncService;
import br.com.graspfs.rcl.ig.service.InformationGainService;
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
        @RequestParam(value = "classifier", defaultValue = "J48") String classifierName,
        @RequestParam(value = "useTrainingCache", defaultValue = "false") boolean useTrainingCache,
        @RequestParam(value = "neighborhoodStrategy", required = false) String neighborhoodStrategy,
        @RequestParam(value = "localSearches", required = false) String localSearches,
        @RequestParam(value = "neighborhoodMaxIterations", required = false) Integer neighborhoodMaxIterations,
        @RequestParam(value = "bitFlipMaxIterations", required = false) Integer bitFlipMaxIterations,
        @RequestParam(value = "iwssMaxIterations", required = false) Integer iwssMaxIterations,
        @RequestParam(value = "iwssrMaxIterations", required = false) Integer iwssrMaxIterations
    ) {
        String requestId = "IG-" + UUID.randomUUID();
        logger.info(
            "Received IG requestId={} train={} test={} classifier={} useTrainingCache={} maxGenerations={} rclCutoff={} sampleSize={} neighborhood={} localSearches={}",
            requestId, trainingFileName, testingFileName, classifierName, useTrainingCache, maxGenerations, rclCutoff,
            sampleSize, neighborhoodStrategy, localSearches
        );

        informationGainAsyncService.processAsync(
            maxGenerations, rclCutoff, sampleSize,
            trainingFileName, testingFileName, classifierName, useTrainingCache, neighborhoodStrategy, localSearches,
            neighborhoodMaxIterations, bitFlipMaxIterations, iwssMaxIterations, iwssrMaxIterations,
            informationGainProducer, informationGainService, isFirstTime, requestId
        );

        isFirstTime = false;

        return ResponseEntity.status(HttpStatus.ACCEPTED)
                .body(Map.of("message", "Processamento assincrono iniciado.", "requestId", requestId));
    }
}
