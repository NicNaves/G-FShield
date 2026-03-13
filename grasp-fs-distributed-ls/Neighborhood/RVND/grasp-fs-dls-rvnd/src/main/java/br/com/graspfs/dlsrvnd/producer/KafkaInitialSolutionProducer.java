package br.com.graspfs.dlsrvnd.producer;

import br.com.graspfs.dlsrvnd.dto.DataSolution;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;

import java.util.Optional;

@Service
@Slf4j
@RequiredArgsConstructor
public class KafkaInitialSolutionProducer {

    private static final String TOPIC = "INITIAL_SOLUTION_TOPIC";
    private final KafkaTemplate<String, DataSolution> kafkaTemplate;

    public void send(DataSolution data) {
        kafkaTemplate.send(TOPIC, buildKey(data), data).addCallback(
            success -> {
                var record = Optional.ofNullable(success)
                                     .map(s -> s.getProducerRecord().value())
                                     .orElse(null);
                log.info("✅ Mensagem enviada com sucesso para [{}]: {}", TOPIC, record);
            },
            failure -> log.error("❌ Falha ao enviar mensagem para [{}]: {}", TOPIC, failure.getMessage())
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
