import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(new URL('..', import.meta.url).pathname);
const required=[
  'index.html','app.js','gps.js','soak.js','styles.css','RELEASE-V3.6.md','RELEASE-V3.6.1.md','RELEASE-V3.6.2.md','RELEASE-V3.6.3.md','depth.js','manifest.webmanifest','sw.js','boot.js','login.html','_headers',
  'functions/_middleware.js','functions/_lib/auth.js','functions/api/state.js','functions/api/traps.js','functions/api/checks.js','functions/api/trips.js',
  'functions/api/planned-traps.js','functions/api/planned-traps/[id].js','functions/api/planned-traps/[id]/set.js','functions/api/reports.js','functions/api/heatmap.js','functions/api/depth-grid.js','functions/api/depth-contours.js',
  'functions/api/trips/[id].js','functions/api/checks/[id].js',
  'functions/api/auth/login.js','functions/api/auth/logout.js','functions/api/auth/session.js',
  'icon-192.png','icon-512.png','apple-touch-icon.png',
  'migrations/0001_init.sql','migrations/0002_day_plans.sql','migrations/0003_planned_traps.sql','migrations/0004_position_events.sql','migrations/0005_trip_events_corrections.sql','migrations/0006_check_locations.sql'
];
for(const file of required){if(!fs.existsSync(path.join(root,file))) throw new Error(`Missing ${file}`)}
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
const stateApi=fs.readFileSync(path.join(root,'functions/api/state.js'),'utf8');
const migration=fs.readFileSync(path.join(root,'migrations/0003_planned_traps.sql'),'utf8');
const gps=fs.readFileSync(path.join(root,'gps.js'),'utf8');
const soak=fs.readFileSync(path.join(root,'soak.js'),'utf8');
const positionMigration=fs.readFileSync(path.join(root,'migrations/0004_position_events.sql'),'utf8');
const tripMigration=fs.readFileSync(path.join(root,'migrations/0005_trip_events_corrections.sql'),'utf8');
const checkLocationMigration=fs.readFileSync(path.join(root,'migrations/0006_check_locations.sql'),'utf8');
const heatmapApi=fs.readFileSync(path.join(root,'functions/api/heatmap.js'),'utf8');
const checksApi=fs.readFileSync(path.join(root,'functions/api/checks.js'),'utf8');
const common=fs.readFileSync(path.join(root,'functions/_lib/common.js'),'utf8');
for(const token of ['mobile-mode-planning','planAddBtn','planOverviewBtn','fishSetTrapBtn','tripPill','reportsView','planned_traps','requestSetTrap','saveCheck','toggleHeatmap','placementCrosshair']){
  if(!app.includes(token)&&!html.includes(token)&&!stateApi.includes(token)) throw new Error(`Missing v3 token: ${token}`);
}
for(const forbidden of ['roundBtn','mobileStartRoundBtn','planDate','mobilePlanDate','navBanner','navigateTrapBtn']){
  if(html.includes(`id="${forbidden}"`)) throw new Error(`Legacy v2 UI still present: ${forbidden}`);
}
if(!migration.includes('CREATE TABLE IF NOT EXISTS planned_traps')) throw new Error('planned_traps migration missing');
if(!stateApi.includes('planned_traps')) throw new Error('state API must return planned traps');
if(!sw.includes("networkFirst(req, SHELL_CACHE)")) throw new Error('App shell must be network-first');
if(!sw.includes('hummerkartan-shell-v18')) throw new Error('Service worker cache not bumped');
if(!html.includes('boot.js?v=3.6.3')||!html.includes('styles.css?v=3.6.3')||!app.includes("sw.js?v=3.6.3")) throw new Error('Asset version not bumped to 3.6.3');
if(!fs.readFileSync(path.join(root,'boot.js'),'utf8').includes("app.js?v=3.6.3")) throw new Error('Boot app version not bumped');
if(!app.includes("TRAP_SOURCE_ID='hk-traps-source'")||!app.includes("PLANNED_SOURCE_ID='hk-planned-source'")) throw new Error('Map point GeoJSON layers missing');
if(app.includes("new maptilersdk.Marker({element:el,anchor:'bottom'")) throw new Error('Trap/planned DOM markers must not be used');
if(!app.includes("maximumAge:0")||!app.includes('captureSetPosition')||!gps.includes('time-interpolated')) throw new Error('Robust GPS capture missing');
if(!soak.includes('FRESH_MAX')||!soak.includes('DUE_MAX')||!app.includes('soakSummaryHtml')) throw new Error('Soak-age status system missing');
if(!html.includes('Fångstdata')||!app.includes('const visible=heatmapVisible')) throw new Error('Fishing heatmap access missing');
if(!checkLocationMigration.includes('CREATE TABLE IF NOT EXISTS check_locations')||!checkLocationMigration.includes('legacy_trap_backfill')) throw new Error('v3.6.1 check location migration missing');
if(!heatmapApi.includes('cl.trap_lat')||heatmapApi.includes('COALESCE(c.lat,t.lat)')) throw new Error('Heatmap must use canonical check location, never observer GPS');
if(!checksApi.includes('client_trap_snapshot')||!checksApi.includes('check_locations')||!checksApi.includes('resolveTripId')) throw new Error('Checks API must snapshot trap location and resolve historical trip safely');
if(!html.includes('detailVittjaBtn')||!html.includes('checkAt')||!app.includes("$('detailVittjaBtn').addEventListener")) throw new Error('Desktop check flow missing');
if(!positionMigration.includes('CREATE TABLE IF NOT EXISTS position_events')) throw new Error('position_events migration missing');
if(!tripMigration.includes('CREATE TABLE IF NOT EXISTS trip_events')||!tripMigration.includes('CREATE TABLE IF NOT EXISTS correction_events')) throw new Error('v3.5 trip/correction migration missing');
if(!tripMigration.includes('CREATE TABLE IF NOT EXISTS app_migrations')) throw new Error('v3.5 migration must be self-contained');
if(!stateApi.includes('trip_events')||!stateApi.includes('correction_events')) throw new Error('state API must expose v3.5 capabilities');
if(!app.includes('trackPointDecision')||!app.includes('maxPitch:0')||!app.includes('disableRotation')) throw new Error('GPS jitter filter or 2D map lock missing');
if(!app.includes('/planned-traps/${encodeURIComponent(planned.id)}/set')) throw new Error('Atomic planned-to-set conversion missing');
if(app.includes('new maptilersdk.Marker({element:el')) throw new Error('DOM map markers should not be used for app entities');
for(const token of ['nearbyActionCard','menuTripsBtn','desktopTripsList','tripCompleteSheet','confirmSheet','editCheckSheet','trapStatusSummary','desktopSoakSummary','mobileReportSoakSummary','desktopReportSoakSummary']){if(!html.includes(`id="${token}"`))throw new Error(`Missing v3.5 UI: ${token}`)}
for(const token of ['renderNearbyWorkSuggestion','nearestWorkCandidate','trapNeedsCheckSuggestion','openTripDetail','saveCheckEdit','confirmAction','NEARBY_WORK_ENTER_M','trip_id:activeTrip?.id','tripStartPromise','selectedTrapId||selectedPlannedId']){if(!app.includes(token))throw new Error(`Missing v3.5 behavior: ${token}`)}
if(app.includes('confirm('))throw new Error('Native confirm dialogs must not be used');
if(app.includes("rgba(222,76,53")||app.includes("rgba(177,36,50")||app.includes("rgba(255,203,89")) throw new Error('Heatmap must not reuse urgency amber/red palette');
if(!html.includes('Fångstdata')) throw new Error('Unified Fångstdata layer label missing');


if(!checksApi.includes('resolveTripId')||!common.includes('export async function resolveTripId')) throw new Error('Stale trip protection missing for checks');
if(!common.includes("value == null || value === ''")||!common.includes("lat == null || lon == null")) throw new Error('Null coordinate validation missing');
if(!stateApi.includes('check_locations:Boolean(checkLocationsTable)')) throw new Error('check_locations capability preflight missing');
if(!app.includes('pendingStart')||!app.includes('serverTrip.ended_at')) throw new Error('Client stale activeTrip healing missing');

const ids=[...html.matchAll(/id="([^"]+)"/g)].map(m=>m[1]);
const seen=new Set();for(const id of ids){if(seen.has(id))throw new Error(`Duplicate DOM id: ${id}`);seen.add(id)}
const refs=[...app.matchAll(/\$\('([^']+)'\)/g)].map(m=>m[1]);
for(const id of new Set(refs)){if(!seen.has(id))throw new Error(`app.js references missing DOM id: ${id}`)}
console.log('Hummerkartan v3.6.3: soak-status, smart arbetsförslag, Fångstdata i båda lägen, enhetlig marin UI, Turer/efterarbete och PWA OK');
