package com.br.graspfs.dls.verify.consumer;

import com.br.graspfs.dls.verify.dto.DataSolution;
import lombok.extern.slf4j.Slf4j;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.TimeUnit;

@Component
@Slf4j
public class KafkaBestSolutionConsumer {

    private final BlockingQueue<DataSolution> responseQueue = new ArrayBlockingQueue<>(1);

    @KafkaListener(
        topics = "BEST_SOLUTION_TOPIC",
        groupId = "myGroup",
        containerFactory = "bestSolutionListenerContainerFactory"
    )
    public void consume(ConsumerRecord<String, DataSolution> record) {
        DataSolution data = record.value();
        if (data == null) {
            log.warn("verify received null message from BEST_SOLUTION_TOPIC");
            return;
        }

        log.info(
                "verify confirmed best solution seedId={} rcl={} localSearch={} neighborhood={} f1={} features={} partition={} offset={}",
                data.getSeedId(),
                data.getRclAlgorithm(),
                data.getLocalSearch(),
                data.getNeighborhood(),
                data.getF1Score(),
                data.getSolutionFeatures() != null ? data.getSolutionFeatures().size() : 0,
                record.partition(),
                record.offset()
        );
        responseQueue.offer(data);
    }

    public DataSolution waitForBestSolution(int timeoutSeconds) throws InterruptedException {
        DataSolution result = responseQueue.poll(timeoutSeconds, TimeUnit.SECONDS);
        if (result == null) {
            log.warn("verify timeout waiting best solution timeoutSeconds={}", timeoutSeconds);
        }
        return result;
    }
}
