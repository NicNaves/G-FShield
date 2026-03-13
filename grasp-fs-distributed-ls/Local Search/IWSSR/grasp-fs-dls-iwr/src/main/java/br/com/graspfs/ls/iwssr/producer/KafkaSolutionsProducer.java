package br.com.graspfs.ls.iwssr.producer;

import br.com.graspfs.ls.iwssr.dto.DataSolution;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;

@Service
@Slf4j
public class KafkaSolutionsProducer {

    private final KafkaTemplate<String, DataSolution> kafkaTemplate;
    private final String topic;
    private final String progressTopic;

    public KafkaSolutionsProducer(KafkaTemplate<String, DataSolution> kafkaTemplate,
                                   @Value("${kafka.topics.solutions:SOLUTIONS_TOPIC}") String topic,
                                   @Value("${kafka.topics.progress:LOCAL_SEARCH_PROGRESS_TOPIC}") String progressTopic) {
        this.kafkaTemplate = kafkaTemplate;
        this.topic = topic;
        this.progressTopic = progressTopic;
    }

    public void send(DataSolution data) {
        sendToTopic(topic, data);
    }

    public void sendProgress(DataSolution data) {
        sendToTopic(progressTopic, data);
    }

    private void sendToTopic(String destinationTopic, DataSolution data) {
        kafkaTemplate.send(destinationTopic, buildKey(data), data).addCallback(
            success -> {
                if (success != null) {
                    log.debug("Message sent to topic [{}] with key {}", destinationTopic, success.getProducerRecord().key());
                }
            },
            failure -> log.error("❌ Falha ao enviar mensagem para [{}]: {}", destinationTopic, failure.getMessage(), failure)
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
