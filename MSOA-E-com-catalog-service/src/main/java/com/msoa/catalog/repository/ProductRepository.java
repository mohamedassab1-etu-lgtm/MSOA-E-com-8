package com.msoa.catalog.repository;

import com.msoa.catalog.model.Product;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class ProductRepository {

    private static final String SELECT_COLUMNS = "SELECT id, name, category, price, image, description FROM products ";

    private final JdbcTemplate jdbcTemplate;

    public ProductRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public List<Product> findAll() {
        return jdbcTemplate.query(
                SELECT_COLUMNS + "ORDER BY id",
                (resultSet, rowNumber) -> new Product(
                        resultSet.getLong("id"),
                        resultSet.getString("name"),
                        resultSet.getString("category"),
                        resultSet.getDouble("price"),
                        resultSet.getString("image"),
                        resultSet.getString("description")
                )
        );
    }

    public Optional<Product> findById(long id) {
        return jdbcTemplate.query(
                SELECT_COLUMNS + "WHERE id = ?",
                (resultSet, rowNumber) -> new Product(
                        resultSet.getLong("id"),
                        resultSet.getString("name"),
                        resultSet.getString("category"),
                        resultSet.getDouble("price"),
                        resultSet.getString("image"),
                        resultSet.getString("description")
                ),
                id
        ).stream().findFirst();
    }
}
