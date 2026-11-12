const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const jwt = require("jsonwebtoken");

// Override config before importing the app
const config = require("../src/config");
config.jwtSecret = "test-secret-key-that-is-at-least-32-chars-long!";
config.allowedOrigins = ["http://localhost:5173"];

const { initDatabase } = require("../src/db");
const { createShippingRepository } = require("../src/shippingRepository");
const { createApp } = require("../src/app");

const USER_ID = "user-1";
const AUTH_HEADER = `Bearer ${jwt.sign({ id: USER_ID, role: "CUSTOMER" }, config.jwtSecret)}`;

async function setup() {
    // 1. Mock Orders Service
    const mockOrdersApp = express();
    mockOrdersApp.use(express.json());
    
    let mockOrder = { 
        id: "order-123", 
        userId: USER_ID, 
        status: "PAID", 
        customer: { name: "Demo", address: "123 St", city: "Casa" } 
    };
    let patchedStatuses = [];

    mockOrdersApp.get("/api/orders/:id", (req, res) => res.json(mockOrder));
    mockOrdersApp.patch("/api/orders/:id/status", (req, res) => {
        patchedStatuses.push(req.body.status);
        res.json({ success: true });
    });

    const ordersServer = mockOrdersApp.listen(0);
    config.ordersUrl = `http://127.0.0.1:${ordersServer.address().port}`;

    // 2. Shipping Service
    const db = initDatabase(":memory:");
    await db.initDb();
    const repo = createShippingRepository(db);
    const app = createApp({ repo });
    const server = app.listen(0);
    
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    const http = async (method, path, body, headers = {}) => {
        const r = await fetch(baseUrl + path, {
            method,
            headers: { "Content-Type": "application/json", Authorization: AUTH_HEADER, ...headers },
            body: body ? JSON.stringify(body) : undefined,
        });
        const text = await r.text();
        return { status: r.status, body: text ? JSON.parse(text) : null };
    };

    return {
        http,
        setOrderMock: (data) => { mockOrder = data; },
        getPatchedStatuses: () => patchedStatuses,
        close: () => {
            server.close();
            ordersServer.close();
        }
    };
}

test("création : génère un tracking number et initialise à PREPARING", async () => {
    const { http, close } = await setup();
    
    const res = await http("POST", "/api/shipments", { orderId: "order-123" });
    
    assert.equal(res.status, 201);
    assert.equal(res.body.status, "PREPARING");
    assert.equal(res.body.orderId, "order-123");
    assert.match(res.body.trackingNumber, /^MSOA-[A-F0-9]{12}$/);
    assert.equal(res.body.address.city, "Casa");
    
    close();
});

test("création : refusée si la commande n'est pas PAID", async () => {
    const { http, setOrderMock, close } = await setup();
    
    // Simulate an unpaid order
    setOrderMock({ id: "order-999", userId: USER_ID, status: "PENDING_PAYMENT", customer: {} });
    
    const res = await http("POST", "/api/shipments", { orderId: "order-999" });
    
    assert.equal(res.status, 400);
    assert.match(res.body.message, /Cannot ship order/i);
    
    close();
});

test("transition : SHIPPED synchronise le statut avec Orders", async () => {
    const { http, getPatchedStatuses, close } = await setup();
    
    const created = await http("POST", "/api/shipments", { orderId: "order-123" });
    const shipmentId = created.body.id;

    const res = await http("PATCH", `/api/shipments/${shipmentId}/status`, { status: "SHIPPED" });
    
    assert.equal(res.status, 200);
    assert.equal(res.body.status, "SHIPPED");
    
    // Ensure the external API call was made to the mock Orders service
    const synced = getPatchedStatuses();
    assert.equal(synced.length, 1);
    assert.equal(synced[0], "SHIPPED");
    
    close();
});