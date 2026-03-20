package br.com.graspfs.ls.iwssr.consumer;

import br.com.graspfs.ls.iwssr.dto.DataSolution;
import br.com.graspfs.ls.iwssr.service.IwssrService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
@Slf4j
public class KafkaIwssrConsumer {

    private static final String TOPIC = "IWSSR_TOPIC";
    private static final String SEARCH_NAME = "IWSSR";

    private final IwssrService iwssrService;

    @KafkaListener(topics = TOPIC, groupId = "${spring.kafka.consumer.group-id}", containerFactory = "jsonKafkaListenerContainer")
    public void consume(ConsumerRecord<String, DataSolution> record) {
        DataSolution data = record.value();
        log.info(
                "dls message received search={} topic={} seedId={} iteration={} neighborhoodIteration={} status={}",
                SEARCH_NAME,
                TOPIC,
                data.getSeedId(),
                data.getIterationLocalSearch(),
                data.getIterationNeighborhood(),
                data.getStatus()
        );

        try {
            // The consumer isolates Kafka concerns so the service can focus on the search rules.
            iwssrService.doIwssr(data);
        } catch (IllegalArgumentException ex) {
            log.warn(
                    "dls invalid input search={} topic={} seedId={} message={}",
                    SEARCH_NAME,
                    TOPIC,
                    data.getSeedId(),
                    ex.getMessage()
            );
            throw ex;
        } catch (Exception ex) {
            log.error(
                    "dls processing failed search={} topic={} seedId={}",
                    SEARCH_NAME,
                    TOPIC,
                    data.getSeedId(),
                    ex
            );
            throw new RuntimeException("Erro ao processar IWSSR", ex);
        }
    }
}
