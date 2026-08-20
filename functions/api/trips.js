import { getDb, json, dbError, actorFromContext, readJson, text, uuid, isoNow } from "../_lib/common.js";

export async function onRequestGet(context){
  try{const db=getDb(context);const r=await db.prepare("SELECT * FROM trips ORDER BY started_at DESC LIMIT 100").all();return json({ok:true,trips:r.results||[]});}
  catch(error){return dbError(error);}
}

export async function onRequestPost(context){
  try{
    const db=getDb(context),body=await readJson(context.request),actor=actorFromContext(context),id=uuid(body.id),started=text(body.started_at,isoNow())||isoNow();
    const name=text(body.name,"Hummertur").slice(0,100)||"Hummertur";
    await db.prepare("INSERT OR IGNORE INTO trips (id,name,started_at,ended_at,distance_nm,actor,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)")
      .bind(id,name,started,null,0,actor,isoNow(),isoNow()).run();
    const trip=await db.prepare("SELECT * FROM trips WHERE id=?").bind(id).first();
    return json({ok:true,trip},201);
  }catch(error){return dbError(error);}
}
