package br.com.graspfs.dlsrvnd.service;

import br.com.graspfs.dlsrvnd.dto.DataSolution;
import br.com.graspfs.dlsrvnd.enuns.LocalSearch;
import br.com.graspfs.dlsrvnd.producer.KafkaBitFlipProducer;
import br.com.graspfs.dlsrvnd.producer.KafkaInitialSolutionProducer;
import br.com.graspfs.dlsrvnd.producer.KafkaIwssProducer;
import br.com.graspfs.dlsrvnd.producer.KafkaIwssrProducer;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Random;
import java.util.concurrent.atomic.AtomicInteger;

@Component
@RequiredArgsConstructor
@Slf4j
public class RvndService {

    private final KafkaBitFlipProducer bitFlipProducer;
    private final KafkaIwssProducer kafkaIwssProducer;
    private final KafkaIwssrProducer kafkaIwssrProducer;
    private final KafkaInitialSolutionProducer kafkaInitialSolutionProducer;

    private final Random random = new Random();
    private final AtomicInteger iteration = new AtomicInteger(1);

    public void doRvnd(DataSolution data) {
        data.setNeighborhood("RVND");
        data.setIterationNeighborhood(iteration.getAndIncrement());

        List<LocalSearch> enabledSearches = resolveEnabledLocalSearches(data);
        LocalSearch selected = enabledSearches.get(random.nextInt(enabledSearches.size()));
        data.setLocalSearch(selected);

        log.info(
                "rvnd dispatch seedId={} iterationNeighborhood={} selectedSearch={} enabledSearches={} currentBestF1={}",
                data.getSeedId(),
                data.getIterationNeighborhood(),
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
