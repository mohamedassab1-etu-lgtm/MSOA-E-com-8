package com.msoa.payments.controller;

import com.msoa.payments.model.Payment;
import com.msoa.payments.service.PaymentService;
import jakarta.inject.Inject;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.json.Json;
import jakarta.json.JsonObject;

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

    private final HttpClient httpClient = HttpClient.newHttpClient();
    
    // URL officielle du service Orders
    private static final String ORDERS_SERVICE_URL = "http://localhost:8084/api/orders";

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
        Optional<Payment> payment = paymentService.getPaymentByOrderId(orderId);
        if (payment.isPresent()) {
            return Response.ok(payment.get()).build();
        }
        return Response.status(Response.Status.NOT_FOUND)
                .entity("{\"error\": \"Payment not found with id: " + orderId + "\"}")
                .build();
    }

    // Créer un paiement avec intégration réelle Orders-Service
    @POST
    public Response createPayment(Payment payment, @HeaderParam("Authorization") String authHeader) {
        try {
            if (payment == null || payment.getOrderId() == null) {
                return Response.status(Response.Status.BAD_REQUEST)
                        .entity("{\"error\": \"Invalid payment data or missing orderId\"}")
                        .build();
            }

            String orderId = payment.getOrderId();

            // 1. VÉRIFIER LA COMMANDE AUPRES DU SERVICE ORDERS : GET /api/orders/{id}
            HttpRequest checkRequest = HttpRequest.newBuilder()
                    .uri(URI.create(ORDERS_SERVICE_URL + "/" + orderId))
                    .header("Authorization", authHeader) // Transmission du token JWT M2M
                    .GET()
                    .build();

            HttpResponse<String> checkResponse = httpClient.send(checkRequest, HttpResponse.BodyHandlers.ofString());

            if (checkResponse.statusCode() != 200) {
                return Response.status(Response.Status.BAD_REQUEST)
                        .entity("{\"error\": \"Order not found or inaccessible on orders-service\"}")
                        .build();
            }

            // Parser le JSON pour vérifier si le statut est PENDING_PAYMENT
            JsonObject orderJson = Json.createReader(new StringReader(checkResponse.body())).readObject();
            String status = orderJson.getString("status", "");

            if (!"PENDING_PAYMENT".equals(status)) {
                return Response.status(Response.Status.BAD_REQUEST)
                        .entity("{\"error\": \"Order status is not PENDING_PAYMENT. Current status: " + status + "\"}")
                        .build();
            }

            // 2. ENREGISTRER LE PAIEMENT DANS LA BASE SQLITE LOCALE
            Payment createdPayment = paymentService.createPayment(payment);

            // 3. METTRE A JOUR LE STATUT DE LA COMMANDE À "PAID" : PATCH /api/orders/{id}/status
            String patchBody = "{\"status\":\"PAID\"}";
            HttpRequest patchRequest = HttpRequest.newBuilder()
                    .uri(URI.create(ORDERS_SERVICE_URL + "/" + orderId + "/status"))
                    .header("Authorization", authHeader)
                    .header("Content-Type", "application/json")
                    .method("PATCH", HttpRequest.BodyPublishers.ofString(patchBody))
                    .build();

            HttpResponse<String> patchResponse = httpClient.send(patchRequest, HttpResponse.BodyHandlers.ofString());

            if (patchResponse.statusCode() != 200 && patchResponse.statusCode() != 204) {
                System.err.println("Warning: Failed to update order status to PAID on orders-service");
            }

            return Response.status(Response.Status.CREATED).entity(createdPayment).build();

        } catch (Exception e) {
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                    .entity("{\"error\": \"" + e.getMessage() + "\"}")
                    .build();
        }
    }
}