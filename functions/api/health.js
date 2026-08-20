import { json } from "../_lib/common.js";
export async function onRequestGet(context) {
  let db = false;
  try { if (context.env.DB) { await context.env.DB.prepare("SELECT 1 AS ok").first(); db = true; } } catch {}
  return json({ ok: true, db, time: new Date().toISOString() });
}
