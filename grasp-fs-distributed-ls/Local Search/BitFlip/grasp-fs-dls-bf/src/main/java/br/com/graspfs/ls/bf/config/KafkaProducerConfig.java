package br.com.graspfs.ls.bf.config;

import br.com.graspfs.ls.bf.dto.DataSolution;
import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.common.serialization.StringSerializer;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.core.DefaultKafkaProducerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.core.ProducerFactory;
import org.springframework.kafka.support.serializer.JsonSerializer;

import java.util.HashMap;
import java.util.Map;

@Configuration
public class KafkaProducerConfig {

    private static final int DEFAULT_BATCH_SIZE = 65_536;

    @Value("${spring.kafka.bootstrap-servers}")
    private String bootstrapserver;

    @Bean
    public ProducerFactory<String, DataSolution> kafkaProducerConfigFactory() {
        Map<String, Object> configProps = new HashMap<>();
        configProps.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapserver);
        configProps.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class.getName());
        configProps.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, JsonSerializer.class.getName());
        configProps.put(ProducerConfig.ACKS_CONFIG, "all");
        configProps.put(ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG, true);
        configProps.put(ProducerConfig.COMPRESSION_TYPE_CONFIG, "gzip");
        configProps.put(ProducerConfig.LINGER_MS_CONFIG, 5);
        configProps.put(ProducerConfig.BATCH_SIZE_CONFIG, DEFAULT_BATCH_SIZE);
        configProps.put(ProducerConfig.MAX_IN_FLIGHT_REQUESTS_PER_CONNECTION, 5);
        return new DefaultKafkaProducerFactory<>(configProps, new StringSerializer(), new JsonSerializer<>());
    }

    @Bean
    public KafkaTemplate<String, DataSolution> kafkaProducerTemplate() {
        return new KafkaTemplate<>(kafkaProducerConfigFactory());
    }

}
