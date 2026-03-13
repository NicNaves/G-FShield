package br.com.graspfs.ls.bf.producer;

import br.com.graspfs.ls.bf.dto.DataSolution;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
@Slf4j
public class KafkaSolutionsProducer {

    private static final String TOPIC = "SOLUTIONS_TOPIC";
    private static final String PROGRESS_TOPIC = "LOCAL_SEARCH_PROGRESS_TOPIC";
    private final KafkaTemplate<String, DataSolution> kafkaTemplate;

    public void send(DataSolution data) {
        sendToTopic(TOPIC, data);
    }

    public void sendProgress(DataSolution data) {
        sendToTopic(PROGRESS_TOPIC, data);
    }

    private void sendToTopic(String topic, DataSolution data) {
        kafkaTemplate.send(topic, buildKey(data), data).addCallback(
            success -> {
                if (success != null) {
                    log.debug("Message sent to topic [{}] with key {}", topic, success.getProducerRecord().key());
                }
            },
            failure -> log.error("❌ Falha ao enviar mensagem para [{}]: {}", topic, failure.getMessage(), failure)
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
