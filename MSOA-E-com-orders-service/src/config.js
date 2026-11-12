require("dotenv").config();

module.exports = {
  port: Number(process.env.PORT || 8084),
  dbPath: process.env.DB_PATH || "./data/orders.db",
  frontendOrigin: process.env.FRONTEND_ORIGIN || "http://localhost:5173",
  timeoutMs: Number(process.env.HTTP_TIMEOUT_MS || 3000),
  catalog: {
    mode: process.env.CATALOG_MODE || "stub",
    url: process.env.CATALOG_URL || "http://localhost:8082",
  },
  inventory: {
    mode: process.env.INVENTORY_MODE || "stub",
    url: process.env.INVENTORY_URL || "http://localhost:8083",
  },
  shipping: {
    mode: process.env.SHIPPING_MODE || "stub",
    url: process.env.SHIPPING_URL || "http://localhost:8086",
  },
};
