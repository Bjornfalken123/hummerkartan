import { getDb, json, dbError } from '../_lib/common.js';

function validYear(value){return /^20\d{2}$/.test(String(value||''));}

export async function onRequestGet(context){
  try{
    const db=getDb(context),url=new URL(context.request.url);
    const year=validYear(url.searchParams.get('year'))?url.searchParams.get('year'):String(new Date().getUTCFullYear());
    const [totals,bestTraps,trips,days,years]=await Promise.all([
      db.prepare(`SELECT COUNT(*) AS checks,COALESCE(SUM(lobster_count),0) AS lobsters,COALESCE(SUM(released_count),0) AS released
        FROM checks WHERE substr(checked_at,1,4)=?`).bind(year).first(),
      db.prepare(`SELECT t.id,t.name,COUNT(c.id) AS checks,COALESCE(SUM(c.lobster_count),0) AS lobsters,
          CASE WHEN COUNT(c.id)>0 THEN CAST(SUM(c.lobster_count) AS REAL)/COUNT(c.id) ELSE 0 END AS avg_catch,
          MAX(c.checked_at) AS last_checked_at
        FROM traps t LEFT JOIN checks c ON c.trap_id=t.id AND substr(c.checked_at,1,4)=?
        GROUP BY t.id,t.name HAVING COUNT(c.id)>0
        ORDER BY avg_catch DESC,checks DESC,lower(t.name) LIMIT 30`).bind(year).all(),
      db.prepare(`SELECT COUNT(*) AS trips,COALESCE(SUM(distance_nm),0) AS distance_nm,
          COALESCE(SUM(CASE WHEN ended_at IS NOT NULL THEN (julianday(ended_at)-julianday(started_at))*24.0 ELSE 0 END),0) AS hours
        FROM trips WHERE substr(started_at,1,4)=?`).bind(year).first(),
      db.prepare(`SELECT substr(checked_at,1,10) AS day,COUNT(*) AS checks,COALESCE(SUM(lobster_count),0) AS lobsters
        FROM checks WHERE substr(checked_at,1,4)=? GROUP BY substr(checked_at,1,10) ORDER BY day DESC LIMIT 24`).bind(year).all(),
      db.prepare(`SELECT DISTINCT substr(checked_at,1,4) AS year FROM checks WHERE checked_at IS NOT NULL
        UNION SELECT DISTINCT substr(started_at,1,4) AS year FROM trips WHERE started_at IS NOT NULL ORDER BY year DESC`).all()
    ]);
    const checks=Number(totals?.checks)||0,lobsters=Number(totals?.lobsters)||0;
    return json({ok:true,year,years:(years.results||[]).map(r=>r.year).filter(Boolean),summary:{
      checks,lobsters,released:Number(totals?.released)||0,average:checks?lobsters/checks:0,
      trips:Number(trips?.trips)||0,distance_nm:Number(trips?.distance_nm)||0,hours:Number(trips?.hours)||0
    },best_traps:bestTraps.results||[],days:days.results||[]});
  }catch(error){return dbError(error);}
}
