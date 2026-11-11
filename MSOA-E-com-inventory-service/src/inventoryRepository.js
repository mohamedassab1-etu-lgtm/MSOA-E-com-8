const db = require("./db");

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const now = () => new Date().toISOString();

function normalizeItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new HttpError(400, "items must be a non-empty array.");
  }
  const merged = new Map();
  for (const item of items) {
    const productId = Number(item?.productId);
    const quantity = Number(item?.quantity);
    if (!Number.isInteger(productId) || productId <= 0) {
      throw new HttpError(400, "Invalid productId.");
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new HttpError(400, `Invalid quantity for product ${productId}.`);
    }
    merged.set(productId, (merged.get(productId) ?? 0) + quantity);
  }
  return [...merged].map(([productId, quantity]) => ({ productId, quantity }));
}
const selectStock = db.prepare("SELECT quantity FROM stock WHERE product_id = ?");

function getStock(productId) {
  const row = selectStock.get(productId);
  return row ? row.quantity : null;
}

function checkAvailability(items) {
  const list = normalizeItems(items);
  return list.every(({ productId, quantity }) => {
    const stock = getStock(productId);
    return stock !== null && stock >= quantity;
  });
}
// fonction de recerve
const reserveTx = db.transaction((list) => {
  const update = db.prepare(
    "UPDATE stock SET quantity = quantity - ?, updated_at = ? WHERE product_id = ? AND quantity >= ?"
  );
  for (const { productId, quantity } of list) {
    if (getStock(productId) === null) {
      throw new HttpError(404, `Unknown product: ${productId}`);
    }
    const result = update.run(quantity, now(), productId, quantity);
    if (result.changes === 0) {
      throw new HttpError(409, `Insufficient stock for product ${productId}.`);
    }
  }
});

function reserve(items) {
  reserveTx.immediate(normalizeItems(items));
  return { success: true };
}
// fct de release
const releaseTx = db.transaction((list) => {
  const update = db.prepare(
    "UPDATE stock SET quantity = quantity + ?, updated_at = ? WHERE product_id = ?"
  );
  for (const { productId } of list) {
    if (getStock(productId) === null) {
      throw new HttpError(404, `Unknown product: ${productId}`);
    }
  }
  for (const { productId, quantity } of list) {
    update.run(quantity, now(), productId);
  }
});

function release(items) {
  releaseTx.immediate(normalizeItems(items));
  return { success: true };
}

module.exports = { HttpError, getStock, checkAvailability, reserve, release };