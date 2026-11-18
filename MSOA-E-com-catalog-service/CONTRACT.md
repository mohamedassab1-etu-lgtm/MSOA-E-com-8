# Catalog Service: API Contract

> Module: Microservices Architecture (MSOA), Master in Data Science
> Service: **Catalog** (port **8082**)
> Responsible: `TALBI OUMAIMA`

---

## 1. Service overview

| | |
|---|---|
| **Service** | Catalog |
| **Base URL** | `http://localhost:8082` |
| **Responsibility** | Read-only access to the product catalog (name, category, price, image, description). It is the **source of truth for product prices**. |
| **Technology** | Java 17, Spring Boot 3.4.5 (Spring Web, JdbcTemplate), SQLite (`sqlite-jdbc`), Maven |
| **Database (owned by the service)** | `data/catalog.db` (SQLite, table `products`) |
| **Called by** | Frontend (product list and details), Orders (`GET /products/{id}` to read the authoritative name and price), Inventory (`GET /products/{id}` to check that a product exists) |
| **Authentication** | None. The endpoints are public and read-only. |
| **Start** | From the project root: `./mvnw spring-boot:run` (Windows: `mvnw.cmd spring-boot:run`). Tests: `./mvnw test` |

**Configuration** (`application.properties`): `server.port=8082`, `spring.datasource.url=jdbc:sqlite:data/catalog.db` (relative path, so the service must be started from the project root).

---

## 2. Summary of the operations

| # | Operation | Method | Endpoint | Success code |
|---|---|---|---|---|
| 1 | List all products | `GET` | `/products` | `200 OK` |
| 2 | Get one product by id | `GET` | `/products/{id}` | `200 OK` |

The service is **read-only**: there is no `POST`, `PUT`, `PATCH` or `DELETE` operation.

---

## 3. Data schemas

### 3.1 Product object

| Field | Type | Required | Format / Description |
|---|---|---|---|
| `id` | integer | yes | Unique product identifier (e.g. `1`) |
| `name` | string | yes | Product name |
| `category` | string | yes | Product category (e.g. `Electronics`, `Accessories`) |
| `price` | number (decimal) | yes | Unit price in MAD, `>= 0` (e.g. `8499.0`) |
| `image` | string | yes | Absolute URL of the product image (external URL). Empty string `""` if none |
| `description` | string | yes | Short description. Empty string `""` if none |

The object contains **exactly these 6 fields**. There is no stock field: the stock belongs to the Inventory service.

```json
{
  "id": 1,
  "name": "ThinkPad Laptop",
  "category": "Electronics",
  "price": 8499.0,
  "image": "https://p1-ofp.static.pub//fes/cms/2023/07/25/atnjjqjt9tsbneiyamwbmu7ootzy0v438710.jpg",
  "description": "Business laptop"
}
```

### 3.2 Error object

All errors have the same JSON structure:

| Field | Type | Description |
|---|---|---|
| `status` | integer | HTTP status code (same as the response status) |
| `error` | string | Standard HTTP reason phrase (`Bad Request`, `Not Found`, `Internal Server Error`) |
| `message` | string | Human-readable explanation (the frontend displays this field) |

```json
{ "status": 404, "error": "Not Found", "message": "Product 999 not found" }
```

---

## 4. Common HTTP headers

| Header | Direction | Value | Required |
|---|---|---|---|
| `Content-Type` | Response | `application/json` (UTF-8). Sent with every response, success or error | Always returned |
| `Content-Type` | Request | `application/json` (by convention). The requests have **no body**, so the header is not needed | No |
| `Accept` | Request | `application/json` | Optional |
| `Authorization` | Request | Not used. The service does not check any token | No |
| `Origin` | Request | Sent by the browser. Must be an allowed origin for CORS (see Section 7) | Browser only |

---

## 5. Operations

### 5.1 `GET /products`

**Description**: returns the list of all products, sorted by `id` ascending.

**URL parameters**: none.
**Query parameters**: none.
**Request headers**: none required (optional: `Accept: application/json`).
**Request body**: none.

