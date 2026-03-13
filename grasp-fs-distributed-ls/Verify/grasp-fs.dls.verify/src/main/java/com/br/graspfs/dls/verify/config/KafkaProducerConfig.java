package com.br.graspfs.dls.verify.config;

import com.br.graspfs.dls.verify.dto.DataSolution;
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
    

    public ProducerFactory<String, DataSolution> kafkaProducerConfig(){
        Map<String, Object> properties = new HashMap<>();
        properties.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapserver);
        properties.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        properties.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, JsonSerializer.class);
        properties.put(ProducerConfig.ACKS_CONFIG, "all");
        properties.put(ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG, true);
        properties.put(ProducerConfig.COMPRESSION_TYPE_CONFIG, "gzip");
        properties.put(ProducerConfig.LINGER_MS_CONFIG, 5);
        properties.put(ProducerConfig.BATCH_SIZE_CONFIG, DEFAULT_BATCH_SIZE);
        properties.put(ProducerConfig.MAX_IN_FLIGHT_REQUESTS_PER_CONNECTION, 5);
        return new DefaultKafkaProducerFactory<>(properties);
    }
    @Bean
    public KafkaTemplate<String, DataSolution> dataSolutionKafkaTemplate(){
        return new KafkaTemplate<>(kafkaProducerConfig());
    }

}
