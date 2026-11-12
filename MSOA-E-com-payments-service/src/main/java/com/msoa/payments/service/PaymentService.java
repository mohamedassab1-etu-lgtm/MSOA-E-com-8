package com.msoa.payments.service;

import com.msoa.payments.model.Payment;
import com.msoa.payments.repository.PaymentRepository;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@ApplicationScoped
public class PaymentService {

    @Inject
    private PaymentRepository paymentRepository;

    public List<Payment> getAllPayments() {
        return paymentRepository.findAll();
    }

    public Optional<Payment> getPaymentByOrderId(String orderId) {
        return paymentRepository.findByOrderId(orderId);
    }

    // Méthode adaptée pour être compatible avec PaymentResource (reçoit un objet Payment)
    public Payment createPayment(Payment payment) {
        Optional<Payment> existing = paymentRepository.findByOrderId(payment.getOrderId());
        if (existing.isPresent()) {
            return existing.get();
        }

        // Utiliser getId() et setId()
        if (payment.getId() == null || payment.getId().isEmpty()) {
            String paymentId = "pay-" + UUID.randomUUID().toString().substring(0, 8);
            payment.setId(paymentId);
        }

        if (payment.getStatus() == null || payment.getStatus().isEmpty()) {
            payment.setStatus("SUCCESS");
        }

        if (payment.getCreatedAt() == null || payment.getCreatedAt().isEmpty()) {
            payment.setCreatedAt(java.time.Instant.now().toString());
        }

        return paymentRepository.save(payment);
    }

    // Ancienne méthode conservée si vous l'utilisez ailleurs dans votre projet
    public Payment processPayment(String orderId, double amount, String method) {
        Optional<Payment> existing = paymentRepository.findByOrderId(orderId);
        if (existing.isPresent()) {
            return existing.get();
        }

        String paymentId = "pay-" + UUID.randomUUID().toString().substring(0, 8);
        Payment payment = new Payment(paymentId, orderId, amount, method, "SUCCESS");
    
        return paymentRepository.save(payment);
    }

    public void markAsFailed(String id) {
        paymentRepository.updateStatus(id, "FAILED");
    }
}