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
        String key = buildKey(data);
        log.debug(
                "dls publishing snapshot search={} topic={} seedId={} key={} status={} iteration={} neighborhoodIteration={}",
                data.getLocalSearchName(),
                destinationTopic,
                data.getSeedId(),
                key,
                data.getStatus(),
                data.getIterationLocalSearch(),
                data.getIterationNeighborhood()
        );

        kafkaTemplate.send(destinationTopic, key, data).addCallback(
                success -> {
                    if (success != null) {
                        log.debug(
                                "dls published snapshot search={} topic={} seedId={} partition={} offset={}",
                                data.getLocalSearchName(),
                                destinationTopic,
                                data.getSeedId(),
                                success.getRecordMetadata().partition(),
                                success.getRecordMetadata().offset()
                        );
                    }
                },
                failure -> log.error(
                        "dls failed to publish snapshot search={} topic={} seedId={} message={}",
                        data.getLocalSearchName(),
                        destinationTopic,
                        data.getSeedId(),
                        failure.getMessage(),
                        failure
                )
        );
    }

    private String buildKey(DataSolution data) {
        // The seed key keeps one optimization trajectory grouped together in Kafka.
        if (data.getSeedId() != null) {
            return data.getSeedId().toString();
        }
        return String.join("|",
                String.valueOf(data.getClassfier()),
                String.valueOf(data.getTrainingFileName()),
                String.valueOf(data.getTestingFileName()));
    }
}
