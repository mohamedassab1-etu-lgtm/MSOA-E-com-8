# MSOA E-Commerce: API Contract

> Module: Microservices Architecture (MSOA), Master in Data Science
> Document version: 1.0, 12 November 2026

---

## 0. Purpose of this document

This document is the **API contract** of our e-commerce backend. The backend is made of **six independent REST microservices**, each one implemented by a different member of the group, with its own server, its own language/framework and its own SQLite database.

Its goals are:

1. **Describe, for every endpoint of every microservice**, what is sent (method, path, headers, JSON body) and what is returned (JSON body and HTTP status code for every case: success and errors).
2. **Show who is responsible** for each microservice and which technology it uses.
3. **Document the service-to-service communications** (who calls whom, with which endpoint), since the services must cooperate to execute business scenarios (checkout, payment, shipping, cancellation).
4. **Serve as the reference for integration**: the React frontend provided by the professor is connected *only* through `src/config/backend.js` and relies on the shapes described here.
5. **Record the remaining points** (configuration, known limitations, discrepancies) that were identified while consolidating the six code bases.

This contract was written **from the actual source code** of the six services, not only from the specification in the assignment README. Where the code differs from the assignment (or from a service's own README), it is stated explicitly in [Section 7](#7-integration-notes-and-known-discrepancies).

### Table of contents

0. [Purpose of this document](#0-purpose-of-this-document)
1. [Global overview and conventions](#1-global-overview-and-conventions)
2. [Auth Service (port 8081)](#2-auth-service-port-8081)
3. [Catalog Service (port 8082)](#3-catalog-service-port-8082)
4. [Inventory Service (port 8083)](#4-inventory-service-port-8083)
5. [Orders Service (port 8084)](#5-orders-service-port-8084)
6. [Payments Service (port 8085)](#6-payments-service-port-8085)
7. [Shipping Service (port 8086)](#7-shipping-service-port-8086)
8. [Integration notes and known discrepancies](#8-integration-notes-and-known-discrepancies)

> Note on numbering: Section 1 is the global overview; Sections 2 to 7 are the six microservices; Section 8 contains the integration notes.

---

## 1. Global overview and conventions

### 1.1 Services at a glance

| # | Service | Port | Responsible | Language / Framework | Database (owned by the service) |
|---|---|---|---|---|---|
| 1 | Auth | 8081 | `[Member name]` | JavaScript, Node.js, Express, bcryptjs, JWT | `auth.db` (SQLite, `better-sqlite3`) |
| 2 | Catalog | 8082 | `[Member name]` | Java 17, Spring Boot 3.4.5, JdbcTemplate | `data/catalog.db` (SQLite) |
| 3 | Inventory | 8083 | `[Member name]` | JavaScript, Node.js, Express | `db/inventory.db` (SQLite, `better-sqlite3`) |
| 4 | Orders | 8084 | `[Member name]` | JavaScript, Node.js, Express | `data/orders.db` (SQLite, `better-sqlite3`) |
| 5 | Payments | 8085 | `[Member name]` | Java 17, Jakarta EE 10 (JAX-RS, CDI), Payara Micro | `data/payments.db` (SQLite, JDBC) |
| 6 | Shipping | 8086 | `[Member name]` | JavaScript, Node.js, Express 5, helmet, JWT | `shipping.db` (SQLite, `sqlite3`) |

Frontend (provided by the professor): React + Vite + MUI, `http://localhost:5173`.

### 1.2 Base URLs

All services are called on `http://localhost:<port>`. There is no API gateway; the frontend calls each service directly (see `src/config/backend.js`).

| Service | Base URL |
|---|---|
| Auth | `http://localhost:8081` |
| Catalog | `http://localhost:8082` |
| Inventory | `http://localhost:8083` |
| Orders | `http://localhost:8084` |
| Payments | `http://localhost:8085` |
| Shipping | `http://localhost:8086` |

### 1.3 General conventions

- **Format**: requests and responses use JSON (`Content-Type: application/json`), UTF-8.
- **Error body**: the frontend (`apiClient.js`) reads the field **`message`** of the JSON error body. All services return it:
  - Auth, Inventory, Orders, Payments, Shipping: `{ "message": "..." }`
  - Catalog: `{ "status": 404, "error": "Not Found", "message": "..." }` (contains `message` too).
- **Authentication**: the Auth service issues a **JWT** (HS256, 2 h). The frontend sends it on every request as `Authorization: Bearer <token>`. Only **Auth** (`/me`) and **Shipping** (all `/api/shipments*` routes) verify it; the other services do not require it (see Section 8).
- **Database ownership**: each service is the only owner of its database. Services never read another service's database; they communicate only through REST. `userId`, `productId` and `orderId` are references across service boundaries (no cross-database foreign keys).
- **CORS**: each service allows the Vite frontend origin `http://localhost:5173` (configurable per service).
- **Health checks**: Inventory, Orders and Shipping expose `GET /health`.
- **Dates**: ISO 8601 UTC strings (e.g. `2026-11-08T12:23:26.257Z`).
- **Money**: numbers, in MAD.

### 1.4 State machines (shared business rules)

**Order status** (owned by Orders)

```
PENDING_PAYMENT ──► PAID ──► SHIPPED ──► DELIVERED
      │               │
      └──► CANCELLED ◄┘        (cancellation only from PENDING_PAYMENT or PAID)
```

**Shipment status** (owned by Shipping)

```
PREPARING ──► SHIPPED ──► IN_TRANSIT ──► DELIVERED        (CANCELLED exists in the schema)
```

**Payment status** (owned by Payments): `SUCCESS`, `FAILED`, `PENDING`, `REFUNDED`.

### 1.5 Service-to-service communication map

| Caller | Callee | Request | Purpose |
|---|---|---|---|
| Inventory | Catalog | `GET /products/{id}` | Check that a product exists before creating its stock row |
| Orders | Catalog | `GET /products/{id}` | Get the **authoritative name and price** of each item (the frontend's prices are never trusted) |
| Orders | Inventory | `POST /api/inventory/reserve` | Atomic stock reservation when an order is created |
| Orders | Inventory | `POST /api/inventory/release` | Release the stock when an order is cancelled |
| Orders | Shipping | `GET /api/shipments/order/{orderId}` | Refuse the cancellation if the parcel has already left |
| Orders | Shipping | `PATCH /api/shipments/{id}/status` | Cancel the shipment when the order is cancelled (best effort) |
| Payments | Orders | `GET /api/orders/{id}` | Read the order's `status` and `total` |
| Payments | Orders | `PATCH /api/orders/{id}/status` | Set the order to `PAID` after a successful payment |
| Shipping | Orders | `GET /api/orders/{id}` | Check the order is `PAID`, copy the customer address, get `userId` |
| Shipping | Orders | `PATCH /api/orders/{id}/status` | Set the order to `SHIPPED` / `DELIVERED` |
| Auth | none | none | Supplier only. Shipping validates JWTs locally with the shared `JWT_SECRET` |

### 1.6 Checkout flow (frontend → backend)

1. `POST /api/inventory/check` (Inventory): quick availability check.
2. `POST /api/orders` (Orders): reads price from Catalog, reserves stock in Inventory, stores the order as `PENDING_PAYMENT`.
3. `POST /api/payments` (Payments): reads the order in Orders, stores the payment, sets the order to `PAID`.
4. `POST /api/shipments` (Shipping): reads the order in Orders (must be `PAID`), creates the shipment as `PREPARING`.

---

## 2. Auth Service (port 8081)

| | |
|---|---|
| **Responsible** | `[Member name]` |
| **Technology** | Node.js, Express, SQLite (`better-sqlite3`), `bcryptjs`, `jsonwebtoken`, `dotenv`, `cors` |
| **Responsibility** | Registration, login, logout, identity of the current user |
| **Calls other services** | None (supplier) |
| **Start** | `npm install`, create `.env` (see below), `node server.js` |

**Environment variables**

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8081` | Listening port |
| `JWT_SECRET` | none, **required** | Token signing secret (the service exits if missing). **Shipping must use the same value** |
| `JWT_EXPIRES_IN` | `2h` | Token lifetime |
| `FRONTEND_URL` | `http://localhost:5173` | Allowed CORS origin |
| `DB_FILE` | `auth.db` | SQLite file |

**Demo account** (created automatically at first start): `demo@msoa.shop` / `demo123`, id `user-1`, role `CUSTOMER`.

**JWT payload**: `{ "sub": "<user id>", "email": "...", "role": "CUSTOMER", "iat": ..., "exp": ... }` (see the note in Section 8 about the `sub` / `id` claim).

**User object** (returned everywhere, never contains the password hash):

```json
{ "id": "user-1", "name": "Demo Customer", "email": "demo@msoa.shop", "role": "CUSTOMER" }
```

### 2.1 `POST /api/auth/register`

Creates a new account. **Does not return a token**: the frontend logs in afterwards.

**Request body**

```json
{ "name": "Jane Doe", "email": "jane@example.com", "password": "secret123" }
```

Rules: `name` and `email` are trimmed (the email is also lower-cased) and must not be empty; the email must match a basic syntax check; the password must be 6 to 72 characters (72 **bytes** max, bcrypt limit).

**Responses**

| Status | Body | When |
|---|---|---|
| **201 Created** | `{ "user": { "id": "user-1a2b3c4d", "name": "Jane Doe", "email": "jane@example.com", "role": "CUSTOMER" } }` | Account created |
| **400 Bad Request** | `{ "message": "Nom, email et mot de passe requis" }` | A field is missing or is not a string |
| **400 Bad Request** | `{ "message": "Nom, email et mot de passe ne doivent pas être vides" }` | A field is empty after trimming |
| **400 Bad Request** | `{ "message": "Format d'email invalide" }` | Invalid email syntax |
| **400 Bad Request** | `{ "message": "Mot de passe invalide (entre 6 et 72 caractères)" }` | Password too short or too long |
| **409 Conflict** | `{ "message": "Email déjà utilisé" }` | Email already registered |

### 2.2 `POST /api/auth/login`

**Request body**

```json
{ "email": "demo@msoa.shop", "password": "demo123" }
```

**Responses**

| Status | Body | When |
|---|---|---|
| **200 OK** | `{ "user": { "id": "user-1", "name": "Demo Customer", "email": "demo@msoa.shop", "role": "CUSTOMER" }, "token": "<JWT>" }` | Valid credentials |
| **400 Bad Request** | `{ "message": "Email et mot de passe requis" }` | Missing / empty / non-string field |
| **401 Unauthorized** | `{ "message": "Email ou mot de passe incorrect" }` | Unknown email **or** wrong password (same message on purpose, to avoid revealing which emails exist) |

### 2.3 `POST /api/auth/logout`

Revokes the presented token (stored in an in-memory revocation list). Header `Authorization: Bearer <token>` is optional.

**Request body**: none.

| Status | Body | When |
|---|---|---|
| **200 OK** | `{ "success": true }` | Always (even without a token) |

### 2.4 `GET /api/auth/me`

Returns the currently authenticated user. Used by the frontend to restore the session.

**Headers**: `Authorization: Bearer <token>` (required)

| Status | Body | When |
|---|---|---|
| **200 OK** | `{ "id": "user-1", "name": "Demo Customer", "email": "demo@msoa.shop", "role": "CUSTOMER" }` | Valid token. **The user object is returned directly, not wrapped in `{user}`** |
| **401 Unauthorized** | `{ "message": "Non authentifié" }` | Header missing, or token revoked by logout |
| **401 Unauthorized** | `{ "message": "Token invalide ou expiré" }` | Bad signature or expired token |
| **404 Not Found** | `{ "message": "Utilisateur introuvable" }` | The user in the token no longer exists |

**Other remarks**
- Malformed JSON bodies are not handled by a custom handler (Express default error response, not JSON).
- Revoked tokens are kept in memory only: they are forgotten when the service restarts.

---

## 3. Catalog Service (port 8082)

| | |
|---|---|
| **Responsible** | `[Member name]` |
| **Technology** | Java 17, Spring Boot 3.4.5 (Spring Web, JdbcTemplate), SQLite (`sqlite-jdbc`), Maven |
| **Responsibility** | Read-only access to the product catalog |
| **Calls other services** | None (supplier) |
| **Start** | From the project root: `./mvnw spring-boot:run` (Windows: `mvnw.cmd spring-boot:run`). Tests: `./mvnw test` |

**Configuration** (`application.properties`): `server.port=8082`, `spring.datasource.url=jdbc:sqlite:data/catalog.db` (relative path: start from the project root), `cors.allowed-origins=http://localhost:5173,http://localhost:8083`. CORS allows `GET`, `HEAD`, `OPTIONS` only (the service is read-only).

**Product object** (exactly these 6 fields):

```json
{
  "id": 1,
  "name": "ThinkPad Laptop",
  "category": "Electronics",
  "price": 8499.0,
  "image": "https://.../image.jpg",
  "description": "Business laptop"
}
```

There is **no stock field** in the catalog: the frontend gets the stock from Inventory.

**Error body format** (Spring `ApiError` record):

```json
{ "status": 404, "error": "Not Found", "message": "Product 999 not found" }
```

### 3.1 `GET /products`

Returns all products sorted by `id`.

| Status | Body | When |
|---|---|---|
| **200 OK** | `[ { Product }, { Product }, ... ]` (6 products in the seed data) | Always |
| **500 Internal Server Error** | `{ "status": 500, "error": "Internal Server Error", "message": "An unexpected error occurred" }` | Unexpected error (e.g. database unavailable) |

### 3.2 `GET /products/{id}`

**Path parameter**: `id` (integer).

| Status | Body | When |
|---|---|---|
| **200 OK** | `{ Product }` | Product found |
| **400 Bad Request** | `{ "status": 400, "error": "Bad Request", "message": "Invalid value for parameter 'id': abc" }` | `id` is not numeric |
| **404 Not Found** | `{ "status": 404, "error": "Not Found", "message": "Product 999 not found" }` | Unknown product |
| **500 Internal Server Error** | `{ "status": 500, "error": "Internal Server Error", "message": "An unexpected error occurred" }` | Unexpected error |

**Other remarks**
- The `image` field contains external URLs (set by `update-images.sql`), so an Internet connection is needed to display them.
- If the database is rebuilt: run `schema.sql`, `seed.sql`, then `update-images.sql` on a **new** database file.
- Unknown routes are caught by the global `Exception` handler and may return `500` instead of `404` (see Section 8).

---

## 4. Inventory Service (port 8083)

| | |
|---|---|
| **Responsible** | `[Member name]` |
| **Technology** | Node.js, Express 5, SQLite (`better-sqlite3`, WAL mode), `cors`, `dotenv` |
| **Responsibility** | Stock levels, availability check, **atomic** reservation and release |
| **Calls other services** | Catalog (`GET /products/{id}`) |
| **Start** | `npm install`, `npm start` (`node src/server.js`) |

**Environment variables**

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8083` | Listening port |
| `FRONTEND_URL` | `http://localhost:5173` | Allowed CORS origin |
| `ORDERS_SERVICE_URL` | `http://localhost:8084` | Second allowed CORS origin |
| `CATALOG_SERVICE_URL` | `http://localhost:8082` | Catalog base URL |
| `DB_FILE` | `db/inventory.db` | SQLite file |

**Seed stock**: product 1 → 12, 2 → 25, 3 → 15, 4 → 18, 5 → 8, 6 → 20.

**Items format** (shared by `check`, `reserve`, `release`):

```json
{ "items": [ { "productId": 1, "quantity": 2 }, { "productId": 3, "quantity": 1 } ] }
```

`items` must be a non-empty array; `productId` and `quantity` must be positive integers. Duplicate `productId`s in the same request are **merged** (quantities added).

**Lazy initialisation**: if a product is not in the `stock` table, Inventory asks Catalog whether it exists; if it does, a stock row with quantity `0` is created. If Catalog answers 404, the product is unknown.

**Common error responses** (all endpoints)

| Status | Body | When |
|---|---|---|
| **503 Service Unavailable** | `{ "message": "Catalog service unavailable" }` | Catalog cannot be reached (only when the product is not yet in the stock table) |
| **500 Internal Server Error** | `{ "message": "Internal server error." }` | Unexpected error |
| **400 Bad Request** | `{ "message": "Invalid JSON body." }` | Malformed JSON |
| **403 Forbidden** | `{ "message": "Origin not allowed." }` | Browser request from a non-allowed origin |

### 4.1 `GET /health`

| Status | Body |
|---|---|
| **200 OK** | `{ "status": "UP", "service": "inventory" }` |

### 4.2 `GET /api/inventory/{productId}`

Current stock of one product. Used by the frontend product page.

| Status | Body | When |
|---|---|---|
| **200 OK** | `{ "productId": 1, "stock": 12 }` | Known product |
| **400 Bad Request** | `{ "message": "Invalid productId." }` | `productId` is not an integer |
| **404 Not Found** | `{ "message": "Unknown product: 999" }` | Product does not exist in Catalog |
| **503** | see common errors | Catalog unreachable |

### 4.3 `POST /api/inventory/check`

Checks that **every** requested quantity is available. Does not modify any stock.

**Request body**: items format above.

| Status | Body | When |
|---|---|---|
| **200 OK** | `{ "available": true }` | All items are available |
| **200 OK** | `{ "available": false }` | At least one item has insufficient stock **or is an unknown product** (no 404 here) |
| **400 Bad Request** | `{ "message": "items must be a non-empty array." }` | `items` missing / empty / not an array |
| **400 Bad Request** | `{ "message": "Invalid productId." }` | Invalid product id |
| **400 Bad Request** | `{ "message": "Invalid quantity for product 1." }` | Quantity is not a positive integer |
| **503** | see common errors | Catalog unreachable |

### 4.4 `POST /api/inventory/reserve`

**Atomic** reservation (single SQL transaction): if one item cannot be reserved, **no stock is modified**.

**Request body**: items format above.

| Status | Body | When |
|---|---|---|
| **200 OK** | `{ "success": true }` | All items reserved, stock decremented |
| **400 Bad Request** | `{ "message": "items must be a non-empty array." }` / `"Invalid productId."` / `"Invalid quantity for product X."` | Invalid body |
| **404 Not Found** | `{ "message": "Unknown product: 999" }` | A product does not exist |
| **409 Conflict** | `{ "message": "Insufficient stock for product 1." }` | Not enough stock (nothing is reserved) |
| **503** | see common errors | Catalog unreachable |

### 4.5 `POST /api/inventory/release`

Gives stock back (used when an order is cancelled).

**Request body**: items format above.

| Status | Body | When |
|---|---|---|
| **200 OK** | `{ "success": true }` | Stock incremented |
| **400 Bad Request** | same messages as `reserve` | Invalid body |
| **404 Not Found** | `{ "message": "Unknown product: 999" }` | A product does not exist |
| **503** | see common errors | Catalog unreachable |

**Other remarks**
- These endpoints are **not authenticated** (they are called by Orders and by the frontend).
- Stock rows have a `CHECK(quantity >= 0)` constraint in the database, a second protection against overselling.

---

## 5. Orders Service (port 8084)

| | |
|---|---|
| **Responsible** | `[Member name]` |
| **Technology** | Node.js, Express 4, SQLite (`better-sqlite3`, WAL), `cors`, `dotenv`; native `node:test` tests |
| **Responsibility** | Order creation, order history, status transitions, cancellation. Orchestrates Catalog, Inventory and Shipping |
| **Calls other services** | Catalog, Inventory, Shipping |
| **Called by** | Frontend, Payments (`PATCH` status), Shipping (`GET` order, `PATCH` status) |
| **Start** | `npm install`, `npm start`. Tests: `npm test` (no other service required) |

**Environment variables** (`.env`)

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8084` | Listening port |
| `DB_PATH` | `./data/orders.db` | SQLite file (created automatically, `:memory:` allowed) |
| `FRONTEND_ORIGIN` | `http://localhost:5173` | CORS origin |
| `HTTP_TIMEOUT_MS` | `3000` | Timeout for calls to other services |
| `CATALOG_MODE` / `CATALOG_URL` | `stub` / `http://localhost:8082` | `stub` = hardcoded products, `rest` = call Catalog |
| `INVENTORY_MODE` / `INVENTORY_URL` | `stub` / `http://localhost:8083` | `stub` = in-memory stock, `rest` = call Inventory |
| `SHIPPING_MODE` / `SHIPPING_URL` | `stub` / `http://localhost:8086` | `stub` = no shipment, `rest` = call Shipping |

> **For the real integrated system, the three `*_MODE` variables must be set to `rest`.** In `stub` mode, Orders uses simulated data and never contacts the other services.

**Order object**

```json
{
  "id": "5b3f2a1e-7c1d-4f08-9d0a-2f6c0f3e9a11",
  "userId": "user-1",
  "customer": { "name": "Demo Customer", "address": "123 Main Street", "city": "Casablanca" },
  "items": [
    { "productId": 1, "name": "ThinkPad Laptop", "price": 8499, "quantity": 2 }
  ],
  "total": 16998,
  "status": "PENDING_PAYMENT",
  "createdAt": "2026-11-12T10:15:30.123Z"
}
```

`name`, `price` and `total` are **computed by the server** from Catalog; values sent by the client are ignored.

**Common error responses** (all endpoints)

| Status | Body | When |
|---|---|---|
| **404 Not Found** | `{ "message": "Route introuvable." }` | Unknown route |
| **400 Bad Request** | `{ "message": "JSON invalide." }` | Malformed JSON |
| **500 Internal Server Error** | `{ "message": "Erreur interne du serveur." }` | Unexpected error |

### 5.1 `GET /health`

| Status | Body |
|---|---|
| **200 OK** | `{ "service": "orders", "status": "UP" }` |

### 5.2 `GET /api/orders?userId={userId}`

Orders of one user, newest first.

**Query parameter**: `userId` (required).

| Status | Body | When |
|---|---|---|
| **200 OK** | `[ { Order }, ... ]` (empty array if none) | OK |
| **400 Bad Request** | `{ "message": "Le paramètre userId est obligatoire." }` | `userId` missing or empty |

### 5.3 `GET /api/orders/{id}`

| Status | Body | When |
|---|---|---|
| **200 OK** | `{ Order }` | Found |
| **404 Not Found** | `{ "message": "Order not found." }` | Unknown order |

### 5.4 `POST /api/orders`

Creates an order. Steps: validate, get each product from Catalog (name, price), **atomically reserve** the stock in Inventory, store the order as `PENDING_PAYMENT`. If saving fails after the reservation, the stock is released (compensation).

**Request body**

```json
{
  "userId": "user-1",
  "customer": { "name": "Demo Customer", "address": "123 Main Street", "city": "Casablanca" },
  "items": [ { "productId": 1, "quantity": 2 } ]
}
```

Duplicate `productId`s are merged.

| Status | Body | When |
|---|---|---|
| **201 Created** | `{ Order }` with `status: "PENDING_PAYMENT"` | Order created, stock reserved |
| **400 Bad Request** | `{ "message": "Corps de requête invalide." }` | Body is not an object |
| **400 Bad Request** | `{ "message": "userId est obligatoire." }` | Missing / empty `userId` |
| **400 Bad Request** | `{ "message": "customer.name, customer.address et customer.city sont obligatoires." }` | Missing customer field |
| **400 Bad Request** | `{ "message": "Cannot create an empty order." }` | `items` missing or empty |
| **400 Bad Request** | `{ "message": "productId invalide." }` | Invalid product id |
| **400 Bad Request** | `{ "message": "quantity doit être un entier positif." }` | Invalid quantity |
| **404 Not Found** | `{ "message": "Unknown product: 999" }` | Product unknown to Catalog |
| **409 Conflict** | `{ "message": "Insufficient stock." }` (or the message returned by Inventory) | Stock insufficient. **Nothing is created and no stock is changed** |
| **502 Bad Gateway** | `{ "message": "Erreur du service Catalog" }` / `"Erreur du service Inventory"` | Unexpected answer from a dependency |
| **503 Service Unavailable** | `{ "message": "Service injoignable : http://localhost:8083" }` | A dependency is unreachable or timed out |

### 5.5 `PATCH /api/orders/{id}/status`

Changes the business status of an order. Called by **Payments** (`PAID`) and **Shipping / frontend** (`SHIPPED`, `DELIVERED`). **Idempotent**: setting the status the order already has returns `200` with the unchanged order.

**Request body**

```json
{ "status": "PAID" }
```

Accepted values here: `PAID`, `SHIPPED`, `DELIVERED`. Allowed transitions: `PENDING_PAYMENT → PAID`, `PAID → SHIPPED`, `SHIPPED → DELIVERED`. Cancellation must use `POST /cancel`.

| Status | Body | When |
|---|---|---|
| **200 OK** | `{ Order }` with the new status | Transition done (or already in that status) |
| **400 Bad Request** | `{ "message": "Statut invalide : BIDON" }` | Value not in the 5 known statuses |
| **400 Bad Request** | `{ "message": "Utilisez POST /api/orders/{id}/cancel pour annuler (libération du stock)." }` | `status` is `CANCELLED` |
| **404 Not Found** | `{ "message": "Order not found." }` | Unknown order |
| **409 Conflict** | `{ "message": "Invalid transition: PENDING_PAYMENT → SHIPPED" }` | Transition not allowed |
| **409 Conflict** | `{ "message": "La commande a été modifiée entre-temps, réessayez." }` | Concurrent modification (conditional update failed) |

### 5.6 `POST /api/orders/{id}/cancel`

Cancels an order and **releases the stock**. Allowed only from `PENDING_PAYMENT` or `PAID`, and only if no parcel has left (no shipment, or shipment in `PREPARING` / `CANCELLED`). The `Authorization` header received is forwarded to Shipping.

**Request body**: none.

| Status | Body | When |
|---|---|---|
| **200 OK** | `{ Order }` with `status: "CANCELLED"` | Cancelled, stock restored |
| **404 Not Found** | `{ "message": "Order not found." }` | Unknown order |
| **409 Conflict** | `{ "message": "This order cannot be cancelled." }` | Status is `SHIPPED`, `DELIVERED` or already `CANCELLED` (double cancel is refused, stock is not released twice) |
| **409 Conflict** | `{ "message": "Cannot cancel an order that has already been shipped." }` | Shipment exists and is `SHIPPED`, `IN_TRANSIT` or `DELIVERED` |
| **502 Bad Gateway** | `{ "message": "Impossible de libérer le stock" }` / `"Erreur du service Shipping"` | Inventory / Shipping error. If the stock release fails, the order status is **rolled back** to its previous value |
| **503 Service Unavailable** | `{ "message": "Service injoignable : <url>" }` | Inventory or Shipping unreachable |

After a successful cancellation, if the shipment was `PREPARING`, Orders tries to cancel it in Shipping (best effort: a failure is only logged, the order stays `CANCELLED`).

**Other remarks**
- Orders does **not verify the JWT**: `userId` is taken from the request body / query string (see Section 8).
- The order and its lines are saved in **one SQL transaction**.

---

## 6. Payments Service (port 8085)

| | |
|---|---|
| **Responsible** | `[Member name]` |
| **Technology** | Java 17, Jakarta EE 10 (JAX-RS, CDI, JSON-P), Payara Micro 6, SQLite (plain JDBC), MicroProfile Config, Maven (WAR) |
| **Responsibility** | Simulated payments; marks the order as `PAID` |
| **Calls other services** | Orders (`GET` order, `PATCH` status) |
| **Start** | `mvn clean package`, then run with Payara Micro on port `8085` |

**Base URL**: the WAR is deployed at context root `/` (`glassfish-web.xml`) and JAX-RS is mounted on `/api`, so the endpoints are `http://localhost:8085/api/payments...` (this is the URL the frontend uses).

**Configuration** (`META-INF/microprofile-config.properties`)

| Key | Default | Description |
|---|---|---|
| `db.url` | `jdbc:sqlite:data/payments.db` | SQLite file; the `payments` table is created automatically |
| `frontend.url` | `http://localhost:5173` | Value of `Access-Control-Allow-Origin` |
| `orders.service.url` | `http://localhost:8084/api/orders` | Orders base URL **including** `/api/orders` |

**Payment object**

```json
{
  "id": "pay-57ec47bd",
  "orderId": "5b3f2a1e-7c1d-4f08-9d0a-2f6c0f3e9a11",
  "amount": 16998.0,
  "method": "CARD",
  "status": "SUCCESS",
  "createdAt": "2026-11-12T10:16:02.257Z"
}
```

**Error body**: `{ "message": "..." }`.

### 6.1 `GET /api/payments`

| Status | Body | When |
|---|---|---|
| **200 OK** | `[ { Payment }, ... ]` (empty array if none) | Always |

### 6.2 `GET /api/payments/order/{orderId}`

| Status | Body | When |
|---|---|---|
| **200 OK** | `{ Payment }` | A payment exists for this order |
| **404 Not Found** | `{ "message": "Payment not found for order <orderId>" }` | No payment for this order |

### 6.3 `POST /api/payments`

Simulated payment of an order. Steps:

1. Validate the request.
2. `GET` the order from Orders; it must be `PENDING_PAYMENT`.
3. Save the payment with `status = SUCCESS`. **The `amount` is the `total` of the order read from Orders** (any `amount` sent by the client is ignored).
4. `PATCH` the order to `PAID` in Orders. If this fails, the payment is marked `FAILED`.

**Request body**

```json
{ "orderId": "5b3f2a1e-7c1d-4f08-9d0a-2f6c0f3e9a11", "method": "CARD" }
```

`method`: `CARD` or `CASH` (case-insensitive; defaults to `CARD` if omitted).

| Status | Body | When |
|---|---|---|
| **201 Created** | `{ Payment }` with `status: "SUCCESS"` | Payment saved and order set to `PAID` |
| **400 Bad Request** | `{ "message": "orderId is required" }` | `orderId` missing or blank |
| **400 Bad Request** | `{ "message": "Invalid payment method" }` | Method not `CARD` / `CASH` |
| **404 Not Found** | `{ "message": "Order not found" }` | Orders answered 404 |
| **409 Conflict** | `{ "message": "Order is not awaiting payment (status: PAID)" }` | Order status is not `PENDING_PAYMENT` |
| **502 Bad Gateway** | `{ "message": "Orders service error" }` | Orders answered something other than 200 / 404 |
| **502 Bad Gateway** | `{ "message": "Could not update order to PAID. Payment marked FAILED." }` | Payment saved but Orders refused the `PAID` update (payment is stored as `FAILED`) |
| **500 Internal Server Error** | `{ "message": "Internal error: <details>" }` | Unexpected error, **including Orders being unreachable** |

**Idempotence / retry**: there is a `UNIQUE` constraint on `order_id` (one payment per order). If a payment already exists for the order, it is returned instead of creating a second one; a `FAILED` payment is switched back to `SUCCESS` on retry. A new attempt on an order already `PAID` is refused by the status check (`409`).

**Other remarks**
- CORS: the service sends `Access-Control-Allow-Origin: <frontend.url>` and allows `GET, POST, PUT, DELETE, OPTIONS, PATCH` with headers `origin, content-type, accept, authorization`.
- The endpoints are **not authenticated** (see Section 8 about the README of this service).

---

## 7. Shipping Service (port 8086)

| | |
|---|---|
| **Responsible** | `[Member name]` |
| **Technology** | Node.js, Express 5, SQLite (`sqlite3`, WAL), `helmet`, `cors`, `jsonwebtoken`, `dotenv`; native `node:test` tests |
| **Responsibility** | Shipments, tracking numbers, delivery-status transitions kept consistent with the order |
| **Calls other services** | Orders (`GET` order, `PATCH` status) |
| **Called by** | Frontend, Orders (cancellation checks) |
| **Start** | `npm install`, create `.env`, `npm start`. Tests: `npm test` |

**Environment variables**

| Variable | Default | Description |
|---|---|---|
| `JWT_SECRET` | none, **required** (≥ 32 characters, otherwise the service refuses to start) | **Must be identical to the Auth service secret**, and therefore ≥ 32 characters too |
| `PORT` | `8086` | Listening port |
| `HOST` | `0.0.0.0` | Listening address |
| `ORDERS_URL` | `http://localhost:8084` | Orders base URL |
| `FRONTEND_ORIGIN` | `http://localhost:5173,http://127.0.0.1:5173` | Comma-separated CORS origins |

Timeout for calls to Orders: 5 s. JSON body limit: 10 kb.

**Authentication**: **all** `/api/shipments*` endpoints require `Authorization: Bearer <JWT>` signed by Auth (HS256). A user with role `ADMIN` can access every shipment; other users only see the shipments of orders they own.

**Shipment object**

```json
{
  "id": "shipment-0b1c6a52-3f4e-4c9a-8e7d-1a2b3c4d5e6f",
  "orderId": "5b3f2a1e-7c1d-4f08-9d0a-2f6c0f3e9a11",
  "address": { "name": "Demo Customer", "address": "123 Main Street", "city": "Casablanca" },
  "trackingNumber": "MSOA-9F3A1C7B20DE",
  "status": "PREPARING",
  "createdAt": "2026-11-12T10:16:05.000Z",
  "updatedAt": "2026-11-12T10:16:05.000Z"
}
```

`trackingNumber` format: `MSOA-` followed by 12 uppercase hexadecimal characters. `status` is one of `PREPARING`, `SHIPPED`, `IN_TRANSIT`, `DELIVERED`, `CANCELLED`.

**Authentication errors** (all `/api/shipments*` endpoints)

| Status | Body | When |
|---|---|---|
| **401 Unauthorized** | `{ "message": "Unauthorized" }` | Header missing or not `Bearer <token>` |
| **401 Unauthorized** | `{ "message": "Invalid or expired token" }` | Bad signature or expired token |

**Other errors** (all endpoints)

| Status | Body | When |
|---|---|---|
| **400 Bad Request** | `{ "message": "Malformed JSON body." }` | Malformed JSON |
| **413 Payload Too Large** | `{ "message": "Payload too large." }` | Body above 10 kb |
| **404 Not Found** | `{ "message": "Not found" }` | Unknown route |
| **500 Internal Server Error** | `{ "message": "Internal server error" }` | Unexpected error |

### 7.1 `GET /health`

| Status | Body |
|---|---|
| **200 OK** | `{ "status": "ok", "service": "shipping" }` |

### 7.2 `GET /api/shipments`

Lists shipments (maximum 500, newest first): all of them for an `ADMIN`, only the caller's own shipments otherwise.

| Status | Body | When |
|---|---|---|
| **200 OK** | `[ { Shipment }, ... ]` (empty array if none) | Valid token |
| **401** | see authentication errors | |

### 7.3 `GET /api/shipments/order/{orderId}`

Shipment of one order. Used by the frontend tracking component (it treats `404` as "no shipment yet").

| Status | Body | When |
|---|---|---|
| **200 OK** | `{ Shipment }` | Found and the caller may access it |
| **404 Not Found** | `{ "message": "Shipment not found" }` | No shipment for this order, **or** the shipment belongs to another user (same answer on purpose) |
| **401** | see authentication errors | |

### 7.4 `POST /api/shipments`

Creates the shipment of a **paid** order. The delivery address and recipient are read **from the order** in Orders (the `address` object sent by the frontend is accepted but ignored). The caller's `Authorization` header is forwarded to Orders.

**Request body**

```json
{
  "orderId": "5b3f2a1e-7c1d-4f08-9d0a-2f6c0f3e9a11",
  "address": { "name": "Demo Customer", "address": "123 Main Street", "city": "Casablanca" }
}
```

Only `orderId` is used.

| Status | Body | When |
|---|---|---|
| **201 Created** | `{ Shipment }` with `status: "PREPARING"` | Shipment created |
| **400 Bad Request** | `{ "message": "orderId is required" }` | `orderId` missing, not a string, or longer than 100 chars |
| **400 Bad Request** | `{ "message": "Cannot ship order in status: PENDING_PAYMENT" }` | Order is not `PAID` |
| **404 Not Found** | `{ "message": "Order not found" }` | Orders did not return the order |
| **409 Conflict** | `{ "message": "Shipment already exists for this order" }` | A shipment already exists (unique `order_id`) |
| **502 Bad Gateway** | `{ "message": "Upstream service unavailable" }` | Orders unreachable / timeout |
| **401** | see authentication errors | |

### 7.5 `PATCH /api/shipments/{id}/status`

Moves the shipment to the next delivery status. Allowed transitions only: `PREPARING → SHIPPED → IN_TRANSIT → DELIVERED`.

For `SHIPPED` and `DELIVERED`, Shipping **also updates the order** in Orders (`PATCH /api/orders/{orderId}/status`). If that update fails, the shipment change is **rolled back**. The update is a compare-and-set on the previous status (protection against concurrent updates).

**Request body**

```json
{ "status": "SHIPPED" }
```

| Status | Body | When |
|---|---|---|
| **200 OK** | `{ Shipment }` with the new status and updated `updatedAt` | Transition done (and order synchronised if needed) |
| **400 Bad Request** | `{ "message": "Invalid transition: PREPARING → DELIVERED" }` | Transition not allowed, or `status` missing / not a string |
| **404 Not Found** | `{ "message": "Shipment not found" }` | Unknown shipment, or not accessible to the caller |
| **409 Conflict** | `{ "message": "Shipment status changed concurrently, please retry" }` | Concurrent modification |
| **409 Conflict** | `{ "message": "Failed to sync status with Orders Service. Transition rolled back." }` | Orders answered `409` (e.g. invalid order transition); shipment rolled back |
| **502 Bad Gateway** | `{ "message": "Failed to sync status with Orders Service. Transition rolled back." }` | Orders unreachable or answered another error; shipment rolled back |
| **401** | see authentication errors | |

The `IN_TRANSIT` transition is **not** synchronised with Orders (the order stays `SHIPPED`).

---

## 8. Integration notes and known discrepancies

This section lists the points found when reading all six code bases together. They concern the **cooperation between services** and should be fixed or acknowledged before the final integration test.

### 8.1 Blocking issues

| # | Where | Issue | Suggested fix |
|---|---|---|---|
| 1 | **Auth ↔ Shipping** | Auth signs the token with the user id in the **`sub`** claim, but Shipping reads **`req.user.id`**. With real tokens `req.user.id` is `undefined`, so for non-admin users Shipping answers `404` on `GET /api/shipments/order/{id}`, an empty list on `GET /api/shipments`, and `404` on `PATCH .../status`. Shipping's own tests pass only because they sign tokens with `{ id: ... }`. | Add `id: u.id` to the payload in Auth's `signToken` (or read `sub` in Shipping). |
| 2 | **Auth ↔ Shipping** | The `JWT_SECRET` must be the same in both services and at least 32 characters (Shipping refuses to start otherwise). | Use one shared secret of ≥ 32 characters in both `.env` files. |
| 3 | **Orders** | In the provided snapshot, `src/clients/shippingClient.js` has no `require` statements for `HttpError` / `callJson` and no `module.exports`. `server.js` imports `createShippingClient` from it, so the service cannot start as provided. | Add `const { HttpError } = require("../errors"); const { callJson } = require("./http");` at the top and `module.exports = { createShippingClient };` at the bottom (as in the other two clients). |
| 4 | **Orders ↔ Shipping** | On cancellation Orders sends `PATCH /api/shipments/{id}/status` with `CANCELLED`, but Shipping's transition table does not allow `CANCELLED` (it answers `400`). The error is only logged by Orders, so the order becomes `CANCELLED` while its shipment stays `PREPARING`. | Allow `PREPARING → CANCELLED` in Shipping's `TRANSITIONS`. |
| 5 | **Orders configuration** | Orders defaults to `stub` mode for Catalog, Inventory and Shipping, in which it never contacts the real services. | Set `CATALOG_MODE=rest`, `INVENTORY_MODE=rest`, `SHIPPING_MODE=rest` in the Orders `.env`. |

### 8.2 Security limitations (to be aware of)

- **Orders, Inventory, Payments and Catalog do not verify the JWT.** The Orders service takes `userId` from the request body / query string, so the ownership of an order is not enforced server-side by Orders. Only Auth (`/me`) and Shipping validate tokens.
- Inventory `reserve` / `release` are open: any client can modify stock.
- Revoked tokens (logout) are kept in Auth's memory only; Shipping does not check revocation.
- Payment is a simulation: it always succeeds when the order is `PENDING_PAYMENT`; no card data is handled.

### 8.3 Documentation discrepancies

- **Payments README**: it mentions the URL `/payments-service/api/payments`, JPA/Hibernate, and an `X-API-KEY` filter (`ApiKeyFilter`). The code has **no** API-key filter, no JPA (plain JDBC), and the context root is `/` (`glassfish-web.xml`), so the real URL is `http://localhost:8085/api/payments`. This contract follows the code.
- **Payments README (idempotence)**: it says an existing payment is simply returned; in the code the order status check (`409`) is done first, so only a pending-payment order with an existing (e.g. `FAILED`) payment reaches that logic.
- **Catalog**: a catch-all `@ExceptionHandler(Exception.class)` may turn unmapped routes or unsupported HTTP methods into `500` instead of `404` / `405`.
- **Payments**: when Orders is unreachable, `POST /api/payments` returns `500` (not `502` / `503`).
- **Error languages**: Auth and Orders use French messages for validation errors, the other services use English. The frontend only displays `message`, so this has no functional impact.
- **Assignment README vs. implementation**: the `address` field of `POST /api/shipments` is accepted for compatibility with the frontend but ignored (the address of the order is used, which is more reliable).

### 8.4 Recommended start-up order

1. Auth (8081), Catalog (8082)
2. Inventory (8083, needs Catalog)
3. Shipping (8086), Orders (8084), Payments (8085) (Orders needs Catalog, Inventory and Shipping for `rest` mode; Payments and Shipping need Orders)
4. Frontend (`npm run dev`, port 5173) with all six entries of `BACKEND_MODE` set to `"rest"` in `src/config/backend.js`

### 8.5 Scenario checklist (assignment validation criteria)

| Scenario | Covered by |
|---|---|
| Products are displayed from Catalog | Catalog `GET /products` + Inventory `GET /api/inventory/{id}` |
| Inventory refuses any reservation above available stock | Inventory `reserve` → `409` |
| An order reserves the products | Orders `POST /api/orders` → Inventory `reserve` |
| A successful payment sets the order to `PAID` | Payments `POST /api/payments` → Orders `PATCH` status |
| An allowed cancellation restores the stock | Orders `POST /cancel` → Inventory `release` |
| A shipped order can no longer be cancelled | Orders `cancel` → `409` |
| Delivery tracking respects the allowed transitions | Shipping `PATCH .../status` (`400` on invalid transition) |
| Orders belong to the right user | Orders `GET /api/orders?userId=` (filtering only, see 8.2) |
| REST errors are returned and handled | All services return JSON `{ "message": ... }` |
