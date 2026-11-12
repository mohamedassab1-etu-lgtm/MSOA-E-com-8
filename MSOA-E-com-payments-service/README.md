# MSOA E-Commerce - Payments Service

Microservice de simulation et de gestion des paiements pour l'architecture microservices e-commerce.

---

## 🛠️ Stack Technique & Outils

* **Langage de programmation :** Java 17+ (ou version supportée par votre environnement)
* **Plateforme & Serveur d'applications :** Payara Micro (Jakarta EE)
* **Spécifications Web / API :** JAX-RS (Jakarta RESTful Web Services), CDI (Contexts and Dependency Injection)
* **Persistance & Base de données :** JPA / Hibernate avec base de données **SQLite**
* **Outil de Build :** Apache Maven
* **Client de Test :** Postman

---

## 🚀 Informations de Connexion & URL

* **Port par défaut :** `8085`
* **Context Path :** `/payments-service`
* **URL de base complète :** `http://localhost:8085/payments-service/api/payments`

---

## 📌 Endpoints de l'API

### 1. Consulter la liste de tous les paiements
* **Méthode :** `GET`
* **URL :** `http://localhost:8085/payments-service/api/payments`
* **Description :** Retourne l'ensemble des transactions de paiement enregistrées dans la base de données SQLite.

---

### 2. Consulter le paiement d'une commande spécifique
* **Méthode :** `GET`
* **URL :** `http://localhost:8085/payments-service/api/payments/order/{orderId}`
* **Exemple :** `http://localhost:8085/payments-service/api/payments/order/order-demo-005`
* **Description :** Retourne les détails du paiement associe à la commande spécifiée.

---

### 3. Effectuer / Enregistrer un paiement
* **Méthode :** `POST`
* **URL :** `http://localhost:8085/payments-service/api/payments`
* **Header :** `Content-Type: application/json`
* **Corps de la requête (JSON) :**
  ```json
  {
    "orderId": "order-demo-005",
    "amount": 299.99,
    "method": "CARD"
  }
  ```
* **Réponse de succès (201 Created) :**
  ```json
  {
    "id": "pay-57ec47bd",
    "orderId": "order-demo-005",
    "amount": 299.99,
    "method": "CARD",
    "status": "SUCCESS",
    "createdAt": "2026-11-08T12:23:26.257697800Z"
  }
  ```
* **Règle Métier (Idempotence) :** Le service garantit l'unicité du paiement par commande (`orderId`). Si une tentative de paiement est envoyée pour une commande déjà enregistrée, le service renvoie le paiement existant sans créer de doublon.

---

## 📦 Exécution du projet

Pour compiler et lancer le service localement avec Maven et Payara Micro :

```bash
mvn clean package
java -jar target/payments-service-exec.jar --port 8085
```

---

## 🔒 Sécurité Machine-to-Machine (M2M)

Les requêtes `POST` de ce microservice sont sécurisées par un filtre JAX-RS (`ApiKeyFilter`). Seuls les services internes autorisés (ex: `Orders`) peuvent effectuer des transactions.

### Configuration du service client
Pour appeler ce microservice, le service appelant doit inclure la clé d'autorisation dans ses en-têtes (Headers) HTTP :

* **Header :** `X-API-KEY`
* **Valeur :** `msoa_machine_to_machine_backend_authorization_secret_key_2026`

> **Note :** En cas de clé manquante ou invalide, le service retournera une erreur HTTP `401 Unauthorized`.