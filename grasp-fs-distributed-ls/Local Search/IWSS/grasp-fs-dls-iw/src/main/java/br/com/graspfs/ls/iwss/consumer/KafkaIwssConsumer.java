package br.com.graspfs.ls.iwss.consumer;

import br.com.graspfs.ls.iwss.dto.DataSolution;
import br.com.graspfs.ls.iwss.service.IwssService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
@Slf4j
public class KafkaIwssConsumer {

    private static final String TOPIC = "IWSS_TOPIC";
    private static final String SEARCH_NAME = "IWSS";

    private final IwssService iwssService;

    @KafkaListener(topics = TOPIC, groupId = "${spring.kafka.consumer.group-id}", containerFactory = "jsonKafkaListenerContainer")
    public void consume(DataSolution record) {
        log.info(
                "dls message received search={} topic={} seedId={} iteration={} neighborhoodIteration={} status={}",
                SEARCH_NAME,
                TOPIC,
                record.getSeedId(),
                record.getIterationLocalSearch(),
                record.getIterationNeighborhood(),
                record.getStatus()
        );

        try {
            // Kafka hands off the work item; the service updates the candidate solution.
            iwssService.doIwss(record);
        } catch (IllegalArgumentException ex) {
            log.warn(
                    "dls invalid input search={} topic={} seedId={} message={}",
                    SEARCH_NAME,
                    TOPIC,
                    record.getSeedId(),
                    ex.getMessage()
            );
            throw ex;
        } catch (Exception ex) {
            log.error(
                    "dls processing failed search={} topic={} seedId={}",
                    SEARCH_NAME,
                    TOPIC,
                    record.getSeedId(),
                    ex
            );
            throw new RuntimeException("Erro ao processar mensagem no IWSS", ex);
        }
    }
}
