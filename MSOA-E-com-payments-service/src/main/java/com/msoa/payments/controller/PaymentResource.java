package com.msoa.payments.controller;

import com.msoa.payments.model.Payment;
import com.msoa.payments.service.PaymentService;
import jakarta.inject.Inject;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import java.util.List;
import java.util.Optional;

@Path("/payments")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class PaymentResource {

    @Inject
    private PaymentService paymentService;

    @GET
    public Response getAllPayments() {
        List<Payment> payments = paymentService.getAllPayments();
        return Response.ok(payments).build();
    }

    @GET
    @Path("/order/{orderId}")
    public Response getPaymentByOrderId(@PathParam("orderId") String orderId) {
        Optional<Payment> payment = paymentService.getPaymentByOrderId(orderId);
        if (payment.isPresent()) {
            return Response.ok(payment.get()).build();
        } else {
            return Response.status(Response.Status.NOT_FOUND)
                    .entity("{\"error\": \"Payment not found for order ID: " + orderId + "\"}")
                    .build();
        }
    }

    @POST
    public Response createPayment(PaymentRequest request) {
        if (request == null || request.getOrderId() == null) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity("{\"error\": \"Invalid payment request data\"}")
                    .build();
        }

        Payment payment = paymentService.processPayment(request.getOrderId(), request.getAmount(), request.getMethod());
        return Response.status(Response.Status.CREATED).entity(payment).build();
    }

    // DTO for incoming POST request body matching README contract
    public static class PaymentRequest {
        private String orderId;
        private double amount;
        private String method;

        public String getOrderId() { return orderId; }
        public void setOrderId(String orderId) { this.orderId = orderId; }

        public double getAmount() { // <-- Ajoutez ce getter
            return amount;
        }
        public void setAmount(double amount) { // <-- Ajoutez ce setter
            this.amount = amount;
        }

        public String getMethod() { return method; }
        public void setMethod(String method) { this.method = method; }
    }
}