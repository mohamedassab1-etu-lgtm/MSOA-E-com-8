const authHeaders = (a) => (a ? { Authorization: a } : {});

function createShippingClient({ mode, url, timeoutMs }) {
  if (mode === "rest") {
    return {
      async getShipmentByOrder(orderId, authorization) {
        const res = await callJson(url, `/api/shipments/order/${encodeURIComponent(orderId)}`, {
          timeoutMs,
          headers: authHeaders(authorization),
        });
        if (res.status === 404) return null;
        if (!res.ok) throw new HttpError(502, "Erreur du service Shipping");
        return res.data;
      },
      async cancelShipment(shipmentId, authorization) {
        const res = await callJson(url, `/api/shipments/${encodeURIComponent(shipmentId)}/status`, {
          method: "PATCH",
          body: { status: "CANCELLED" },
          timeoutMs,
          headers: authHeaders(authorization),
        });
        if (!res.ok) throw new HttpError(502, "Impossible d'annuler l'expédition");
      },
    };
  }

  const shipments = new Map();
  return {
    _shipments: shipments,
    async getShipmentByOrder(orderId) {
      return shipments.get(orderId) ?? null;
    },
    async cancelShipment() {},
  };
}