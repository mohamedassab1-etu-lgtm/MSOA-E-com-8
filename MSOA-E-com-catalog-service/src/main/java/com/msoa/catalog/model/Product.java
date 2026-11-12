package com.msoa.catalog.model;

public record Product(
        Long id,
        String name,
        String category,
        double price,
        String image,
        String description
) {
}
