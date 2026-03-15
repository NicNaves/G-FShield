package br.com.graspfs.rcl.su.producer;

import br.com.graspfs.rcl.su.dto.DataSolution;
import lombok.extern.slf4j.Slf4j;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;

@Service
@Slf4j
public class KafkaSolutionsProducer {

    private static final Logger logger = LoggerFactory.getLogger(KafkaSolutionsProducer.class);
    private static final String TOPIC = "INITIAL_SOLUTION_TOPIC";

    private final KafkaTemplate<String, DataSolution> kafkaTemplate;

    public KafkaSolutionsProducer(KafkaTemplate<String, DataSolution> kafkaTemplate) {
        this.kafkaTemplate = kafkaTemplate;
    }

    public void send(DataSolution data) {
        logger.info(
                "rcl publishing initial solution seedId={} algorithm={} featureCount={} rclSize={} f1={} topic={}",
                data.getSeedId(),
                data.getRclAlgorithm(),
                data.getSolutionFeatures() != null ? data.getSolutionFeatures().size() : 0,
                data.getRclfeatures() != null ? data.getRclfeatures().size() : 0,
                data.getF1Score(),
                TOPIC
        );

        kafkaTemplate.send(TOPIC, buildKey(data), data).addCallback(
                success -> {
                    if (success != null) {
                        logger.info(
                                "rcl published initial solution seedId={} topic={} partition={} offset={}",
                                data.getSeedId(),
                                TOPIC,
                                success.getRecordMetadata().partition(),
                                success.getRecordMetadata().offset()
                        );
                    }
                },
                failure -> logger.error(
                        "rcl failed to publish initial solution seedId={} topic={} message={}",
                        data.getSeedId(),
                        TOPIC,
                        failure.getMessage()
                )
        );
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
