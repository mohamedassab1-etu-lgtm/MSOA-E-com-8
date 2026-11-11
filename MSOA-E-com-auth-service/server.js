require("dotenv").config();

const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Database = require("better-sqlite3");
const { randomUUID } = require("crypto");

const PORT = process.env.PORT || 8081;
const JWT_SECRET = process.env.JWT_SECRET;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "2h";
const DB_FILE = process.env.DB_FILE || "auth.db";

if (!JWT_SECRET) {
  console.error("JWT_SECRET manquant : créez un fichier .env (voir .env.example)");
  process.exit(1);
}

// ---------- Base de données (créée automatiquement) ----------
const db = new Database("auth.db");
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'CUSTOMER',
    created_at TEXT NOT NULL
  )
`);

// Compte demo avec un vrai hash (mot de passe: demo123)
if (!db.prepare("SELECT 1 FROM users WHERE email = ?").get("demo@msoa.shop")) {
  db.prepare(
    "INSERT INTO users (id, name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run("user-1", "Demo Customer", "demo@msoa.shop", bcrypt.hashSync("demo123", 10), "CUSTOMER", new Date().toISOString());
}

// ---------- Helpers ----------
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const findByEmail = (email) =>
  db.prepare("SELECT * FROM users WHERE lower(email) = lower(?)").get(email);
const findById = (id) => db.prepare("SELECT * FROM users WHERE id = ?").get(id);

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role });
const signToken = (u) =>
  jwt.sign({ sub: u.id, email: u.email, role: u.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

const revokedTokens = new Set();
const getToken = (req) => {
  const h = req.headers.authorization || "";
  return h.startsWith("Bearer ") ? h.slice(7) : null;
};

const requireAuth = (req, res, next) => {
  const token = getToken(req);
  if (!token || revokedTokens.has(token))
    return res.status(401).json({ message: "Non authentifié" });
  try {
    req.auth = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ message: "Token invalide ou expiré" });
  }
};

// ---------- App ----------
const app = express();
app.use(cors({ origin: FRONTEND_URL }));
app.use(express.json());

app.post("/api/auth/register", async (req, res) => {
  const { name, email, password } = req.body || {};

  if (typeof name !== "string" || typeof email !== "string" || typeof password !== "string")
    return res.status(400).json({ message: "Nom, email et mot de passe requis" });

  const cleanName = name.trim();
  const cleanEmail = email.trim().toLowerCase();

  if (!cleanName || !cleanEmail || !password)
    return res.status(400).json({ message: "Nom, email et mot de passe ne doivent pas être vides" });

  if (!EMAIL_REGEX.test(cleanEmail))
    return res.status(400).json({ message: "Format d'email invalide" });

  if (password.length < 6 || Buffer.byteLength(password, "utf8") > 72)
    return res.status(400).json({ message: "Mot de passe invalide (entre 6 et 72 caractères)" });

  if (findByEmail(cleanEmail))
    return res.status(409).json({ message: "Email déjà utilisé" });

  const user = {
    id: `user-${randomUUID().slice(0, 8)}`,
    name: cleanName,
    email: cleanEmail,
    password_hash: await bcrypt.hash(password, 10),
    role: "CUSTOMER",
    created_at: new Date().toISOString(),
  };
  db.prepare(
    "INSERT INTO users (id, name, email, password_hash, role, created_at) VALUES (@id, @name, @email, @password_hash, @role, @created_at)"
  ).run(user);

  res.status(201).json({ user: publicUser(user) });
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password)
    return res.status(400).json({ message: "Email et mot de passe requis" });

  const user = findByEmail(email.trim());
  if (!user || !(await bcrypt.compare(password, user.password_hash)))
    return res.status(401).json({ message: "Email ou mot de passe incorrect" });

  res.json({ user: publicUser(user), token: signToken(user) });
});

app.post("/api/auth/logout", (req, res) => {
  const token = getToken(req);
  if (token) revokedTokens.add(token);
  res.json({ success: true });
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  const user = findById(req.auth.sub);
  if (!user) return res.status(404).json({ message: "Utilisateur introuvable" });
  res.json(publicUser(user));
});

app.listen(PORT, () => console.log(`Auth service sur http://localhost:${PORT}`));