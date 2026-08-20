import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(new URL('..', import.meta.url).pathname);
const required=[
  'index.html','app.js','styles.css','depth.js','manifest.webmanifest','sw.js','boot.js','login.html','_headers',
  'functions/_middleware.js','functions/_lib/auth.js',
  'functions/api/state.js','functions/api/traps.js','functions/api/checks.js','functions/api/trips.js',
  'functions/api/plan.js','functions/api/heatmap.js','functions/api/depth-grid.js','functions/api/depth-contours.js',
  'functions/api/auth/login.js','functions/api/auth/logout.js','functions/api/auth/session.js',
  'migrations/0001_init.sql','migrations/0002_day_plans.sql'
];
for(const file of required){if(!fs.existsSync(path.join(root,file))) throw new Error(`Missing ${file}`)}
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
const planApi=fs.readFileSync(path.join(root,'functions/api/plan.js'),'utf8');
for(const token of ['dayPlan','roundSequence','mobilePlanSheet','mobileFitPlanBtn','mobileRefreshPlanBtn','mobileStartRoundBtn','placementBanner','cancelPlacementBtn','skipSelectedTrap','openTrapFromSelectedSpot','planConflict','getGpsFix','syncWorkspace']){
  if(!app.includes(token)&&!html.includes(token)) throw new Error(`Missing v2.2 feature token: ${token}`);
}
if(!planApi.includes('base_updated_at')||!planApi.includes('409')) throw new Error('Plan concurrency guard missing');
if(!sw.includes("networkFirst(req, SHELL_CACHE)")) throw new Error('App shell must be network-first');
if(!sw.includes('MAP_CACHE')) throw new Error('Map runtime cache missing');
if(!html.includes('boot.js?v=2.2.0')||!app.includes("sw.js?v=2.2.0")) throw new Error('Asset version not bumped to 2.2.0');
const ids=[...html.matchAll(/id="([^"]+)"/g)].map(m=>m[1]);
const seen=new Set(); for(const id of ids){if(seen.has(id)) throw new Error(`Duplicate DOM id: ${id}`); seen.add(id)}
const refs=[...app.matchAll(/\$\('([^']+)'\)/g)].map(m=>m[1]);
for(const id of new Set(refs)){if(!seen.has(id)) throw new Error(`app.js references missing DOM id: ${id}`)}
console.log('Hummerkartan v2.2.0: mobil planering, round-flöde, auth, PWA-uppdatering och plan-konfliktskydd OK');
