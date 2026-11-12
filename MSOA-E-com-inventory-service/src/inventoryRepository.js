const db = require("./db");

const CATALOG_URL = process.env.CATALOG_SERVICE_URL || "http://localhost:8082";

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
const insertStock = db.prepare("INSERT INTO stock (product_id, quantity, updated_at) VALUES (?, 0, ?)");

// Ask Catalog if the product exists
async function checkCatalogForProduct(productId) {
  try {
    const response = await fetch(`${CATALOG_URL}/products/${productId}`);
    if (response.status === 404) return false;
    if (!response.ok) throw new Error("Catalog service error");
    return true;
  } catch (error) {
    console.error("Failed to fetch from Catalog:", error);
    throw new HttpError(503, "Catalog service unavailable");
  }
}

async function getStock(productId) {
  const row = selectStock.get(productId);
  if (row) return row.quantity;

  // Check Catalog if the product is not in DB.
  const existsInCatalog = await checkCatalogForProduct(productId);
  if (!existsInCatalog) return null; // Doesn't exist at all

  // Exists in Catalog, initialize stock to 0
  insertStock.run(productId, now());
  return 0; 
}

async function checkAvailability(items) {
  const list = normalizeItems(items);
  for (const { productId, quantity } of list) {
    const stock = await getStock(productId);
    if (stock === null || stock < quantity) {
      return false;
    }
  }
  return true;
}

async function reserve(items) {
  const list = normalizeItems(items);
  
  // 1. Pre-fetch and initialize stock for all items
  for (const item of list) {
    const stock = await getStock(item.productId);
    if (stock === null) {
      throw new HttpError(404, `Unknown product: ${item.productId}`);
    }
  }

  // 2. Perform the synchronous transaction
  const reserveTx = db.transaction((listToReserve) => {
    const update = db.prepare(
      "UPDATE stock SET quantity = quantity - ?, updated_at = ? WHERE product_id = ? AND quantity >= ?"
    );
    for (const { productId, quantity } of listToReserve) {
      const result = update.run(quantity, now(), productId, quantity);
      if (result.changes === 0) {
        throw new HttpError(409, `Insufficient stock for product ${productId}.`);
      }
    }
  });

  reserveTx.immediate(list);
  return { success: true };
}

async function release(items) {
  const list = normalizeItems(items);
  
  // 1. Pre-fetch and initialize stock (in case they are releasing a newly returned item)
  for (const item of list) {
    const stock = await getStock(item.productId);
    if (stock === null) {
      throw new HttpError(404, `Unknown product: ${item.productId}`);
    }
  }

  // 2. Perform synchronous transaction
  const releaseTx = db.transaction((listToRelease) => {
    const update = db.prepare(
      "UPDATE stock SET quantity = quantity + ?, updated_at = ? WHERE product_id = ?"
    );
    for (const { productId, quantity } of listToRelease) {
      update.run(quantity, now(), productId);
    }
  });

  releaseTx.immediate(list);
  return { success: true };
}

module.exports = { HttpError, getStock, checkAvailability, reserve, release };