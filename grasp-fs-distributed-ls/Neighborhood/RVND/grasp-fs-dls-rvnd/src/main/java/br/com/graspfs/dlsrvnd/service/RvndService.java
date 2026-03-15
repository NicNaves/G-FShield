package br.com.graspfs.dlsrvnd.service;

import br.com.graspfs.dlsrvnd.dto.DataSolution;
import br.com.graspfs.dlsrvnd.enuns.LocalSearch;
import br.com.graspfs.dlsrvnd.producer.KafkaBitFlipProducer;
import br.com.graspfs.dlsrvnd.producer.KafkaNeighborhoodRestartProducer;
import br.com.graspfs.dlsrvnd.producer.KafkaIwssProducer;
import br.com.graspfs.dlsrvnd.producer.KafkaIwssrProducer;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Random;

@Component
@RequiredArgsConstructor
@Slf4j
public class RvndService {

    @Value("${rvnd.iterations:10}")
    private int defaultMaxIterations;

    private final KafkaBitFlipProducer bitFlipProducer;
    private final KafkaIwssProducer kafkaIwssProducer;
    private final KafkaIwssrProducer kafkaIwssrProducer;
    private final KafkaNeighborhoodRestartProducer kafkaNeighborhoodRestartProducer;

    private final Random random = new Random();

    public void doRvnd(DataSolution data) {
        doRvnd(data, null);
    }

    public void doRvnd(DataSolution data, LocalSearch preferredLocalSearch) {
        data.setNeighborhood("RVND");
        int maxIterations = resolveMaxIterations(data);
        int currentIteration = data.getIterationNeighborhood() != null ? data.getIterationNeighborhood() : 0;
        int nextIteration = currentIteration + 1;
        data.setIterationNeighborhood(nextIteration);

        List<LocalSearch> enabledSearches = resolveEnabledLocalSearches(data);
        LocalSearch selected = preferredLocalSearch != null && enabledSearches.contains(preferredLocalSearch)
                ? preferredLocalSearch
                : enabledSearches.get(random.nextInt(enabledSearches.size()));
        data.setLocalSearch(selected);

        log.info(
                "rvnd dispatch seedId={} iterationNeighborhood={}/{} selectedSearch={} enabledSearches={} currentBestF1={}",
                data.getSeedId(),
                nextIteration,
                maxIterations,
                selected,
                enabledSearches,
                data.getF1Score()
        );

        switch (selected) {
            case BIT_FLIP -> bitFlipProducer.send(data);
            case IWSS -> kafkaIwssProducer.send(data);
            case IWSSR -> kafkaIwssrProducer.send(data);
            default -> throw new IllegalStateException("Invalid RVND local search: " + selected);
        }
    }

    public DataSolution callNextService(DataSolution bestSolution, DataSolution incoming, boolean allowContinuation) {
        List<LocalSearch> enabledSearches = resolveEnabledLocalSearches(incoming);
        int maxIterations = resolveMaxIterations(incoming);
        int currentIteration = incoming.getIterationNeighborhood() != null ? incoming.getIterationNeighborhood() : 0;
        boolean improved = scoreOf(incoming) > scoreOf(bestSolution);
        DataSolution updatedBest = improved ? incoming : bestSolution;

        log.info(
                "rvnd result seedId={} incomingSearch={} incomingF1={} bestF1={} improved={} iteration={}/{} enabledSearches={}",
                incoming.getSeedId(),
                incoming.getLocalSearch(),
                scoreOf(incoming),
                scoreOf(bestSolution),
                improved,
                currentIteration,
                maxIterations,
                enabledSearches
        );

        if (improved) {
            if (allowContinuation) {
                log.info(
                        "rvnd improvement seedId={} previousBestF1={} newBestF1={} restartingCycle=true remainingIterations={}",
                        incoming.getSeedId(),
                        scoreOf(bestSolution),
                        scoreOf(incoming),
                        Math.max(maxIterations - currentIteration, 0)
                );
                kafkaNeighborhoodRestartProducer.send(incoming);
            } else {
                log.info(
                        "rvnd improvement seedId={} previousBestF1={} newBestF1={} restartingCycle=false reason=iteration-budget-exhausted",
                        incoming.getSeedId(),
                        scoreOf(bestSolution),
                        scoreOf(incoming)
                );
            }

            return updatedBest;
        }

        if (!allowContinuation) {
            log.info(
                    "rvnd cycle completed seedId={} lastSearch={} iteration={}/{} finalBestF1={}",
                    incoming.getSeedId(),
                    incoming.getLocalSearch(),
                    currentIteration,
                    maxIterations,
                    scoreOf(updatedBest)
            );
            return updatedBest;
        }

        LocalSearch nextSearch = enabledSearches.get(random.nextInt(enabledSearches.size()));
        log.info(
                "rvnd continuing seedId={} currentSearch={} nextSearch={} iteration={}/{}",
                incoming.getSeedId(),
                incoming.getLocalSearch(),
                nextSearch,
                currentIteration,
                maxIterations
        );
        doRvnd(updatedBest, nextSearch);

        return updatedBest;
    }

    public int resolveMaxIterations(DataSolution data) {
        int configuredIterations = data.getNeighborhoodMaxIterations() != null && data.getNeighborhoodMaxIterations() > 0
                ? data.getNeighborhoodMaxIterations()
                : defaultMaxIterations;
        return Math.max(configuredIterations, 1);
    }

    private float scoreOf(DataSolution data) {
        return data != null && data.getF1Score() != null ? data.getF1Score() : 0.0F;
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
                    log.warn("rvnd ignored invalid local-search configuration={}", configured);
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
}
