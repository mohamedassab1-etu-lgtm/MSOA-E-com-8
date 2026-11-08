package com.msoa.payments.security;

import jakarta.annotation.Priority;
import jakarta.inject.Inject;
import jakarta.ws.rs.Priorities;
import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.container.ContainerRequestFilter;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.ext.Provider;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import java.io.IOException;

@Provider
@Priority(Priorities.AUTHENTICATION)
public class ApiKeyFilter implements ContainerRequestFilter {

    @Inject
    @ConfigProperty(name = "msoa.internal.secret.key", defaultValue = "msoa_machine_to_machine_backend_authorization_secret_key_2026")
    private String secretKey;

    @Override
    public void filter(ContainerRequestContext requestContext) throws IOException {
        // Optionnel : Vous pouvez désactiver le filtre pour GET /api/payments si vous voulez 
        // que ce soit public, ou l'appliquer à tout le monde. 
        // Ici, on vérifie l'en-tête "X-API-KEY" pour les communications inter-services.

        String path = requestContext.getUriInfo().getPath();
        
        // Exemple : Exiger la clé uniquement sur les requêtes POST (création de paiement)
        if (requestContext.getMethod().equalsIgnoreCase("POST")) {
            String clientKey = requestContext.getHeaderString("X-API-KEY");

            if (clientKey == null || !clientKey.equals(secretKey)) {
                requestContext.abortWith(
                    Response.status(Response.Status.UNAUTHORIZED)
                            .entity("{\"error\": \"Accès non autorisé - Clé M2M invalide ou manquante\"}")
                            .type("application/json")
                            .build()
                );
            }
        }
    }
}