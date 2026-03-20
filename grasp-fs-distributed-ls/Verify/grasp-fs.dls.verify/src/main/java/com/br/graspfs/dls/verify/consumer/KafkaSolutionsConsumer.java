package com.br.graspfs.dls.verify.consumer;

import com.br.graspfs.dls.verify.dto.DataSolution;
import com.br.graspfs.dls.verify.service.VerifyService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
@Slf4j
public class KafkaSolutionsConsumer {

    private final VerifyService verifyService;

    @KafkaListener(
        topics = "SOLUTIONS_TOPIC",
        groupId = "${spring.kafka.consumer.group-id}",
        containerFactory = "solutionListenerContainerFactory"
    )
    public void consume(ConsumerRecord<String, DataSolution> record) {
        long start = System.currentTimeMillis();
        DataSolution data = record.value();

        if (data == null) {
            log.warn("verify received null message topic={} partition={} offset={}",
                    record.topic(), record.partition(), record.offset());
            return;
        }

        log.info(
                "verify received local-search result seedId={} rcl={} localSearch={} neighborhood={} f1={} features={} classifier={} topic={} partition={} offset={}",
                data.getSeedId(),
                data.getRclAlgorithm(),
                data.getLocalSearch(),
                data.getNeighborhood(),
                data.getF1Score(),
                data.getSolutionFeatures() != null ? data.getSolutionFeatures().size() : 0,
                data.getClassfier(),
                record.topic(),
                record.partition(),
                record.offset()
        );

        try {
            verifyService.doVerify(data);
            log.info(
                    "verify finished seedId={} localSearch={} elapsedMs={}",
                    data.getSeedId(),
                    data.getLocalSearch(),
                    System.currentTimeMillis() - start
            );
        } catch (IllegalArgumentException ex) {
            log.error(
                    "verify failed seedId={} localSearch={} message={}",
                    data.getSeedId(),
                    data.getLocalSearch(),
                    ex.getMessage(),
                    ex
            );
            throw ex;
        }
    }
}
