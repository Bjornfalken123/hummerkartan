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

export function actorFromContext(context) {
  return (
    context?.env?.AUTH_USERNAME ||
    context?.request?.headers?.get("cf-access-authenticated-user-email") ||
    context?.request?.headers?.get("x-hummer-user") ||
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

export function validLatLon(lat, lon) {
  return Number.isFinite(Number(lat)) && Number.isFinite(Number(lon)) && Math.abs(Number(lat)) <= 90 && Math.abs(Number(lon)) <= 180;
}

export function positionMetaFromBody(body, lat, lon) {
  const method = text(body?.gps_method).slice(0, 40);
  const actionAt = text(body?.gps_action_at);
  if (!method || !actionAt || !validLatLon(lat, lon)) return null;
  const accuracy = finite(body?.gps_accuracy_m);
  const speed = finite(body?.gps_speed_kn);
  const course = finite(body?.gps_course);
  const timing = finite(body?.gps_timing_error_ms);
  return {
    lat:Number(lat), lon:Number(lon), accuracy_m:accuracy == null ? null : Math.max(0, accuracy),
    speed_kn:speed, course, fix_at:text(body?.gps_fix_at) || null, action_at:actionAt,
    timing_error_ms:timing == null ? null : Math.max(0, Math.round(timing)), method
  };
}

export function positionEventStatement(db, eventType, entityId, meta, actor) {
  if (!meta) return null;
  return db.prepare(`INSERT OR IGNORE INTO position_events
    (id,event_type,entity_id,lat,lon,accuracy_m,speed_kn,course,fix_at,action_at,timing_error_ms,method,created_at,actor)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(`${eventType}:${entityId}`,eventType,entityId,meta.lat,meta.lon,meta.accuracy_m,meta.speed_kn,meta.course,meta.fix_at,meta.action_at,meta.timing_error_ms,meta.method,isoNow(),actor);
}
