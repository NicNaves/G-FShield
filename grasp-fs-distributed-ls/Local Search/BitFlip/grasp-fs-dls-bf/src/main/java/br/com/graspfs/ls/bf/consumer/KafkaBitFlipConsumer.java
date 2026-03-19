package br.com.graspfs.ls.bf.consumer;

import br.com.graspfs.ls.bf.dto.DataSolution;
import br.com.graspfs.ls.bf.service.BitFlipService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
@Slf4j
public class KafkaBitFlipConsumer {

    private static final String TOPIC = "BIT_FLIP_TOPIC";
    private static final String SEARCH_NAME = "BIT_FLIP";

    private final BitFlipService bitFlipService;

    @KafkaListener(topics = TOPIC, groupId = "myGroup", containerFactory = "jsonKafkaListenerContainer")
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
            // The service owns the neighborhood logic; the consumer only marks the transport boundary.
            bitFlipService.doBitFlip(record);
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
            throw new RuntimeException("Erro ao processar BitFlip", ex);
        }
    }
}
