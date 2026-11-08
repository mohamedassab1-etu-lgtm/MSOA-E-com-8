package com.msoa.payments.repository;

import com.msoa.payments.model.Payment;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import jakarta.persistence.EntityTransaction;
import jakarta.persistence.Persistence;

import java.util.List;
import java.util.Optional;

@ApplicationScoped
public class PaymentRepository {

    private EntityManagerFactory emf;

    @PostConstruct
    public void init() {
        this.emf = Persistence.createEntityManagerFactory("paymentsPU");
    }

    @PreDestroy
    public void destroy() {
        if (emf != null && emf.isOpen()) {
            emf.close();
        }
    }

    public List<Payment> findAll() {
        EntityManager em = emf.createEntityManager();
        try {
            return em.createQuery("SELECT p FROM Payment p", Payment.class).getResultList();
        } finally {
            em.close();
        }
    }

    public Optional<Payment> findByOrderId(String orderId) {
        EntityManager em = emf.createEntityManager();
        try {
            Payment payment = em.createQuery("SELECT p FROM Payment p WHERE p.orderId = :orderId", Payment.class)
                    .setParameter("orderId", orderId)
                    .getSingleResult();
            return Optional.of(payment);
        } catch (Exception e) {
            return Optional.empty();
        } finally {
            em.close();
        }
    }

    public Payment save(Payment payment) {
        EntityManager em = emf.createEntityManager();
        EntityTransaction tx = em.getTransaction();
        try {
            tx.begin();
            em.persist(payment);
            tx.commit();
            return payment;
        } catch (Exception e) {
            if (tx.isActive()) {
                tx.rollback();
            }
            throw e;
        } finally {
            em.close();
        }
    }
}