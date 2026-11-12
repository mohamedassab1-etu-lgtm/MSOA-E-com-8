package com.msoa.payments.repository;

import com.msoa.payments.model.Payment;
import jakarta.annotation.PostConstruct;
import jakarta.enterprise.context.ApplicationScoped;

import java.sql.*;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

@ApplicationScoped
public class PaymentRepository {

    @Inject
    @ConfigProperty(name = "db.url", defaultValue = "jdbc:sqlite:data/payments.db")
    private String dbUrl;

    @PostConstruct
    public void init() {
        try {
            Class.forName("org.sqlite.JDBC");
        } catch (ClassNotFoundException e) {
            throw new RuntimeException("SQLite JDBC Driver not found", e);
        }
    }

    private Connection getConnection() throws SQLException {
        return DriverManager.getConnection(dbUrl);
    }

    public List<Payment> findAll() {
        List<Payment> payments = new ArrayList<>();
        String sql = "SELECT id, order_id, amount, method, status, created_at FROM payments";

        try (Connection conn = getConnection();
             Statement stmt = conn.createStatement();
             ResultSet rs = stmt.executeQuery(sql)) {

            while (rs.next()) {
                payments.add(new Payment(
                        rs.getString("id"),
                        rs.getString("order_id"),
                        rs.getDouble("amount"),
                        rs.getString("method"),
                        rs.getString("status")
                ));
                payments.get(payments.size() - 1).setCreatedAt(rs.getString("created_at"));
            }
        } catch (SQLException e) {
            throw new RuntimeException("Error fetching payments", e);
        }
        return payments;
    }

    public Optional<Payment> findByOrderId(String orderId) {
        String sql = "SELECT id, order_id, amount, method, status, created_at FROM payments WHERE order_id = ?";

        try (Connection conn = getConnection();
             PreparedStatement pstmt = conn.prepareStatement(sql)) {

            pstmt.setString(1, orderId);
            try (ResultSet rs = pstmt.executeQuery()) {
                if (rs.next()) {
                    Payment payment = new Payment(
                            rs.getString("id"),
                            rs.getString("order_id"),
                            rs.getDouble("amount"),
                            rs.getString("method"),
                            rs.getString("status")
                    );
                    payment.setCreatedAt(rs.getString("created_at"));
                    return Optional.of(payment);
                }
            }
        } catch (SQLException e) {
            throw new RuntimeException("Error fetching payment for order " + orderId, e);
        }
        return Optional.empty();
    }

    public void updateStatus(String id, String status) {
        String sql = "UPDATE payments SET status = ? WHERE id = ?";
        try (Connection conn = getConnection();
             PreparedStatement pstmt = conn.prepareStatement(sql)) {
            pstmt.setString(1, status);
            pstmt.setString(2, id);
            pstmt.executeUpdate();
        } catch (SQLException e) {
            throw new RuntimeException("Error updating payment status", e);
        }
    }

    public Payment save(Payment payment) {
        String sql = "INSERT INTO payments (id, order_id, amount, method, status, created_at) VALUES (?, ?, ?, ?, ?, ?)";

        try (Connection conn = getConnection();
             PreparedStatement pstmt = conn.prepareStatement(sql)) {

            pstmt.setString(1, payment.getId());
            pstmt.setString(2, payment.getOrderId());
            pstmt.setDouble(3, payment.getAmount());
            pstmt.setString(4, payment.getMethod());
            pstmt.setString(5, payment.getStatus());
            pstmt.setString(6, payment.getCreatedAt());

            pstmt.executeUpdate();
            return payment;

        } catch (SQLException e) {
            throw new RuntimeException("Error saving payment", e);
        }
    }
}