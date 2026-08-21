import { getDb, json, dbError, actorFromContext, readJson, finite, text, uuid, isoNow, normalizeTrapStatus, validLatLon, positionMetaFromBody, positionEventStatement, tripEventStatement, resolveTripId } from "../_lib/common.js";

export async function onRequestGet(context) {
  try {
    const db = getDb(context);
    const result = await db.prepare("SELECT * FROM traps ORDER BY status, lower(name)").all();
    return json({ ok: true, traps: result.results || [] });
  } catch (error) { return dbError(error); }
}

export async function onRequestPost(context) {
  try {
    const db = getDb(context), body = await readJson(context.request), actor = actorFromContext(context);
    const id = uuid(body.id), lat = finite(body.lat), lon = finite(body.lon);
    if (!validLatLon(lat, lon)) return json({ ok:false, error:"Ogiltig position" }, 400);
    const now = isoNow();
    const name = text(body.name, "Tina").slice(0, 80) || "Tina";
    const setAt = text(body.set_at, now) || now;
    const statements=[db.prepare(`
      INSERT OR IGNORE INTO traps (id,name,lat,lon,status,set_at,last_checked_at,notes,created_at,updated_at,updated_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `).bind(id,name,lat,lon,normalizeTrapStatus(body.status),setAt,null,text(body.notes).slice(0,1000),now,now,actor)];
    const meta=positionMetaFromBody(body,lat,lon),event=positionEventStatement(db,'trap_set',id,meta,actor);
    if(event) statements.push(event);
    const tripId=await resolveTripId(db,body.trip_id,setAt);
    const tripEvent=tripEventStatement(db,tripId,'trap_set',id,setAt,actor);if(tripEvent)statements.push(tripEvent);
    await db.batch(statements);
    const trap=await db.prepare("SELECT * FROM traps WHERE id=?").bind(id).first();
    return json({ ok:true, trap }, 201);
  } catch (error) { return dbError(error); }
}
