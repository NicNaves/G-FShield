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

    /**
     * Inicia o processo de VND com a vizinhança definida.
     */
    public void doVnd(DataSolution data, LocalSearch localSearch) {
        List<LocalSearch> sequence = resolveEnabledLocalSearches(data);
        LocalSearch effectiveLocalSearch = localSearch != null && sequence.contains(localSearch)
                ? localSearch
                : sequence.get(0);

        data.setNeighborhood("VND");
        int currentIteration = data.getIterationNeighborhood() != null ? data.getIterationNeighborhood() : 0;
        data.setIterationNeighborhood(currentIteration + 1);

        log.info("🔁 [{}] Enviando para {}", effectiveLocalSearch.getEnumIdentifier(), effectiveLocalSearch.name());

        switch (effectiveLocalSearch) {
            case BIT_FLIP -> bitFlipProducer.send(data);
            case IWSS -> kafkaIwssProducer.send(data);
            case IWSSR -> kafkaIwssrProducer.send(data);
            default -> throw new IllegalStateException("🚫 Estratégia de busca inválida: " + effectiveLocalSearch);
        }
    }

    /**
     * Define se a solução recebida deve reiniciar o VND ou seguir para próxima vizinhança.
     */
    public DataSolution callNextService(DataSolution bestSolution, DataSolution incoming) {
        log.info("📨 Solução recebida (F1: {}, Estratégia: {})", incoming.getF1Score(), incoming.getLocalSearch());
        List<LocalSearch> sequence = resolveEnabledLocalSearches(incoming);

        if (scoreOf(incoming) > scoreOf(bestSolution)) {
            log.info("✅ Nova melhor solução encontrada. Reiniciando ciclo VND.");
            kafkaInitialSolutionProducer.send(incoming);
            return incoming;
        }

        LocalSearch nextLocalSearch = nextLocalSearch(sequence, incoming.getLocalSearch());
        log.info("➡️ Próxima vizinhança: {}", nextLocalSearch);
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
                    log.warn("⚠️ Busca local inválida ignorada no VND: {}", configured);
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
