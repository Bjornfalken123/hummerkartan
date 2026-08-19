import { getDb, json, dbError } from "../_lib/common.js";
export async function onRequestGet(context){
  try{
    const db=getDb(context);
    const [traps,checks,trips,points,plans,planItems]=await Promise.all([
      db.prepare("SELECT * FROM traps ORDER BY created_at").all(),
      db.prepare("SELECT * FROM checks ORDER BY checked_at").all(),
      db.prepare("SELECT * FROM trips ORDER BY started_at").all(),
      db.prepare("SELECT * FROM track_points ORDER BY trip_id,seq").all(),
      db.prepare("SELECT * FROM day_plans ORDER BY plan_date").all(),
      db.prepare("SELECT * FROM day_plan_items ORDER BY plan_id,seq").all()
    ]);
    return json({version:2,exported_at:new Date().toISOString(),traps:traps.results||[],checks:checks.results||[],trips:trips.results||[],track_points:points.results||[],day_plans:plans.results||[],day_plan_items:planItems.results||[]});
  }catch(error){return dbError(error);}
}
