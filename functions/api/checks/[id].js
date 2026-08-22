import { getDb, json, dbError, actorFromContext, readJson, finite, text, isoNow, correctionEventStatement } from '../../_lib/common.js';

function recalcTrap(db,trapId,actor,now){
  return db.prepare(`UPDATE traps SET
    last_checked_at=(SELECT MAX(checked_at) FROM checks WHERE trap_id=?),
    updated_at=?,updated_by=? WHERE id=?`).bind(trapId,now,actor,trapId);
}
async function hasTable(db,name){try{return Boolean(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1").bind(name).first())}catch{return false}}

export async function onRequestPatch(context){
  try{
    const db=getDb(context),id=context.params.id,body=await readJson(context.request),actor=actorFromContext(context),now=isoNow();
    const current=await db.prepare('SELECT * FROM checks WHERE id=?').bind(id).first();
    if(!current)return json({ok:false,error:'Vittjningen hittades inte'},404);
    const trapId=body.trap_id===undefined?current.trap_id:text(body.trap_id);
    const trap=await db.prepare('SELECT id,lat,lon FROM traps WHERE id=?').bind(trapId).first();
    if(!trap)return json({ok:false,error:'Tinan hittades inte'},404);
    const lobsterCount=body.lobster_count===undefined?current.lobster_count:Math.max(0,Math.round(finite(body.lobster_count,current.lobster_count)));
    const releasedCount=body.released_count===undefined?current.released_count:Math.max(0,Math.round(finite(body.released_count,current.released_count)));
    const notes=body.notes===undefined?current.notes:text(body.notes).slice(0,1000);
    const moved=trapId!==current.trap_id,catchLat=moved?Number(trap.lat):current.lat,catchLon=moved?Number(trap.lon):current.lon;
    const after={...current,trap_id:trapId,lobster_count:lobsterCount,released_count:releasedCount,notes,lat:catchLat,lon:catchLon,actor};

    // Själva korrigeringen ska fungera även om revisions-tabeller saknas.
    const core=[db.prepare('UPDATE checks SET trap_id=?,lobster_count=?,released_count=?,notes=?,lat=?,lon=?,actor=? WHERE id=?').bind(trapId,lobsterCount,releasedCount,notes,catchLat,catchLon,actor,id),recalcTrap(db,current.trap_id,actor,now)];
    if(moved)core.push(recalcTrap(db,trapId,actor,now));
    await db.batch(core);

    if(moved&&await hasTable(db,'check_locations')){
      try{await db.prepare(`INSERT INTO check_locations (check_id,trap_lat,trap_lon,source,captured_at) VALUES (?,?,?,?,?) ON CONFLICT(check_id) DO UPDATE SET trap_lat=excluded.trap_lat,trap_lon=excluded.trap_lon,source=excluded.source,captured_at=excluded.captured_at`).bind(id,Number(trap.lat),Number(trap.lon),'manual_reassign',now).run()}catch{}
    }
    if(await hasTable(db,'correction_events')){
      try{const event=correctionEventStatement(db,'check',id,'update',current,after,actor);if(event)await event.run()}catch{}
    }
    const check=await db.prepare('SELECT c.*,t.name AS trap_name FROM checks c LEFT JOIN traps t ON t.id=c.trap_id WHERE c.id=?').bind(id).first();
    return json({ok:true,check});
  }catch(error){return dbError(error)}
}

export async function onRequestDelete(context){
  try{
    const db=getDb(context),id=context.params.id,actor=actorFromContext(context),now=isoNow();
    const current=await db.prepare('SELECT * FROM checks WHERE id=?').bind(id).first();
    if(!current)return json({ok:true,id});
    // Radera först kärndata och räkna om tinan. Revision är best-effort.
    await db.batch([db.prepare('DELETE FROM checks WHERE id=?').bind(id),recalcTrap(db,current.trap_id,actor,now)]);
    if(await hasTable(db,'correction_events')){
      try{const event=correctionEventStatement(db,'check',id,'delete',current,null,actor);if(event)await event.run()}catch{}
    }
    return json({ok:true,id});
  }catch(error){return dbError(error)}
}
