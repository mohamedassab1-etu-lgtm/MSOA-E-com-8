const crypto = require("crypto");
const { HttpError } = require("./errors");

const STATUSES = ["PENDING_PAYMENT", "PAID", "SHIPPED", "DELIVERED", "CANCELLED"];

// Mêmes transitions que le mock du frontend (orderService.js)
const TRANSITIONS = {
  PENDING_PAYMENT: ["PAID", "CANCELLED"],
  PAID: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: [],
};

const CANCELLABLE = ["PENDING_PAYMENT", "PAID"];
const isText = (v) => typeof v === "string" && v.trim().length > 0;

function validateCreate(body) {
  if (!body || typeof body !== "object") throw new HttpError(400, "Corps de requête invalide.");
  if (!isText(body.userId)) throw new HttpError(400, "userId est obligatoire.");

  const c = body.customer;
  if (!c || !isText(c.name) || !isText(c.address) || !isText(c.city)) {
    throw new HttpError(400, "customer.name, customer.address et customer.city sont obligatoires.");
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    throw new HttpError(400, "Cannot create an empty order.");
  }

  // Fusionne les doublons (même produit deux fois) et valide chaque ligne
  const merged = new Map();
  for (const item of body.items) {
    const productId = Number(item?.productId);
    const quantity = Number(item?.quantity);
    if (!Number.isInteger(productId) || productId <= 0) throw new HttpError(400, "productId invalide.");
    if (!Number.isInteger(quantity) || quantity <= 0) throw new HttpError(400, "quantity doit être un entier positif.");
    merged.set(productId, (merged.get(productId) ?? 0) + quantity);
  }

  return {
    userId: body.userId.trim(),
    customer: { name: c.name.trim(), address: c.address.trim(), city: c.city.trim() },
    lines: [...merged].map(([productId, quantity]) => ({ productId, quantity })),
  };
}

function createOrderService({ repo, catalog, inventory, shipping }) {
  return {
    list(userId) {
      if (!isText(userId)) throw new HttpError(400, "Le paramètre userId est obligatoire.");
      return repo.findByUser(userId);
    },

    get(id) {
      const order = repo.findById(id);
      if (!order) throw new HttpError(404, "Order not found.");
      return order;
    },

    async create(body) {
      const { userId, customer, lines } = validateCreate(body);

      // 1. Prix et noms viennent du Catalog, JAMAIS du frontend
      const items = [];
      for (const line of lines) {
        const product = await catalog.getProduct(line.productId);
        if (!product) throw new HttpError(404, `Unknown product: ${line.productId}`);
        items.push({
          productId: line.productId,
          name: product.name,
          price: product.price,
          quantity: line.quantity,
        });
      }
      const total = Math.round(items.reduce((s, i) => s + i.price * i.quantity, 0) * 100) / 100;

      // 2. Réservation atomique du stock (409 si insuffisant => rien n'est créé)
      const toReserve = items.map(({ productId, quantity }) => ({ productId, quantity }));
      await inventory.reserve(toReserve);

      // 3. Enregistrement. Si la base échoue, on compense en libérant le stock.
      try {
        return repo.create({
          id: crypto.randomUUID(),
          userId,
          customer,
          items,
          total,
          status: "PENDING_PAYMENT",
          createdAt: new Date().toISOString(),
        });
      } catch (err) {
        await inventory.release(toReserve).catch(() => { });
        throw err;
      }
    },

    // Appelé par Payments (-> PAID) et Shipping/frontend (-> SHIPPED, DELIVERED)
    updateStatus(id, status) {
      if (!STATUSES.includes(status)) throw new HttpError(400, `Statut invalide : ${status}`);
      if (status === "CANCELLED") {
        throw new HttpError(400, "Utilisez POST /api/orders/{id}/cancel pour annuler (libération du stock).");
      }

      const order = this.get(id);
      if (order.status === status) return order;   // idempotent: Shipping + frontend both PATCH

      if (!TRANSITIONS[order.status].includes(status)) {
        throw new HttpError(409, `Invalid transition: ${order.status} → ${status}`);
      }
      if (!repo.setStatusIf(id, order.status, status)) {
        throw new HttpError(409, "La commande a été modifiée entre-temps, réessayez.");
      }
      return repo.findById(id);
    },

    async cancel(id, authorization) {
      const order = this.get(id);
      if (!CANCELLABLE.includes(order.status)) {
        throw new HttpError(409, "This order cannot be cancelled.");
      }

      const shipment = await shipping.getShipmentByOrder(id, authorization);
      if (shipment && !["PREPARING", "CANCELLED"].includes(shipment.status)) {
        throw new HttpError(409, "Cannot cancel an order that has already been shipped.");
      }

      if (!repo.setStatusIf(id, order.status, "CANCELLED")) {
        throw new HttpError(409, "This order cannot be cancelled.");
      }

      try {
        await inventory.release(order.items.map(({ productId, quantity }) => ({ productId, quantity })));
      } catch (err) {
        repo.setStatusIf(id, "CANCELLED", order.status);
        throw err;
      }

      // Keep Shipping consistent (best effort)
      if (shipment && shipment.status === "PREPARING") {
        await shipping.cancelShipment(shipment.id, authorization)
          .catch((e) => console.error(`[Orders] shipment ${shipment.id} not cancelled: ${e.message}`));
      }

      return repo.findById(id);
    },
  };
}

module.exports = { createOrderService };
