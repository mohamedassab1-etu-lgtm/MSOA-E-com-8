package com.msoa.payments.security;

import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import jakarta.annotation.Priority;
import jakarta.inject.Inject;
import jakarta.ws.rs.Priorities;
import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.container.ContainerRequestFilter;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.ext.Provider;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import javax.crypto.SecretKey;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

@Provider
@Priority(Priorities.AUTHENTICATION)
public class ApiKeyFilter implements ContainerRequestFilter {

    @Inject
    @ConfigProperty(name = "msoa.internal.secret.key", defaultValue = "ad43db4120d321f201527ffc71a66d9741756afa8b69fc8dab4ec784ff92287b")
    private String secretKeyString;

    @Override
    public void filter(ContainerRequestContext requestContext) throws IOException {
        // Appliquer la sécurité sur les requêtes POST (création de paiement)
        if (requestContext.getMethod().equalsIgnoreCase("POST")) {
            String authHeader = requestContext.getHeaderString("Authorization");

            if (authHeader == null || !authHeader.startsWith("Bearer ")) {
                abortWithUnauthorized(requestContext, "Token JWT manquant ou format invalide (Bearer requis)");
                return;
            }

            String token = authHeader.substring("Bearer ".length());

            try {
                SecretKey key = Keys.hmacShaKeyFor(secretKeyString.getBytes(StandardCharsets.UTF_8));

                // Valide le token avec HS256
                Jwts.parser()
                    .verifyWith(key)
                    .build()
                    .parseSignedClaims(token);

            } catch (JwtException e) {
                abortWithUnauthorized(requestContext, "Token JWT invalide ou signature incorrecte : " + e.getMessage());
            }
        }
    }

    private void abortWithUnauthorized(ContainerRequestContext requestContext, String message) {
        requestContext.abortWith(
            Response.status(Response.Status.UNAUTHORIZED)
                    .entity("{\"error\": \"" + message + "\"}")
                    .type("application/json")
                    .build()
        );
    }
}