
const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const path = require("path");

const {
  createInventoryGrpcClient,
} = require("../src/clients/inventoryGrpcClient");

// Chargement du contrat commun
const definition = protoLoader.loadSync(
  path.join(__dirname, "../proto/inventory.proto"),
  {
    keepCase: true,
    defaults: true,
  }
);

const proto =
  grpc.loadPackageDefinition(definition).inventory;

const INITIAL_STOCK = {
  1: 12,
  2: 20,
  3: 8,
  4: 25,
  5: 10,
  6: 15,
};

let stock;
let server;
let client;
let address;

// Validation des articles
function validateItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw {
      code: grpc.status.INVALID_ARGUMENT,
      message: "Invalid items.",
    };
  }

  const merged = new Map();

  for (const item of items) {
    if (
      !Number.isInteger(item.product_id) ||
      item.product_id <= 0 ||
      !Number.isInteger(item.quantity) ||
      item.quantity <= 0
    ) {
      throw {
        code: grpc.status.INVALID_ARGUMENT,
        message: "Invalid request.",
      };
    }

    if (!Object.hasOwn(stock, item.product_id)) {
      throw {
        code: grpc.status.NOT_FOUND,
        message: "Product not found.",
      };
    }

    merged.set(
      item.product_id,
      (merged.get(item.product_id) ?? 0)
        + item.quantity
    );
  }

  return Array.from(
    merged,
    ([product_id, quantity]) => ({
      product_id,
      quantity,
    })
  );
}

// =====================================
// INITIALISATION DU SERVEUR DE TEST
// =====================================

before(async () => {
  stock = { ...INITIAL_STOCK };

  server = new grpc.Server();

  server.addService(
    proto.InventoryService.service,
    {
      GetStock(call, callback) {
        const { product_id } = call.request;

        if (!Object.hasOwn(stock, product_id)) {
          return callback({
            code: grpc.status.NOT_FOUND,
            message: "Product not found.",
          });
        }

        callback(null, {
          product_id,
          stock: stock[product_id],
        });
      },

      CheckAvailability(call, callback) {
        // Simulation d'une reponse lente
        if (
          call.request.items?.some(
            (item) => item.product_id === 100
          )
        ) {
          const timer = setTimeout(() => {
            callback(null, { available: true });
          }, 1000);

          call.on("cancelled", () => {
            clearTimeout(timer);
          });

          return;
        }

        try {
          const items = validateItems(
            call.request.items
          );

          const available = items.every(
            (item) =>
              stock[item.product_id] >= item.quantity
          );

          callback(null, { available });
        } catch (error) {
          callback(error);
        }
      },

      ReserveStock(call, callback) {
        try {
          const items = validateItems(
            call.request.items
          );

          const available = items.every(
            (item) =>
              stock[item.product_id] >= item.quantity
          );

          if (!available) {
            return callback(null, {
              success: false,
            });
          }

          for (const item of items) {
            stock[item.product_id] -= item.quantity;
          }

          callback(null, { success: true });
        } catch (error) {
          callback(error);
        }
      },

      ReleaseStock(call, callback) {
        try {
          const items = validateItems(
            call.request.items
          );

          for (const item of items) {
            stock[item.product_id] += item.quantity;
          }

          callback(null, { success: true });
        } catch (error) {
          callback(error);
        }
      },
    }
  );

  const port = await new Promise((resolve, reject) => {
    server.bindAsync(
      "127.0.0.1:0",
      grpc.ServerCredentials.createInsecure(),
      (error, port) => {
        if (error) reject(error);
        else resolve(port);
      }
    );
  });

  address = `127.0.0.1:${port}`;

  client = createInventoryGrpcClient({
    grpcAddress: address,
    grpcTimeoutMs: 3000,
  });
});

// Reinitialiser le stock avant chaque test
beforeEach(() => {
  stock = { ...INITIAL_STOCK };
});

// Fermer les connexions apres les tests
after(() => {
  if (client) client.close();
  if (server) server.forceShutdown();
});

