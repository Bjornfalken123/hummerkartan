import { getDb, json, dbError, actorFromContext, readJson, text, finite, isoNow } from "../_lib/common.js";

function validDate(value){return /^\d{4}-\d{2}-\d{2}$/.test(String(value||""));}

async function readPlan(db,date){
  const plan=await db.prepare("SELECT * FROM day_plans WHERE plan_date=?").bind(date).first();
  if(!plan) return {plan:null,items:[]};
  const rows=await db.prepare(`SELECT i.*, t.status AS trap_status, t.last_checked_at AS trap_last_checked_at
    FROM day_plan_items i LEFT JOIN traps t ON t.id=i.trap_id
    WHERE i.plan_id=? ORDER BY i.seq, i.created_at`).bind(plan.id).all();
  return {plan,items:rows.results||[]};
}

export async function onRequestGet(context){
  try{
    const db=getDb(context),url=new URL(context.request.url),date=url.searchParams.get("date")||new Date().toISOString().slice(0,10);
    if(!validDate(date)) return json({ok:false,error:"Ogiltigt datum"},400);
    const result=await readPlan(db,date);
    return json({ok:true,date,...result});
  }catch(error){return dbError(error);}
}

export async function onRequestPut(context){
  try{
    const db=getDb(context),body=await readJson(context.request),actor=actorFromContext(context),date=text(body.date);
    if(!validDate(date)) return json({ok:false,error:"Ogiltigt datum"},400);
    const now=isoNow(),existing=await db.prepare("SELECT * FROM day_plans WHERE plan_date=?").bind(date).first();
    const baseUpdatedAt=text(body.base_updated_at),baseKnown=body.base_known===true,force=body.force===true;
    if(existing&&!force&&((baseUpdatedAt&&existing.updated_at!==baseUpdatedAt)||(baseKnown&&!baseUpdatedAt))){
      const current=await readPlan(db,date);
      return json({ok:false,error:"Planen har ändrats på en annan enhet.",conflict:true,...current},409);
    }
    const planId=existing?.id||crypto.randomUUID(),name=text(body.name,`Hummertur ${date}`).slice(0,120);
    if(existing){
      await db.prepare("UPDATE day_plans SET name=?,updated_at=?,updated_by=? WHERE id=?").bind(name,now,actor,planId).run();
    }else{
      await db.prepare("INSERT INTO day_plans (id,plan_date,name,created_at,updated_at,updated_by) VALUES (?,?,?,?,?,?)").bind(planId,date,name,now,now,actor).run();
    }
    const input=Array.isArray(body.items)?body.items.slice(0,80):[];
    const statements=[db.prepare("DELETE FROM day_plan_items WHERE plan_id=?").bind(planId)];
    let seq=0;
    for(const raw of input){
      const lat=finite(raw.lat),lon=finite(raw.lon);if(lat==null||lon==null||Math.abs(lat)>90||Math.abs(lon)>180)continue;
      const kind=raw.kind==="spot"?"spot":"trap",trapId=kind==="trap"?text(raw.trap_id)||null:null;
      statements.push(db.prepare(`INSERT INTO day_plan_items (id,plan_id,seq,kind,trap_id,name,lat,lon,notes,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`).bind(text(raw.id)||crypto.randomUUID(),planId,seq++,kind,trapId,text(raw.name,kind==="spot"?"Planerad plats":"Tina").slice(0,100),lat,lon,text(raw.notes).slice(0,500),now,now));
    }
    await db.batch(statements);
    const result=await readPlan(db,date);
    return json({ok:true,date,...result});
  }catch(error){return dbError(error);}
}
