import { getDb, json, dbError, actorFromContext, readJson, finite, text, uuid, isoNow, validLatLon, positionMetaFromBody, positionEventStatement, tripEventStatement, resolveTripId } from '../../../_lib/common.js';

export async function onRequestPost(context){
  try{
    const db=getDb(context),plannedId=context.params.id,body=await readJson(context.request),actor=actorFromContext(context);
    const trapId=uuid(body.id),lat=finite(body.lat),lon=finite(body.lon);
    if(!validLatLon(lat,lon)) return json({ok:false,error:'Ogiltig position'},400);
    const [planned,existingTrap]=await Promise.all([
      db.prepare('SELECT * FROM planned_traps WHERE id=?').bind(plannedId).first(),
      db.prepare('SELECT * FROM traps WHERE id=?').bind(trapId).first()
    ]);
    if(existingTrap){const replay=[];const replayMeta=positionMetaFromBody(body,lat,lon),replayEvent=positionEventStatement(db,'trap_set',trapId,replayMeta,actor);if(replayEvent)replay.push(replayEvent);const replaySetAt=text(body.set_at,existingTrap.set_at)||existingTrap.set_at,replayTripId=await resolveTripId(db,body.trip_id,replaySetAt),replayTrip=tripEventStatement(db,replayTripId,'trap_set',trapId,replaySetAt,actor);if(replayTrip)replay.push(replayTrip);if(planned)replay.push(db.prepare('DELETE FROM planned_traps WHERE id=?').bind(plannedId));if(replay.length)await db.batch(replay);return json({ok:true,trap:existingTrap,planned_removed:true});}
    const now=isoNow(),name=(text(body.name,'Tina').slice(0,80)||'Tina'),setAt=text(body.set_at,now)||now;
    const statements=[db.prepare(`INSERT OR IGNORE INTO traps (id,name,lat,lon,status,set_at,last_checked_at,notes,created_at,updated_at,updated_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`).bind(trapId,name,lat,lon,'active',setAt,null,text(body.notes,planned?.notes||'').slice(0,1000),now,now,actor)];
    const meta=positionMetaFromBody(body,lat,lon),event=positionEventStatement(db,'trap_set',trapId,meta,actor);if(event)statements.push(event);const tripId=await resolveTripId(db,body.trip_id,setAt),tripEvent=tripEventStatement(db,tripId,'trap_set',trapId,setAt,actor);if(tripEvent)statements.push(tripEvent);
    statements.push(db.prepare('DELETE FROM planned_traps WHERE id=?').bind(plannedId));
    await db.batch(statements);
    const trap=await db.prepare('SELECT * FROM traps WHERE id=?').bind(trapId).first();
    return json({ok:true,trap,planned_removed:true},201);
  }catch(error){return dbError(error);}
}
