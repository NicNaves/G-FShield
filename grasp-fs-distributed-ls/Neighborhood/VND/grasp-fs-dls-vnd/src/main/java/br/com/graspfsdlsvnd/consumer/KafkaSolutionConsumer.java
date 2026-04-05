package br.com.graspfsdlsvnd.consumer;

import br.com.graspfsdlsvnd.dto.DataSolution;
import br.com.graspfsdlsvnd.service.VndService;
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

    private final VndService vndService;
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
                && !"VND".equalsIgnoreCase(incoming.getNeighborhood())) {
            log.info("Strategy {} ignored by the VND cycle.", incoming.getNeighborhood());
            return;
        }

        int iterationNeighborhood = incoming.getIterationNeighborhood() != null
                ? incoming.getIterationNeighborhood()
                : 0;
        int dispatchBudget = vndService.resolveDispatchBudget(incoming);
        boolean allowContinuation = iterationNeighborhood < dispatchBudget;

        if (iterationNeighborhood <= dispatchBudget) {
            try {
                DataSolution finalBest = bestSolutions.compute(incoming.getSeedId(), (seedId, currentBest) -> {
                    DataSolution baseline = currentBest;
                    if (baseline == null) {
                        log.info("First solution stored. Starting the VND cycle.");
                        baseline = incoming;
                    } else {
                        log.info("Comparing the new solution against the current best one.");
                    }

                    DataSolution updatedBest = vndService.callNextService(baseline, incoming, allowContinuation);
                    log.info(
                            "Current best solution (seedId={}): F1 = {}, Features = {}",
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
                                "VND execution finished seedId={} dispatchBudget={} finalBestF1={} features={}",
                                incoming.getSeedId(),
                                dispatchBudget,
                                finalBest.getF1Score(),
                                finalBest.getSolutionFeatures()
                        );
                    }
                }

            } catch (IllegalArgumentException ex) {
                log.error("Error while processing the received solution: {}", ex.getMessage(), ex);
                throw ex;
            }
        } else {
            bestSolutions.remove(incoming.getSeedId());
            log.warn(
                    "Maximum VND dispatch budget ({}) reached for seedId={} at step={}. Ignoring solution.",
                    dispatchBudget,
                    incoming.getSeedId(),
                    iterationNeighborhood
            );
        }
    }
}
