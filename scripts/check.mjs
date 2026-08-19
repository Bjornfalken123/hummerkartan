import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(new URL('..', import.meta.url).pathname);
const required=[
  'index.html','app.js','styles.css','depth.js','manifest.webmanifest','sw.js',
  'functions/api/state.js','functions/api/traps.js','functions/api/checks.js','functions/api/trips.js',
  'functions/api/plan.js','functions/api/heatmap.js','functions/api/depth-grid.js','functions/api/depth-contours.js',
  'migrations/0001_init.sql','migrations/0002_day_plans.sql'
];
for(const file of required){if(!fs.existsSync(path.join(root,file))) throw new Error(`Missing ${file}`)}
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
for(const token of ['catch-heat-layer','dayPlan','roundSequence','plan-route']){
  if(!app.includes(token)) throw new Error(`Missing v2 feature token: ${token}`);
}
if(!html.includes('id="desktopPanel"')) throw new Error('Missing desktop planner');
console.log('Hummerkartan v2: grundfiler och huvudfunktioner OK');
