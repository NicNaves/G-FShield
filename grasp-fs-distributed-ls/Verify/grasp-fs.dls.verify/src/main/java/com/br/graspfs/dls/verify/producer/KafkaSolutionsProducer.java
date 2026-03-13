package com.br.graspfs.dls.verify.producer;

import com.br.graspfs.dls.verify.dto.DataSolution;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;
import org.springframework.util.concurrent.ListenableFutureCallback;

@Service
@Slf4j
public class KafkaSolutionsProducer {

    private static final String TOPIC = "BEST_SOLUTION_TOPIC";
    private final KafkaTemplate<String, DataSolution> kafkaTemplate;

    public KafkaSolutionsProducer(KafkaTemplate<String, DataSolution> kafkaTemplate) {
        this.kafkaTemplate = kafkaTemplate;
    }

    public void send(DataSolution data) {
        log.info(
                "verify publishing best solution seedId={} rcl={} localSearch={} neighborhood={} f1={} features={} topic={}",
                data.getSeedId(),
                data.getRclAlgorithm(),
                data.getLocalSearch(),
                data.getNeighborhood(),
                data.getF1Score(),
                data.getSolutionFeatures() != null ? data.getSolutionFeatures().size() : 0,
                TOPIC
        );

        kafkaTemplate.send(TOPIC, buildKey(data), data).addCallback(new ListenableFutureCallback<>() {
            @Override
            public void onSuccess(org.springframework.kafka.support.SendResult<String, DataSolution> result) {
                log.info(
                        "verify published best solution seedId={} partition={} offset={} topic={}",
                        data.getSeedId(),
                        result.getRecordMetadata().partition(),
                        result.getRecordMetadata().offset(),
                        TOPIC
                );
            }

            @Override
            public void onFailure(Throwable ex) {
                log.error(
                        "verify failed to publish best solution seedId={} topic={} message={}",
                        data.getSeedId(),
                        TOPIC,
                        ex.getMessage(),
                        ex
                );
            }
        });
    }

    private String buildKey(DataSolution data) {
        if (data.getSeedId() != null) {
            return data.getSeedId().toString();
        }
        return String.join("|",
                String.valueOf(data.getClassfier()),
                String.valueOf(data.getTrainingFileName()),
                String.valueOf(data.getTestingFileName()));
    }
}
