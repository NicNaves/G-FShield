package br.com.graspfsdlsvnd.producer;

import br.com.graspfsdlsvnd.dto.DataSolution;
import lombok.extern.slf4j.Slf4j;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;

@Service
@Slf4j
public class KafkaInitialSolutionProducer {

    private final String topic;
    private final Logger logg = LoggerFactory.getLogger(KafkaInitialSolutionProducer.class);
    private final KafkaTemplate<String, DataSolution> kafkaTemplate;

    public KafkaInitialSolutionProducer(KafkaTemplate<String, DataSolution> kafkaTemplate){
        this.topic = "INITIAL_SOLUTION_TOPIC";
        this.kafkaTemplate = kafkaTemplate;
    }

    public void send(DataSolution data){
        kafkaTemplate.send(topic, buildKey(data), data).addCallback(
                sucess -> {
                    assert sucess != null;
                    logg.info("Mensage send sucess " + sucess.getProducerRecord().value());
                },
                failure -> logg.info("Mensage Failure " + failure.getMessage())
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
