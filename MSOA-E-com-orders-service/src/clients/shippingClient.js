const { HttpError } = require("../errors");
const { callJson } = require("./http");

// Interface : getShipmentByOrder(orderId) -> { status, ... } | null
function createShippingClient({ mode, url, timeoutMs }) {
  if (mode === "rest") {
    return {
      async getShipmentByOrder(orderId) {
        const res = await callJson(url, `/api/shipments/order/${encodeURIComponent(orderId)}`, { timeoutMs });
        if (res.status === 404) return null;
        if (!res.ok) throw new HttpError(502, "Erreur du service Shipping");
        return res.data;
      },
    };
  }

  // Simulation : aucune expédition n'existe. Les tests peuvent en ajouter via _shipments.
  const shipments = new Map();
  return {
    _shipments: shipments,
    async getShipmentByOrder(orderId) {
      return shipments.get(orderId) ?? null;
    },
  };
}

module.exports = { createShippingClient };
