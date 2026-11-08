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

    public Payment processPayment(String orderId, double amount, String method) {
        // Check if payment already exists for this order
        Optional<Payment> existing = paymentRepository.findByOrderId(orderId);
        if (existing.isPresent()) {
            return existing.get();
        }

        // Utiliser le montant passé en paramètre au lieu de 199.0
        String paymentId = "pay-" + UUID.randomUUID().toString().substring(0, 8);
        Payment payment = new Payment(paymentId, orderId, amount, method, "SUCCESS");
    
        return paymentRepository.save(payment);
    }
}