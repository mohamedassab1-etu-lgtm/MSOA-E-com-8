package com.msoa.catalog.exception;

public class ProductNotFoundException extends RuntimeException {

    public ProductNotFoundException(long id) {
        super("Product " + id + " not found");
    }
}
