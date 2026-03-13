package br.com.graspfs.dlsrvnd.consumer;

import br.com.graspfs.dlsrvnd.dto.DataSolution;
import br.com.graspfs.dlsrvnd.service.RvndService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
@Slf4j
public class KafkaInitialSolutionConsumer {

    private final RvndService rvndService;

    @Value("${rvnd.iterations:10}")
    private int maxIterations;

    @KafkaListener(
        topics = "INITIAL_SOLUTION_TOPIC",
        groupId = "RVND",
        containerFactory = "jsonKafkaListenerContainer"
    )
    public void consume(ConsumerRecord<String, DataSolution> record) {
        DataSolution data = record.value();

        if (data == null) {
            log.warn("Null message received from INITIAL_SOLUTION_TOPIC.");
            return;
        }

        if (data.getNeighborhood() != null
                && !data.getNeighborhood().isBlank()
                && !"RVND".equalsIgnoreCase(data.getNeighborhood())) {
            log.info("Strategy {} ignored by the RVND consumer.", data.getNeighborhood());
            return;
        }

        log.info(
                "Message received: seedId={}, F1={}, Features={}",
                data.getSeedId(),
                data.getF1Score(),
                data.getSolutionFeatures()
        );

        int configuredMaxIterations = data.getNeighborhoodMaxIterations() != null
                && data.getNeighborhoodMaxIterations() > 0
                ? data.getNeighborhoodMaxIterations()
                : maxIterations;

        for (int i = 0; i < configuredMaxIterations; i++) {
            try {
                log.info("RVND iteration {}/{}", i + 1, configuredMaxIterations);
                rvndService.doRvnd(data);
            } catch (Exception ex) {
                log.error("Unexpected error during RVND iteration {}: {}", i + 1, ex.getMessage(), ex);
                throw ex;
            }
        }

        log.info("RVND finished for seedId={}", data.getSeedId());
    }
}
