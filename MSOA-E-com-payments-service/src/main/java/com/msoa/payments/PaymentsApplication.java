package com.msoa.payments;

import jakarta.ws.rs.ApplicationPath;
import jakarta.ws.rs.core.Application;

@ApplicationPath("/api")
public class PaymentsApplication extends Application {
    // Left empty intentionally; discovers JAX-RS resources automatically
}