package com.br.graspfs.dls.verify.config;

import com.br.graspfs.dls.verify.dto.DataSolution;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.config.ConcurrentKafkaListenerContainerFactory;
import org.springframework.kafka.core.ConsumerFactory;
import org.springframework.kafka.core.DefaultKafkaConsumerFactory;
import org.springframework.kafka.listener.ContainerProperties;
import org.springframework.kafka.support.serializer.JsonDeserializer;

import java.util.HashMap;
import java.util.Map;

@Configuration
public class KafkaConsumerConfig {

    @Value("${spring.kafka.bootstrap-servers}")
    private String bootstrapserver;

    @Value("${spring.kafka.consumer.group-id:grasp-fs-dls-verify-group}")
    private String consumerGroupId;

    @Value("${spring.kafka.consumer.auto-offset-reset:earliest}")
    private String autoOffsetReset;

    @Value("${spring.kafka.consumer.max-poll-interval-ms:14400000}")
    private Integer maxPollIntervalMs;

    @Value("${spring.kafka.consumer.max-poll-records:1}")
    private Integer maxPollRecords;

    @Value("${kafka.listener.concurrency:1}")
    private Integer listenerConcurrency;


    @Bean
    public ConsumerFactory<String, DataSolution> dataSolutionConsumerFactory() {
        JsonDeserializer<DataSolution> deserializer = new JsonDeserializer<>(DataSolution.class, false);
        deserializer.addTrustedPackages("*");
        deserializer.setRemoveTypeHeaders(true); // <--- IGNORA O __TypeId__

        Map<String, Object> props = new HashMap<>();
        props.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapserver);
        props.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);
        props.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, JsonDeserializer.class);
        props.put(ConsumerConfig.GROUP_ID_CONFIG, consumerGroupId);
        props.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, autoOffsetReset);
        props.put(ConsumerConfig.MAX_POLL_INTERVAL_MS_CONFIG, maxPollIntervalMs);
        props.put(ConsumerConfig.MAX_POLL_RECORDS_CONFIG, maxPollRecords);

        return new DefaultKafkaConsumerFactory<>(props, new StringDeserializer(), deserializer);
    }

    @Bean(name = "bestSolutionListenerContainerFactory")
    public ConcurrentKafkaListenerContainerFactory<String, DataSolution> bestSolutionListenerContainerFactory() {
        ConcurrentKafkaListenerContainerFactory<String, DataSolution> factory =
                new ConcurrentKafkaListenerContainerFactory<>();
        factory.setConsumerFactory(dataSolutionConsumerFactory());
        factory.setConcurrency(listenerConcurrency);
        factory.getContainerProperties().setAckMode(ContainerProperties.AckMode.RECORD);
        factory.getContainerProperties().setMissingTopicsFatal(false);
        return factory;
    }

    @Bean(name = "solutionListenerContainerFactory") 
    public ConcurrentKafkaListenerContainerFactory<String, DataSolution> solutionListenerContainerFactory() {
        ConcurrentKafkaListenerContainerFactory<String, DataSolution> factory =
                new ConcurrentKafkaListenerContainerFactory<>();
        factory.setConsumerFactory(dataSolutionConsumerFactory());
        factory.setConcurrency(listenerConcurrency);
        factory.getContainerProperties().setAckMode(ContainerProperties.AckMode.RECORD);
        factory.getContainerProperties().setMissingTopicsFatal(false);
        return factory;
    }

}
