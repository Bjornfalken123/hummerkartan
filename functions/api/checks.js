import { getDb, json, dbError, actorFromContext, readJson, finite, text, uuid, isoNow, validLatLon, positionMetaFromBody, positionEventStatement, tripEventStatement } from "../_lib/common.js";

export async function onRequestPost(context) {
  try {
    const db=getDb(context), body=await readJson(context.request), actor=actorFromContext(context);
    const trapId=text(body.trap_id), trap=await db.prepare("SELECT * FROM traps WHERE id=?").bind(trapId).first();
    if(!trap) return json({ok:false,error:"Tinan hittades inte"},404);
    const checkedAt=text(body.checked_at,isoNow())||isoNow(), id=uuid(body.id);
    const lobsterCount=Math.max(0,Math.round(finite(body.lobster_count,0))), releasedCount=Math.max(0,Math.round(finite(body.released_count,0)));
    let observerLat=finite(body.lat), observerLon=finite(body.lon); if(!validLatLon(observerLat,observerLon)){observerLat=null;observerLon=null}
    let trapLat=finite(body.trap_lat),trapLon=finite(body.trap_lon),locationSource='client_trap_snapshot'; if(!validLatLon(trapLat,trapLon)){trapLat=finite(trap.lat);trapLon=finite(trap.lon);locationSource='trap_snapshot'} if(!validLatLon(trapLat,trapLon)) return json({ok:false,error:"Tinans position är ogiltig"},409)
    const notes=text(body.notes).slice(0,1000),created=isoNow();
    let tripId=text(body.trip_id);if(!tripId){const match=await db.prepare(`SELECT id FROM trips WHERE started_at<=? AND (ended_at IS NULL OR ended_at>=?) ORDER BY started_at DESC LIMIT 1`).bind(checkedAt,checkedAt).first();tripId=text(match?.id)}
    const statements=[db.prepare(`INSERT OR IGNORE INTO checks (id,trap_id,checked_at,lobster_count,released_count,notes,lat,lon,actor,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(id,trapId,checkedAt,lobsterCount,releasedCount,notes,observerLat,observerLon,actor,created),
      db.prepare(`INSERT OR IGNORE INTO check_locations (check_id,trap_lat,trap_lon,source,captured_at) VALUES (?,?,?,?,?)`).bind(id,trapLat,trapLon,locationSource,checkedAt)];
    if(observerLat!=null&&observerLon!=null){const meta=positionMetaFromBody(body,observerLat,observerLon),event=positionEventStatement(db,'check',id,meta,actor);if(event)statements.push(event)}const tripEvent=tripEventStatement(db,tripId,'check',id,checkedAt,actor);if(tripEvent)statements.push(tripEvent)
    statements.push(db.prepare(`UPDATE traps SET
      last_checked_at=CASE WHEN last_checked_at IS NULL OR last_checked_at < ? THEN ? ELSE last_checked_at END,
      updated_at=CASE WHEN last_checked_at IS NULL OR last_checked_at < ? THEN ? ELSE updated_at END,
      updated_by=CASE WHEN last_checked_at IS NULL OR last_checked_at < ? THEN ? ELSE updated_by END
      WHERE id=?`).bind(checkedAt,checkedAt,checkedAt,created,checkedAt,actor,trapId));
    await db.batch(statements);
    return json({ok:true,check:{id,trap_id:trapId,checked_at:checkedAt,lobster_count:lobsterCount,released_count:releasedCount,notes,lat:observerLat,lon:observerLon,trap_lat:trapLat,trap_lon:trapLon,trip_id:tripId||null,actor}},201);
  } catch(error){return dbError(error);}
}
