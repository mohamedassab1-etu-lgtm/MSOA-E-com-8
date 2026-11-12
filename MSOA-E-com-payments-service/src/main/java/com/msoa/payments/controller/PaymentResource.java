package com.msoa.payments.controller;

import com.msoa.payments.model.Payment;
import com.msoa.payments.service.PaymentService;
import jakarta.inject.Inject;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.json.Json;
import jakarta.json.JsonObject;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import java.io.StringReader;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.List;
import java.util.Optional;

@Path("/payments")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class PaymentResource {

    @Inject
    private PaymentService paymentService;

    @Inject
    @ConfigProperty(name = "orders.service.url", defaultValue = "http://localhost:8084/api/orders")
    private String ordersServiceUrl;

    private final HttpClient httpClient = HttpClient.newHttpClient();

    private Response error(Response.Status status, String message) {
        String body = Json.createObjectBuilder().add("message", message).build().toString();
        return Response.status(status).entity(body).build();
    }

    // Récupérer tous les paiements
    @GET
    public Response getAllPayments() {
        List<Payment> payments = paymentService.getAllPayments();
        return Response.ok(payments).build();
    }

    // Récupérer un paiement par son ID
    @GET
    @Path("order/{orderId}")
    public Response getPaymentById(@PathParam("orderId") String orderId) {
        return paymentService.getPaymentByOrderId(orderId)
                .map(p -> Response.ok(p).build())
                .orElseGet(() -> error(Response.Status.NOT_FOUND, "Payment not found for order " + orderId));
    }

    // Créer un paiement avec intégration réelle Orders-Service
    @POST
    public Response createPayment(Payment payment) {
        try {
            if (payment == null || payment.getOrderId() == null || payment.getOrderId().isBlank()) {
                return error(Response.Status.BAD_REQUEST, "orderId is required");
            }
            String method = payment.getMethod() == null ? "CARD" : payment.getMethod().toUpperCase();
            if (!List.of("CARD", "CASH").contains(method)) {
                return error(Response.Status.BAD_REQUEST, "Invalid payment method");
            }
            String orderId = payment.getOrderId();

            // 1. Verify the order
            HttpRequest checkRequest = HttpRequest.newBuilder()
                    .uri(URI.create(ordersServiceUrl + "/" + orderId))
                    .GET().build();
            HttpResponse<String> checkResponse = httpClient.send(checkRequest, HttpResponse.BodyHandlers.ofString());

            if (checkResponse.statusCode() == 404)
                return error(Response.Status.NOT_FOUND, "Order not found");
            if (checkResponse.statusCode() != 200)
                return error(Response.Status.BAD_GATEWAY, "Orders service error");

            JsonObject order = Json.createReader(new StringReader(checkResponse.body())).readObject();
            String status = order.getString("status", "");
            if (!"PENDING_PAYMENT".equals(status)) {
                return error(Response.Status.CONFLICT, "Order is not awaiting payment (status: " + status + ")");
            }

            // 2. Server-side values only: ignore anything the client sent
            Payment toSave = new Payment();
            toSave.setOrderId(orderId);
            toSave.setAmount(order.getJsonNumber("total").doubleValue());
            toSave.setMethod(method);
            Payment created = paymentService.createPayment(toSave);

            // 3. Mark the order PAID
            HttpRequest patch = HttpRequest.newBuilder()
                    .uri(URI.create(ordersServiceUrl + "/" + orderId + "/status"))
                    .header("Content-Type", "application/json")
                    .method("PATCH", HttpRequest.BodyPublishers.ofString("{\"status\":\"PAID\"}"))
                    .build();
            HttpResponse<String> patchResponse = httpClient.send(patch, HttpResponse.BodyHandlers.ofString());

            if (patchResponse.statusCode() != 200 && patchResponse.statusCode() != 204) {
                paymentService.markAsFailed(created.getId());
                return error(Response.Status.BAD_GATEWAY, "Could not update order to PAID. Payment marked FAILED.");
            }
            return Response.status(Response.Status.CREATED).entity(created).build();

        } catch (Exception e) {
            return error(Response.Status.INTERNAL_SERVER_ERROR, "Internal error: " + e.getMessage());
        }
    }
}