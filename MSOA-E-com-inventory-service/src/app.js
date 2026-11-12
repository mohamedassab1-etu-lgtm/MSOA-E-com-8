const express = require("express");
const cors = require("cors");
const repo = require("./inventoryRepository");

const app = express();

const allowedOrigins = [
  process.env.FRONTEND_URL || "http://localhost:5173",
  process.env.ORDERS_SERVICE_URL || "http://localhost:8084" 
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      var msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  }
}));
app.use(express.json());

app.get("/health", (req, res) => res.json({ status: "UP", service: "inventory" }));

app.get("/api/inventory/:productId", async (req, res, next) => {
  try {
    const productId = Number(req.params.productId);
    if (!Number.isInteger(productId)) {
      throw new repo.HttpError(400, "Invalid productId.");
    }
    const stock = await repo.getStock(productId);
    if (stock === null) throw new repo.HttpError(404, `Unknown product: ${productId}`);
    res.json({ productId, stock });
  } catch (err) {
    next(err);
  }
});

app.post("/api/inventory/check", async (req, res, next) => {
  try {
    const available = await repo.checkAvailability(req.body?.items);
    res.json({ available });
  } catch (err) {
    next(err);
  }
});

app.post("/api/inventory/reserve", async (req, res, next) => {
  try {
    const result = await repo.reserve(req.body?.items);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.post("/api/inventory/release", async (req, res, next) => {
  try {
    const result = await repo.release(req.body?.items);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ message: "Invalid JSON body." });
  }
  if (/CORS policy/.test(err.message)) {
    return res.status(403).json({ message: "Origin not allowed." });
  }
  const status = err.status || 500;
  if (status === 500) console.error(err);
  res.status(status).json({ message: status === 500 ? "Internal server error." : err.message });
});

module.exports = app;