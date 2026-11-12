const { HttpError } = require("../errors");

// Appel HTTP avec timeout. Une panne réseau => 503 (service indisponible).
async function callJson(baseUrl, path, { method = "GET", body, headers = {}, timeoutMs }) {
  let response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...headers },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new HttpError(503, `Service injoignable : ${baseUrl}`);
  }

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* corps non JSON */
  }
  return { status: response.status, ok: response.ok, data };
}

module.exports = { callJson };
