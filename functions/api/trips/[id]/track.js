import { getDb, json, dbError } from "../../../_lib/common.js";
export async function onRequestGet(context){
  try{const db=getDb(context),id=context.params.id;const r=await db.prepare("SELECT * FROM track_points WHERE trip_id=? ORDER BY seq").bind(id).all();return json({ok:true,points:r.results||[]});}
  catch(error){return dbError(error);}
}
