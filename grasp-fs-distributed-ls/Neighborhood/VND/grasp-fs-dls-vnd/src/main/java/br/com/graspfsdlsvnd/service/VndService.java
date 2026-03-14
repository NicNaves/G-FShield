package br.com.graspfsdlsvnd.service;

import br.com.graspfsdlsvnd.dto.DataSolution;
import br.com.graspfsdlsvnd.enuns.LocalSearch;
import br.com.graspfsdlsvnd.producer.KafkaBitFlipProducer;
import br.com.graspfsdlsvnd.producer.KafkaInitialSolutionProducer;
import br.com.graspfsdlsvnd.producer.KafkaIwssProducer;
import br.com.graspfsdlsvnd.producer.KafkaIwssrProducer;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

@Component
@RequiredArgsConstructor
@Slf4j
public class VndService {

    private final KafkaBitFlipProducer bitFlipProducer;
    private final KafkaIwssProducer kafkaIwssProducer;
    private final KafkaIwssrProducer kafkaIwssrProducer;
    private final KafkaInitialSolutionProducer kafkaInitialSolutionProducer;

    public void doVnd(DataSolution data, LocalSearch localSearch) {
        List<LocalSearch> sequence = resolveEnabledLocalSearches(data);
        LocalSearch effectiveLocalSearch = localSearch != null && sequence.contains(localSearch)
                ? localSearch
                : sequence.get(0);

        data.setNeighborhood("VND");
        int currentIteration = data.getIterationNeighborhood() != null ? data.getIterationNeighborhood() : 0;
        data.setIterationNeighborhood(currentIteration + 1);

        log.info(
                "vnd dispatch seedId={} iterationNeighborhood={} selectedSearch={} availableSearches={} currentBestF1={}",
                data.getSeedId(),
                data.getIterationNeighborhood(),
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

    public DataSolution callNextService(DataSolution bestSolution, DataSolution incoming) {
        List<LocalSearch> sequence = resolveEnabledLocalSearches(incoming);

        log.info(
                "vnd result seedId={} incomingSearch={} incomingF1={} bestF1={} availableSearches={}",
                incoming.getSeedId(),
                incoming.getLocalSearch(),
                scoreOf(incoming),
                scoreOf(bestSolution),
                sequence
        );

        if (scoreOf(incoming) > scoreOf(bestSolution)) {
            log.info(
                    "vnd improvement seedId={} previousBestF1={} newBestF1={} restartingCycle=true",
                    incoming.getSeedId(),
                    scoreOf(bestSolution),
                    scoreOf(incoming)
            );
            kafkaInitialSolutionProducer.send(incoming);
            return incoming;
        }

        LocalSearch nextLocalSearch = nextLocalSearch(sequence, incoming.getLocalSearch());
        log.info(
                "vnd continuing seedId={} currentSearch={} nextSearch={} sequenceSize={}",
                incoming.getSeedId(),
                incoming.getLocalSearch(),
                nextLocalSearch,
                sequence.size()
        );
        doVnd(incoming, nextLocalSearch);

        return bestSolution;
    }

    private float scoreOf(DataSolution data) {
        return data.getF1Score() != null ? data.getF1Score() : 0.0F;
    }

    private List<LocalSearch> resolveEnabledLocalSearches(DataSolution data) {
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

    private LocalSearch nextLocalSearch(List<LocalSearch> sequence, LocalSearch currentLocalSearch) {
        if (currentLocalSearch == null || !sequence.contains(currentLocalSearch)) {
            return sequence.get(0);
        }

        int currentIndex = sequence.indexOf(currentLocalSearch);
        int nextIndex = (currentIndex + 1) % sequence.size();
        return sequence.get(nextIndex);
    }
}
