package com.msoa.catalog.controller;

import com.msoa.catalog.event.CatalogEventPublisher;
import com.msoa.catalog.exception.ProductNotFoundException;
import com.msoa.catalog.model.Product;
import com.msoa.catalog.repository.ProductRepository;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ProductController {

    private final ProductRepository productRepository;
    private final CatalogEventPublisher catalogEventPublisher;

    public ProductController(ProductRepository productRepository, CatalogEventPublisher catalogEventPublisher) {
        this.productRepository = productRepository;
        this.catalogEventPublisher = catalogEventPublisher;
    }

    @GetMapping("/products")
    public List<Product> findAll() {
        return productRepository.findAll();
    }

    @GetMapping("/products/{id}")
    public Product findById(@PathVariable long id) {
        Product product = productRepository.findById(id)
                .orElseThrow(() -> new ProductNotFoundException(id));
        catalogEventPublisher.publishProductViewed(product.id());
        return product;
    }
}
