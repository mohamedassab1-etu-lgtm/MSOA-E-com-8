# Auth Service

Microservice d'authentification et de gestion des comptes (port **8081**).

## Technologies

| Élément | Choix |
|---|---|
| Langage | JavaScript |
| Environnement | Node.js |
| Framework web | Express |
| Base de données | SQLite (`auth.db`), propre à ce service |
| Sécurité | bcryptjs (hash des mots de passe), JWT (jsonwebtoken) |
| Configuration | dotenv (fichier `.env`) |
| CORS | cors (autorise le frontend sur http://localhost:5173) |

## Lancement

```bash
npm install
cp .env.example .env     # (Windows : copy .env.example .env) puis renseigner JWT_SECRET
node server.js
```

Le service démarre sur http://localhost:8081.
La base `auth.db` et le compte de démonstration sont créés automatiquement au premier lancement.

## Configuration (.env)

| Variable | Description |
|---|---|
| `PORT` | Port du service (défaut : 8081) |
| `JWT_SECRET` | Secret de signature des tokens (obligatoire, ne jamais le versionner) |

Le fichier `.env` n'est pas versionné. `.env.example` sert de modèle.

## Compte de démonstration

- Email : `demo@msoa.shop`
- Mot de passe : `demo123` (stocké sous forme de hash bcrypt)

## Endpoints

| Méthode | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Création de compte, retourne `{ user }` (sans token) |
| POST | `/api/auth/login` | Connexion, retourne `{ user, token }` |
| POST | `/api/auth/logout` | Déconnexion (le token est invalidé) |
| GET | `/api/auth/me` | Utilisateur connecté (header `Authorization: Bearer <token>`) |

L'objet `user` contient : `id`, `name`, `email`, `role`.

## Validation du register

- `name` et `email` : nettoyés avec `trim` (l'email est aussi mis en minuscules), puis vérification qu'ils ne sont pas vides.
- `email` : format vérifié (syntaxe).
- `password` : entre 6 et 72 caractères (bcrypt ne lit que les 72 premiers octets).
- Email déjà utilisé : erreur 409.

## Codes d'erreur

| Code | Signification |
|---|---|
| 400 | Données invalides (champ manquant ou vide, email invalide, mot de passe hors limites) |
| 401 | Identifiants incorrects, token absent, invalide ou expiré |
| 404 | Utilisateur introuvable |
| 409 | Email déjà utilisé |

## Base de données

Table `users` (créée automatiquement) :

| Colonne | Description |
|---|---|
| id | Identifiant unique (ex : `user-1`) |
| name | Nom complet |
| email | Adresse email (unique) |
| password_hash | Mot de passe haché (jamais en clair) |
| role | `CUSTOMER` par défaut |
| created_at | Date de création |

## Comment ça marche

1. **Inscription** : validation des champs, hash du mot de passe avec bcrypt, enregistrement dans `auth.db`. Aucun token n'est retourné : le frontend fait ensuite un login.
2. **Connexion** : le mot de passe saisi est comparé au hash. Si correct, le service génère un **token JWT** (valable 2 heures) contenant l'id, l'email et le rôle.
3. **Requêtes protégées** : le client envoie le token dans `Authorization: Bearer <token>`. Le service vérifie sa signature et son expiration (`/me`).
4. **Déconnexion** : le token est ajouté à une liste de tokens révoqués (en mémoire).
5. **Sécurité** : même message d'erreur pour un email inconnu ou un mauvais mot de passe, afin de ne pas révéler quels emails existent.

## Communication avec les autres services

Auth ne contacte aucun autre service : il est **fournisseur** (Supplier). Il fournit l'identité (`userId`, `role`) que les autres services utilisent, par exemple Orders pour associer une commande à un utilisateur. Auth est le seul propriétaire de la base `users` : aucun autre service n'y accède directement.

## Tests réalisés

| Scénario | Résultat |
|---|---|
| Login `demo@msoa.shop` / `demo123` | OK : `user` + `token` |
| Register d'un nouvel utilisateur | OK : `user` sans token |
| Register avec nom vide (espaces) | OK : erreur 400 |
| Register avec email invalide | OK : erreur 400 |
| Register avec mot de passe de 80 caractères | OK : erreur 400 |
| Register avec un email existant | OK : erreur 409 |
| Login avec un mauvais mot de passe | OK : erreur 401 |
| `GET /me` avec un token valide | OK : infos de l'utilisateur |
| Inscription puis connexion depuis le frontend React (mode `rest`) | OK |