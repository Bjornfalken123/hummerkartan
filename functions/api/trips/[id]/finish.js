import { getDb, json, dbError, actorFromRequest, readJson, finite, text, isoNow } from "../../../_lib/common.js";
export async function onRequestPost(context){
  try{
    const db=getDb(context),id=context.params.id,body=await readJson(context.request),ended=text(body.ended_at,isoNow())||isoNow(),distance=Math.max(0,finite(body.distance_nm,0)),actor=actorFromRequest(context.request);
    await db.prepare("UPDATE trips SET ended_at=?,distance_nm=?,updated_at=?,actor=? WHERE id=?").bind(ended,distance,isoNow(),actor,id).run();
    return json({ok:true,id,ended_at:ended,distance_nm:distance});
  }catch(error){return dbError(error);}
}
