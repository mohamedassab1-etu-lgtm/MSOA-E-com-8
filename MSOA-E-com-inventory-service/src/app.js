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
    if (allowedOrigins.indexOf(origin) === -1) {
      var msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  }
}));
app.use(express.json());

app.get("/health", (req, res) => res.json({ status: "UP", service: "inventory" }));

app.get("/api/inventory/:productId", (req, res) => {
  const productId = Number(req.params.productId);
  if (!Number.isInteger(productId)) {
    throw new repo.HttpError(400, "Invalid productId.");
  }
  const stock = repo.getStock(productId);
  if (stock === null) throw new repo.HttpError(404, `Unknown product: ${productId}`);
  res.json({ productId, stock });
});

app.post("/api/inventory/check", (req, res) => {
  res.json({ available: repo.checkAvailability(req.body?.items) });
});

app.post("/api/inventory/reserve", (req, res) => {
  res.json(repo.reserve(req.body?.items));
});

app.post("/api/inventory/release", (req, res) => {
  res.json(repo.release(req.body?.items));
});

app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ message: "Invalid JSON body." });
  }
  const status = err.status || 500;
  if (status === 500) console.error(err);
  res.status(status).json({ message: status === 500 ? "Internal server error." : err.message });
});

module.exports = app;