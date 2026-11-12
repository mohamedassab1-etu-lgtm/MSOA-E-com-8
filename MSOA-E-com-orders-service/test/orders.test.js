const test = require("node:test");
const assert = require("node:assert/strict");
const { openDb } = require("../src/db");
const { createOrderRepository } = require("../src/orderRepository");
const { createOrderService } = require("../src/orderService");
const { createCatalogClient } = require("../src/clients/catalogClient");
const { createInventoryClient } = require("../src/clients/inventoryClient");
const { createShippingClient } = require("../src/clients/shippingClient");
const { createApp } = require("../src/app");

async function setup() {
  const stubCfg = { mode: "stub", url: "", timeoutMs: 1000 };
  const inventory = createInventoryClient(stubCfg);
  const shipping = createShippingClient(stubCfg);
  const service = createOrderService({
    repo: createOrderRepository(openDb(":memory:")),
    catalog: createCatalogClient(stubCfg),
    inventory,
    shipping,
  });
  const server = createApp({ orderService: service, frontendOrigin: "http://localhost:5173" }).listen(0);
  const base = `http://localhost:${server.address().port}`;
  const http = async (method, path, body) => {
    const r = await fetch(base + path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await r.text();
    return { status: r.status, body: text ? JSON.parse(text) : null };
  };
  return { http, inventory, shipping, close: () => server.close() };
}

const customer = { name: "Demo Customer", address: "123 Main Street", city: "Casablanca" };
const newOrder = (items, userId = "user-1") => ({ userId, customer, items });

test("création : calcule le total côté serveur et réserve le stock", async () => {
  const { http, inventory, close } = await setup();
  const res = await http("POST", "/api/orders", newOrder([{ productId: 1, quantity: 2 }, { productId: 4, quantity: 1 }]));
  assert.equal(res.status, 201);
  assert.equal(res.body.status, "PENDING_PAYMENT");
  assert.equal(res.body.total, 8499 * 2 + 1199);
  assert.equal(res.body.items[0].name, "Lenovo ThinkPad E14");
  assert.equal(inventory._stock[1], 10);
  assert.equal(inventory._stock[4], 24);
  close();
});

test("stock insuffisant : 409, aucune commande créée, stock inchangé (atomique)", async () => {
  const { http, inventory, close } = await setup();
  const res = await http("POST", "/api/orders", newOrder([{ productId: 4, quantity: 2 }, { productId: 3, quantity: 99 }]));
  assert.equal(res.status, 409);
  assert.match(res.body.message, /stock/i);
  assert.equal(inventory._stock[4], 25);
  assert.equal(inventory._stock[3], 8);
  assert.deepEqual((await http("GET", "/api/orders?userId=user-1")).body, []);
  close();
});

test("validation : panier vide, produit inconnu, quantité invalide, userId absent", async () => {
  const { http, close } = await setup();
  assert.equal((await http("POST", "/api/orders", newOrder([]))).status, 400);
  assert.equal((await http("POST", "/api/orders", newOrder([{ productId: 999, quantity: 1 }]))).status, 404);
  assert.equal((await http("POST", "/api/orders", newOrder([{ productId: 1, quantity: 0 }]))).status, 400);
  assert.equal((await http("POST", "/api/orders", { customer, items: [{ productId: 1, quantity: 1 }] })).status, 400);
  assert.equal((await http("GET", "/api/orders")).status, 400);
  close();
});

test("les commandes sont isolées par utilisateur ; 404 sur id inconnu", async () => {
  const { http, close } = await setup();
  await http("POST", "/api/orders", newOrder([{ productId: 2, quantity: 1 }], "user-1"));
  await http("POST", "/api/orders", newOrder([{ productId: 2, quantity: 1 }], "user-2"));
  assert.equal((await http("GET", "/api/orders?userId=user-1")).body.length, 1);
  assert.equal((await http("GET", "/api/orders/inconnu")).status, 404);
  close();
});

test("transitions : PENDING_PAYMENT → PAID → SHIPPED → DELIVERED, le reste est refusé", async () => {
  const { http, close } = await setup();
  const { body: order } = await http("POST", "/api/orders", newOrder([{ productId: 2, quantity: 1 }]));
  const patch = (status) => http("PATCH", `/api/orders/${order.id}/status`, { status });

  assert.equal((await patch("SHIPPED")).status, 409); // saute PAID
  assert.equal((await patch("PAID")).body.status, "PAID");
  assert.equal((await patch("PAID")).status, 200);
  assert.equal((await patch("SHIPPED")).body.status, "SHIPPED");
  assert.equal((await patch("DELIVERED")).body.status, "DELIVERED");
  assert.equal((await patch("BIDON")).status, 400);
  close();
});

test("annulation autorisée : stock restauré ; double annulation refusée", async () => {
  const { http, inventory, close } = await setup();
  const { body: order } = await http("POST", "/api/orders", newOrder([{ productId: 1, quantity: 3 }]));
  assert.equal(inventory._stock[1], 9);

  const res = await http("POST", `/api/orders/${order.id}/cancel`);
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "CANCELLED");
  assert.equal(inventory._stock[1], 12);

  assert.equal((await http("POST", `/api/orders/${order.id}/cancel`)).status, 409);
  assert.equal(inventory._stock[1], 12); // pas de double libération
  close();
});

test("annulation refusée si expédiée (commande SHIPPED ou shipment SHIPPED)", async () => {
  const { http, inventory, shipping, close } = await setup();

  // Cas 1 : statut SHIPPED
  const a = (await http("POST", "/api/orders", newOrder([{ productId: 2, quantity: 1 }]))).body;
  await http("PATCH", `/api/orders/${a.id}/status`, { status: "PAID" });
  await http("PATCH", `/api/orders/${a.id}/status`, { status: "SHIPPED" });
  assert.equal((await http("POST", `/api/orders/${a.id}/cancel`)).status, 409);

  // Cas 2 : commande PAID mais le colis est déjà parti
  const b = (await http("POST", "/api/orders", newOrder([{ productId: 2, quantity: 1 }]))).body;
  await http("PATCH", `/api/orders/${b.id}/status`, { status: "PAID" });
  shipping._shipments.set(b.id, { status: "SHIPPED" });
  const res = await http("POST", `/api/orders/${b.id}/cancel`);
  assert.equal(res.status, 409);
  assert.match(res.body.message, /shipped/i);
  assert.equal(inventory._stock[2], 18); // 20 - 2 commandes, rien restitué
  close();
});

test("shipment en PREPARING : l'annulation reste possible", async () => {
  const { http, shipping, close } = await setup();
  const o = (await http("POST", "/api/orders", newOrder([{ productId: 2, quantity: 1 }]))).body;
  await http("PATCH", `/api/orders/${o.id}/status`, { status: "PAID" });
  shipping._shipments.set(o.id, { status: "PREPARING" });
  assert.equal((await http("POST", `/api/orders/${o.id}/cancel`)).body.status, "CANCELLED");
  close();
});
