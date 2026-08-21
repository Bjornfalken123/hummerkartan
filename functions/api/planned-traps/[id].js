import { getDb, json, dbError, actorFromContext, readJson, finite, text, isoNow, validLatLon } from '../../_lib/common.js';

export async function onRequestPatch(context) {
  try {
    const db=getDb(context),id=context.params.id,body=await readJson(context.request),actor=actorFromContext(context),now=isoNow();
    const current=await db.prepare('SELECT * FROM planned_traps WHERE id=?').bind(id).first();
    if(!current) return json({ok:false,error:'Den planerade tinan hittades inte'},404);
    const name=body.name===undefined?current.name:(text(body.name,'Planerad tina').slice(0,80)||'Planerad tina');
    const lat=body.lat===undefined?current.lat:finite(body.lat,current.lat),lon=body.lon===undefined?current.lon:finite(body.lon,current.lon);
    const notes=body.notes===undefined?current.notes:text(body.notes).slice(0,500);
    if(!validLatLon(lat,lon)) return json({ok:false,error:'Ogiltig position'},400);
    await db.prepare('UPDATE planned_traps SET name=?,lat=?,lon=?,notes=?,updated_at=?,updated_by=? WHERE id=?')
      .bind(name,lat,lon,notes,now,actor,id).run();
    return json({ok:true,planned_trap:{...current,name,lat,lon,notes,updated_at:now,updated_by:actor}});
  } catch(error) { return dbError(error); }
}

export async function onRequestDelete(context) {
  try {
    const db=getDb(context),id=context.params.id;
    await db.prepare('DELETE FROM planned_traps WHERE id=?').bind(id).run();
    return json({ok:true,id});
  } catch(error) { return dbError(error); }
}
