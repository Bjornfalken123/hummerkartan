export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers
    }
  });
}

export function getDb(context) {
  const db = context && context.env && context.env.DB;
  if (!db) throw new Error("D1 binding DB saknas. Lägg till en D1-binding med variabelnamnet DB i Cloudflare Pages.");
  return db;
}

export function actorFromRequest(request) {
  return (
    request.headers.get("cf-access-authenticated-user-email") ||
    request.headers.get("x-hummer-user") ||
    "familj"
  ).slice(0, 180);
}

export async function readJson(request) {
  try { return await request.json(); } catch { return {}; }
}

export function text(value, fallback = "") {
  return String(value == null ? fallback : value).trim();
}

export function finite(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function isoNow() { return new Date().toISOString(); }

export function normalizeTrapStatus(value) {
  const v = text(value, "active").toLowerCase();
  return ["active", "retrieved"].includes(v) ? v : "active";
}

export function uuid(value) {
  const v = text(value);
  return v || crypto.randomUUID();
}

export function dbError(error) {
  const message = error instanceof Error ? error.message : String(error || "Okänt fel");
  return json({ ok: false, error: message }, message.includes("D1 binding") ? 503 : 500);
}
