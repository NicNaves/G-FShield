package com.br.graspfs.dls.verify.service;

import com.br.graspfs.dls.verify.dto.DataSolution;
import com.br.graspfs.dls.verify.producer.KafkaSolutionsProducer;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

@Service
@RequiredArgsConstructor
@Slf4j
public class VerifyService {

    private final KafkaSolutionsProducer kafkaSolutionsProducer;
    private final ConcurrentMap<UUID, DataSolution> bestSolutions = new ConcurrentHashMap<>();

    public void doVerify(DataSolution data) {
        if (data == null || data.getSeedId() == null) {
            log.warn("verify ignored invalid solution because seedId is missing");
            return;
        }

        DataSolution previousBest = bestSolutions.get(data.getSeedId());
        float candidateScore = scoreOf(data);
        float previousScore = scoreOf(previousBest);

        log.info(
                "verify evaluating seedId={} candidateF1={} previousBestF1={} rcl={} localSearch={} neighborhood={} features={}",
                data.getSeedId(),
                candidateScore,
                previousScore,
                data.getRclAlgorithm(),
                data.getLocalSearch(),
                data.getNeighborhood(),
                data.getSolutionFeatures() != null ? data.getSolutionFeatures().size() : 0
        );

        DataSolution best = bestSolutions.compute(data.getSeedId(), (seedId, currentBest) -> {
            if (currentBest == null || candidateScore > scoreOf(currentBest)) {
                return data;
            }
            return currentBest;
        });

        if (best == data) {
            log.info(
                    "verify accepted new best seedId={} previousBestF1={} newBestF1={} gain={} rcl={} localSearch={} neighborhood={}",
                    data.getSeedId(),
                    previousScore,
                    candidateScore,
                    candidateScore - previousScore,
                    data.getRclAlgorithm(),
                    data.getLocalSearch(),
                    data.getNeighborhood()
            );
            kafkaSolutionsProducer.send(data);
            return;
        }

        log.info(
                "verify discarded candidate seedId={} candidateF1={} keptBestF1={} keptLocalSearch={}",
                data.getSeedId(),
                candidateScore,
                scoreOf(best),
                best != null ? best.getLocalSearch() : null
        );
    }

    private float scoreOf(DataSolution data) {
        return data != null && data.getF1Score() != null ? data.getF1Score() : 0.0F;
    }
}
