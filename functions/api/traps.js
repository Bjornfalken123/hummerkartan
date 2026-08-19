import { getDb, json, dbError, actorFromRequest, readJson, finite, text, uuid, isoNow, normalizeTrapStatus } from "../_lib/common.js";

export async function onRequestGet(context) {
  try {
    const db = getDb(context);
    const result = await db.prepare("SELECT * FROM traps ORDER BY status, lower(name)").all();
    return json({ ok: true, traps: result.results || [] });
  } catch (error) { return dbError(error); }
}

export async function onRequestPost(context) {
  try {
    const db = getDb(context), body = await readJson(context.request), actor = actorFromRequest(context.request);
    const id = uuid(body.id), lat = finite(body.lat), lon = finite(body.lon);
    if (lat == null || lon == null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return json({ ok:false, error:"Ogiltig position" }, 400);
    const now = isoNow();
    const name = text(body.name, "Bur").slice(0, 80) || "Bur";
    const setAt = text(body.set_at, now) || now;
    await db.prepare(`
      INSERT INTO traps (id,name,lat,lon,status,set_at,last_checked_at,notes,created_at,updated_at,updated_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `).bind(id,name,lat,lon,normalizeTrapStatus(body.status),setAt,null,text(body.notes).slice(0,1000),now,now,actor).run();
    return json({ ok:true, trap:{ id,name,lat,lon,status:"active",set_at:setAt,last_checked_at:null,notes:text(body.notes),updated_at:now,updated_by:actor } }, 201);
  } catch (error) { return dbError(error); }
}
