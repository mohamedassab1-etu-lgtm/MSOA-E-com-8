# Catalog Service

Le service CATALOG expose en lecture seule le catalogue de produits de l'application e-commerce. Il utilise Spring Boot, Java 17, JdbcTemplate et la base SQLite fournie (`data/catalog.db`), sans rejouer le schéma ni les données d'initialisation.

Le service écoute sur le port `8082`.

## API

- `GET /products` : retourne tous les produits, triés par identifiant.
- `GET /products/{id}` : retourne un produit ou une erreur `404` s'il n'existe pas.

Chaque produit contient exactement les champs `id`, `name`, `category`, `price`, `image` et `description`.

Les erreurs sont au format JSON suivant :

```json
{"status": 404, "error": "Not Found", "message": "Product 999 not found"}
```

Un identifiant non numérique produit une erreur `400`. Les erreurs inattendues produisent une erreur `500` avec un message générique.

## Lancement

Depuis la racine `Catalog_Service` (le chemin SQLite est relatif à ce dossier) :

```shell
./mvnw spring-boot:run
```

Sous Windows, utiliser `mvnw.cmd spring-boot:run`.

## Tests

```shell
./mvnw test
```

Sous Windows, utiliser `mvnw.cmd test`.

## Exemples curl

```shell
curl http://localhost:8082/products
curl http://localhost:8082/products/1
curl http://localhost:8082/products/999
curl http://localhost:8082/products/abc
```

## Images des produits

Le champ `image` de chaque produit contient l'URL externe de son image. Le fichier `update-images.sql` met à jour ces URLs pour les six produits.

Si la base est reconstruite, exécuter les scripts depuis la racine du projet, dans cet ordre :

```shell
sqlite3 data/catalog.db < schema.sql
sqlite3 data/catalog.db < seed.sql
sqlite3 data/catalog.db < update-images.sql
```

Les images dépendent de sites externes ; une connexion Internet est requise pour les afficher.