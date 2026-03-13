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

    private final BitFlipService bitFlipService;

    @KafkaListener(topics = "BIT_FLIP_TOPIC", groupId = "myGroup", containerFactory = "jsonKafkaListenerContainer")
    public void consume(DataSolution record) {
        log.info("📥 [BIT_FLIP_TOPIC] Mensagem recebida: {}", record);

        try {
            bitFlipService.doBitFlip(record);
        } catch (IllegalArgumentException ex) {
            throw ex; // pode-se logar antes de relançar se desejar rastreabilidade
        } catch (Exception e) {
            log.error("❌ Erro ao processar BitFlip para seedId={}", record.getSeedId(), e);
            throw new RuntimeException("Erro ao processar BitFlip", e);
        }
    }
}
