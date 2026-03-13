package graspfs.rcl.rf.controller;

import graspfs.rcl.rf.producer.KafkaSolutionsProducer;
import graspfs.rcl.rf.service.RelieFAsyncService;
import graspfs.rcl.rf.service.RelieFService;
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
@RequestMapping("/rf")
@RequiredArgsConstructor
public class RelieFController {

    private static final Logger logger = LoggerFactory.getLogger(RelieFController.class);

    private final KafkaSolutionsProducer reliefProducer;
    private final RelieFService relieFService;
    private final RelieFAsyncService relieFAsyncService;

    private static volatile boolean isFirstTime = true;

    @PostMapping
    public ResponseEntity<Map<String, String>> processRelieF(
        @RequestParam("maxGenerations") int maxGenerations,
        @RequestParam("rclCutoff") int rclCutoff,
        @RequestParam("sampleSize") int sampleSize,
        @RequestParam("datasetTrainingName") String trainingFileName,
        @RequestParam("datasetTestingName") String testingFileName,
        @RequestParam(value = "classifier", defaultValue = "J48") String classifierName,
        @RequestParam(value = "neighborhoodStrategy", required = false) String neighborhoodStrategy,
        @RequestParam(value = "localSearches", required = false) String localSearches
    ) {
        String requestId = "RF-" + UUID.randomUUID();
        logger.info(
            "Received RF requestId={} train={} test={} classifier={} maxGenerations={} rclCutoff={} sampleSize={} neighborhood={} localSearches={}",
            requestId, trainingFileName, testingFileName, classifierName, maxGenerations, rclCutoff, sampleSize,
            neighborhoodStrategy, localSearches
        );

        relieFAsyncService.processAsync(
            maxGenerations, rclCutoff, sampleSize,
            trainingFileName, testingFileName, classifierName, neighborhoodStrategy, localSearches,
            reliefProducer, relieFService, isFirstTime, requestId
        );

        isFirstTime = false;

        return ResponseEntity.status(HttpStatus.ACCEPTED)
                .body(Map.of("message", "Processamento assincrono iniciado.", "requestId", requestId));
    }
}
