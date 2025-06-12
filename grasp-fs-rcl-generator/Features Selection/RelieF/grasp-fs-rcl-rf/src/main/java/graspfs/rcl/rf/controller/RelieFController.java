package graspfs.rcl.rf.controller;

import graspfs.rcl.rf.producer.KafkaSolutionsProducer;
import graspfs.rcl.rf.service.RelieFAsyncService;
import graspfs.rcl.rf.service.RelieFService;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

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
        @RequestParam(value = "classifier", defaultValue = "J48") String classifierName
    ) {
        relieFAsyncService.processAsync(
            maxGenerations, rclCutoff, sampleSize,
            trainingFileName, testingFileName, classifierName,
            reliefProducer, relieFService, isFirstTime
        );

        isFirstTime = false;

        return ResponseEntity.status(HttpStatus.ACCEPTED)
                .body(Map.of("message", "Processamento assíncrono iniciado."));
    }
}
