package com.msoa.catalog.event;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import org.junit.jupiter.api.Test;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.SendResult;

class CatalogEventPublisherTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @SuppressWarnings("unchecked")
    private final KafkaTemplate<String, String> kafkaTemplate = org.mockito.Mockito.mock(KafkaTemplate.class);

    @Test
    void publishesProductViewedEventAsJsonWithProductIdKey() throws Exception {
        when(kafkaTemplate.send(eq("catalog-events"), eq("42"), anyString()))
                .thenReturn(CompletableFuture.completedFuture(null));

        new CatalogEventPublisher(kafkaTemplate, objectMapper, "catalog-events", true)
                .publishProductViewed(42L);

        org.mockito.ArgumentCaptor<String> valueCaptor = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(kafkaTemplate).send(eq("catalog-events"), eq("42"), valueCaptor.capture());
        JsonNode event = objectMapper.readTree(valueCaptor.getValue());

        Set<String> eventFields = new HashSet<>();
        Iterator<String> names = event.fieldNames();
        names.forEachRemaining(eventFields::add);
        assertThat(eventFields)
                .containsExactlyInAnyOrder("eventId", "type", "source", "timestamp", "data");
        assertThat(event.get("eventId").asText()).isNotBlank();
        assertThat(event.get("type").asText()).isEqualTo("ProductViewed");
        assertThat(event.get("source").asText()).isEqualTo("catalog");
        assertThat(event.get("timestamp").asText()).endsWith("Z");
        assertThat(Instant.parse(event.get("timestamp").asText())).isNotNull();
        Set<String> dataFields = new HashSet<>();
        event.get("data").fieldNames().forEachRemaining(dataFields::add);
        assertThat(dataFields).containsExactly("productId");
        assertThat(event.get("data").get("productId").asLong()).isEqualTo(42L);
    }
}
