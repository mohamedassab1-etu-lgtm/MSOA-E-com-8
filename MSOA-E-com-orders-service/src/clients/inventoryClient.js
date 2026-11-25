
const { HttpError } = require("../errors");
const { callJson } = require("./http");

const {
  createInventoryGrpcClient,
} = require("./inventoryGrpcClient");

const INITIAL_STOCK = {
  1: 12,
  2: 20,
  3: 8,
  4: 25,
  5: 10,
  6: 15,
};

function createInventoryClient({
  mode,
  url,
  timeoutMs,
  grpcAddress,
  grpcTimeoutMs,
}) {

  // =====================================
  // MODE GRPC - LAB 4
  // =====================================

  if (mode === "grpc") {
    const grpcClient = createInventoryGrpcClient({
      grpcAddress,
      grpcTimeoutMs,
    });

    return {
      async reserve(items) {

        // 1. Verification du panier complet
        const availability =
          await grpcClient.checkAvailability(items);

        console.log("[gRPC] CheckAvailability:", {
          items,
          available: availability.available,
        });

        if (!availability.available) {
          throw new HttpError(
            409,
            "Insufficient stock."
          );
        }

        // 2. Reservation atomique via gRPC
        const reservation =
          await grpcClient.reserveStock(items);

        console.log("[gRPC] ReserveStock:", {
          items,
          success: reservation.success,
        });
      },

      async release(items) {

        // 3. Liberation du stock via gRPC
        const result =
          await grpcClient.releaseStock(items);

        console.log("[gRPC] ReleaseStock:", {
          items,
          success: result.success,
        });
      },

      async getStock(productId) {
        return grpcClient.getStock(productId);
      },

      close() {
        grpcClient.close();
      },
    };
  }

  // =====================================
  // MODE REST - EXISTANT
  // =====================================

  if (mode === "rest") {
    return {
      async reserve(items) {
        const res = await callJson(
          url,
          "/api/inventory/reserve",
          {
            method: "POST",
            body: { items },
            timeoutMs,
          }
        );

        if (res.ok) return;

        if (res.status >= 400 && res.status < 500) {
          throw new HttpError(
            409,
            res.data?.message || "Insufficient stock."
          );
        }

        throw new HttpError(
          502,
          "Erreur du service Inventory"
        );
      },

      async release(items) {
        const res = await callJson(
          url,
          "/api/inventory/release",
          {
            method: "POST",
            body: { items },
            timeoutMs,
          }
        );

        if (!res.ok) {
          throw new HttpError(
            502,
            "Impossible de liberer le stock"
          );
        }
      },
    };
  }

  // =====================================
  // MODE STUB - SIMULATION LOCALE
  // =====================================

  const stock = { ...INITIAL_STOCK };

  return {
    _stock: stock,

    async reserve(items) {
      const ok = items.every(
        (i) => (stock[i.productId] ?? 0) >= i.quantity
      );

      if (!ok) {
        throw new HttpError(
          409,
          "Insufficient stock."
        );
      }

      for (const i of items) {
        stock[i.productId] -= i.quantity;
      }
    },

    async release(items) {
      for (const i of items) {
        stock[i.productId] =
          (stock[i.productId] ?? 0) + i.quantity;
      }
    },
  };
}

module.exports = { createInventoryClient };
