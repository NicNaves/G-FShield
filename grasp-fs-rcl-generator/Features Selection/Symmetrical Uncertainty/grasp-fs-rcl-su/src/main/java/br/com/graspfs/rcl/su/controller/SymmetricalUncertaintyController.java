package br.com.graspfs.rcl.su.controller;

import br.com.graspfs.rcl.su.service.SymmetricalUncertaintyAsyncService;
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
@RequestMapping("/su")
@RequiredArgsConstructor
public class SymmetricalUncertaintyController {

    private static final Logger logger = LoggerFactory.getLogger(SymmetricalUncertaintyController.class);

    private static volatile boolean isFirstTime = true;
    private final SymmetricalUncertaintyAsyncService symmetricalUncertaintyAsyncService;

    @PostMapping
    public ResponseEntity<Map<String, String>> processSymmetricalUncertainty(
        @RequestParam("maxGenerations") int maxGenerations,
        @RequestParam("rclCutoff") int rclCutoff,
        @RequestParam("sampleSize") int sampleSize,
        @RequestParam("datasetTrainingName") String trainingFileName,
        @RequestParam("datasetTestingName") String testingFileName,
        @RequestParam(value = "classifier", defaultValue = "J48") String classifierName,
        @RequestParam(value = "neighborhoodStrategy", required = false) String neighborhoodStrategy,
        @RequestParam(value = "localSearches", required = false) String localSearches
    ) {
        String requestId = "SU-" + UUID.randomUUID();
        logger.info(
            "Received SU requestId={} train={} test={} classifier={} maxGenerations={} rclCutoff={} sampleSize={} neighborhood={} localSearches={}",
            requestId, trainingFileName, testingFileName, classifierName, maxGenerations, rclCutoff, sampleSize,
            neighborhoodStrategy, localSearches
        );

        symmetricalUncertaintyAsyncService.processAsync(
            maxGenerations, rclCutoff, sampleSize,
            trainingFileName, testingFileName, classifierName, neighborhoodStrategy, localSearches,
            isFirstTime, requestId
        );

        isFirstTime = false;

        return ResponseEntity.status(HttpStatus.ACCEPTED)
                .body(Map.of("message", "Processamento assincrono iniciado.", "requestId", requestId));
    }
}
