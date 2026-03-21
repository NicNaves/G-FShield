package br.com.graspfsdlsvnd.service;

import br.com.graspfsdlsvnd.dto.DataSolution;
import br.com.graspfsdlsvnd.enuns.LocalSearch;
import br.com.graspfsdlsvnd.producer.KafkaBitFlipProducer;
import br.com.graspfsdlsvnd.producer.KafkaNeighborhoodRestartProducer;
import br.com.graspfsdlsvnd.producer.KafkaIwssProducer;
import br.com.graspfsdlsvnd.producer.KafkaIwssrProducer;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

@Component
@RequiredArgsConstructor
@Slf4j
public class VndService {

    @Value("${vnd.max.iterations:10}")
    private int defaultMaxIterations;

    private final KafkaBitFlipProducer bitFlipProducer;
    private final KafkaIwssProducer kafkaIwssProducer;
    private final KafkaIwssrProducer kafkaIwssrProducer;
    private final KafkaNeighborhoodRestartProducer kafkaNeighborhoodRestartProducer;
    private final ConcurrentMap<UUID, Float> cycleBaselineScores = new ConcurrentHashMap<>();

    public void doVnd(DataSolution data, LocalSearch localSearch) {
        List<LocalSearch> sequence = resolveEnabledLocalSearches(data);
        LocalSearch effectiveLocalSearch = localSearch != null && sequence.contains(localSearch)
                ? localSearch
                : sequence.get(0);
        int dispatchBudget = resolveDispatchBudget(data, sequence);
        initializeCycleBaseline(data, sequence, effectiveLocalSearch);

        data.setNeighborhood("VND");
        int currentIteration = data.getIterationNeighborhood() != null ? data.getIterationNeighborhood() : 0;
        int nextIteration = currentIteration + 1;
        data.setIterationNeighborhood(nextIteration);

        log.info(
                "vnd dispatch seedId={} dispatchStep={}/{} selectedSearch={} availableSearches={} currentBestF1={}",
                data.getSeedId(),
                nextIteration,
                dispatchBudget,
                effectiveLocalSearch,
                sequence,
                data.getF1Score()
        );

        switch (effectiveLocalSearch) {
            case BIT_FLIP -> bitFlipProducer.send(data);
            case IWSS -> kafkaIwssProducer.send(data);
            case IWSSR -> kafkaIwssrProducer.send(data);
            default -> throw new IllegalStateException("Invalid VND local search: " + effectiveLocalSearch);
        }
    }

    public DataSolution callNextService(DataSolution bestSolution, DataSolution incoming, boolean allowContinuation) {
        List<LocalSearch> sequence = resolveEnabledLocalSearches(incoming);
        int dispatchBudget = resolveDispatchBudget(incoming, sequence);
        int currentStep = incoming.getIterationNeighborhood() != null ? incoming.getIterationNeighborhood() : 0;
        boolean improved = scoreOf(incoming) > scoreOf(bestSolution);
        DataSolution updatedBest = improved ? incoming : bestSolution;
        float cycleBaseline = resolveCycleBaseline(incoming, bestSolution, sequence);
        boolean cycleImproved = scoreOf(updatedBest) > cycleBaseline;
        boolean lastSearchInCycle = isLastSearchInCycle(sequence, incoming.getLocalSearch());

        log.info(
                "vnd result seedId={} incomingSearch={} incomingF1={} bestF1={} improved={} cycleImproved={} dispatchStep={}/{} availableSearches={}",
                incoming.getSeedId(),
                incoming.getLocalSearch(),
                scoreOf(incoming),
                scoreOf(bestSolution),
                improved,
                cycleImproved,
                currentStep,
                dispatchBudget,
                sequence
        );

        if (!lastSearchInCycle) {
            LocalSearch nextLocalSearch = nextLocalSearch(sequence, incoming.getLocalSearch());
            log.info(
                    "vnd continuing seedId={} currentSearch={} nextSearch={} dispatchStep={}/{} sequenceSize={} cycleImproved={}",
                    incoming.getSeedId(),
                    incoming.getLocalSearch(),
                    nextLocalSearch,
                    currentStep,
                    dispatchBudget,
                    sequence.size(),
                    cycleImproved
            );
            doVnd(updatedBest, nextLocalSearch);
            return updatedBest;
        }

        clearCycleBaseline(incoming);

        if (cycleImproved) {
            if (allowContinuation) {
                log.info(
                        "vnd cycle improved seedId={} cycleBaselineF1={} finalBestF1={} restartingCycle=true remainingDispatches={}",
                        incoming.getSeedId(),
                        cycleBaseline,
                        scoreOf(updatedBest),
                        Math.max(dispatchBudget - currentStep, 0)
                );
                kafkaNeighborhoodRestartProducer.send(updatedBest);
            } else {
                log.info(
                        "vnd cycle improved seedId={} cycleBaselineF1={} finalBestF1={} restartingCycle=false reason=dispatch-budget-exhausted",
                        incoming.getSeedId(),
                        cycleBaseline,
                        scoreOf(updatedBest)
                );
            }
            return updatedBest;
        }

        log.info(
                "vnd cycle completed seedId={} lastSearch={} dispatchStep={}/{} finalBestF1={} cycleBaselineF1={}",
                incoming.getSeedId(),
                incoming.getLocalSearch(),
                currentStep,
                dispatchBudget,
                scoreOf(updatedBest),
                cycleBaseline
        );

        return updatedBest;
    }

