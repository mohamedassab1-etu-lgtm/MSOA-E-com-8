package com.msoa.analytics;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.clients.consumer.ConsumerRecords;
import org.apache.kafka.clients.consumer.KafkaConsumer;
import org.apache.kafka.common.errors.WakeupException;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.TreeMap;

public class AnalyticsConsumerApplication {
    private static final Logger LOGGER = LoggerFactory.getLogger(AnalyticsConsumerApplication.class);
    private static final List<String> TOPICS = List.of("catalog-events");
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();
    private static final String DEFAULT_GROUP_ID = "analytics-group-1";

    public static void main(String[] args) {
        String groupId = args.length > 0 ? args[0] : DEFAULT_GROUP_ID;
        Properties properties = new Properties();
        properties.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, "localhost:9092");
        properties.put(ConsumerConfig.GROUP_ID_CONFIG, groupId);
        properties.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class.getName());
        properties.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class.getName());
        properties.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");

        KafkaConsumer<String, String> consumer = new KafkaConsumer<>(properties);
        Runtime.getRuntime().addShutdownHook(new Thread(consumer::wakeup, "analytics-consumer-shutdown"));
        Map<Integer, Long> viewsByProduct = new TreeMap<>();
        long eventCount = 0;

        try (consumer) {
            consumer.subscribe(TOPICS);
            while (true) {
                ConsumerRecords<String, String> records = consumer.poll(Duration.ofMillis(1000));
                for (var record : records) {
                    try {
                        if (record.value() == null) {
                            LOGGER.warn("Message Kafka vide ignoré à l'offset {}", record.offset());
                            continue;
                        }

                        JsonNode event = OBJECT_MAPPER.readTree(record.value());
                        JsonNode productIdNode = event == null ? null : event.path("data").path("productId");
                        if (event == null
                                || !"ProductViewed".equals(event.path("type").asText())
                                || !productIdNode.isIntegralNumber()
                                || !productIdNode.canConvertToInt()) {
                            LOGGER.warn("Événement ignoré (format ou type invalide), offset {}", record.offset());
                            continue;
                        }

                        int productId = productIdNode.intValue();
                        eventCount++;
                        viewsByProduct.merge(productId, 1L, Long::sum);

                        System.out.printf("Événement reçu: %s%n", record.value());
                        System.out.printf(
                                "Statistiques: événements=%d, vuesParProduit=%s%n",
                                eventCount,
                                viewsByProduct
                        );
                    } catch (JsonProcessingException exception) {
                        LOGGER.warn("JSON invalide ignoré à l'offset {}", record.offset(), exception);
                    }
                }
            }
        } catch (WakeupException exception) {
            // Le wakeup déclenché par le ShutdownHook permet de sortir de poll().
        }
    }
}
