const config = require("./config");
const { openDb } = require("./db");
const { createOrderRepository } = require("./orderRepository");
const { createOrderService } = require("./orderService");
const { createCatalogClient } = require("./clients/catalogClient");
const { createInventoryClient } = require("./clients/inventoryClient");
const { createShippingClient } = require("./clients/shippingClient");
const { createApp } = require("./app");

const db = openDb(config.dbPath);
const t = config.timeoutMs;

const orderService = createOrderService({
  repo: createOrderRepository(db),
  catalog: createCatalogClient({ ...config.catalog, timeoutMs: t }),
  inventory: createInventoryClient({ ...config.inventory, timeoutMs: t }),
  shipping: createShippingClient({ ...config.shipping, timeoutMs: t }),
});

createApp({ orderService, frontendOrigin: config.frontendOrigin }).listen(config.port, () => {
  console.log(`Order service sur http://localhost:${config.port}`);
  console.log(
    `catalog=${config.catalog.mode} inventory=${config.inventory.mode} shipping=${config.shipping.mode}`
  );
});
