package br.com.graspfs.dlsrvnd.consumer;

import br.com.graspfs.dlsrvnd.dto.DataSolution;
import br.com.graspfs.dlsrvnd.service.RvndService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

@Component
@RequiredArgsConstructor
@Slf4j
public class KafkaSolutionConsumer {

    private final RvndService rvndService;
    private final ConcurrentMap<UUID, DataSolution> bestSolutions = new ConcurrentHashMap<>();

    @KafkaListener(topics = "SOLUTIONS_TOPIC", containerFactory = "jsonKafkaListenerContainer")
    public void consume(ConsumerRecord<String, DataSolution> record) {
        DataSolution incoming = record.value();
        log.info("Message received from Kafka: {}", incoming);

        if (incoming == null || incoming.getSeedId() == null) {
            log.warn("Solution received without seedId. Ignoring.");
            return;
        }

        if (incoming.getNeighborhood() != null
                && !incoming.getNeighborhood().isBlank()
                && !"RVND".equalsIgnoreCase(incoming.getNeighborhood())) {
            log.info("Strategy {} ignored by the RVND cycle.", incoming.getNeighborhood());
            return;
        }

        int iterationNeighborhood = incoming.getIterationNeighborhood() != null
                ? incoming.getIterationNeighborhood()
                : 0;
        int maxIterations = rvndService.resolveMaxIterations(incoming);
        boolean allowContinuation = iterationNeighborhood < maxIterations;

        if (iterationNeighborhood <= maxIterations) {
            try {
                DataSolution finalBest = bestSolutions.compute(incoming.getSeedId(), (seedId, currentBest) -> {
                    DataSolution baseline = currentBest;
                    if (baseline == null) {
                        log.info("First solution stored. Starting the RVND cycle.");
                        baseline = incoming;
                    } else {
                        log.info("Comparing the new solution against the current best one.");
                    }

                    DataSolution updatedBest = rvndService.callNextService(baseline, incoming, allowContinuation);
                    log.info(
                            "Current RVND best solution (seedId={}): F1 = {}, Features = {}",
                            seedId,
                            updatedBest.getF1Score(),
                            updatedBest.getSolutionFeatures()
                    );
                    return updatedBest;
                });

                if (!allowContinuation) {
                    bestSolutions.remove(incoming.getSeedId());
                    if (finalBest != null) {
                        log.info(
                                "RVND execution finished seedId={} maxIterations={} finalBestF1={} features={}",
                                incoming.getSeedId(),
                                maxIterations,
                                finalBest.getF1Score(),
                                finalBest.getSolutionFeatures()
                        );
                    }
                }
            } catch (IllegalArgumentException ex) {
                log.error("Error while processing the received RVND solution: {}", ex.getMessage(), ex);
                throw ex;
            }
        } else {
            bestSolutions.remove(incoming.getSeedId());
            log.warn(
                    "Maximum RVND iteration budget ({}) reached for seedId={} at step={}. Ignoring solution.",
                    maxIterations,
                    incoming.getSeedId(),
                    iterationNeighborhood
            );
        }
    }
}
