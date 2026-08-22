import { getDb, json, dbError, actorFromContext, readJson, finite, text, uuid, isoNow, validLatLon, positionMetaFromBody, positionEventStatement, tripEventStatement, resolveTripId } from "../_lib/common.js";

async function tableExists(db,name){
  try{return Boolean(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1").bind(name).first())}catch{return false}
}

export async function onRequestPost(context) {
  try {
    const db=getDb(context), body=await readJson(context.request), actor=actorFromContext(context);
    const trapId=text(body.trap_id), trap=await db.prepare("SELECT * FROM traps WHERE id=?").bind(trapId).first();
    if(!trap) return json({ok:false,error:"Tinan hittades inte"},404);

    const checkedAt=text(body.checked_at,isoNow())||isoNow(), id=uuid(body.id);
    const lobsterCount=Math.max(0,Math.round(finite(body.lobster_count,0))), releasedCount=Math.max(0,Math.round(finite(body.released_count,0)));
    const notes=text(body.notes).slice(0,1000), created=isoNow();

    // Fångstplatsen är alltid en snapshot av den valda tinans position.
    // Telefonens GPS sparas separat i position_events och får aldrig styra heatmapen.
    let trapLat=finite(body.trap_lat),trapLon=finite(body.trap_lon);
    if(!validLatLon(trapLat,trapLon)){trapLat=finite(trap.lat);trapLon=finite(trap.lon)}
    if(!validLatLon(trapLat,trapLon)) return json({ok:false,error:"Tinans position är ogiltig"},409);

    let observerLat=finite(body.lat),observerLon=finite(body.lon);
    if(!validLatLon(observerLat,observerLon)){observerLat=null;observerLon=null}

    // Kärntransaktionen innehåller bara fiskedata. Revisions-/metadata får aldrig
    // blockera en vittjning om en hjälptabell saknas eller tillfälligt strular.
    await db.batch([
      db.prepare(`INSERT OR IGNORE INTO checks (id,trap_id,checked_at,lobster_count,released_count,notes,lat,lon,actor,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(id,trapId,checkedAt,lobsterCount,releasedCount,notes,Number(trapLat),Number(trapLon),actor,created),
      db.prepare(`UPDATE traps SET
        last_checked_at=CASE WHEN last_checked_at IS NULL OR last_checked_at < ? THEN ? ELSE last_checked_at END,
        updated_at=CASE WHEN last_checked_at IS NULL OR last_checked_at < ? THEN ? ELSE updated_at END,
        updated_by=CASE WHEN last_checked_at IS NULL OR last_checked_at < ? THEN ? ELSE updated_by END
        WHERE id=?`).bind(checkedAt,checkedAt,checkedAt,created,checkedAt,actor,trapId)
    ]);

    const warnings=[];
    let tripId='';
    try{tripId=await resolveTripId(db,body.trip_id,checkedAt)}catch(error){warnings.push(`trip_resolve:${error instanceof Error?error.message:String(error)}`)}

    // Best-effort revisionsdata. Ingen av dessa får rulla tillbaka själva vittjningen.
    if(observerLat!=null&&observerLon!=null){
      try{
        if(await tableExists(db,'position_events')){
          const meta=positionMetaFromBody(body,observerLat,observerLon),event=positionEventStatement(db,'check',id,meta,actor);
          if(event)await event.run();
        }
      }catch(error){warnings.push(`position_event:${error instanceof Error?error.message:String(error)}`)}
    }

    if(tripId){
      try{
        if(await tableExists(db,'trip_events')){
          const event=tripEventStatement(db,tripId,'check',id,checkedAt,actor);
          if(event)await event.run();
        }
      }catch(error){warnings.push(`trip_event:${error instanceof Error?error.message:String(error)}`)}
    }

    // Behåll 0006-data när tabellen finns, men checks.lat/lon är nu den kanoniska
    // fångstplatsen. Därmed är check_locations inte längre ett driftberoende.
    try{
      if(await tableExists(db,'check_locations')){
        await db.prepare(`INSERT INTO check_locations (check_id,trap_lat,trap_lon,source,captured_at)
          VALUES (?,?,?,?,?) ON CONFLICT(check_id) DO UPDATE SET
          trap_lat=excluded.trap_lat,trap_lon=excluded.trap_lon,source=excluded.source,captured_at=excluded.captured_at`)
          .bind(id,Number(trapLat),Number(trapLon),'trap_snapshot',checkedAt).run();
      }
    }catch(error){warnings.push(`check_location:${error instanceof Error?error.message:String(error)}`)}

    return json({ok:true,check:{id,trap_id:trapId,checked_at:checkedAt,lobster_count:lobsterCount,released_count:releasedCount,notes,lat:Number(trapLat),lon:Number(trapLon),trip_id:tripId||null,actor},warnings},201);
  } catch(error){return dbError(error);}
}
