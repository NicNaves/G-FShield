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

    /**
     * Executa a lógica RVND com seleção aleatória da vizinhança.
     */
    public void doRvnd(DataSolution data) {
        data.setNeighborhood("RVND");
        data.setIterationNeighborhood(iteration.getAndIncrement());

        LocalSearch selected = pickRandomNeighborhood(data);
        data.setLocalSearch(selected);

        log.info("🔀 RVND escolheu vizinhança: {}", selected);

        switch (selected) {
            case BIT_FLIP -> bitFlipProducer.send(data);
            case IWSS -> kafkaIwssProducer.send(data);
            case IWSSR -> kafkaIwssrProducer.send(data);
        }
    }

    /**
     * Seleciona aleatoriamente uma vizinhança local.
     */
    private LocalSearch pickRandomNeighborhood(DataSolution data) {
        List<LocalSearch> enabled = resolveEnabledLocalSearches(data);
        return enabled.get(random.nextInt(enabled.size()));
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
                    log.warn("⚠️ Busca local inválida ignorada no RVND: {}", configured);
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
