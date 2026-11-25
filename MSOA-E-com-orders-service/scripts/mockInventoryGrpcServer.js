
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const express = require("express");
const path = require("path");

// Chargement du contrat commun
const PROTO_PATH = path.join(
  __dirname,
  "../proto/inventory.proto"
);

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  defaults: true,
});

const inventoryProto =
  grpc.loadPackageDefinition(packageDefinition).inventory;

// Stock simule
const stock = {
  1: 12,
  2: 20,
  3: 8,
  4: 25,
  5: 10,
  6: 15,
};

// Validation des entiers int32
function isPositiveInt32(value) {
  return (
    Number.isInteger(value) &&
    value > 0 &&
    value <= 2147483647
  );
}

// Validation et regroupement des produits
function validateItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw {
      code: grpc.status.INVALID_ARGUMENT,
      message: "Items are required.",
    };
  }

  const merged = new Map();

  for (const item of items) {
    const { product_id, quantity } = item;

    if (
      !isPositiveInt32(product_id) ||
      !isPositiveInt32(quantity)
    ) {
      throw {
        code: grpc.status.INVALID_ARGUMENT,
        message: "Invalid product_id or quantity.",
      };
    }

    if (!Object.hasOwn(stock, product_id)) {
      throw {
        code: grpc.status.NOT_FOUND,
        message: "Product not found.",
      };
    }

    const total =
      (merged.get(product_id) ?? 0) + quantity;

    if (!isPositiveInt32(total)) {
      throw {
        code: grpc.status.INVALID_ARGUMENT,
        message: "Invalid total quantity.",
      };
    }

    merged.set(product_id, total);
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
// RPC 1 : GET STOCK
// =====================================

function getStock(call, callback) {
  const { product_id } = call.request;

  if (!isPositiveInt32(product_id)) {
    return callback({
      code: grpc.status.INVALID_ARGUMENT,
      message: "Invalid product ID.",
    });
  }

  if (!Object.hasOwn(stock, product_id)) {
    return callback({
      code: grpc.status.NOT_FOUND,
      message: "Product not found.",
    });
  }

  const response = {
    product_id,
    stock: stock[product_id],
  };

  console.log("[gRPC] GetStock:", response);

  callback(null, response);
}

// =====================================
// RPC 2 : CHECK AVAILABILITY
// =====================================

function checkAvailability(call, callback) {
  try {
    const items = validateItems(call.request.items);

    const available = items.every(
      (item) =>
        stock[item.product_id] >= item.quantity
    );

    console.log("[gRPC] CheckAvailability:", {
      items,
      available,
    });

    callback(null, { available });
  } catch (error) {
    callback(error);
  }
}

// =====================================
// RPC 3 : RESERVE STOCK
// =====================================

function reserveStock(call, callback) {
  try {
    const items = validateItems(call.request.items);

    // Verification de tous les produits
    const available = items.every(
      (item) =>
        stock[item.product_id] >= item.quantity
    );

    if (!available) {
      console.log("[gRPC] Reservation rejected");

      return callback(null, {
        success: false,
      });
    }

    // Reservation atomique en memoire
    for (const item of items) {
      stock[item.product_id] -= item.quantity;
    }

    console.log("[gRPC] ReserveStock:", items);
    console.log("[Stock]", stock);

    callback(null, { success: true });
  } catch (error) {
    callback(error);
  }
}

// =====================================
// RPC 4 : RELEASE STOCK
// =====================================

function releaseStock(call, callback) {
  try {
    const items = validateItems(call.request.items);

    const valid = items.every(
      (item) =>
        stock[item.product_id] + item.quantity
          <= 2147483647
    );

    if (!valid) {
      return callback(null, { success: false });
    }

    for (const item of items) {
      stock[item.product_id] += item.quantity;
    }

    console.log("[gRPC] ReleaseStock:", items);
    console.log("[Stock]", stock);

    callback(null, { success: true });
  } catch (error) {
    callback(error);
  }
}

// =====================================
// DEMARRAGE DU SERVEUR GRPC
// =====================================

const server = new grpc.Server();

server.addService(
  inventoryProto.InventoryService.service,
  {
    GetStock: getStock,
    CheckAvailability: checkAvailability,
    ReserveStock: reserveStock,
    ReleaseStock: releaseStock,
  }
);

server.bindAsync(
  "127.0.0.1:50051",
  grpc.ServerCredentials.createInsecure(),
  (error, port) => {
    if (error) {
      console.error(error);
      process.exit(1);
    }

    console.log(
      `[gRPC] Mock Inventory running on port ${port}`
    );

    console.log("[Stock initial]", stock);
  }
);

// =====================================
// API REST DE DIAGNOSTIC UNIQUEMENT
// =====================================

const app = express();

app.get("/health", (req, res) => {
  res.json({
    service: "mock-inventory",
    status: "UP",
  });
});

app.get("/api/inventory/stock", (req, res) => {
  res.json(stock);
});

const httpServer = app.listen(8083, "127.0.0.1", () => {
  console.log("[REST] Stock monitoring on port 8083");
});

httpServer.on("error", (error) => {
  console.error(error);
  server.forceShutdown();
  process.exit(1);
});
