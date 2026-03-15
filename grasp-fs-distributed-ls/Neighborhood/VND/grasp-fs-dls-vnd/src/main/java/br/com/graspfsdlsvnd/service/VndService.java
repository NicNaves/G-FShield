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

    public void doVnd(DataSolution data, LocalSearch localSearch) {
        List<LocalSearch> sequence = resolveEnabledLocalSearches(data);
        LocalSearch effectiveLocalSearch = localSearch != null && sequence.contains(localSearch)
                ? localSearch
                : sequence.get(0);
        int dispatchBudget = resolveDispatchBudget(data, sequence);

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

        log.info(
                "vnd result seedId={} incomingSearch={} incomingF1={} bestF1={} improved={} dispatchStep={}/{} availableSearches={}",
                incoming.getSeedId(),
                incoming.getLocalSearch(),
                scoreOf(incoming),
                scoreOf(bestSolution),
                improved,
                currentStep,
                dispatchBudget,
                sequence
        );

        if (improved) {
            if (allowContinuation) {
                log.info(
                        "vnd improvement seedId={} previousBestF1={} newBestF1={} restartingCycle=true remainingDispatches={}",
                        incoming.getSeedId(),
                        scoreOf(bestSolution),
                        scoreOf(incoming),
                        Math.max(dispatchBudget - currentStep, 0)
                );
                kafkaNeighborhoodRestartProducer.send(incoming);
            } else {
                log.info(
                        "vnd improvement seedId={} previousBestF1={} newBestF1={} restartingCycle=false reason=dispatch-budget-exhausted",
                        incoming.getSeedId(),
                        scoreOf(bestSolution),
                        scoreOf(incoming)
                );
            }
            return updatedBest;
        }

        if (!allowContinuation) {
            log.info(
                    "vnd cycle completed seedId={} lastSearch={} dispatchStep={}/{} finalBestF1={}",
                    incoming.getSeedId(),
                    incoming.getLocalSearch(),
                    currentStep,
                    dispatchBudget,
                    scoreOf(updatedBest)
            );
            return updatedBest;
        }

        LocalSearch nextLocalSearch = nextLocalSearch(sequence, incoming.getLocalSearch());
        log.info(
                "vnd continuing seedId={} currentSearch={} nextSearch={} dispatchStep={}/{} sequenceSize={}",
                incoming.getSeedId(),
                incoming.getLocalSearch(),
                nextLocalSearch,
                currentStep,
                dispatchBudget,
                sequence.size()
        );
        doVnd(incoming, nextLocalSearch);

        return updatedBest;
    }

    private float scoreOf(DataSolution data) {
        return data.getF1Score() != null ? data.getF1Score() : 0.0F;
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
