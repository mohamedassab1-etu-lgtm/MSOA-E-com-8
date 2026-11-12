package com.msoa.catalog.repository;

import static org.assertj.core.api.Assertions.assertThat;

import com.msoa.catalog.model.Product;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest
class ProductRepositoryTest {

    @Autowired
    private ProductRepository productRepository;

    @Test
    void readsProductsFromProvidedDatabase() {
        List<Product> products = productRepository.findAll();
        assertThat(products).hasSize(6);
        assertThat(products)
                .extracting(Product::id)
                .containsExactly(1L, 2L, 3L, 4L, 5L, 6L);

        Optional<Product> product = productRepository.findById(1);
        assertThat(product)
                .isPresent()
                .get()
                .satisfies(found -> {
                    assertThat(found.name()).isEqualTo("ThinkPad Laptop");
                    assertThat(found.price()).isEqualTo(8499.0);
                });

        assertThat(productRepository.findById(999)).isEmpty();
    }
}
