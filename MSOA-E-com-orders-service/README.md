# Orders Service — MSOA LAB 4

Microservice de gestion des commandes du projet e-commerce MSOA.

## 1. Technologies utilisées

- Node.js
- Express.js
- SQLite (better-sqlite3)
- gRPC
- Protocol Buffers
- @grpc/grpc-js
- @grpc/proto-loader
- Node.js Test Runner

## 2. Objectif du LAB 4

Implémenter une communication synchrone entre Orders Service et Inventory Service en utilisant gRPC.

Cette communication permet de consulter, vérifier, réserver et libérer le stock des produits.

Les API REST existantes d'Orders sont conservées.

## 3. Architecture

Orders Service joue le rôle de client gRPC.

Inventory Service joue le rôle de serveur gRPC.

Les deux microservices utilisent le même contrat Protocol Buffers : `proto/inventory.proto`.

La communication gRPC utilise HTTP/2 et le port 50051 par défaut.

## 4. Contrat gRPC commun

| RPC | Request | Response |
|---|---|---|
| GetStock | StockRequest | StockResponse |
| CheckAvailability | ItemsRequest | AvailabilityResponse |
| ReserveStock | ItemsRequest | OperationResponse |
| ReleaseStock | ItemsRequest | OperationResponse |

Le contrat permet de transmettre plusieurs produits dans une seule requête grâce à `repeated Item`.

Le client Orders convertit automatiquement les identifiants `productId` en `product_id`.

## 5. Installation

```bash
npm install
```

Sous PowerShell, créer le fichier `.env` s'il n'existe pas :

```powershell
Copy-Item .env.example .env
```

Démarrer Orders Service :

```bash
npm start
```

URL : http://localhost:8084

## 6. Modes de communication

| Service | Modes disponibles |
|---|---|
| Catalog | stub, rest |
| Inventory | stub, rest, grpc |
| Shipping | stub, rest |

Le mode stub permet de développer indépendamment des autres microservices.

Le mode rest conserve la communication HTTP existante.

Le mode grpc utilise les quatre méthodes RPC du contrat commun pour les opérations Inventory.

## 7. Configuration gRPC

Configurer le fichier `.env` :

```ini
CATALOG_MODE=stub
INVENTORY_MODE=grpc
SHIPPING_MODE=stub

INVENTORY_GRPC_ADDRESS=127.0.0.1:50051
INVENTORY_GRPC_TIMEOUT_MS=3000
```

Les autres paramètres sont documentés dans `.env.example`.

## 8. Processus de création d'une commande

1. Réception de la requête REST.
2. Validation des données.
3. Récupération des informations produits.
4. Vérification du panier via CheckAvailability.
5. Réservation atomique via ReserveStock.
6. Enregistrement dans SQLite.
7. Retour HTTP 201 avec le statut PENDING_PAYMENT.

Si le stock est insuffisant, la commande est refusée avec une erreur HTTP 409.

Si l'enregistrement de la commande échoue après la réservation, une compensation via ReleaseStock est tentée.

## 9. Processus d'annulation

Lors de l'annulation d'une commande, Orders utilise ReleaseStock pour restaurer les quantités réservées.

La commande annulée possède le statut CANCELLED.

## 10. Gestion des erreurs

| Situation | Code HTTP |
|---|---|
| Requête invalide | 400 |
| Produit inexistant (NOT_FOUND) | 404 |
| Stock insuffisant | 409 |
| Réservation refusée | 409 |
| Erreur de communication | 502 |
| Inventory indisponible | 503 |
| Timeout gRPC | 504 |

Le timeout par défaut est de 3000 ms.

Aucune répétition automatique des opérations de réservation et de libération n'est ajoutée, afin de limiter les risques de modification multiple du stock.

## 11. Mock Inventory

Un serveur simulé permet de tester Orders indépendamment du véritable Inventory Service.

Dans un premier terminal :

```bash
node scripts/mockInventoryGrpcServer.js
```

Le Mock expose :

- Serveur gRPC : 127.0.0.1:50051
- API REST de diagnostic : http://127.0.0.1:8083
- Consultation du stock : GET /api/inventory/stock

Dans un deuxième terminal :

```bash
npm start
```

Orders doit être configuré en mode grpc.

Le stock du Mock est conservé en mémoire et réinitialisé à chaque redémarrage.

## 12. Tests automatisés

Exécuter les tests gRPC :

```bash
node --test test/inventoryGrpc.test.js
```

Exécuter tous les tests :

```bash
npm test
```

La suite comprend 8 tests fonctionnels existants et 11 tests gRPC.

Les tests gRPC couvrent :

- Consultation du stock.
- Stock suffisant.
- Stock insuffisant.
- Vérification de plusieurs produits.
- Réservation.
- Libération.
- Réservation atomique refusée.
- Produit inexistant.
- Quantité invalide.
- Timeout.
- Serveur indisponible.

Les tests automatisés démarrent leur propre serveur gRPC sur un port dynamique.

## 13. Endpoints REST Orders

| Méthode | Route | Description |
|---|---|---|
| GET | /health | État du service |
| GET | /api/orders?userId= | Liste des commandes |
| GET | /api/orders/{id} | Consulter une commande |
| POST | /api/orders | Créer une commande |
| PATCH | /api/orders/{id}/status | Modifier le statut |
| POST | /api/orders/{id}/cancel | Annuler une commande |

Format des erreurs :

```json
{
    "message": "Error description"
}
```

## 14. Communication avec Payments et Shipping

Payments utilise l'endpoint PATCH /api/orders/{orderId}/status avec le statut PAID après un paiement réussi.

Shipping utilise le même endpoint avec les statuts SHIPPED et DELIVERED.

Ces communications REST existantes sont conservées.

## 15. Configuration du frontend

Dans `src/config/backend.js` :

```javascript
ORDERS: "rest"
```

## 16. Intégration avec le véritable Inventory Service

Les deux microservices doivent utiliser le même contrat `inventory.proto`.

Pour connecter Orders au véritable Inventory Service :

1. Arrêter le Mock Inventory.
2. Démarrer Inventory Service.
3. Configurer INVENTORY_GRPC_ADDRESS.
4. Activer INVENTORY_MODE=grpc.
5. Redémarrer Orders Service.
6. Exécuter les tests d'intégration.

Inventory doit garantir la réservation atomique des articles et respecter les comportements métier convenus pour les quatre RPC.

La compatibilité avec le véritable serveur reste à confirmer par des tests d'intégration.

## 17. Structure des fichiers gRPC

```text
MSOA-E-com-orders-service/
├── proto/
│   └── inventory.proto
├── scripts/
│   └── mockInventoryGrpcServer.js
├── src/
│   ├── clients/
│   │   ├── inventoryClient.js
│   │   └── inventoryGrpcClient.js
│   └── config.js
├── test/
│   └── inventoryGrpc.test.js
├── .env.example
├── .gitignore
├── package.json
├── package-lock.json
└── README.md
```

## 18. Limites et périmètre

Cette implémentation concerne exclusivement la communication gRPC côté Orders Service.

Le Mock Inventory est réservé aux tests et au développement.

La communication gRPC sans TLS est réservée à l'environnement local.

Le contrat actuel ne contient pas d'identifiant d'opération permettant de garantir l'idempotence des réservations et des libérations. Une interruption réseau pendant une opération de modification du stock peut donc rendre son résultat incertain.

Aucune implémentation Kafka ou RabbitMQ n'est incluse dans cette partie du LAB 4.