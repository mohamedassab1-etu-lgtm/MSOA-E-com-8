const GATEWAY_URL = process.env.GATEWAY_URL || "http://127.0.0.1:3000";
const SERVICE_NAME = process.env.SERVICE_NAME || "auth-service";
const SERVICE_ADDRESS =
  process.env.SERVICE_ADDRESS || `http://127.0.0.1:${process.env.PORT || 8081}`;
const INTERVAL_MS = 30000;

async function register() {
  try {
    const res = await fetch(`${GATEWAY_URL}/registry/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
      body: JSON.stringify({ name: SERVICE_NAME, address: SERVICE_ADDRESS }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    console.log(`Registre : ${SERVICE_NAME} -> ${SERVICE_ADDRESS}`);
  } catch (err) {
    console.error("Registre indisponible :", err.message);
  }
}

function startRegistryClient() {
  register();
  setInterval(register, INTERVAL_MS).unref();
}

module.exports = { startRegistryClient };