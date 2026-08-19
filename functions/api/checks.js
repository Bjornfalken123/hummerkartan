import { getDb, json, dbError, actorFromContext, readJson, finite, text, uuid, isoNow } from "../_lib/common.js";

export async function onRequestPost(context) {
  try {
    const db=getDb(context), body=await readJson(context.request), actor=actorFromContext(context);
    const trapId=text(body.trap_id), trap=await db.prepare("SELECT * FROM traps WHERE id=?").bind(trapId).first();
    if(!trap) return json({ok:false,error:"Buren hittades inte"},404);
    const checkedAt=text(body.checked_at,isoNow())||isoNow(), id=uuid(body.id);
    const lobsterCount=Math.max(0,Math.round(finite(body.lobster_count,0))), releasedCount=Math.max(0,Math.round(finite(body.released_count,0)));
    const lat=finite(body.lat), lon=finite(body.lon), notes=text(body.notes).slice(0,1000);
    await db.prepare(`INSERT INTO checks (id,trap_id,checked_at,lobster_count,released_count,notes,lat,lon,actor,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(id,trapId,checkedAt,lobsterCount,releasedCount,notes,lat,lon,actor,isoNow()).run();
    await db.prepare("UPDATE traps SET last_checked_at=?, updated_at=?, updated_by=? WHERE id=?").bind(checkedAt,isoNow(),actor,trapId).run();
    return json({ok:true,check:{id,trap_id:trapId,checked_at:checkedAt,lobster_count:lobsterCount,released_count:releasedCount,notes,lat,lon,actor}},201);
  } catch(error){return dbError(error);}
}
