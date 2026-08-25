package com.br.graspfs.dls.verify.service;

import com.br.graspfs.dls.verify.dto.DataSolution;
import com.br.graspfs.dls.verify.producer.KafkaSolutionsProducer;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.atomic.AtomicInteger;

@Service
@RequiredArgsConstructor
@Slf4j
public class VerifyService {

    private final KafkaSolutionsProducer kafkaSolutionsProducer;
    private final ConcurrentMap<String, DataSolution> bestSolutions = new ConcurrentHashMap<>();
    private final ConcurrentMap<String, AtomicInteger> acceptedImprovements = new ConcurrentHashMap<>();

    public void doVerify(DataSolution data) {
        if (data == null || data.getSeedId() == null) {
            log.warn("verify ignored invalid solution because seedId is missing");
            return;
        }

        if (deadlineReached(data)) {
            log.info("verify ignored solution runId={} seedId={} reason=deadline", data.getRunId(), data.getSeedId());
            return;
        }

        String runKey = data.getRunId() != null && !data.getRunId().isBlank()
                ? data.getRunId()
                : data.getSeedId().toString();
        AtomicInteger improvementCount = acceptedImprovements.computeIfAbsent(runKey, ignored -> new AtomicInteger());
        int maximumImprovements = environmentInteger("CAMPAIGN_MAX_ACCEPTED_IMPROVEMENTS", 500);
        if (improvementCount.get() >= maximumImprovements) {
            log.info("verify ignored solution runId={} reason=max_accepted_improvements count={}", runKey, improvementCount.get());
            return;
        }

        DataSolution previousBest = bestSolutions.get(runKey);
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

        DataSolution best = bestSolutions.compute(runKey, (ignored, currentBest) -> {
            if (isBetter(data, currentBest)) {
                return data;
            }
            return currentBest;
        });

        if (best == data) {
            int accepted = improvementCount.incrementAndGet();
            data.setStage("best_so_far");
            data.setTimestampUtc(Instant.now().toString());
            log.info(
                    "verify accepted new best runId={} seedId={} previousBestF1={} newBestF1={} gain={} acceptedImprovements={} rcl={} localSearch={} neighborhood={}",
                    runKey,
                    data.getSeedId(),
                    previousScore,
                    candidateScore,
                    candidateScore - previousScore,
                    accepted,
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

    private boolean isBetter(DataSolution candidate, DataSolution current) {
        if (current == null) {
            return true;
        }
        double tolerance = environmentDouble("CAMPAIGN_MINIMUM_IMPROVEMENT", 0.0001D);
        double delta = scoreOf(candidate) - scoreOf(current);
        if (delta >= tolerance) {
            return true;
        }
        if (Math.abs(delta) > tolerance) {
            return false;
        }
        int candidateSize = candidate.getSolutionFeatures() != null ? candidate.getSolutionFeatures().size() : Integer.MAX_VALUE;
        int currentSize = current.getSolutionFeatures() != null ? current.getSolutionFeatures().size() : Integer.MAX_VALUE;
        if (candidateSize != currentSize) {
            return candidateSize < currentSize;
        }
        long candidateTime = candidate.getRunnigTime() != null ? candidate.getRunnigTime() : Long.MAX_VALUE;
        long currentTime = current.getRunnigTime() != null ? current.getRunnigTime() : Long.MAX_VALUE;
        return candidateTime < currentTime;
    }

    private boolean deadlineReached(DataSolution data) {
        return data.getDeadlineEpochMs() != null
                && System.currentTimeMillis() >= data.getDeadlineEpochMs();
    }

    private int environmentInteger(String name, int fallback) {
        try {
            return Integer.parseInt(System.getenv().getOrDefault(name, Integer.toString(fallback)));
        } catch (NumberFormatException ignored) {
            return fallback;
        }
    }

    private double environmentDouble(String name, double fallback) {
        try {
            return Double.parseDouble(System.getenv().getOrDefault(name, Double.toString(fallback)));
        } catch (NumberFormatException ignored) {
            return fallback;
        }
    }
}
