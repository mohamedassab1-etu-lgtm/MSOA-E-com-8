
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const path = require("path");
const { HttpError } = require("../errors");

// Chargement du contrat commun
const PROTO_PATH = path.join(
  __dirname,
  "../../proto/inventory.proto"
);

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const inventoryProto =
  grpc.loadPackageDefinition(packageDefinition).inventory;

// Validation des entiers Protobuf int32
function isPositiveInt32(value) {
  return (
    Number.isInteger(value) &&
    value > 0 &&
    value <= 2147483647
  );
}

// Conversion productId vers product_id
function formatItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new HttpError(400, "Items are required.");
  }

  const merged = new Map();

  for (const item of items) {
    if (
      !isPositiveInt32(item?.productId) ||
      !isPositiveInt32(item?.quantity)
    ) {
      throw new HttpError(
        400,
        "Invalid productId or quantity."
      );
    }

    const total =
      (merged.get(item.productId) ?? 0) + item.quantity;

    if (!isPositiveInt32(total)) {
      throw new HttpError(400, "Invalid total quantity.");
    }

    merged.set(item.productId, total);
  }

  return Array.from(
    merged,
    ([product_id, quantity]) => ({
      product_id,
      quantity,
    })
  );
}

// Conversion des erreurs gRPC vers HTTP
function mapGrpcError(error) {
  switch (error.code) {
    case grpc.status.INVALID_ARGUMENT:
      return new HttpError(
        400,
        "Invalid inventory request."
      );

    case grpc.status.NOT_FOUND:
      return new HttpError(
        404,
        "Product not found."
      );

    case grpc.status.FAILED_PRECONDITION:
      return new HttpError(
        409,
        error.details || "Inventory operation rejected."
      );

    case grpc.status.UNAVAILABLE:
      return new HttpError(
        503,
        "Inventory service unavailable."
      );

    case grpc.status.DEADLINE_EXCEEDED:
      return new HttpError(
        504,
        "Inventory service timeout."
      );

    default:
      return new HttpError(
        502,
        "Inventory gRPC communication error."
      );
  }
}

// Creation du client gRPC
function createInventoryGrpcClient({
  grpcAddress = "localhost:50051",
  grpcTimeoutMs = 3000,
} = {}) {
  const client = new inventoryProto.InventoryService(
    grpcAddress,
    grpc.credentials.createInsecure()
  );

  // Fonction commune pour les appels RPC
  function callRpc(method, request) {
    return new Promise((resolve, reject) => {
      const deadline = new Date(
        Date.now() + grpcTimeoutMs
      );

      client[method](
        request,
        { deadline },
        (error, response) => {
          if (error) {
            return reject(mapGrpcError(error));
          }

          resolve(response);
        }
      );
    });
  }

  return {
    // RPC 1 : consulter le stock
    async getStock(productId) {
      if (!isPositiveInt32(productId)) {
        throw new HttpError(400, "Invalid productId.");
      }

      const response = await callRpc("GetStock", {
        product_id: productId,
      });

      return {
        productId: response.product_id,
        stock: response.stock,
      };
    },

    // RPC 2 : verifier la disponibilite
    async checkAvailability(items) {
      return callRpc("CheckAvailability", {
        items: formatItems(items),
      });
    },

    // RPC 3 : reserver le stock
    async reserveStock(items) {
      const response = await callRpc("ReserveStock", {
        items: formatItems(items),
      });

      if (!response.success) {
        throw new HttpError(
          409,
          "Stock reservation rejected."
        );
      }

      return response;
    },

    // RPC 4 : liberer le stock
    async releaseStock(items) {
      const response = await callRpc("ReleaseStock", {
        items: formatItems(items),
      });

      if (!response.success) {
        throw new HttpError(
          502,
          "Unable to release stock."
        );
      }

      return response;
    },

    // Fermer la connexion gRPC
    close() {
      client.close();
    },
  };
}

module.exports = { createInventoryGrpcClient };
