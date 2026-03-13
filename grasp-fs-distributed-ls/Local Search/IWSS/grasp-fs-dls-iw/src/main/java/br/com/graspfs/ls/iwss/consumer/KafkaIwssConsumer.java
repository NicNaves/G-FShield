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

    private final IwssService iwssService;

    @KafkaListener(topics = "IWSS_TOPIC", groupId = "myGroup", containerFactory = "jsonKafkaListenerContainer")
    public void consume(DataSolution record) {
        log.info("📥 [IWSS] Mensagem recebida: {}", record);

        try {
            iwssService.doIwss(record);
        } catch (IllegalArgumentException e) {
            log.error("⚠️ Erro de argumento inválido: {}", e.getMessage(), e);
            throw e;
        } catch (Exception e) {
            log.error("❌ Erro inesperado ao processar mensagem IWSS", e);
            throw new RuntimeException("Erro ao processar mensagem no IWSS", e);
        }
    }
}
