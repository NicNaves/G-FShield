package br.com.graspfs.rcl.su.controller;
import br.com.graspfs.rcl.su.service.SymmetricalUncertaintyAsyncService;



import lombok.RequiredArgsConstructor;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/su")
@RequiredArgsConstructor
public class SymmetricalUncertaintyController {

    private boolean isFirstTime = true;
    private final SymmetricalUncertaintyAsyncService symmetricalUncertaintyAsyncService;
    // Remova o código anterior de leitura e looping

    @PostMapping
    public ResponseEntity<Map<String, String>> processSymmetricalUncertainty(
        @RequestParam("maxGenerations") int maxGenerations,
        @RequestParam("rclCutoff") int rclCutoff,
        @RequestParam("sampleSize") int sampleSize,
        @RequestParam("datasetTrainingName") String trainingFileName,
        @RequestParam("datasetTestingName") String testingFileName,
        @RequestParam(value = "classifier", defaultValue = "J48") String classifierName
    ) {
        symmetricalUncertaintyAsyncService.processAsync(
            maxGenerations, rclCutoff, sampleSize,
            trainingFileName, testingFileName, classifierName,
            isFirstTime
        );

        return ResponseEntity.status(HttpStatus.ACCEPTED)
                .body(Map.of("message", "Processamento assíncrono iniciado."));
    }
}