// =====================================
// TEST 1 : GET STOCK
// =====================================

test("gRPC : GetStock", async () => {
  const result = await client.getStock(3);

  assert.equal(result.productId, 3);
  assert.equal(result.stock, 8);
});

// =====================================
// TEST 2 : STOCK SUFFISANT
// =====================================

test("gRPC : stock suffisant", async () => {
  const result = await client.checkAvailability([
    { productId: 3, quantity: 3 },
  ]);

  assert.equal(result.available, true);
});

// =====================================
// TEST 3 : STOCK INSUFFISANT
// =====================================

test("gRPC : stock insuffisant", async () => {
  const result = await client.checkAvailability([
    { productId: 3, quantity: 10 },
  ]);

  assert.equal(result.available, false);
});

// =====================================
// TEST 4 : PLUSIEURS PRODUITS
// =====================================

test("gRPC : verification de plusieurs produits", async () => {
  const result = await client.checkAvailability([
    { productId: 1, quantity: 2 },
    { productId: 3, quantity: 3 },
    { productId: 5, quantity: 1 },
  ]);

  assert.equal(result.available, true);
});

// =====================================
// TEST 5 : RESERVATION
// =====================================

test("gRPC : ReserveStock", async () => {
  const result = await client.reserveStock([
    { productId: 3, quantity: 3 },
  ]);

  assert.equal(result.success, true);

  const remaining = await client.getStock(3);

  assert.equal(remaining.stock, 5);
});

// =====================================
// TEST 6 : LIBERATION
// =====================================

test("gRPC : ReleaseStock", async () => {
  const items = [
    { productId: 3, quantity: 3 },
  ];

  await client.reserveStock(items);

  const result = await client.releaseStock(items);

  assert.equal(result.success, true);

  const restored = await client.getStock(3);

  assert.equal(restored.stock, 8);
});

// =====================================
// TEST 7 : RESERVATION ATOMIQUE
// =====================================

test("gRPC : reservation atomique refusee", async () => {
  await assert.rejects(
    client.reserveStock([
      { productId: 1, quantity: 2 },
      { productId: 3, quantity: 100 },
    ]),
    (error) => error.status === 409
  );

  const product1 = await client.getStock(1);
  const product3 = await client.getStock(3);

  assert.equal(product1.stock, 12);
  assert.equal(product3.stock, 8);
});

// =====================================
// TEST 8 : PRODUIT INCONNU
// =====================================

test("gRPC : produit inconnu - 404", async () => {
  await assert.rejects(
    client.checkAvailability([
      { productId: 999, quantity: 2 },
    ]),
    (error) => error.status === 404
  );
});

// =====================================
// TEST 9 : QUANTITE INVALIDE
// =====================================

test("gRPC : quantite invalide - 400", async () => {
  await assert.rejects(
    client.checkAvailability([
      { productId: 3, quantity: 0 },
    ]),
    (error) => error.status === 400
  );
});

// =====================================
// TEST 10 : TIMEOUT
// =====================================

test("gRPC : timeout - 504", async () => {
  const slowClient = createInventoryGrpcClient({
    grpcAddress: address,
    grpcTimeoutMs: 100,
  });

  try {
    await assert.rejects(
      slowClient.checkAvailability([
        { productId: 100, quantity: 1 },
      ]),
      (error) => error.status === 504
    );
  } finally {
    slowClient.close();
  }
});

// =====================================
// TEST 11 : SERVEUR INDISPONIBLE
// =====================================

test("gRPC : serveur indisponible", async () => {
  server.forceShutdown();
  server = null;

  const unavailableClient =
    createInventoryGrpcClient({
      grpcAddress: address,
      grpcTimeoutMs: 1000,
    });

  try {
    await assert.rejects(
      unavailableClient.checkAvailability([
        { productId: 3, quantity: 3 },
      ]),
      (error) =>
        error.status === 503 ||
        error.status === 504
    );
  } finally {
    unavailableClient.close();
  }
});