    private float scoreOf(DataSolution data) {
        return data.getF1Score() != null ? data.getF1Score() : 0.0F;
    }

    private void initializeCycleBaseline(DataSolution data, List<LocalSearch> sequence, LocalSearch effectiveLocalSearch) {
        if (data.getSeedId() == null || sequence.isEmpty() || effectiveLocalSearch != sequence.get(0)) {
            return;
        }

        cycleBaselineScores.put(data.getSeedId(), scoreOf(data));
    }

    private float resolveCycleBaseline(DataSolution incoming, DataSolution bestSolution, List<LocalSearch> sequence) {
        if (incoming.getSeedId() == null) {
            return scoreOf(bestSolution);
        }

        return cycleBaselineScores.computeIfAbsent(
                incoming.getSeedId(),
                ignored -> isFirstSearchInCycle(sequence, incoming.getLocalSearch()) ? scoreOf(bestSolution) : scoreOf(bestSolution)
        );
    }

    private void clearCycleBaseline(DataSolution data) {
        if (data.getSeedId() != null) {
            cycleBaselineScores.remove(data.getSeedId());
        }
    }

    private boolean isFirstSearchInCycle(List<LocalSearch> sequence, LocalSearch search) {
        return !sequence.isEmpty() && search == sequence.get(0);
    }

    private boolean isLastSearchInCycle(List<LocalSearch> sequence, LocalSearch search) {
        return !sequence.isEmpty() && search == sequence.get(sequence.size() - 1);
    }

    public List<LocalSearch> resolveEnabledLocalSearches(DataSolution data) {
        List<LocalSearch> resolved = new ArrayList<>();

        if (data.getEnabledLocalSearches() != null) {
            for (String configured : data.getEnabledLocalSearches()) {
                if (configured == null || configured.isBlank()) {
                    continue;
                }

                try {
                    LocalSearch parsed = LocalSearch.valueOf(configured.trim().toUpperCase());
                    if (!resolved.contains(parsed)) {
                        resolved.add(parsed);
                    }
                } catch (IllegalArgumentException ex) {
                    log.warn("vnd ignored invalid local-search configuration={}", configured);
                }
            }
        }

        if (resolved.isEmpty()) {
            resolved.add(LocalSearch.BIT_FLIP);
            resolved.add(LocalSearch.IWSS);
            resolved.add(LocalSearch.IWSSR);
        }

        return resolved;
    }

    public int resolveDispatchBudget(DataSolution data) {
        return resolveDispatchBudget(data, resolveEnabledLocalSearches(data));
    }

    private int resolveDispatchBudget(DataSolution data, List<LocalSearch> sequence) {
        int configuredCycles = data.getNeighborhoodMaxIterations() != null && data.getNeighborhoodMaxIterations() > 0
                ? data.getNeighborhoodMaxIterations()
                : defaultMaxIterations;
        int searchesPerCycle = Math.max(sequence.size(), 1);
        return Math.max(configuredCycles * searchesPerCycle, searchesPerCycle);
    }

    private LocalSearch nextLocalSearch(List<LocalSearch> sequence, LocalSearch currentLocalSearch) {
        if (currentLocalSearch == null || !sequence.contains(currentLocalSearch)) {
            return sequence.get(0);
        }

        int currentIndex = sequence.indexOf(currentLocalSearch);
        int nextIndex = (currentIndex + 1) % sequence.size();
        return sequence.get(nextIndex);
    }
}
