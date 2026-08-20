import { getDb, json, dbError, actorFromContext, readJson, finite, text, uuid, isoNow } from '../_lib/common.js';

export async function onRequestGet(context) {
  try {
    const db=getDb(context);
    const result=await db.prepare('SELECT * FROM planned_traps ORDER BY created_at, lower(name)').all();
    return json({ok:true,planned_traps:result.results||[]});
  } catch(error) { return dbError(error); }
}

export async function onRequestPost(context) {
  try {
    const db=getDb(context),body=await readJson(context.request),actor=actorFromContext(context);
    const id=uuid(body.id),lat=finite(body.lat),lon=finite(body.lon);
    if(lat==null||lon==null||Math.abs(lat)>90||Math.abs(lon)>180) return json({ok:false,error:'Ogiltig position'},400);
    const now=isoNow(),name=(text(body.name,'Planerad tina').slice(0,80)||'Planerad tina'),notes=text(body.notes).slice(0,500);
    await db.prepare(`INSERT OR IGNORE INTO planned_traps (id,name,lat,lon,notes,created_at,updated_at,updated_by)
      VALUES (?,?,?,?,?,?,?,?)`).bind(id,name,lat,lon,notes,now,now,actor).run();
    const planned=await db.prepare('SELECT * FROM planned_traps WHERE id=?').bind(id).first();
    return json({ok:true,planned_trap:planned},201);
  } catch(error) { return dbError(error); }
}
