import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(new URL('..', import.meta.url).pathname);
const required=[
  'index.html','app.js','styles.css','depth.js','manifest.webmanifest','sw.js','boot.js','login.html','_headers',
  'functions/_middleware.js','functions/_lib/auth.js','functions/api/state.js','functions/api/traps.js','functions/api/checks.js','functions/api/trips.js',
  'functions/api/planned-traps.js','functions/api/planned-traps/[id].js','functions/api/reports.js','functions/api/heatmap.js','functions/api/depth-grid.js','functions/api/depth-contours.js',
  'functions/api/auth/login.js','functions/api/auth/logout.js','functions/api/auth/session.js',
  'icon-192.png','icon-512.png','apple-touch-icon.png',
  'migrations/0001_init.sql','migrations/0002_day_plans.sql','migrations/0003_planned_traps.sql'
];
for(const file of required){if(!fs.existsSync(path.join(root,file))) throw new Error(`Missing ${file}`)}
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
const stateApi=fs.readFileSync(path.join(root,'functions/api/state.js'),'utf8');
const migration=fs.readFileSync(path.join(root,'migrations/0003_planned_traps.sql'),'utf8');
for(const token of ['mobile-mode-planning','planAddBtn','planOverviewBtn','fishSetTrapBtn','tripPill','reportsView','planned_traps','requestSetTrap','saveCheck','toggleHeatmap','placementCrosshair']){
  if(!app.includes(token)&&!html.includes(token)&&!stateApi.includes(token)) throw new Error(`Missing v3 token: ${token}`);
}
for(const forbidden of ['roundBtn','mobileStartRoundBtn','planDate','mobilePlanDate','navBanner','navigateTrapBtn']){
  if(html.includes(`id="${forbidden}"`)) throw new Error(`Legacy v2 UI still present: ${forbidden}`);
}
if(!migration.includes('CREATE TABLE IF NOT EXISTS planned_traps')) throw new Error('planned_traps migration missing');
if(!stateApi.includes('planned_traps')) throw new Error('state API must return planned traps');
if(!sw.includes("networkFirst(req, SHELL_CACHE)")) throw new Error('App shell must be network-first');
if(!sw.includes('hummerkartan-shell-v10')) throw new Error('Service worker cache not bumped');
if(!html.includes('boot.js?v=3.2.1')||!html.includes('styles.css?v=3.2.1')||!app.includes("sw.js?v=3.2.1")) throw new Error('Asset version not bumped to 3.0.0');
if(!fs.readFileSync(path.join(root,'boot.js'),'utf8').includes("app.js?v=3.2.1")) throw new Error('Boot app version not bumped');
const ids=[...html.matchAll(/id="([^"]+)"/g)].map(m=>m[1]);
const seen=new Set();for(const id of ids){if(seen.has(id))throw new Error(`Duplicate DOM id: ${id}`);seen.add(id)}
const refs=[...app.matchAll(/\$\('([^']+)'\)/g)].map(m=>m[1]);
for(const id of new Set(refs)){if(!seen.has(id))throw new Error(`app.js references missing DOM id: ${id}`)}
console.log('Hummerkartan v3.2.1: karta-i-fokus, Planering/Fiske, planned_traps, rapporter, auth och PWA-kontroller OK');
