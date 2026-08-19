import { getDb, json, dbError } from "../_lib/common.js";

// Heatmapen visar resultat per litet område, inte bara total fångst per bur.
// Rutstorleken är ungefär 200–250 m på svenska västkusten.
const LAT_CELL=0.0020;
const LON_CELL=0.0035;

export async function onRequestGet(context){
  try{
    const db=getDb(context);
    const rows=await db.prepare(`
      SELECT t.id AS trap_id,t.name,t.lat,t.lon,
             COUNT(c.id) AS check_count,
             COALESCE(SUM(c.lobster_count),0) AS lobster_count,
             COALESCE(AVG(c.lobster_count),0) AS avg_catch,
             MAX(c.checked_at) AS last_checked_at
      FROM traps t
      JOIN checks c ON c.trap_id=t.id
      GROUP BY t.id,t.name,t.lat,t.lon
    `).all();

    const cells=new Map();
    for(const row of rows.results||[]){
      const lat=Number(row.lat),lon=Number(row.lon),checks=Number(row.check_count)||0,lobsters=Number(row.lobster_count)||0;
      if(!Number.isFinite(lat)||!Number.isFinite(lon)||checks<1) continue;
      const y=Math.floor(lat/LAT_CELL),x=Math.floor(lon/LON_CELL),key=`${y}:${x}`;
      let cell=cells.get(key);
      if(!cell){cell={key,lat_sum:0,lon_sum:0,position_weight:0,check_count:0,lobster_count:0,last_checked_at:null,names:[]};cells.set(key,cell);}
      cell.lat_sum+=lat*checks;cell.lon_sum+=lon*checks;cell.position_weight+=checks;cell.check_count+=checks;cell.lobster_count+=lobsters;
      if(row.name&&!cell.names.includes(row.name))cell.names.push(row.name);
      if(row.last_checked_at&&(!cell.last_checked_at||row.last_checked_at>cell.last_checked_at))cell.last_checked_at=row.last_checked_at;
    }

    let points=[...cells.values()].map(cell=>{
      const avg=cell.check_count?cell.lobster_count/cell.check_count:0;
      // Ett enstaka lyckat vittjningstillfälle ska inte dominera kartan.
      // Full visuell tilltro nås från fyra vittjningar i området.
      const confidence=Math.min(1,Math.sqrt(cell.check_count/4));
      return {
        id:cell.key,
        name:cell.names.length===1?cell.names[0]:`${cell.names.length} burplatser`,
        lat:cell.lat_sum/Math.max(1,cell.position_weight),
        lon:cell.lon_sum/Math.max(1,cell.position_weight),
        check_count:cell.check_count,
        lobster_count:cell.lobster_count,
        avg_catch:avg,
        score:avg*confidence,
        last_checked_at:cell.last_checked_at
      };
    });

    const maxScore=Math.max(0,...points.map(p=>p.score));
    points=points.map(p=>({...p,weight:maxScore>0?p.score/maxScore:0})).sort((a,b)=>b.avg_catch-a.avg_catch||b.check_count-a.check_count);
    const totals=points.reduce((a,p)=>{a.checks+=p.check_count;a.lobsters+=p.lobster_count;return a},{checks:0,lobsters:0});
    return json({ok:true,cell_meters_approx:220,points,totals:{...totals,average:totals.checks?totals.lobsters/totals.checks:0}});
  }catch(error){return dbError(error);}
}
