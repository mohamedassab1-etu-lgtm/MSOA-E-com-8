package com.msoa.catalog.event;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.SendResult;
import org.springframework.stereotype.Component;

@Component
public class CatalogEventPublisher {

    private static final Logger LOGGER = LoggerFactory.getLogger(CatalogEventPublisher.class);

    private final KafkaTemplate<String, String> kafkaTemplate;
    private final ObjectMapper objectMapper;
    private final String topic;
    private final boolean enabled;

    public CatalogEventPublisher(
            KafkaTemplate<String, String> kafkaTemplate,
            ObjectMapper objectMapper,
            @Value("${catalog.kafka.topic}") String topic,
            @Value("${catalog.kafka.enabled:true}") boolean enabled
    ) {
        this.kafkaTemplate = kafkaTemplate;
        this.objectMapper = objectMapper;
        this.topic = topic;
        this.enabled = enabled;
    }

    public void publishProductViewed(long productId) {
        if (!enabled) {
            return;
        }

        ProductViewedEvent event = new ProductViewedEvent(
                UUID.randomUUID().toString(),
                "ProductViewed",
                "catalog",
                Instant.now().toString(),
                new ProductViewedEvent.Data(productId)
        );

        try {
            String value = objectMapper.writeValueAsString(event);
            CompletableFuture<SendResult<String, String>> send = kafkaTemplate.send(
                    topic,
                    Long.toString(productId),
                    value
            );
            send.whenComplete((result, error) -> {
                if (error != null) {
                    LOGGER.warn(
                            "Échec de publication de l'événement ProductViewed pour le produit {}",
                            productId,
                            error
                    );
                }
            });
        } catch (JsonProcessingException | RuntimeException error) {
            LOGGER.warn(
                    "Échec de publication de l'événement ProductViewed pour le produit {}",
                    productId,
                    error
            );
        }
    }
}
