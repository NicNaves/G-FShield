package br.com.graspfs.ls.iwss.config;

import br.com.graspfs.ls.iwss.dto.DataSolution;
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

    @Value("${spring.kafka.consumer.group-id:grasp-fs-dls-iw-group}")
    private String consumerGroupId;

    @Value("${spring.kafka.consumer.auto-offset-reset:earliest}")
    private String autoOffsetReset;

    @Value("${spring.kafka.consumer.max-poll-interval-ms:1800000}")
    private Integer maxPollIntervalMs;

    @Value("${spring.kafka.consumer.max-poll-records:1}")
    private Integer maxPollRecords;

    @Value("${kafka.listener.concurrency:1}")
    private Integer listenerConcurrency;

    @Bean
    public ConsumerFactory<String, DataSolution> consumerConfig() {
        Map<String, Object> properties = new HashMap<>();
        JsonDeserializer<DataSolution> deserializer = new JsonDeserializer<>(DataSolution.class, false);
        deserializer.addTrustedPackages("*");

        properties.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapserver);
        properties.put(ConsumerConfig.GROUP_ID_CONFIG, consumerGroupId);
        properties.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, autoOffsetReset);
        properties.put(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, false);
        properties.put(ConsumerConfig.MAX_POLL_INTERVAL_MS_CONFIG, maxPollIntervalMs);
        properties.put(ConsumerConfig.MAX_POLL_RECORDS_CONFIG, maxPollRecords);
        properties.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);
        properties.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, JsonDeserializer.class);
        return new DefaultKafkaConsumerFactory<>(properties, new StringDeserializer(), deserializer);
    }

    @Bean
    public ConcurrentKafkaListenerContainerFactory<String, DataSolution> jsonKafkaListenerContainer(){
        ConcurrentKafkaListenerContainerFactory<String, DataSolution> containerFactory =
                new ConcurrentKafkaListenerContainerFactory<>();
        containerFactory.setConsumerFactory(consumerConfig());
        containerFactory.setConcurrency(listenerConcurrency);
        containerFactory.getContainerProperties().setAckMode(ContainerProperties.AckMode.RECORD);
        containerFactory.getContainerProperties().setMissingTopicsFatal(false);
        return containerFactory;
    }

}
