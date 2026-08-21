import { getDb, json, dbError, actorFromContext, readJson, finite, text, uuid, isoNow, validLatLon, positionMetaFromBody, positionEventStatement, tripEventStatement } from "../_lib/common.js";

export async function onRequestPost(context) {
  try {
    const db=getDb(context), body=await readJson(context.request), actor=actorFromContext(context);
    const trapId=text(body.trap_id), trap=await db.prepare("SELECT * FROM traps WHERE id=?").bind(trapId).first();
    if(!trap) return json({ok:false,error:"Tinan hittades inte"},404);
    const checkedAt=text(body.checked_at,isoNow())||isoNow(), id=uuid(body.id);
    const lobsterCount=Math.max(0,Math.round(finite(body.lobster_count,0))), releasedCount=Math.max(0,Math.round(finite(body.released_count,0)));
    let lat=finite(body.lat), lon=finite(body.lon); if(!validLatLon(lat,lon)){lat=null;lon=null}
    const notes=text(body.notes).slice(0,1000),created=isoNow();
    const statements=[db.prepare(`INSERT OR IGNORE INTO checks (id,trap_id,checked_at,lobster_count,released_count,notes,lat,lon,actor,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(id,trapId,checkedAt,lobsterCount,releasedCount,notes,lat,lon,actor,created)];
    if(lat!=null&&lon!=null){const meta=positionMetaFromBody(body,lat,lon),event=positionEventStatement(db,'check',id,meta,actor);if(event)statements.push(event)}const tripEvent=tripEventStatement(db,body.trip_id,'check',id,checkedAt,actor);if(tripEvent)statements.push(tripEvent)
    statements.push(db.prepare(`UPDATE traps SET
      last_checked_at=CASE WHEN last_checked_at IS NULL OR last_checked_at < ? THEN ? ELSE last_checked_at END,
      updated_at=CASE WHEN last_checked_at IS NULL OR last_checked_at < ? THEN ? ELSE updated_at END,
      updated_by=CASE WHEN last_checked_at IS NULL OR last_checked_at < ? THEN ? ELSE updated_by END
      WHERE id=?`).bind(checkedAt,checkedAt,checkedAt,created,checkedAt,actor,trapId));
    await db.batch(statements);
    return json({ok:true,check:{id,trap_id:trapId,checked_at:checkedAt,lobster_count:lobsterCount,released_count:releasedCount,notes,lat,lon,actor}},201);
  } catch(error){return dbError(error);}
}