**Success response**

| Status | Body | When |
|---|---|---|
| **200 OK** | JSON array of Product objects (see 3.1). Empty array `[]` if the table is empty | Always |

Response schema: `Product[]` (array of objects with `id` integer, `name` string, `category` string, `price` number, `image` string, `description` string).

Example (shortened):

```json
[
  { "id": 1, "name": "ThinkPad Laptop", "category": "Electronics", "price": 8499.0, "image": "https://.../1.jpg", "description": "Business laptop" },
  { "id": 2, "name": "Wireless Mouse", "category": "Accessories", "price": 199.0, "image": "https://.../2.jpg", "description": "Wireless optical mouse" }
]
```

The seed data contains 6 products (ids 1 to 6).

**Error responses**

| Status | Body | When |
|---|---|---|
| **500 Internal Server Error** | `{ "status": 500, "error": "Internal Server Error", "message": "An unexpected error occurred" }` | Unexpected error (e.g. database unavailable). No stack trace is exposed |

**Example**

```shell
curl http://localhost:8082/products
```

---

### 5.2 `GET /products/{id}`

**Description**: returns one product identified by its id.

**URL parameters**

| Name | Location | Type | Required | Format / Constraint |
|---|---|---|---|---|
| `id` | Path | integer | yes | Numeric product id (e.g. `1`). Must be an integer |

**Query parameters**: none.
**Request headers**: none required (optional: `Accept: application/json`).
**Request body**: none.

**Success response**

| Status | Body | When |
|---|---|---|
| **200 OK** | One Product object (see 3.1) | The product exists |

Example:

```json
{
  "id": 1,
  "name": "ThinkPad Laptop",
  "category": "Electronics",
  "price": 8499.0,
  "image": "https://.../1.jpg",
  "description": "Business laptop"
}
```

**Error responses**

| Status | Body | When |
|---|---|---|
| **400 Bad Request** | `{ "status": 400, "error": "Bad Request", "message": "Invalid value for parameter 'id': abc" }` | `id` is not an integer (e.g. `/products/abc`) |
| **404 Not Found** | `{ "status": 404, "error": "Not Found", "message": "Product 999 not found" }` | No product with this id (the number in the message is the requested id) |
| **500 Internal Server Error** | `{ "status": 500, "error": "Internal Server Error", "message": "An unexpected error occurred" }` | Unexpected error |

**Examples**

```shell
curl http://localhost:8082/products/1     # 200
curl http://localhost:8082/products/999   # 404
curl http://localhost:8082/products/abc   # 400
```

---

## 6. Summary of HTTP status codes

| Code | Meaning | Used by |
|---|---|---|
| **200** | OK | `GET /products`, `GET /products/{id}` |
| **400** | Bad Request: invalid `id` (not an integer) | `GET /products/{id}` |
| **404** | Not Found: unknown product | `GET /products/{id}` |
| **500** | Internal Server Error: unexpected error | Both operations |

---

## 7. CORS

- The service allows cross-origin requests from the Vite frontend (`http://localhost:5173`, also `http://127.0.0.1:5173`); the allowed origins are configurable in the service.
- Allowed methods: `GET`, `HEAD`, `OPTIONS` (read-only service).
- Allowed headers: any (`*`).
- Browser preflight (`OPTIONS`) requests are answered automatically.

---

## 9. Notes and known limitations

- The `image` field contains **external URLs** (set by `update-images.sql`), so an Internet connection is needed to display the images.
- `data/catalog.db` is the database provided for the lab, with only the `image` column updated. If it is rebuilt, run `schema.sql`, `seed.sql`, then `update-images.sql` on a new database file.
- `price` is serialized as a decimal number (`8499.0`), which is the same value as `8499` for JSON consumers.
- Unknown routes or unsupported HTTP methods (e.g. `POST /products`) are caught by the global exception handler and may return `500` instead of `404` / `405`.
- The service does not verify any JWT: the endpoints are public and read-only.
