package br.com.graspfsdlsvnd.consumer;

import br.com.graspfsdlsvnd.dto.DataSolution;
import br.com.graspfsdlsvnd.enuns.LocalSearch;
import br.com.graspfsdlsvnd.service.VndService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
@Slf4j
public class KafkaInitialSolutionConsumer {

    private final VndService vndService;

    @KafkaListener(
        topics = {"INITIAL_SOLUTION_TOPIC", "NEIGHBORHOOD_RESTART_TOPIC"},
        containerFactory = "jsonKafkaListenerContainer"
    )
    public void consume(ConsumerRecord<String, DataSolution> record) {
        DataSolution data = record.value();
        String topic = record.topic();

        if (data == null) {
            log.warn("📭 Mensagem nula recebida no tópico {}.", topic);
            return;
        }

        if (data.getNeighborhood() != null
                && !data.getNeighborhood().isBlank()
                && !"VND".equalsIgnoreCase(data.getNeighborhood())) {
            log.info("⏭ Estratégia {} ignorada pelo consumidor VND.", data.getNeighborhood());
            return;
        }

        log.info("📥 Recebida mensagem de bootstrap VND (topic={}, seedId={}, features={})",
                 topic, data.getSeedId(), data.getSolutionFeatures());

        try {
            vndService.doVnd(data, null);
        } catch (Exception ex) {
            log.error("❌ Erro ao processar solução inicial (seedId={}): {}", 
                      data.getSeedId(), ex.getMessage(), ex);
        }
    }
}
