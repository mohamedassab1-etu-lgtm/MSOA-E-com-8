const { HttpError } = require("../errors");
const { callJson } = require("./http");

// Données de simulation = src/data/products.js du frontend.
// Source de vérité réelle : le service Catalog (mode "rest").
const STUB_PRODUCTS = [
  { id: 1, name: "Lenovo ThinkPad E14", price: 8499 },
  { id: 2, name: "Samsung Galaxy A55", price: 4299 },
  { id: 3, name: "Sony WH-1000XM5", price: 3499 },
  { id: 4, name: "Logitech MX Master 3S", price: 1199 },
  { id: 5, name: "Dell UltraSharp 27", price: 3999 },
  { id: 6, name: "Apple iPad Air", price: 7299 },
];

// Interface : getProduct(id) -> { id, name, price } | null
function createCatalogClient({ mode, url, timeoutMs }) {
  if (mode === "rest") {
    return {
      async getProduct(id) {
        const res = await callJson(url, `/products/${encodeURIComponent(id)}`, { timeoutMs });
        if (res.status === 404) return null;
        if (!res.ok) throw new HttpError(502, "Erreur du service Catalog");
        return res.data;
      },
    };
  }
  return {
    async getProduct(id) {
      return STUB_PRODUCTS.find((p) => p.id === Number(id)) ?? null;
    },
  };
}

module.exports = { createCatalogClient };
