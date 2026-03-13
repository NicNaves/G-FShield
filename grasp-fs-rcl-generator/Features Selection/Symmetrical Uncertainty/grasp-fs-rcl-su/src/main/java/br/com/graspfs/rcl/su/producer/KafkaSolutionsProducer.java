package br.com.graspfs.rcl.su.producer;

import br.com.graspfs.rcl.su.dto.DataSolution;
import lombok.extern.slf4j.Slf4j;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;

@Service
@Slf4j
public class KafkaSolutionsProducer {

    private static final Logger logger = LoggerFactory.getLogger(KafkaSolutionsProducer.class);
    private static final String TOPIC = "INITIAL_SOLUTION_TOPIC";

    private final KafkaTemplate<String, DataSolution> kafkaTemplate;

    public KafkaSolutionsProducer(KafkaTemplate<String, DataSolution> kafkaTemplate) {
        this.kafkaTemplate = kafkaTemplate;
    }

    /**
     * Envia uma instância de DataSolution para o tópico Kafka.
     * 
     * @param data a solução a ser enviada
     */
    public void send(DataSolution data) {
        kafkaTemplate.send(TOPIC, buildKey(data), data).addCallback(
            success -> {
                if (success != null) {
                    logger.info("✅ Mensagem enviada para o tópico {}: {}", TOPIC, success.getProducerRecord().value());
                }
            },
            failure -> logger.error("❌ Falha ao enviar mensagem para o tópico {}: {}", TOPIC, failure.getMessage())
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
