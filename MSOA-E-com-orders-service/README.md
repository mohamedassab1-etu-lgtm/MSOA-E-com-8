# Order Service (port 8084)

Microservice « Orders » du TP MSOA. Node.js + Express + SQLite (better-sqlite3).

## Lancement
```bash
npm install
npm start        # http://localhost:8084  (le fichier .env est déjà fourni)
npm test         # 8 tests, aucun autre service requis
```

## Brancher le frontend
Dans `src/config/backend.js` du frontend : `ORDERS: "rest"`.

## Modes stub / rest (fichier .env)
| Variable | stub (défaut) | rest |
|---|---|---|
| CATALOG_MODE | prix/noms en dur (= products.js) | GET {CATALOG_URL}/products/{id} |
| INVENTORY_MODE | stock en mémoire | POST {INVENTORY_URL}/api/inventory/reserve et /release |
| SHIPPING_MODE | aucune expédition | GET {SHIPPING_URL}/api/shipments/order/{id} |

Quand un collègue a fini son service : mettre `..._MODE=rest`. Aucune ligne de code à modifier.

## Endpoints
| Méthode | Route | Rôle |
|---|---|---|
| GET | /api/orders?userId= | commandes d'un utilisateur |
| GET | /api/orders/{id} | une commande (404 sinon) |
| POST | /api/orders | crée la commande, réserve le stock (409 si insuffisant) |
| PATCH | /api/orders/{id}/status | PAID / SHIPPED / DELIVERED (appelé par Payments et Shipping) |
| POST | /api/orders/{id}/cancel | annule + libère le stock |

Erreurs : `{ "message": "..." }` avec 400 / 404 / 409 / 502 / 503.

## Ce que les autres services doivent appeler chez toi
- Payments, après un paiement SUCCESS : `PATCH /api/orders/{orderId}/status` avec `{"status":"PAID"}`
- Shipping (SHIPPED puis DELIVERED) : `PATCH /api/orders/{orderId}/status`
