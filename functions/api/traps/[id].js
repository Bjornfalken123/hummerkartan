import { getDb, json, dbError, actorFromContext, readJson, finite, text, isoNow, normalizeTrapStatus, validLatLon, correctionEventStatement } from "../../_lib/common.js";

export async function onRequestPatch(context) {
  try {
    const db=getDb(context), id=context.params.id, body=await readJson(context.request), actor=actorFromContext(context), now=isoNow();
    const current=await db.prepare("SELECT * FROM traps WHERE id=?").bind(id).first();
    if(!current) return json({ok:false,error:"Tinan hittades inte"},404);
    const name=body.name===undefined?current.name:(text(body.name,"Tina").slice(0,80)||"Tina");
    const lat=body.lat===undefined?current.lat:finite(body.lat,current.lat);
    const lon=body.lon===undefined?current.lon:finite(body.lon,current.lon);
    if(!validLatLon(lat,lon)) return json({ok:false,error:"Ogiltig position"},400);
    const status=body.status===undefined?current.status:normalizeTrapStatus(body.status);
    const notes=body.notes===undefined?current.notes:text(body.notes).slice(0,1000);
    const setAt=body.set_at===undefined?current.set_at:text(body.set_at,current.set_at);
    const updated={...current,name,lat,lon,status,set_at:setAt,notes,updated_at:now,updated_by:actor};
    const correction=correctionEventStatement(db,'trap',id,'update',current,updated,actor);
    await db.batch([
      db.prepare("UPDATE traps SET name=?,lat=?,lon=?,status=?,set_at=?,notes=?,updated_at=?,updated_by=? WHERE id=?").bind(name,lat,lon,status,setAt,notes,now,actor,id),
      correction
    ].filter(Boolean));
    return json({ok:true,trap:updated});
  } catch(error){return dbError(error);}
}

export async function onRequestDelete(context) {
  try {
    const db=getDb(context), id=context.params.id, actor=actorFromContext(context), now=isoNow();
    const current=await db.prepare("SELECT * FROM traps WHERE id=?").bind(id).first();
    if(!current)return json({ok:true,id,status:"retrieved"});
    const updated={...current,status:'retrieved',updated_at:now,updated_by:actor};
    await db.batch([
      db.prepare("UPDATE traps SET status='retrieved', updated_at=?, updated_by=? WHERE id=?").bind(now,actor,id),
      correctionEventStatement(db,'trap',id,'retrieve',current,updated,actor)
    ].filter(Boolean));
    return json({ok:true,id,status:"retrieved"});
  } catch(error){return dbError(error);}
}
