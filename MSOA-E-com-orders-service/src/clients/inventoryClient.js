const { HttpError } = require("../errors");
const { callJson } = require("./http");

const INITIAL_STOCK = { 1: 12, 2: 20, 3: 8, 4: 25, 5: 10, 6: 15 };

// Interface : reserve(items) / release(items), items = [{ productId, quantity }]
// reserve doit être ATOMIQUE : tout ou rien.
function createInventoryClient({ mode, url, timeoutMs }) {
  if (mode === "rest") {
    return {
      async reserve(items) {
        const res = await callJson(url, "/api/inventory/reserve", {
          method: "POST",
          body: { items },
          timeoutMs,
        });
        if (res.ok) return;
        if (res.status >= 400 && res.status < 500) {
          throw new HttpError(409, res.data?.message || "Insufficient stock.");
        }
        throw new HttpError(502, "Erreur du service Inventory");
      },
      async release(items) {
        const res = await callJson(url, "/api/inventory/release", {
          method: "POST",
          body: { items },
          timeoutMs,
        });
        if (!res.ok) throw new HttpError(502, "Impossible de libérer le stock");
      },
    };
  }

  // Simulation en mémoire
  const stock = { ...INITIAL_STOCK };
  return {
    _stock: stock, // exposé pour les tests
    async reserve(items) {
      const ok = items.every((i) => (stock[i.productId] ?? 0) >= i.quantity);
      if (!ok) throw new HttpError(409, "Insufficient stock.");
      for (const i of items) stock[i.productId] -= i.quantity;
    },
    async release(items) {
      for (const i of items) stock[i.productId] = (stock[i.productId] ?? 0) + i.quantity;
    },
  };
}

module.exports = { createInventoryClient };
