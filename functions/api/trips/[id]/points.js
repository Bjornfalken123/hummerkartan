import { getDb, json, dbError, actorFromContext, readJson, finite, text, isoNow } from "../../../_lib/common.js";

export async function onRequestPost(context){
  try{
    const db=getDb(context),tripId=context.params.id,body=await readJson(context.request),actor=actorFromContext(context);
    const points=Array.isArray(body.points)?body.points.slice(0,300):[];
    if(!points.length) return json({ok:true,inserted:0});
    const statements=[];
    for(const p of points){
      const seq=Math.max(0,Math.round(finite(p.seq,0))),lat=finite(p.lat),lon=finite(p.lon);
      if(lat==null||lon==null) continue;
      statements.push(db.prepare(`INSERT OR IGNORE INTO track_points (trip_id,seq,lat,lon,speed_kn,course,accuracy,recorded_at,actor)
        VALUES (?,?,?,?,?,?,?,?,?)`).bind(tripId,seq,lat,lon,finite(p.speed_kn),finite(p.course),finite(p.accuracy),text(p.recorded_at,isoNow()),actor));
    }
    if(statements.length) await db.batch(statements);
    return json({ok:true,inserted:statements.length});
  }catch(error){return dbError(error);}
}
