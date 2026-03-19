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
        String key = buildKey(data);
        log.debug(
                "dls publishing snapshot search={} topic={} seedId={} key={} status={} iteration={} neighborhoodIteration={}",
                data.getLocalSearchName(),
                topic,
                data.getSeedId(),
                key,
                data.getStatus(),
                data.getIterationLocalSearch(),
                data.getIterationNeighborhood()
        );

        kafkaTemplate.send(topic, key, data).addCallback(
                success -> {
                    if (success != null) {
                        log.debug(
                                "dls published snapshot search={} topic={} seedId={} partition={} offset={}",
                                data.getLocalSearchName(),
                                topic,
                                data.getSeedId(),
                                success.getRecordMetadata().partition(),
                                success.getRecordMetadata().offset()
                        );
                    }
                },
                failure -> log.error(
                        "dls failed to publish snapshot search={} topic={} seedId={} message={}",
                        data.getLocalSearchName(),
                        topic,
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
