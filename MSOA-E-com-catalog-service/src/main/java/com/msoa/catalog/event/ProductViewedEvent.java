package com.msoa.catalog.event;

public record ProductViewedEvent(
        String eventId,
        String type,
        String source,
        String timestamp,
        Data data
) {
    public record Data(long productId) {
    }
}
