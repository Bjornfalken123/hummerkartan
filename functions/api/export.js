import { getDb, json, dbError } from '../_lib/common.js';

async function optionalAll(db,table,orderBy=''){
  try{
    const exists=await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1").bind(table).first();
    if(!exists)return {results:[]};
    return await db.prepare(`SELECT * FROM ${table}${orderBy?` ORDER BY ${orderBy}`:''}`).all();
  }catch{return {results:[]}}
}

export async function onRequestGet(context){
  try{
    const db=getDb(context);
    const [traps,checks,checkLocations,trips,points,planned,positionEvents,tripEvents,corrections,plans,planItems]=await Promise.all([
      db.prepare('SELECT * FROM traps ORDER BY created_at').all(),
      db.prepare('SELECT * FROM checks ORDER BY checked_at').all(),
      optionalAll(db,'check_locations','captured_at'),
      db.prepare('SELECT * FROM trips ORDER BY started_at').all(),
      db.prepare('SELECT * FROM track_points ORDER BY trip_id,seq').all(),
      db.prepare('SELECT * FROM planned_traps ORDER BY created_at').all(),
      optionalAll(db,'position_events','action_at'),
      optionalAll(db,'trip_events','occurred_at'),
      optionalAll(db,'correction_events','created_at'),
      db.prepare('SELECT * FROM day_plans ORDER BY plan_date').all(),
      db.prepare('SELECT * FROM day_plan_items ORDER BY plan_id,seq').all()
    ]);
    return json({version:7,exported_at:new Date().toISOString(),traps:traps.results||[],checks:checks.results||[],check_locations:checkLocations.results||[],trips:trips.results||[],track_points:points.results||[],planned_traps:planned.results||[],position_events:positionEvents.results||[],trip_events:tripEvents.results||[],correction_events:corrections.results||[],legacy_day_plans:plans.results||[],legacy_day_plan_items:planItems.results||[]});
  }catch(error){return dbError(error);}
}
