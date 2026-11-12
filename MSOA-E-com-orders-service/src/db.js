const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");

// Même schéma que orders/schema.sql fourni dans le TP.
// Pas de clé étrangère vers d'autres bases : user_id et product_id sont de simples références.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_address TEXT NOT NULL,
  customer_city TEXT NOT NULL,
  total REAL NOT NULL CHECK(total >= 0),
  status TEXT NOT NULL CHECK(status IN ('PENDING_PAYMENT','PAID','SHIPPED','DELIVERED','CANCELLED')),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL REFERENCES orders(id),
  product_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  price REAL NOT NULL CHECK(price >= 0),
  quantity INTEGER NOT NULL CHECK(quantity > 0)
);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_items_order ON order_items(order_id);
`;

function openDb(dbPath) {
  if (dbPath !== ":memory:") {
    fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
  }
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  return db;
}

module.exports = { openDb };
