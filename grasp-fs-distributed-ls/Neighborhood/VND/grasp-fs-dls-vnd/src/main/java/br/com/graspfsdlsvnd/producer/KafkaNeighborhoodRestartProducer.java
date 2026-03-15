package br.com.graspfsdlsvnd.producer;

import br.com.graspfsdlsvnd.dto.DataSolution;
import lombok.extern.slf4j.Slf4j;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;

@Service
@Slf4j
public class KafkaNeighborhoodRestartProducer {

    private final String topic;
    private final Logger logg = LoggerFactory.getLogger(KafkaNeighborhoodRestartProducer.class);
    private final KafkaTemplate<String, DataSolution> kafkaTemplate;

    public KafkaNeighborhoodRestartProducer(KafkaTemplate<String, DataSolution> kafkaTemplate) {
        this.topic = "NEIGHBORHOOD_RESTART_TOPIC";
        this.kafkaTemplate = kafkaTemplate;
    }

    public void send(DataSolution data) {
        kafkaTemplate.send(topic, buildKey(data), data).addCallback(
                success -> {
                    assert success != null;
                    logg.info("Neighborhood restart message sent {}", success.getProducerRecord().value());
                },
                failure -> logg.info("Neighborhood restart failure {}", failure.getMessage())
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
