import { getDb, json, dbError, actorFromContext, readJson, finite, text, isoNow, correctionEventStatement } from '../../_lib/common.js';

function windowEnd(trip){return trip?.ended_at || new Date().toISOString()}

export async function onRequestGet(context){
  try{
    const db=getDb(context),id=context.params.id;
    const trip=await db.prepare('SELECT * FROM trips WHERE id=?').bind(id).first();
    if(!trip)return json({ok:false,error:'Turen hittades inte'},404);
    const end=windowEnd(trip);
    const [points,checks,sets]=await Promise.all([
      db.prepare('SELECT * FROM track_points WHERE trip_id=? ORDER BY seq').bind(id).all(),
      db.prepare(`SELECT c.*,t.name AS trap_name FROM checks c LEFT JOIN traps t ON t.id=c.trap_id LEFT JOIN trip_events te ON te.event_type='check' AND te.entity_id=c.id
        WHERE te.trip_id=? OR (te.id IS NULL AND c.checked_at>=? AND c.checked_at<=?) ORDER BY c.checked_at`).bind(id,trip.started_at,end).all(),
      db.prepare(`SELECT t.id,t.name,t.lat,t.lon,t.set_at,t.notes,t.status FROM traps t LEFT JOIN trip_events te ON te.event_type='trap_set' AND te.entity_id=t.id
        WHERE te.trip_id=? OR (te.id IS NULL AND t.set_at>=? AND t.set_at<=?) ORDER BY t.set_at`).bind(id,trip.started_at,end).all()
    ]);
    const checkRows=checks.results||[],setRows=sets.results||[];
    const lobsters=checkRows.reduce((n,c)=>n+(Number(c.lobster_count)||0),0);
    return json({ok:true,trip,points:points.results||[],checks:checkRows,sets:setRows,summary:{checks:checkRows.length,sets:setRows.length,lobsters}});
  }catch(error){return dbError(error)}
}

export async function onRequestPatch(context){
  try{
    const db=getDb(context),id=context.params.id,body=await readJson(context.request),actor=actorFromContext(context),now=isoNow();
    const current=await db.prepare('SELECT * FROM trips WHERE id=?').bind(id).first();
    if(!current)return json({ok:false,error:'Turen hittades inte'},404);
    const name=body.name===undefined?current.name:(text(body.name,'Hummertur').slice(0,100)||'Hummertur');
    const distance=body.distance_nm===undefined?current.distance_nm:Math.max(0,finite(body.distance_nm,current.distance_nm));
    const updated={...current,name,distance_nm:distance,actor,updated_at:now};
    await db.batch([
      db.prepare('UPDATE trips SET name=?,distance_nm=?,actor=?,updated_at=? WHERE id=?').bind(name,distance,actor,now,id),
      correctionEventStatement(db,'trip',id,'update',current,updated,actor)
    ].filter(Boolean));
    return json({ok:true,trip:updated});
  }catch(error){return dbError(error)}
}
