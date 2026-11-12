const express = require("express");
const cors = require("cors");
const { HttpError } = require("./errors");

function createApp({ orderService, frontendOrigin }) {
  const app = express();
  app.use(cors({ origin: frontendOrigin }));
  app.use(express.json());

  // Permet d'écrire des handlers async sans try/catch partout
  const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

  app.get("/health", (_req, res) => res.json({ service: "orders", status: "UP" }));

  app.get("/api/orders", wrap(async (req, res) => {
    res.json(orderService.list(req.query.userId));
  }));

  app.get("/api/orders/:id", wrap(async (req, res) => {
    res.json(orderService.get(req.params.id));
  }));

  app.post("/api/orders", wrap(async (req, res) => {
    res.status(201).json(await orderService.create(req.body));
  }));

  app.patch("/api/orders/:id/status", wrap(async (req, res) => {
    res.json(orderService.updateStatus(req.params.id, req.body?.status));
  }));

  app.post("/api/orders/:id/cancel", wrap(async (req, res) => {
    res.json(await orderService.cancel(req.params.id));
  }));

  app.use((_req, _res, next) => next(new HttpError(404, "Route introuvable.")));

  // Format d'erreur attendu par le frontend : { "message": "..." }
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err.type === "entity.parse.failed") return res.status(400).json({ message: "JSON invalide." });
    const status = err.status || 500;
    if (status === 500) console.error(err);
    res.status(status).json({ message: status === 500 ? "Erreur interne du serveur." : err.message });
  });

  return app;
}

module.exports = { createApp };
