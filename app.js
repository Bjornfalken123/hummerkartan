import { initNauticalDepth, setNauticalDepthTheme } from './depth.js';
import { GPS_DEFAULTS, normalizeGpsFix, chooseActionFix, trackPointDecision } from './gps.js';
import { soakAgeMs, soakStatus, soakStatusLabel, formatSoakAge, soakSummary } from './soak.js';

const MAPTILER_API_KEY='72WUquDNJCLDzyB9DSky'; // Publik klientnyckel. Begränsa till appens domän i MapTiler.
const CACHE_KEY='hummerkartan:state:v3';
const LEGACY_CACHE_KEY='hummerkartan:state:v2';
const PENDING_KEY='hummerkartan:pending:v2'; // behåll gamla offlineköer över uppgraderingen
const TRIP_KEY='hummerkartan:activeTrip:v2';
const HEAT_CACHE_KEY='hummerkartan:heat:v2';
const REPORT_CACHE_KEY='hummerkartan:reports:v3';
const AUTH_DEVICE_KEY='hummerkartan:auth-device:v1';
const MOBILE_MODE_KEY='hummerkartan:mobile-mode:v2';
const WEST_COAST_CENTER=[11.45,58.15];
const START_ZOOM=8.2;
const NAV_ZOOM=14.2;
const DESKTOP_BREAKPOINT=900;
const GPS_HISTORY_MS=12000;
const GPS_SET_WAIT_MS=4200;
const GPS_CHECK_MAX_ACCURACY_M=35;
const GPS_CHECK_MAX_AGE_MS=5000;
const NEARBY_WORK_ENTER_M=110;
const NEARBY_WORK_EXIT_M=170;
const NEARBY_WORK_DISMISS_MS=120000;

const $=id=>document.getElementById(id);
const state={traps:[],checks:[],trips:[],planned:[],user:'familj',serverTime:null,capabilities:{}};
let map=null,watchId=null,currentPosition=null,currentAccuracy=null,lastPosition=null,lastPositionAt=0;
const TRAP_SOURCE_ID='hk-traps-source',TRAP_HALO_LAYER_ID='hk-traps-halo',TRAP_HIT_LAYER_ID='hk-traps-hit',TRAP_POINT_LAYER_ID='hk-traps-points',TRAP_LABEL_LAYER_ID='hk-traps-labels',TRAP_FOCUS_LABEL_LAYER_ID='hk-traps-focus-labels';
const PLANNED_SOURCE_ID='hk-planned-source',PLANNED_HALO_LAYER_ID='hk-planned-halo',PLANNED_HIT_LAYER_ID='hk-planned-hit',PLANNED_POINT_LAYER_ID='hk-planned-points',PLANNED_LABEL_LAYER_ID='hk-planned-labels',PLANNED_FOCUS_LABEL_LAYER_ID='hk-planned-focus-labels';
const BOAT_SOURCE_ID='hk-boat-source',BOAT_HALO_LAYER_ID='hk-boat-halo',BOAT_SYMBOL_LAYER_ID='hk-boat-symbol';
let selectedTrapId=null,selectedPlannedId=null,currentFix=null,mapPointEventsBound=false;
let nearbyWork=null,nearbyDismissed=new Map(),lastSpeedKn=0,confirmResolver=null;
let desktopTab='plan',selectedHistoryTripId=null,historyTripDetail=null,historyTrackPoints=[];
let gpsFixHistory=[],gpsFixWaiters=[],lastHandledFixTimestamp=null,schemaWarningShown=false,serverClockOffsetMs=0;
let activeTrip=loadJson(TRIP_KEY,null),tripPoints=[],trackBatch=[],trackSeq=0,tripDistanceNm=0,tripStartPromise=null;
let theme=localStorage.getItem('hummerkartan:theme')==='night'?'night':'day';
let mobileMode=localStorage.getItem(MOBILE_MODE_KEY)==='planning'?'planning':'fishing';
let filterActiveOnly=true,desktopFilterActive=true,desktopSearch='',placementMode=null,pendingSet=null,toastTimer=null,syncTimer=null,actionBusy=false,lastOfflineToastAt=0;
let heatData=loadJson(HEAT_CACHE_KEY,{points:[],totals:{checks:0,lobsters:0,average:0}}),heatmapVisible=false;
let reportData=loadJson(REPORT_CACHE_KEY,null),reportYear=String(new Date().getFullYear());

function loadJson(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}}
function saveJson(key,value){try{localStorage.setItem(key,JSON.stringify(value))}catch{}}
function esc(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function isoNow(){return new Date().toISOString()}
function fmtDate(value){if(!value)return 'Inte vittjad';const d=new Date(value);return Number.isNaN(d.valueOf())?'—':d.toLocaleString('sv-SE',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}
function fmtDay(value){if(!value)return '—';const d=new Date(value);return Number.isNaN(d.valueOf())?'—':d.toLocaleDateString('sv-SE',{year:'numeric',month:'short',day:'numeric'})}
function fmtClock(value){if(!value)return '—';const d=new Date(value);return Number.isNaN(d.valueOf())?'—':d.toLocaleTimeString('sv-SE',{hour:'2-digit',minute:'2-digit'})}
function toLocalDateTimeInput(value=Date.now()){const d=new Date(value);if(Number.isNaN(d.valueOf()))return '';const local=new Date(d.getTime()-d.getTimezoneOffset()*60000);return local.toISOString().slice(0,16)}
function checkActionTimeMs(){if(isDesktop()&&$('checkAt')?.value){const d=new Date($('checkAt').value);if(!Number.isNaN(d.valueOf()))return d.getTime()}return Date.now()}
function fmtDuration(ms){const total=Math.max(0,Math.round(Number(ms||0)/60000)),h=Math.floor(total/60),m=total%60;return h?`${h} h ${m} min`:`${m} min`}
function clamp(n,a,b){return Math.max(a,Math.min(b,n))}
function toRad(d){return d*Math.PI/180}
function distanceNm(a,b){if(!a||!b)return Infinity;const R=3440.065,lat1=toRad(a.lat),lat2=toRad(b.lat),dLat=lat2-lat1,dLon=toRad(b.lon-a.lon),h=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;return 2*R*Math.asin(Math.min(1,Math.sqrt(h)))}
function knots(ms){return Number.isFinite(ms)?ms*1.943844:null}
function isDesktop(){return window.innerWidth>=DESKTOP_BREAKPOINT}
function activeTraps(){return state.traps.filter(t=>t.status==='active')}
function toast(text,ms=2400){const el=$('toast');if(!el)return;el.textContent=text;el.classList.remove('hidden');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.add('hidden'),ms)}
function setSync(text,ok=true){if($('desktopSyncText')){$('desktopSyncText').textContent=text;$('desktopSyncText').style.color=ok?'':'#e9a18f'}}
function saveState(){saveJson(CACHE_KEY,state)}
function appNowMs(){return Date.now()+serverClockOffsetMs}

function setTheme(next){theme=next==='night'?'night':'day';localStorage.setItem('hummerkartan:theme',theme);document.body.classList.toggle('night',theme==='night');if($('desktopThemeBtn'))$('desktopThemeBtn').textContent=theme==='night'?'☀':'☾';try{setNauticalDepthTheme(theme)}catch{}}

function applyMobileMode(){
  if(isDesktop()){document.body.classList.remove('mobile-mode-planning','mobile-mode-fishing');return}
  document.body.classList.toggle('mobile-mode-planning',mobileMode==='planning');
  document.body.classList.toggle('mobile-mode-fishing',mobileMode==='fishing');
  document.querySelectorAll('[data-mobile-mode]').forEach(btn=>btn.classList.toggle('active',btn.dataset.mobileMode===mobileMode));
  if(mobileMode==='fishing'&&heatmapVisible) updateHeatmapSource();
  renderSelections();renderTripUi();setTimeout(()=>map?.resize(),20);
}
function setMobileMode(mode){if(isDesktop())return;mobileMode=mode==='planning'?'planning':'fishing';localStorage.setItem(MOBILE_MODE_KEY,mobileMode);closeSheets();cancelPlacement({silent:true});applyMobileMode();updateHeatmapSource();}

async function api(method,url,body,{queue=false}={}){
  try{
    const res=await fetch(url,{method,headers:{'content-type':'application/json','accept':'application/json'},body:body==null?undefined:JSON.stringify(body),credentials:'same-origin'});
    const data=await res.json().catch(()=>({}));
    if(!res.ok){const error=new Error(data.error||`HTTP ${res.status}`);error.status=res.status;error.data=data;if(res.status===401&&location.pathname!=='/login')location.replace('/login');throw error}
    return data;
  }catch(error){
    if(queue&&method!=='GET'&&error?.status==null){const pending=loadJson(PENDING_KEY,[]);pending.push({id:crypto.randomUUID(),method,url,body,queued_at:isoNow()});saveJson(PENDING_KEY,pending);setSync('Offline · sparar lokalt',false);if(!url.includes('/points')&&Date.now()-lastOfflineToastAt>4500){lastOfflineToastAt=Date.now();toast('Offline · sparat på telefonen',2800)}return {ok:true,queued:true}}
    throw error;
  }
}

async function flushPending(){
  if(!navigator.onLine)return loadJson(PENDING_KEY,[]).length;
  const pending=loadJson(PENDING_KEY,[]);if(!pending.length)return 0;
  const remain=[];
  for(const item of pending){try{await api(item.method,item.url,item.body)}catch(error){if(error?.status===404&&item.method==='DELETE')continue;remain.push(item)}}
  saveJson(PENDING_KEY,remain);if(!remain.length)toast('Lokala ändringar synkade');return remain.length;
}

function applyServerState(data){
  state.traps=Array.isArray(data.traps)?data.traps:[];state.checks=Array.isArray(data.checks)?data.checks:[];state.trips=Array.isArray(data.trips)?data.trips:[];state.planned=Array.isArray(data.planned_traps)?data.planned_traps:[];state.user=data.user||'familj';state.serverTime=data.serverTime||null;state.capabilities=data.capabilities||{};const serverMs=new Date(state.serverTime||'').getTime();if(Number.isFinite(serverMs))serverClockOffsetMs=serverMs-Date.now();saveState();renderAll();
  if((state.capabilities.position_events===false||state.capabilities.trip_events===false||state.capabilities.correction_events===false)&&!schemaWarningShown){schemaWarningShown=true;toast(state.capabilities.position_events===false?'D1 behöver migration 0004_position_events.sql':'D1 behöver migration 0005_trip_events_corrections.sql',5600)}
}
function restoreCachedState(){const cached=loadJson(CACHE_KEY,null)||loadJson(LEGACY_CACHE_KEY,null);if(!cached)return false;state.traps=Array.isArray(cached.traps)?cached.traps:[];state.checks=Array.isArray(cached.checks)?cached.checks:[];state.trips=Array.isArray(cached.trips)?cached.trips:[];state.planned=Array.isArray(cached.planned)?cached.planned:Array.isArray(cached.planned_traps)?cached.planned_traps:[];state.user=cached.user||'familj';renderAll();return true}
async function syncState({quiet=false}={}){
  try{
    const remain=await flushPending();if(remain){if(!state.traps.length&&!state.planned.length)restoreCachedState();setSync(navigator.onLine?`${remain} ändring${remain===1?'':'ar'} väntar på synk`:'Offline · lokal data',false);renderAll();return false}
    const data=await api('GET','/api/state');applyServerState(data);setSync(`Synkad · ${state.user}`);if($('desktopUser'))$('desktopUser').textContent=state.user;if(!quiet)toast('Synkad');return true;
  }catch(error){
    if(error?.status===401)return false;
    if(restoreCachedState())setSync('Offline · lokal data',false);else setSync('Data kunde inte laddas',false);
    if(String(error.message||'').includes('planned_traps'))toast('D1 behöver migration 0003_planned_traps.sql',5000);else if(!quiet)toast(error.message||'Kunde inte synka');return false;
  }
}

function trapLastCheck(trap){const c=state.checks.find(x=>x.trap_id===trap.id);if(c)return c;if(trap.last_checked_at)return {checked_at:trap.last_checked_at,lobster_count:Number(trap.last_lobster_count)||0,notes:trap.last_check_notes||''};return null}
function trapCheckedThisTrip(id){if(!activeTrip?.started_at)return false;const start=new Date(activeTrip.started_at).getTime();return state.checks.some(c=>c.trap_id===id&&new Date(c.checked_at).getTime()>=start)}
function trapSetThisTrip(trap){if(!activeTrip?.started_at||!trap?.set_at)return false;return new Date(trap.set_at).getTime()>=new Date(activeTrip.started_at).getTime()}
function trapSoakStatus(trap){return soakStatus(trap,appNowMs())}
function trapSoakMeta(trap){if(trap?.status==='retrieved')return 'Upptagen';const status=trapSoakStatus(trap),age=formatSoakAge(soakAgeMs(trap,appNowMs()));return `${soakStatusLabel(status)} · ${age}`}
function trapNeedsCheckSuggestion(trap){return Boolean(activeTrip&&trap?.status==='active'&&!trapCheckedThisTrip(trap.id)&&!trapSetThisTrip(trap)&&['due','priority'].includes(trapSoakStatus(trap)))}
function shortLabel(name,fallback='B'){const s=String(name||fallback).trim();return s.length>3?s.slice(0,3):s}
function nextTrapName(){const nums=state.traps.map(t=>String(t.name||'').match(/^B(\d+)$/i)).filter(Boolean).map(m=>+m[1]);return `B${Math.max(0,...nums)+1}`}
function nextPlannedName(){const nums=state.planned.map(t=>String(t.name||'').match(/^P(\d+)$/i)).filter(Boolean).map(m=>+m[1]);return `P${Math.max(0,...nums)+1}`}

function renderAll(){renderTrapMarkers();renderPlannedMarkers();renderSelections();renderOverview();renderTrapLists();renderDesktopPlan();renderDesktopTraps();renderDesktopTrips();renderTripLists();renderTripUi();renderReports();}

function emptyFeatureCollection(){return {type:'FeatureCollection',features:[]}}
function ensureMapPointLayers(){
  if(!map||!map.isStyleLoaded?.())return;
  if(!map.getSource(TRAP_SOURCE_ID))map.addSource(TRAP_SOURCE_ID,{type:'geojson',data:emptyFeatureCollection()});
  if(!map.getLayer(TRAP_HALO_LAYER_ID))map.addLayer({id:TRAP_HALO_LAYER_ID,type:'circle',source:TRAP_SOURCE_ID,filter:['all',['==',['get','visible'],1],['any',['==',['get','selected'],1],['==',['get','nearby'],1]]],paint:{'circle-radius':['case',['==',['get','nearby'],1],20,18],'circle-color':['case',['==',['get','nearby'],1],'rgba(87,190,211,.24)','rgba(34,124,184,.18)'],'circle-stroke-width':0}});
  if(!map.getLayer(TRAP_HIT_LAYER_ID))map.addLayer({id:TRAP_HIT_LAYER_ID,type:'circle',source:TRAP_SOURCE_ID,filter:['==',['get','visible'],1],paint:{'circle-radius':24,'circle-color':'rgba(0,0,0,0)','circle-stroke-width':0}});
  if(!map.getLayer(TRAP_POINT_LAYER_ID))map.addLayer({id:TRAP_POINT_LAYER_ID,type:'circle',source:TRAP_SOURCE_ID,filter:['==',['get','visible'],1],paint:{'circle-radius':['case',['==',['get','checked'],1],9,['==',['get','nearby'],1],13,11.5],'circle-color':['get','color'],'circle-stroke-color':'rgba(255,255,255,.96)','circle-stroke-width':['case',['==',['get','nearby'],1],3,2.5],'circle-opacity':['case',['==',['get','checked'],1],.72,1]}});
  if(!map.getLayer(TRAP_LABEL_LAYER_ID))map.addLayer({id:TRAP_LABEL_LAYER_ID,type:'symbol',source:TRAP_SOURCE_ID,minzoom:11.8,filter:['all',['==',['get','visible'],1],['!=',['get','selected'],1],['!=',['get','nearby'],1]],layout:{'text-field':['get','label'],'text-size':10,'text-allow-overlap':false,'text-ignore-placement':false},paint:{'text-color':'#f7fbff','text-halo-color':'rgba(5,24,39,.76)','text-halo-width':1.3}});
  if(!map.getLayer(TRAP_FOCUS_LABEL_LAYER_ID))map.addLayer({id:TRAP_FOCUS_LABEL_LAYER_ID,type:'symbol',source:TRAP_SOURCE_ID,filter:['all',['==',['get','visible'],1],['any',['==',['get','selected'],1],['==',['get','nearby'],1]]],layout:{'text-field':['get','name'],'text-size':11,'text-offset':[0,1.8],'text-anchor':'top','text-allow-overlap':true,'text-ignore-placement':true},paint:{'text-color':'#f7fbff','text-halo-color':'rgba(5,24,39,.9)','text-halo-width':1.5}});
  if(!map.getSource(PLANNED_SOURCE_ID))map.addSource(PLANNED_SOURCE_ID,{type:'geojson',data:emptyFeatureCollection()});
  if(!map.getLayer(PLANNED_HALO_LAYER_ID))map.addLayer({id:PLANNED_HALO_LAYER_ID,type:'circle',source:PLANNED_SOURCE_ID,filter:['any',['==',['get','selected'],1],['==',['get','nearby'],1]],paint:{'circle-radius':['case',['==',['get','nearby'],1],21,18],'circle-color':['case',['==',['get','nearby'],1],'rgba(87,190,211,.24)','rgba(87,190,211,.15)'],'circle-stroke-width':0}});
  if(!map.getLayer(PLANNED_HIT_LAYER_ID))map.addLayer({id:PLANNED_HIT_LAYER_ID,type:'circle',source:PLANNED_SOURCE_ID,paint:{'circle-radius':24,'circle-color':'rgba(0,0,0,0)','circle-stroke-width':0}});
  if(!map.getLayer(PLANNED_POINT_LAYER_ID))map.addLayer({id:PLANNED_POINT_LAYER_ID,type:'circle',source:PLANNED_SOURCE_ID,paint:{'circle-radius':['case',['==',['get','nearby'],1],13,11.5],'circle-color':['case',['any',['==',['get','selected'],1],['==',['get','nearby'],1]],'rgba(87,190,211,.94)','rgba(8,36,56,.84)'],'circle-stroke-color':'rgba(87,190,211,.98)','circle-stroke-width':['case',['any',['==',['get','selected'],1],['==',['get','nearby'],1]],3,2.4]}});
  if(!map.getLayer(PLANNED_LABEL_LAYER_ID))map.addLayer({id:PLANNED_LABEL_LAYER_ID,type:'symbol',source:PLANNED_SOURCE_ID,minzoom:11.8,filter:['all',['!=',['get','selected'],1],['!=',['get','nearby'],1]],layout:{'text-field':['get','label'],'text-size':10,'text-allow-overlap':false,'text-ignore-placement':false},paint:{'text-color':'#dff7fb','text-halo-color':'rgba(5,24,39,.76)','text-halo-width':1.3}});
  if(!map.getLayer(PLANNED_FOCUS_LABEL_LAYER_ID))map.addLayer({id:PLANNED_FOCUS_LABEL_LAYER_ID,type:'symbol',source:PLANNED_SOURCE_ID,filter:['any',['==',['get','selected'],1],['==',['get','nearby'],1]],layout:{'text-field':['get','name'],'text-size':11,'text-offset':[0,1.8],'text-anchor':'top','text-allow-overlap':true,'text-ignore-placement':true},paint:{'text-color':'#dff7fb','text-halo-color':'rgba(5,24,39,.9)','text-halo-width':1.5}});
  if(!map.getSource(BOAT_SOURCE_ID))map.addSource(BOAT_SOURCE_ID,{type:'geojson',data:emptyFeatureCollection()});
  if(!map.getLayer(BOAT_HALO_LAYER_ID))map.addLayer({id:BOAT_HALO_LAYER_ID,type:'circle',source:BOAT_SOURCE_ID,paint:{'circle-radius':15,'circle-color':'rgba(87,190,211,.18)','circle-stroke-width':0}});
  if(!map.getLayer(BOAT_SYMBOL_LAYER_ID))map.addLayer({id:BOAT_SYMBOL_LAYER_ID,type:'symbol',source:BOAT_SOURCE_ID,layout:{'text-field':'▲','text-size':24,'text-rotate':['get','course'],'text-rotation-alignment':'map','text-allow-overlap':true,'text-ignore-placement':true},paint:{'text-color':'#57bed3','text-halo-color':'rgba(4,18,30,.9)','text-halo-width':2}});
  if(!mapPointEventsBound){mapPointEventsBound=true;for(const layerId of [TRAP_HIT_LAYER_ID,TRAP_POINT_LAYER_ID,TRAP_FOCUS_LABEL_LAYER_ID,PLANNED_HIT_LAYER_ID,PLANNED_POINT_LAYER_ID,PLANNED_FOCUS_LABEL_LAYER_ID]){map.on('mouseenter',layerId,()=>{map.getCanvas().style.cursor='pointer'});map.on('mouseleave',layerId,()=>{map.getCanvas().style.cursor=''})}}
}
function trapMapColor(trap){return ({fresh:'#227CB8',due:'#C69A4A',priority:'#D15D57',retrieved:'#667B8C',unknown:'#6E8799'})[trapSoakStatus(trap)]||'#6E8799'}
function nearbyWorkMatches(type,id){return nearbyWork?.type===type&&nearbyWork?.id===id}
function renderTrapMarkers(){
  if(!map)return;ensureMapPointLayers();const source=map.getSource(TRAP_SOURCE_ID);if(!source)return;
  const features=state.traps.map(trap=>{const lat=+trap.lat,lon=+trap.lon;if(!Number.isFinite(lat)||!Number.isFinite(lon))return null;const visible=(trap.status==='active'||(isDesktop()&&!desktopFilterActive))?1:0,checked=trapCheckedThisTrip(trap.id);return {type:'Feature',id:trap.id,properties:{id:trap.id,label:checked?'✓':shortLabel(trap.name),name:trap.name||'Tina',color:trapMapColor(trap),soak:trapSoakStatus(trap),checked:checked?1:0,nearby:nearbyWorkMatches('trap',trap.id)?1:0,selected:trap.id===selectedTrapId?1:0,visible},geometry:{type:'Point',coordinates:[lon,lat]}}}).filter(Boolean);
  source.setData({type:'FeatureCollection',features});
}
function renderPlannedMarkers(){
  if(!map)return;ensureMapPointLayers();const source=map.getSource(PLANNED_SOURCE_ID);if(!source)return;
  const features=state.planned.map(planned=>{const lat=+planned.lat,lon=+planned.lon;if(!Number.isFinite(lat)||!Number.isFinite(lon))return null;return {type:'Feature',id:planned.id,properties:{id:planned.id,label:shortLabel(planned.name,'P'),name:planned.name||'Planerad tina',selected:planned.id===selectedPlannedId?1:0,nearby:nearbyWorkMatches('planned',planned.id)?1:0},geometry:{type:'Point',coordinates:[lon,lat]}}}).filter(Boolean);
  source.setData({type:'FeatureCollection',features});
}

function selectTrap(id,{center=false}={}){selectedPlannedId=null;selectedTrapId=id;renderSelections();renderTrapMarkers();renderPlannedMarkers();renderDesktopTraps();const t=state.traps.find(x=>x.id===id);if(center&&t)map?.easeTo({center:[+t.lon,+t.lat],zoom:Math.max(map.getZoom(),13.8),duration:450})}
function selectPlanned(id,{center=false}={}){selectedTrapId=null;selectedPlannedId=id;renderSelections();renderTrapMarkers();renderPlannedMarkers();renderDesktopPlan();const p=state.planned.find(x=>x.id===id);if(center&&p)map?.easeTo({center:[+p.lon,+p.lat],zoom:Math.max(map.getZoom(),13.8),duration:450})}
function clearSelection(){selectedTrapId=null;selectedPlannedId=null;renderSelections();renderTrapMarkers();renderPlannedMarkers();renderDesktopTraps();renderDesktopPlan()}
function formatDistance(target){const d=distanceNm(currentPosition,target);return Number.isFinite(d)?(d<0.1?`${Math.round(d*1852)} m`:`${d.toFixed(2)} NM`):'—'}

function tripStats(startAt,endAt=isoNow()){
  const start=new Date(startAt).getTime(),end=new Date(endAt).getTime();
  const checks=state.checks.filter(c=>{const t=new Date(c.checked_at).getTime();return t>=start&&t<=end});
  const sets=state.traps.filter(t=>{const x=new Date(t.set_at).getTime();return x>=start&&x<=end});
  return {checks:checks.length,sets:sets.length,lobsters:checks.reduce((n,c)=>n+(Number(c.lobster_count)||0),0)};
}
function renderSystemStatus(){const el=$('systemStatusPill');if(!el||isDesktop()){el?.classList.add('hidden');return}let text='';if(!navigator.onLine)text='Offline · sparar lokalt';else if(activeTrip&&(!currentFix||Date.now()-currentFix.timestamp>8000))text='GPS väntar';else if(activeTrip&&Number.isFinite(currentAccuracy)&&currentAccuracy>GPS_CHECK_MAX_ACCURACY_M)text=`GPS svag · ±${Math.round(currentAccuracy)} m`;if(text){el.textContent=text;el.classList.remove('hidden')}else el.classList.add('hidden')}
function nearbyWorkKey(type,id){return `${type}:${id}`}
function gpsTrustedForAssist(){return Boolean(currentFix&&Date.now()-currentFix.timestamp<=8000&&Number.isFinite(currentAccuracy)&&currentAccuracy<=GPS_CHECK_MAX_ACCURACY_M)}
function workCandidate(type,item,meters){
  const status=type==='trap'?trapSoakStatus(item):'planned';
  const priorityOffset=type==='trap'?(status==='priority'?-45:-20):0;
  return {type,id:item.id,item,meters,status,score:meters+priorityOffset,key:nearbyWorkKey(type,item.id)};
}
function currentNearbyWorkCandidate(){
  if(!nearbyWork||!currentPosition)return null;
  const item=nearbyWork.type==='trap'?state.traps.find(t=>t.id===nearbyWork.id):state.planned.find(p=>p.id===nearbyWork.id);
  if(!item)return null;
  if(nearbyWork.type==='trap'&&!trapNeedsCheckSuggestion(item))return null;
  if((nearbyDismissed.get(nearbyWork.key)||0)>Date.now())return null;
  const meters=distanceNm(currentPosition,{lat:+item.lat,lon:+item.lon})*1852;
  return Number.isFinite(meters)&&meters<=NEARBY_WORK_EXIT_M?workCandidate(nearbyWork.type,item,meters):null;
}
function nearestWorkCandidate(){
  if(!activeTrip||mobileMode!=='fishing'||!currentPosition||!gpsTrustedForAssist())return null;
  let best=null;
  for(const p of state.planned){const key=nearbyWorkKey('planned',p.id);if((nearbyDismissed.get(key)||0)>Date.now())continue;const meters=distanceNm(currentPosition,{lat:+p.lat,lon:+p.lon})*1852;if(!Number.isFinite(meters)||meters>NEARBY_WORK_ENTER_M)continue;const candidate=workCandidate('planned',p,meters);if(!best||candidate.score<best.score)best=candidate}
  for(const trap of state.traps){if(!trapNeedsCheckSuggestion(trap))continue;const key=nearbyWorkKey('trap',trap.id);if((nearbyDismissed.get(key)||0)>Date.now())continue;const meters=distanceNm(currentPosition,{lat:+trap.lat,lon:+trap.lon})*1852;if(!Number.isFinite(meters)||meters>NEARBY_WORK_ENTER_M)continue;const candidate=workCandidate('trap',trap,meters);if(!best||candidate.score<best.score)best=candidate}
  return best;
}
function renderNearbyWorkSuggestion(){
  const card=$('nearbyActionCard');if(!card||isDesktop()){card?.classList.add('hidden');return}
  if(!activeTrip||mobileMode!=='fishing'||!gpsTrustedForAssist()||selectedTrapId||selectedPlannedId){const changed=Boolean(nearbyWork);nearbyWork=null;card.classList.add('hidden');document.body.classList.remove('has-nearby-action');if(changed){renderTrapMarkers();renderPlannedMarkers()}return}
  const previousKey=nearbyWork?.key||null,candidate=currentNearbyWorkCandidate()||nearestWorkCandidate();nearbyWork=candidate;
  if(!candidate){card.classList.add('hidden');document.body.classList.remove('has-nearby-action')}
  else{
    const distance=candidate.meters<100?`${Math.round(candidate.meters)} m`:`${Math.round(candidate.meters/10)*10} m`;
    $('nearbyActionName').textContent=candidate.item.name;
    if(candidate.type==='trap'){$('nearbyActionKind').textContent=candidate.status==='priority'?'PRIORITERA VITTJNING':'DAGS ATT VITTJA';$('nearbyActionMeta').textContent=`${formatSoakAge(soakAgeMs(candidate.item,appNowMs()))} · ${distance}`;$('nearbyActionBtn').textContent=`Vittja ${candidate.item.name}`;card.dataset.kind=candidate.status}
    else{$('nearbyActionKind').textContent='PLANERAD PUNKT';$('nearbyActionMeta').textContent=distance;$('nearbyActionBtn').textContent=`Sätt ${candidate.item.name}`;card.dataset.kind='planned'}
    card.classList.remove('hidden');document.body.classList.add('has-nearby-action')
  }
  if(previousKey!==(candidate?.key||null)){renderTrapMarkers();renderPlannedMarkers()}
}
function triggerNearbyWork(){const candidate=nearbyWork;if(!candidate)return;nearbyWork=null;if(candidate.type==='trap'){selectTrap(candidate.id);openCheck()}else requestSetTrap(candidate.id)}
function dismissNearbyWork(){if(nearbyWork?.key)nearbyDismissed.set(nearbyWork.key,Date.now()+NEARBY_WORK_DISMISS_MS);nearbyWork=null;renderNearbyWorkSuggestion();renderTrapMarkers();renderPlannedMarkers()}

function confirmAction({title='Är du säker?',text='',confirmText='Bekräfta'}={}){if(confirmResolver){confirmResolver(false);confirmResolver=null}$('confirmTitle').textContent=title;$('confirmText').textContent=text;$('confirmActionBtn').textContent=confirmText;openSheet('confirmSheet');return new Promise(resolve=>{confirmResolver=resolve})}
function resolveConfirm(value){const resolve=confirmResolver;confirmResolver=null;closeSheets();if(resolve)resolve(Boolean(value))}
function renderSelections(){
  const trap=state.traps.find(t=>t.id===selectedTrapId),planned=state.planned.find(p=>p.id===selectedPlannedId);
  if(!trap||isDesktop())$('trapCard')?.classList.add('hidden');else{
    const status=trapSoakStatus(trap),checked=trapCheckedThisTrip(trap.id),last=trapLastCheck(trap),card=$('trapCard');
    card.classList.remove('hidden');card.dataset.soak=status;$('trapCardName').textContent=trap.name;$('trapCardDistance').textContent=formatDistance({lat:+trap.lat,lon:+trap.lon});
    if(trap.status==='retrieved')$('trapCardMeta').textContent='Upptagen';
    else if(checked)$('trapCardMeta').textContent=`✓ Vittjad denna tur · ${fmtClock(last?.checked_at)}`;
    else $('trapCardMeta').textContent=trapSoakMeta(trap);
    if(mobileMode==='fishing'&&trap.status==='active'){card.classList.toggle('checked',checked);$('trapPrimaryBtn').textContent=checked?'Vittja igen':'Vittja';$('trapSecondaryBtn').textContent='Detaljer'}
    else{card.classList.remove('checked');$('trapPrimaryBtn').textContent='Detaljer';$('trapSecondaryBtn').textContent='Stäng'}
  }
  if(!planned||isDesktop())$('plannedCard')?.classList.add('hidden');else{
    $('plannedCard').classList.remove('hidden');$('plannedCardName').textContent=planned.name;$('plannedCardDistance').textContent=formatDistance({lat:+planned.lat,lon:+planned.lon});$('plannedCardMeta').textContent=planned.notes||'Planerad placering';
    if(mobileMode==='fishing'){$('plannedPrimaryBtn').textContent='Sätt tina';$('plannedSecondaryBtn').textContent='Ta bort plan'}else{$('plannedPrimaryBtn').textContent='Flytta';$('plannedSecondaryBtn').textContent='Ta bort'}
  }
}

function rowDotClass(item,planned=false){return planned?'planned':`soak-${trapSoakStatus(item)}`}
function trapRowMeta(trap){return trap.status==='retrieved'?'Upptagen':trapSoakMeta(trap)}
function rowHtml(item,{planned=false,value='' }={}){return `<button class="list-row" data-${planned?'planned':'trap'}-row="${esc(item.id)}"><span class="row-dot ${rowDotClass(item,planned)}">${esc(shortLabel(item.name,planned?'P':'B'))}</span><span><strong>${esc(item.name)}</strong><small>${planned?esc(item.notes||'Planerad placering'):esc(trapRowMeta(item))}</small></span><span class="row-value">${esc(value)}</span></button>`}
function soakSummaryHtml(){const sum=soakSummary(activeTraps(),appNowMs());return `<span class="soak-key fresh"><i></i>Ny <strong>${sum.fresh}</strong></span><span class="soak-key due"><i></i>Snart dags <strong>${sum.due}</strong></span><span class="soak-key priority"><i></i>Prioritera <strong>${sum.priority}</strong></span>`}
function renderOverview(){if($('plannedCountBadge'))$('plannedCountBadge').textContent=String(state.planned.length);if($('trapStatusSummary'))$('trapStatusSummary').innerHTML=soakSummaryHtml()}
function renderTrapLists(){const traps=state.traps.filter(t=>!filterActiveOnly||t.status==='active'),list=$('trapList');if(!list)return;if($('trapStatusSummary'))$('trapStatusSummary').innerHTML=soakSummaryHtml();list.innerHTML=traps.length?traps.map(t=>rowHtml(t,{value:formatDistance({lat:+t.lat,lon:+t.lon})})).join(''):'<div class="empty-state"><strong>Inga tinor ännu</strong></div>';bindRows(list)}
function bindRows(root){root.querySelectorAll('[data-trap-row]').forEach(btn=>btn.addEventListener('click',()=>{closeSheets();selectTrap(btn.dataset.trapRow,{center:true})}));root.querySelectorAll('[data-planned-row]').forEach(btn=>btn.addEventListener('click',()=>{closeSheets();selectPlanned(btn.dataset.plannedRow,{center:true})}))}

function renderDesktopPlan(){
  const summary=soakSummary(activeTraps(),appNowMs());if($('desktopPlannedCount'))$('desktopPlannedCount').textContent=String(state.planned.length);if($('desktopActiveCount'))$('desktopActiveCount').textContent=String(activeTraps().length);if($('desktopPriorityCount'))$('desktopPriorityCount').textContent=String(summary.priority);
  const list=$('desktopPlannedList');if(!list)return;list.innerHTML=state.planned.length?state.planned.map(p=>`<button class="desktop-row ${p.id===selectedPlannedId?'selected':''}" data-desktop-planned="${esc(p.id)}"><span class="row-dot planned">${esc(shortLabel(p.name,'P'))}</span><span><strong>${esc(p.name)}</strong><small>${esc(p.notes||'Planerad placering')}</small></span><span class="row-value">Redigera</span></button>`).join(''):'<div class="empty-state"><strong>Inga planerade tinor</strong><span>Placera en på kartan.</span></div>';list.querySelectorAll('[data-desktop-planned]').forEach(btn=>btn.addEventListener('click',()=>{selectPlanned(btn.dataset.desktopPlanned,{center:true});openPlannedDetail()}))
}
function renderDesktopTraps(){const list=$('desktopTrapList');if(!list)return;if($('desktopSoakSummary'))$('desktopSoakSummary').innerHTML=soakSummaryHtml();const q=desktopSearch.trim().toLowerCase(),traps=state.traps.filter(t=>(!desktopFilterActive||t.status==='active')&&(!q||String(t.name).toLowerCase().includes(q)||String(t.notes||'').toLowerCase().includes(q)));list.innerHTML=traps.length?traps.map(t=>`<button class="desktop-row ${t.id===selectedTrapId?'selected':''}" data-desktop-trap="${esc(t.id)}"><span class="row-dot ${rowDotClass(t)}">${esc(shortLabel(t.name))}</span><span><strong>${esc(t.name)}</strong><small>${esc(trapRowMeta(t))}</small></span><span class="row-value ${t.status==='active'?`status-${trapSoakStatus(t)}`:''}">${t.status==='active'?esc(soakStatusLabel(trapSoakStatus(t))):'Upptagen'}</span></button>`).join(''):'<div class="empty-state"><strong>Inga träffar</strong></div>';list.querySelectorAll('[data-desktop-trap]').forEach(btn=>btn.addEventListener('click',()=>{selectTrap(btn.dataset.desktopTrap,{center:true});openTrapDetail()}))}

function openSheet(id){document.querySelectorAll('.sheet').forEach(s=>s.classList.add('hidden'));$('backdrop').classList.remove('hidden');$(id).classList.remove('hidden')}
function closeSheets(){if(confirmResolver){const resolve=confirmResolver;confirmResolver=null;resolve(false)}$('backdrop').classList.add('hidden');document.querySelectorAll('.sheet').forEach(s=>s.classList.add('hidden'));pendingSet=null}

function beginPlacement(mode){if(!isDesktop()){$('tripHistoryView')?.classList.add('hidden');$('reportsView')?.classList.add('hidden')}placementMode=mode;document.body.classList.add('placement-mode');$('placementCrosshair').classList.remove('hidden');$('placementBar').classList.remove('hidden');closeSheets();if(mode==='new-planned')$('placeHereBtn').textContent='Planera här';else if(String(mode).startsWith('move-planned:')||String(mode).startsWith('move-trap:'))$('placeHereBtn').textContent='Flytta hit';else $('placeHereBtn').textContent='Sätt här'}
function cancelPlacement({silent=false}={}){placementMode=null;document.body.classList.remove('placement-mode');$('placementCrosshair')?.classList.add('hidden');$('placementBar')?.classList.add('hidden');if(!silent)toast('Avbrutet')}
async function placeHere(){
  if(!placementMode||!map||actionBusy)return;const center=map.getCenter(),pos={lat:+center.lat,lon:+center.lng};actionBusy=true;
  try{
    if(placementMode==='new-planned') await createPlanned(pos);
    else if(placementMode.startsWith('move-planned:')) await movePlanned(placementMode.slice('move-planned:'.length),pos);
    else if(placementMode==='new-trap-map') await createTrapAt(pos);
    else if(placementMode.startsWith('move-trap:')) await moveTrap(placementMode.slice('move-trap:'.length),pos);
  }finally{actionBusy=false;cancelPlacement({silent:true})}
}
async function createPlanned(pos){const planned={id:crypto.randomUUID(),name:nextPlannedName(),lat:+pos.lat,lon:+pos.lon,notes:'',created_at:isoNow(),updated_at:isoNow(),updated_by:state.user};await api('POST','/api/planned-traps',planned,{queue:true});state.planned.push(planned);selectedPlannedId=planned.id;saveState();renderAll();toast(`${planned.name} planerad`)}
async function createTrapAt(pos){const actionAt=Date.now(),body={id:crypto.randomUUID(),name:nextTrapName(),lat:+pos.lat,lon:+pos.lon,notes:'',set_at:new Date(actionAt).toISOString(),gps_method:'map-manual',gps_action_at:new Date(actionAt).toISOString(),gps_timing_error_ms:0};await api('POST','/api/traps',body,{queue:true});state.traps.unshift({...body,status:'active',last_checked_at:null,created_at:isoNow(),updated_at:isoNow(),updated_by:state.user});selectedTrapId=body.id;saveState();renderAll();toast(`${body.name} tillagd`)}
async function moveTrap(id,pos){const trap=state.traps.find(t=>t.id===id);if(!trap)return;const lat=+pos.lat,lon=+pos.lon;await api('PATCH',`/api/traps/${encodeURIComponent(id)}`,{lat,lon},{queue:true});trap.lat=lat;trap.lon=lon;trap.updated_at=isoNow();saveState();renderAll();toast(`${trap.name} · position justerad`)}
async function movePlanned(id,pos){const planned=state.planned.find(p=>p.id===id);if(!planned)return;const lat=+pos.lat,lon=+pos.lon;await api('PATCH',`/api/planned-traps/${encodeURIComponent(id)}`,{lat,lon},{queue:true});planned.lat=lat;planned.lon=lon;planned.updated_at=isoNow();saveState();renderAll();toast(`${planned.name} flyttad`)}
async function deletePlanned(id=selectedPlannedId){const planned=state.planned.find(p=>p.id===id);if(!planned)return;if(!await confirmAction({title:`Ta bort ${planned.name}?`,text:'Den planerade punkten tas bort från kartan.',confirmText:'Ta bort'}))return;await api('DELETE',`/api/planned-traps/${encodeURIComponent(id)}`,null,{queue:true});state.planned=state.planned.filter(p=>p.id!==id);if(selectedPlannedId===id)selectedPlannedId=null;saveState();renderAll();closeSheets();toast('Planen borttagen')}
function fitAll(){const points=[...activeTraps(),...state.planned].map(x=>[+x.lon,+x.lat]).filter(c=>c.every(Number.isFinite));if(!points.length){toast('Inga tinor att visa');return}if(points.length===1){map?.easeTo({center:points[0],zoom:14,duration:450});return}const bounds=points.reduce((b,c)=>b.extend(c),new maptilersdk.LngLatBounds(points[0],points[0]));map?.fitBounds(bounds,{padding:isDesktop()?70:45,maxZoom:14.5,duration:550})}

function openPlannedDetail(){const p=state.planned.find(x=>x.id===selectedPlannedId);if(!p)return;$('detailPlannedId').value=p.id;$('detailPlannedTitle').textContent=p.name;$('detailPlannedName').value=p.name;$('detailPlannedNotes').value=p.notes||'';openSheet('plannedDetailSheet')}
async function savePlannedEdit(ev){ev.preventDefault();const id=$('detailPlannedId').value,p=state.planned.find(x=>x.id===id);if(!p)return;const name=$('detailPlannedName').value.trim(),notes=$('detailPlannedNotes').value.trim();if(!name)return;await api('PATCH',`/api/planned-traps/${encodeURIComponent(id)}`,{name,notes},{queue:true});Object.assign(p,{name,notes,updated_at:isoNow()});saveState();renderAll();closeSheets();toast('Plan uppdaterad')}

function openTrapDetail(){const t=state.traps.find(x=>x.id===selectedTrapId);if(!t)return;$('detailTrapId').value=t.id;$('detailTrapTitle').textContent=t.name;$('detailTrapName').value=t.name;$('detailTrapNotes').value=t.notes||'';$('detailVittjaBtn').classList.toggle('hidden',t.status!=='active');$('retrieveTrapBtn').classList.toggle('hidden',t.status!=='active');openSheet('trapDetailSheet')}
async function saveTrapEdit(ev){ev.preventDefault();const id=$('detailTrapId').value,t=state.traps.find(x=>x.id===id);if(!t)return;const name=$('detailTrapName').value.trim(),notes=$('detailTrapNotes').value.trim();if(!name)return;await api('PATCH',`/api/traps/${encodeURIComponent(id)}`,{name,notes},{queue:true});Object.assign(t,{name,notes,updated_at:isoNow()});saveState();renderAll();closeSheets();toast('Tina uppdaterad')}
async function retrieveTrap(){const id=$('detailTrapId').value||selectedTrapId,t=state.traps.find(x=>x.id===id);if(!t)return;if(!await confirmAction({title:`Ta upp ${t.name}?`,text:'Tinan markeras som upptagen men historiken sparas.',confirmText:'Ta upp'}))return;await api('DELETE',`/api/traps/${encodeURIComponent(id)}`,null,{queue:true});t.status='retrieved';t.updated_at=isoNow();saveState();renderAll();closeSheets();toast(`${t.name} upptagen`)}

function getGpsFix({timeout=12000}={}){return new Promise((resolve,reject)=>{if(!navigator.geolocation)return reject(new Error('GPS stöds inte'));navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,maximumAge:0,timeout})})}
function rememberGpsFix(fix){
  if(!fix)return;currentFix=fix;gpsFixHistory.push(fix);const cutoff=Date.now()-GPS_HISTORY_MS;gpsFixHistory=gpsFixHistory.filter(f=>f.timestamp>=cutoff).sort((a,b)=>a.timestamp-b.timestamp);
  const waiting=gpsFixWaiters.splice(0);for(const waiter of waiting){if(fix.timestamp>=waiter.after){clearTimeout(waiter.timer);waiter.resolve(fix)}else gpsFixWaiters.push(waiter)}
}
function waitForGpsFixAfter(after,timeout=GPS_SET_WAIT_MS){const existing=gpsFixHistory.find(f=>f.timestamp>=after);if(existing)return Promise.resolve(existing);return new Promise((resolve,reject)=>{const waiter={after,resolve,reject,timer:null};waiter.timer=setTimeout(()=>{gpsFixWaiters=gpsFixWaiters.filter(w=>w!==waiter);reject(new Error('Ingen ny GPS-fix i tid'))},timeout);gpsFixWaiters.push(waiter)})}
function gpsMetaFields(fix,actionAt){return {gps_accuracy_m:fix.accuracy,gps_speed_kn:fix.speed_kn,gps_course:fix.course,gps_fix_at:new Date(fix.timestamp).toISOString(),gps_action_at:new Date(actionAt).toISOString(),gps_timing_error_ms:fix.timing_error_ms??0,gps_method:fix.method||'gps'}}
async function captureSetPosition(actionAt){
  startGps();getGpsFix({timeout:GPS_SET_WAIT_MS}).then(handlePosition).catch(()=>{});
  try{await waitForGpsFixAfter(actionAt,GPS_SET_WAIT_MS)}catch{}
  const chosen=chooseActionFix(gpsFixHistory,actionAt,{maxAccuracyM:GPS_DEFAULTS.setMaxAccuracyM,maxBracketMs:GPS_DEFAULTS.setMaxBracketMs,maxNearestMs:GPS_DEFAULTS.setMaxNearestMs});
  if(chosen)return chosen;
  const nearest=[...gpsFixHistory].sort((a,b)=>Math.abs(a.timestamp-actionAt)-Math.abs(b.timestamp-actionAt))[0];
  if(nearest&&Number.isFinite(nearest.accuracy)&&nearest.accuracy>GPS_DEFAULTS.setMaxAccuracyM)throw new Error(`GPS för osäker · ±${Math.round(nearest.accuracy)} m`);
  throw new Error('Ingen tillräckligt färsk GPS-position');
}
function reliableCheckFix(actionAt){return chooseActionFix(gpsFixHistory,actionAt,{maxAccuracyM:GPS_CHECK_MAX_ACCURACY_M,maxBracketMs:GPS_CHECK_MAX_AGE_MS*2,maxNearestMs:GPS_CHECK_MAX_AGE_MS})}
async function requestSetTrap(plannedId=null){
  if(actionBusy)return;const planned=plannedId?state.planned.find(p=>p.id===plannedId):null;pendingSet={plannedId:planned?.id||null,name:nextTrapName()};$('setTrapTitle').textContent=planned?`${planned.name} · planerad punkt`:'Ny tina';$('setTrapName').textContent=planned?`${planned.name} → ${pendingSet.name}`:pendingSet.name;$('setTrapPosition').textContent='Tryck när tinan går i vattnet';const recent=currentFix&&Date.now()-currentFix.timestamp<=GPS_CHECK_MAX_AGE_MS;$('setTrapAccuracy').textContent=recent&&Number.isFinite(currentFix.accuracy)?`GPS ±${Math.round(currentFix.accuracy)} m`:'Väntar på aktuell GPS';$('confirmSetTrapBtn').textContent=planned?`Sätt ${planned.name} nu`:'Sätt tina nu';$('confirmSetTrapBtn').disabled=false;openSheet('setTrapSheet');
}

async function confirmSetTrap(){if(!pendingSet||actionBusy)return;actionBusy=true;const btn=$('confirmSetTrapBtn'),oldText=btn.textContent;btn.disabled=true;btn.textContent='Förbereder…';const planned=pendingSet.plannedId?state.planned.find(p=>p.id===pendingSet.plannedId):null;let success=false;try{if(!activeTrip&&!isDesktop())await startTrip({quiet:true});const actionAt=Date.now();btn.textContent='Läser GPS…';const fix=await captureSetPosition(actionAt);$('setTrapPosition').textContent=`${fix.pos.lat.toFixed(5)}, ${fix.pos.lon.toFixed(5)}`;$('setTrapAccuracy').textContent=`GPS ±${Math.round(fix.accuracy)} m`;const body={id:crypto.randomUUID(),name:pendingSet.name,lat:+fix.pos.lat,lon:+fix.pos.lon,notes:planned?.notes||'',set_at:new Date(actionAt).toISOString(),...gpsMetaFields(fix,actionAt)};body.trip_id=activeTrip?.id||null;if(planned)await api('POST',`/api/planned-traps/${encodeURIComponent(planned.id)}/set`,body,{queue:true});else await api('POST','/api/traps',body,{queue:true});state.traps.unshift({...body,status:'active',last_checked_at:null,created_at:isoNow(),updated_at:isoNow(),updated_by:state.user});if(planned){state.planned=state.planned.filter(p=>p.id!==planned.id);selectedPlannedId=null}selectedTrapId=body.id;saveState();renderAll();success=true;closeSheets();toast(`${body.name} satt · GPS ±${Math.round(fix.accuracy)} m`)}catch(error){$('setTrapPosition').textContent='Position kunde inte sparas';$('setTrapAccuracy').textContent=error.message||'Kontrollera platsbehörighet';if(String(error.message||'').includes('position_events'))toast('D1 behöver migration 0004_position_events.sql',5200);else if(String(error.message||'').includes('trip_events')||String(error.message||'').includes('correction_events'))toast('D1 behöver migration 0005_trip_events_corrections.sql',5600);else toast(error.message||'Kunde inte sätta tina',3600)}finally{actionBusy=false;btn.disabled=false;btn.textContent=oldText;if(success)pendingSet=null}}

function openCheck(){const t=state.traps.find(x=>x.id===selectedTrapId);if(!t||t.status!=='active')return;$('checkTrapName').textContent=t.name;$('lobsterCount').value='0';$('lobsterCount').textContent='0';$('releasedCount').value='0';$('checkNotes').value='';if($('checkAt'))$('checkAt').value=toLocalDateTimeInput();const details=$('checkSheet').querySelector('details');if(details)details.open=isDesktop();openSheet('checkSheet')}
async function saveCheck(ev){ev.preventDefault();const trap=state.traps.find(x=>x.id===selectedTrapId);if(!trap||actionBusy)return;actionBusy=true;try{if(!activeTrip&&!isDesktop())await startTrip({quiet:true});const actionAt=checkActionTimeMs(),fix=isDesktop()?null:reliableCheckFix(actionAt);const body={id:crypto.randomUUID(),trap_id:trap.id,trip_id:activeTrip?.id||null,checked_at:new Date(actionAt).toISOString(),lobster_count:Math.max(0,Number($('lobsterCount').value||$('lobsterCount').textContent||0)),released_count:Math.max(0,Number($('releasedCount').value||0)),notes:$('checkNotes').value.trim(),trap_lat:+trap.lat,trap_lon:+trap.lon,lat:fix?.pos.lat??null,lon:fix?.pos.lon??null,...(fix?gpsMetaFields(fix,actionAt):{})};await api('POST','/api/checks',body,{queue:true});state.checks.unshift({...body,actor:state.user,trap_name:trap.name});trap.last_checked_at=body.checked_at;trap.updated_at=body.checked_at;saveState();renderAll();closeSheets();toast(`${trap.name} · ${body.lobster_count} hummer`);loadHeatmap({quiet:true});loadReports(reportYear,{quiet:true})}catch(error){if(String(error.message||'').includes('position_events'))toast('D1 behöver migration 0004_position_events.sql',5200);else if(String(error.message||'').includes('trip_events')||String(error.message||'').includes('correction_events'))toast('D1 behöver migration 0005_trip_events_corrections.sql',5600);else if(String(error.message||'').includes('check_locations'))toast('D1 behöver migration 0006_check_locations.sql',5600);else toast(error.message||'Kunde inte spara vittjning',3600)}finally{actionBusy=false}}

function appendTripFix(fix,speed){if(!activeTrip||!fix)return;const decision=trackPointDecision(tripPoints.at(-1),fix);if(!decision.accept)return;if(decision.addDistance)tripDistanceNm+=decision.distanceNm;const point={seq:trackSeq++,lat:fix.pos.lat,lon:fix.pos.lon,speed_kn:Number.isFinite(speed)?speed:null,course:Number.isFinite(fix.course)?fix.course:null,accuracy:fix.accuracy,recorded_at:new Date(fix.timestamp).toISOString(),recorded_ms:fix.timestamp};tripPoints.push(point);trackBatch.push(point);if(tripPoints.length>12000)tripPoints.splice(0,tripPoints.length-12000);saveActiveTrip();renderTrack();renderTripUi();if(trackBatch.length>=12)flushTrackBatch()}
function ensureTrackingLayer(){if(!map.getSource('track'))map.addSource('track',{type:'geojson',data:{type:'FeatureCollection',features:[]}});if(!map.getLayer('track-line'))map.addLayer({id:'track-line',type:'line',source:'track',paint:{'line-color':'#5ec7df','line-width':['interpolate',['linear'],['zoom'],8,2,15,4],'line-opacity':.9},layout:{'line-join':'round','line-cap':'round'}})}
function renderTrack(){if(!map?.getSource('track'))return;const sourcePoints=isDesktop()?(desktopTab==='trips'?historyTrackPoints:[]):tripPoints;const coords=sourcePoints.map(p=>[+p.lon,+p.lat]).filter(c=>c.every(Number.isFinite));map.getSource('track').setData({type:'FeatureCollection',features:coords.length>1?[{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:coords}}]:[]});const visible=isDesktop()?desktopTab==='trips':mobileMode==='fishing';map.setLayoutProperty('track-line','visibility',visible?'visible':'none')}
function updateBoat(pos,course){if(!map)return;ensureMapPointLayers();const source=map.getSource(BOAT_SOURCE_ID);if(!source)return;source.setData({type:'FeatureCollection',features:[{type:'Feature',properties:{course:Number.isFinite(course)?course:0},geometry:{type:'Point',coordinates:[+pos.lon,+pos.lat]}}]})}
function handlePosition(position){const fix=normalizeGpsFix(position);if(!fix)return;const duplicate=lastHandledFixTimestamp===fix.timestamp;rememberGpsFix(fix);let speed=fix.speed_kn;if(!Number.isFinite(speed)&&lastPosition&&fix.timestamp-lastPositionAt>1000){const d=distanceNm(lastPosition,fix.pos),hours=(fix.timestamp-lastPositionAt)/36e5;if(hours>0)speed=d/hours}currentPosition=fix.pos;currentAccuracy=fix.accuracy;lastSpeedKn=Number.isFinite(speed)?clamp(speed,0,99):0;updateBoat(fix.pos,fix.course);renderSelections();renderOverview();renderTripUi();if(activeTrip&&!duplicate)appendTripFix(fix,speed);if(!duplicate){lastPosition=fix.pos;lastPositionAt=fix.timestamp;lastHandledFixTimestamp=fix.timestamp}}
function handlePositionError(error){if(!currentPosition)toast(`GPS: ${error.message||'kunde inte starta'}`,3200)}
function startGps(){if(!navigator.geolocation)return;if(watchId!=null)return;watchId=navigator.geolocation.watchPosition(handlePosition,handlePositionError,{enableHighAccuracy:true,maximumAge:0,timeout:12000})}
function centerBoat(){if(!currentPosition){startGps();toast('Hämtar GPS…');return}map?.easeTo({center:[currentPosition.lon,currentPosition.lat],zoom:Math.max(map.getZoom(),NAV_ZOOM),duration:500})}

async function startTrip({quiet=false}={}){if(activeTrip){if(!quiet)openSheet('tripSheet');return activeTrip}if(tripStartPromise)return tripStartPromise;tripStartPromise=(async()=>{const trip={id:crypto.randomUUID(),name:`Hummertur ${new Date().toLocaleDateString('sv-SE')}`,started_at:isoNow()};await api('POST','/api/trips',trip,{queue:true});activeTrip=trip;tripPoints=[];trackBatch=[];trackSeq=0;tripDistanceNm=0;saveActiveTrip();renderTripUi();if(!quiet){toast('Turen startad');centerBoat()}return trip})();try{return await tripStartPromise}finally{tripStartPromise=null}}
function saveActiveTrip(){saveJson(TRIP_KEY,activeTrip?{...activeTrip,tripPoints,trackSeq,tripDistanceNm}:null)}
function restoreActiveTrip(){const stored=loadJson(TRIP_KEY,null);if(!stored?.id)return;activeTrip={id:stored.id,name:stored.name,started_at:stored.started_at};tripPoints=Array.isArray(stored.tripPoints)?stored.tripPoints:[];trackSeq=Number(stored.trackSeq)||tripPoints.length;tripDistanceNm=Number(stored.tripDistanceNm)||0;renderTrack();renderTripUi()}
async function flushTrackBatch(){if(!activeTrip||!trackBatch.length)return;const points=trackBatch.splice(0,trackBatch.length);try{await api('POST',`/api/trips/${encodeURIComponent(activeTrip.id)}/points`,{points},{queue:true})}catch(error){trackBatch.unshift(...points);throw error}}
async function finishTrip(){if(!activeTrip||actionBusy)return;actionBusy=true;const endedAt=isoNow(),snapshot={...activeTrip},stats=tripStats(snapshot.started_at,endedAt);try{await flushTrackBatch();await api('POST',`/api/trips/${encodeURIComponent(activeTrip.id)}/finish`,{ended_at:endedAt,distance_nm:tripDistanceNm},{queue:true});const d=tripDistanceNm,duration=new Date(endedAt)-new Date(snapshot.started_at);activeTrip=null;tripPoints=[];trackBatch=[];trackSeq=0;tripDistanceNm=0;saveJson(TRIP_KEY,null);renderTrack();renderTripUi();renderTrapMarkers();closeSheets();$('tripCompleteStats').innerHTML=[['Distans',`${d.toFixed(1)} NM`],['Tid',fmtDuration(duration)],['Vittjade',stats.checks],['Satta',stats.sets],['Humrar',stats.lobsters]].map(([a,b])=>`<div><span>${a}</span><strong>${b}</strong></div>`).join('');openSheet('tripCompleteSheet');syncState({quiet:true});loadReports(reportYear,{quiet:true})}finally{actionBusy=false}}
function renderTripUi(){if(!$('tripPill'))return;const fishBtn=$('fishSetTrapBtn');if(activeTrip){$('tripPill').classList.remove('hidden');$('tripPill').classList.add('running');$('tripPillText').textContent='Tur';$('tripPillMeta').textContent=`${lastSpeedKn.toFixed(1)} kn · ${tripDistanceNm.toFixed(1)} NM`;$('tripStarted').textContent=fmtClock(activeTrip.started_at);$('tripDistance').textContent=`${tripDistanceNm.toFixed(2)} NM`;if(fishBtn)fishBtn.textContent='＋ Sätt tina'}else{$('tripPill').classList.add('hidden');$('tripPill').classList.remove('running');$('tripPillText').textContent='Tur';$('tripPillMeta').textContent='';$('tripStarted').textContent='—';$('tripDistance').textContent='0.0 NM';if(fishBtn)fishBtn.textContent='Starta tur'}renderNearbyWorkSuggestion();renderSystemStatus()}

function ensureHeatmapLayer(){if(!map.getSource('catch-heat'))map.addSource('catch-heat',{type:'geojson',data:{type:'FeatureCollection',features:[]}});if(!map.getLayer('catch-heat-layer'))map.addLayer({id:'catch-heat-layer',type:'heatmap',source:'catch-heat',maxzoom:18,layout:{visibility:'none'},paint:{'heatmap-weight':['interpolate',['linear'],['get','weight'],0,.08,.25,.42,.6,.76,1,1],'heatmap-intensity':['interpolate',['linear'],['zoom'],7,.9,11,1.25,14,1.65,17,1.9],'heatmap-radius':['interpolate',['linear'],['zoom'],7,12,10,22,12,38,14,62,16,88,18,110],'heatmap-color':['interpolate',['linear'],['heatmap-density'],0,'rgba(87,190,211,0)',.05,'rgba(87,190,211,.34)',.18,'rgba(52,151,205,.55)',.38,'rgba(49,105,190,.70)',.60,'rgba(91,79,184,.82)',.80,'rgba(145,72,177,.91)',1,'rgba(190,74,160,.97)'],'heatmap-opacity':['interpolate',['linear'],['zoom'],7,.76,12,.86,15,.90,18,.72]}})}
function updateHeatmapSource(){if(!map?.getSource('catch-heat'))return;const features=(heatData.points||[]).map(p=>({type:'Feature',properties:{weight:clamp(Number(p.weight)||0,0,1)},geometry:{type:'Point',coordinates:[+p.lon,+p.lat]}})).filter(f=>f.geometry.coordinates.every(Number.isFinite));map.getSource('catch-heat').setData({type:'FeatureCollection',features});const visible=heatmapVisible;map.setLayoutProperty('catch-heat-layer','visibility',visible?'visible':'none');document.body.classList.toggle('heatmap-on',visible);['mobileHeatmapBtn','desktopHeatmapBtn'].forEach(id=>{const el=$(id);if(el){el.classList.toggle('active',visible);el.setAttribute('aria-pressed',visible?'true':'false')}})}
async function loadHeatmap({quiet=false}={}){try{const data=await api('GET','/api/heatmap');heatData={points:Array.isArray(data.points)?data.points:[],totals:data.totals||{checks:0,lobsters:0,average:0}};saveJson(HEAT_CACHE_KEY,heatData);updateHeatmapSource();if(!quiet)toast('Fångstdata uppdaterad')}catch{heatData=loadJson(HEAT_CACHE_KEY,heatData);updateHeatmapSource();if(!quiet)toast('Visar cachad fångstdata')}}
function toggleHeatmap(){heatmapVisible=!heatmapVisible;updateHeatmapSource();if(heatmapVisible&&!heatData.points?.length)loadHeatmap()}

function reportStatHtml(summary={}){const items=[['Humrar',summary.lobsters||0],['Snitt / vittjning',Number(summary.average||0).toFixed(2)],['Vittjningar',summary.checks||0],['Turer',summary.trips||0],['Distans',`${Number(summary.distance_nm||0).toFixed(1)} NM`],['Tid',`${Number(summary.hours||0).toFixed(1)} h`]];return items.map(([label,value])=>`<div><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('')}
function renderYearSelects(data){const current=String(new Date().getFullYear()),years=[...new Set([current,...(data?.years||[]).map(String)])].sort().reverse();for(const id of ['mobileReportYear','desktopReportYear']){const el=$(id);if(!el)continue;el.innerHTML=years.map(y=>`<option value="${esc(y)}" ${y===reportYear?'selected':''}>${esc(y)}</option>`).join('')}}
function renderReports(){if($('mobileReportSoakSummary'))$('mobileReportSoakSummary').innerHTML=soakSummaryHtml();if($('desktopReportSoakSummary'))$('desktopReportSoakSummary').innerHTML=soakSummaryHtml();if(!reportData)return;renderYearSelects(reportData);if($('mobileReportStats'))$('mobileReportStats').innerHTML=reportStatHtml(reportData.summary);if($('desktopReportStats'))$('desktopReportStats').innerHTML=reportStatHtml(reportData.summary);const best=reportData.best_traps||[],bestHtml=best.length?best.map(t=>`<div class="report-row"><div><strong>${esc(t.name)}</strong><small>${Number(t.checks)||0} vittjningar · ${Number(t.lobsters)||0} humrar</small></div><span>${Number(t.avg_catch||0).toFixed(2)}</span></div>`).join(''):'<div class="empty-state"><strong>Ingen fångstdata ännu</strong></div>';if($('mobileBestTraps'))$('mobileBestTraps').innerHTML=bestHtml;if($('desktopBestTraps'))$('desktopBestTraps').innerHTML=bestHtml;const days=reportData.days||[];if($('mobileReportDays'))$('mobileReportDays').innerHTML=days.length?days.map(d=>`<div class="report-row"><div><strong>${esc(d.day)}</strong><small>${Number(d.checks)||0} vittjningar</small></div><span>${Number(d.lobsters)||0}</span></div>`).join(''):'<div class="empty-state"><strong>Inga vittjningar</strong></div>';renderTripLists()}
async function loadReports(year=reportYear,{quiet=false}={}){reportYear=String(year||new Date().getFullYear());try{const data=await api('GET',`/api/reports?year=${encodeURIComponent(reportYear)}`);reportData=data;saveJson(REPORT_CACHE_KEY,data);renderReports();if(!quiet)toast('Statistik uppdaterad')}catch{reportData=loadJson(REPORT_CACHE_KEY,reportData);renderReports();if(!quiet)toast('Visar cachad statistik')}}
function renderTripLists(){renderMobileTripHistory()}
function bindTripRows(root){root?.querySelectorAll('[data-trip-id]').forEach(btn=>btn.addEventListener('click',()=>openTripDetail(btn.dataset.tripId,{mobile:true})))}
function renderMobileTripHistory(){const el=$('mobileTripsList');if(!el)return;const trips=[...state.trips].sort((a,b)=>String(b.started_at).localeCompare(String(a.started_at)));el.innerHTML=trips.length?trips.map(t=>`<button class="trip-history-row" data-history-trip="${esc(t.id)}"><div><strong>${esc(fmtDay(t.started_at))}</strong><small>${esc(t.name||'Hummertur')} · ${t.ended_at?fmtDuration(new Date(t.ended_at)-new Date(t.started_at)):'Pågående'}</small></div><span>${Number(t.distance_nm||0).toFixed(1)} NM</span></button>`).join(''):'<div class="empty-state"><strong>Inga turer ännu</strong></div>';el.querySelectorAll('[data-history-trip]').forEach(btn=>btn.addEventListener('click',()=>openTripDetail(btn.dataset.historyTrip,{mobile:true})))}
function renderDesktopTrips(){const el=$('desktopTripsList');if(!el)return;const trips=[...state.trips].sort((a,b)=>String(b.started_at).localeCompare(String(a.started_at)));el.innerHTML=trips.length?trips.map(t=>`<button class="desktop-trip-row ${t.id===selectedHistoryTripId?'selected':''}" data-desktop-history-trip="${esc(t.id)}"><div><strong>${esc(fmtDay(t.started_at))}</strong><small>${esc(t.name||'Hummertur')} · ${t.ended_at?fmtDuration(new Date(t.ended_at)-new Date(t.started_at)):'Pågående'}</small></div><span>${Number(t.distance_nm||0).toFixed(1)} NM</span></button>`).join(''):'<div class="empty-state"><strong>Inga turer ännu</strong></div>';el.querySelectorAll('[data-desktop-history-trip]').forEach(btn=>btn.addEventListener('click',()=>openTripDetail(btn.dataset.desktopHistoryTrip,{mobile:false})))}
function tripDetailSummaryHtml(data){const t=data.trip||{},sum=data.summary||{};return [['Datum',fmtDay(t.started_at)],['Tid',t.ended_at?fmtDuration(new Date(t.ended_at)-new Date(t.started_at)):'Pågår'],['Distans',`${Number(t.distance_nm||0).toFixed(1)} NM`],['Vittjade',sum.checks||0],['Satta',sum.sets||0],['Humrar',sum.lobsters||0]].map(([a,b])=>`<div><span>${esc(a)}</span><strong>${esc(b)}</strong></div>`).join('')}
function tripEventsHtml(data){const rows=[];for(const c of data.checks||[])rows.push({at:c.checked_at,html:`<button class="trip-event-row" data-edit-check="${esc(c.id)}"><span class="trip-event-icon">✓</span><span><strong>${esc(c.trap_name||'Tina')} · Vittjad</strong><small>${esc(fmtClock(c.checked_at))}${c.notes?` · ${esc(c.notes)}`:''}</small></span><span>${Number(c.lobster_count)||0} hummer</span></button>`});for(const t of data.sets||[])rows.push({at:t.set_at,html:`<button class="trip-event-row" data-edit-trap="${esc(t.id)}"><span class="trip-event-icon">＋</span><span><strong>${esc(t.name)} · Satt</strong><small>${esc(fmtClock(t.set_at))}</small></span><span>Justera</span></button>`});return rows.sort((a,b)=>String(a.at).localeCompare(String(b.at))).map(r=>r.html).join('')||'<div class="empty-state"><strong>Inga händelser på turen</strong></div>'}
async function openTripDetail(id,{mobile=false}={}){try{const data=await api('GET',`/api/trips/${encodeURIComponent(id)}`);historyTripDetail=data;selectedHistoryTripId=id;historyTrackPoints=data.points||[];renderTrack();renderDesktopTrips();const events=tripEventsHtml(data);if(mobile){$('historyTripTitle').textContent=fmtDay(data.trip?.started_at);$('historyTripSummary').innerHTML=tripDetailSummaryHtml(data);$('historyTripEvents').innerHTML=events;bindTripEventEdits($('historyTripEvents'));openSheet('tripDetailSheet')}else{$('desktopTripDetail').classList.remove('hidden');$('desktopTripDetailSummary').innerHTML=tripDetailSummaryHtml(data);$('desktopTripEvents').innerHTML=events;bindTripEventEdits($('desktopTripEvents'));if(historyTrackPoints.length>1){const coords=historyTrackPoints.map(p=>[+p.lon,+p.lat]).filter(c=>c.every(Number.isFinite));if(coords.length>1){const bounds=coords.reduce((b,c)=>b.extend(c),new maptilersdk.LngLatBounds(coords[0],coords[0]));map?.fitBounds(bounds,{padding:70,maxZoom:15,duration:450})}}}}catch(error){toast(error.message||'Kunde inte öppna turen',3200)}}
function bindTripEventEdits(root){root?.querySelectorAll('[data-edit-check]').forEach(btn=>btn.addEventListener('click',()=>openEditCheck(btn.dataset.editCheck)));root?.querySelectorAll('[data-edit-trap]').forEach(btn=>btn.addEventListener('click',()=>{selectTrap(btn.dataset.editTrap,{center:false});openTrapDetail()}))}
function openEditCheck(id){const c=historyTripDetail?.checks?.find(x=>x.id===id)||state.checks.find(x=>x.id===id);if(!c)return;$('editCheckId').value=c.id;$('editCheckTitle').textContent=c.trap_name||'Vittjning';$('editCheckLobsters').value=String(Number(c.lobster_count)||0);$('editCheckReleased').value=String(Number(c.released_count)||0);$('editCheckNotes').value=c.notes||'';$('editCheckTrap').innerHTML=state.traps.map(t=>`<option value="${esc(t.id)}" ${t.id===c.trap_id?'selected':''}>${esc(t.name)}</option>`).join('');openSheet('editCheckSheet')}
async function saveCheckEdit(ev){ev.preventDefault();const id=$('editCheckId').value;if(!id)return;const body={trap_id:$('editCheckTrap').value,lobster_count:Math.max(0,Number($('editCheckLobsters').value||0)),released_count:Math.max(0,Number($('editCheckReleased').value||0)),notes:$('editCheckNotes').value.trim()};await api('PATCH',`/api/checks/${encodeURIComponent(id)}`,body);closeSheets();await syncState({quiet:true});if(selectedHistoryTripId)await openTripDetail(selectedHistoryTripId,{mobile:!$('tripHistoryView').classList.contains('hidden')||!$('reportsView').classList.contains('hidden')});toast('Vittjningen korrigerad')}
async function deleteHistoryCheck(){const id=$('editCheckId').value;if(!id)return;if(!await confirmAction({title:'Ta bort vittjningen?',text:'Detta tar bort den felregistrerade vittjningen men inte tinan.',confirmText:'Ta bort'}))return;await api('DELETE',`/api/checks/${encodeURIComponent(id)}`);closeSheets();await syncState({quiet:true});if(selectedHistoryTripId)await openTripDetail(selectedHistoryTripId,{mobile:!$('tripHistoryView').classList.contains('hidden')||!$('reportsView').classList.contains('hidden')});toast('Vittjningen borttagen')}
function openReports(){closeSheets();$('tripHistoryView').classList.add('hidden');$('reportsView').classList.remove('hidden');loadReports(reportYear,{quiet:true})}
function closeReports(){$('reportsView').classList.add('hidden')}
function openTripHistory(){closeSheets();$('reportsView').classList.add('hidden');$('tripHistoryView').classList.remove('hidden');renderMobileTripHistory()}
function closeTripHistory(){$('tripHistoryView').classList.add('hidden')}

function switchDesktopTab(name){desktopTab=name;document.querySelectorAll('.desktop-tab').forEach(b=>b.classList.toggle('active',b.dataset.desktopTab===name));document.querySelectorAll('.desktop-pane').forEach(p=>p.classList.toggle('active',p.dataset.desktopPane===name));if(name==='reports')loadReports(reportYear,{quiet:true});if(name==='trips')renderDesktopTrips();renderTrack()}
function clearPrivateLocalData(){const keys=[];for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key)keys.push(key)}for(const key of keys)if(key.startsWith('hummerkartan:'))localStorage.removeItem(key)}
async function logout(){try{await fetch('/api/auth/logout',{method:'POST',headers:{accept:'application/json'}})}catch{}clearPrivateLocalData();try{const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith('hummerkartan-')).map(k=>caches.delete(k)))}catch{}location.replace('/login')}

function trapPrimaryAction(){const t=state.traps.find(x=>x.id===selectedTrapId);if(!t)return;if(mobileMode==='fishing'&&t.status==='active')openCheck();else openTrapDetail()}
function trapSecondaryAction(){if(mobileMode==='fishing')openTrapDetail();else clearSelection()}
function plannedPrimaryAction(){const p=state.planned.find(x=>x.id===selectedPlannedId);if(!p)return;if(mobileMode==='fishing')requestSetTrap(p.id);else beginPlacement(`move-planned:${p.id}`)}
function plannedSecondaryAction(){deletePlanned(selectedPlannedId)}

function bindUi(){
  document.querySelectorAll('[data-mobile-mode]').forEach(btn=>btn.addEventListener('click',()=>setMobileMode(btn.dataset.mobileMode)));
  document.querySelectorAll('[data-close-sheet]').forEach(btn=>btn.addEventListener('click',closeSheets));$('backdrop').addEventListener('click',closeSheets);
  $('mobileMenuBtn').addEventListener('click',()=>openSheet('menuSheet'));$('menuTripsBtn').addEventListener('click',openTripHistory);$('menuReportsBtn').addEventListener('click',openReports);$('menuTrapsBtn').addEventListener('click',()=>{closeSheets();renderTrapLists();openSheet('trapsSheet')});$('menuThemeBtn').addEventListener('click',()=>{setTheme(theme==='night'?'day':'night');closeSheets()});$('menuBackupBtn').addEventListener('click',()=>location.href='/api/export');$('menuLogoutBtn').addEventListener('click',logout);
  $('centerBtn').addEventListener('click',centerBoat);$('mobileHeatmapBtn').addEventListener('click',toggleHeatmap);$('planAddBtn').addEventListener('click',()=>beginPlacement('new-planned'));$('planOverviewBtn').addEventListener('click',fitAll);$('fishSetTrapBtn').addEventListener('click',()=>activeTrip?requestSetTrap():startTrip());$('nearbyActionBtn').addEventListener('click',triggerNearbyWork);$('dismissNearbyActionBtn').addEventListener('click',dismissNearbyWork);
  $('closeTrapCardBtn').addEventListener('click',clearSelection);$('closePlannedCardBtn').addEventListener('click',clearSelection);$('trapPrimaryBtn').addEventListener('click',trapPrimaryAction);$('trapSecondaryBtn').addEventListener('click',trapSecondaryAction);$('plannedPrimaryBtn').addEventListener('click',plannedPrimaryAction);$('plannedSecondaryBtn').addEventListener('click',plannedSecondaryAction);
  $('cancelPlacementBtn').addEventListener('click',()=>cancelPlacement());$('placeHereBtn').addEventListener('click',placeHere);$('confirmSetTrapBtn').addEventListener('click',confirmSetTrap);
  $('checkForm').addEventListener('submit',saveCheck);document.querySelectorAll('[data-count]').forEach(btn=>btn.addEventListener('click',()=>{const out=$('lobsterCount'),v=Math.max(0,Number(out.value||out.textContent||0)+Number(btn.dataset.count));out.value=String(v);out.textContent=String(v)}));
  $('trapEditForm').addEventListener('submit',saveTrapEdit);$('detailVittjaBtn').addEventListener('click',()=>{selectedTrapId=$('detailTrapId').value;openCheck()});$('moveTrapBtn').addEventListener('click',()=>{const id=$('detailTrapId').value;closeSheets();beginPlacement(`move-trap:${id}`)});$('retrieveTrapBtn').addEventListener('click',retrieveTrap);$('plannedEditForm').addEventListener('submit',savePlannedEdit);$('movePlannedBtn').addEventListener('click',()=>{const id=$('detailPlannedId').value;closeSheets();beginPlacement(`move-planned:${id}`)});$('deletePlannedBtn').addEventListener('click',()=>deletePlanned($('detailPlannedId').value));
  $('tripPill').addEventListener('click',()=>activeTrip?openSheet('tripSheet'):startTrip());$('finishTripBtn').addEventListener('click',finishTrip);$('tripCompleteDoneBtn').addEventListener('click',closeSheets);$('confirmCancelBtn').addEventListener('click',()=>resolveConfirm(false));$('confirmActionBtn').addEventListener('click',()=>resolveConfirm(true));
  $('showActiveBtn').addEventListener('click',()=>{filterActiveOnly=true;$('showActiveBtn').classList.add('active');$('showAllBtn').classList.remove('active');renderTrapLists()});$('showAllBtn').addEventListener('click',()=>{filterActiveOnly=false;$('showAllBtn').classList.add('active');$('showActiveBtn').classList.remove('active');renderTrapLists()});$('syncBtn').addEventListener('click',()=>syncState());
  $('closeReportsBtn').addEventListener('click',closeReports);$('closeTripHistoryBtn').addEventListener('click',closeTripHistory);$('editCheckForm').addEventListener('submit',saveCheckEdit);$('deleteCheckBtn').addEventListener('click',deleteHistoryCheck);$('mobileReportYear').addEventListener('change',e=>loadReports(e.target.value));$('desktopReportYear').addEventListener('change',e=>loadReports(e.target.value));
  $('desktopTripsRefreshBtn').addEventListener('click',()=>syncState({quiet:false}));$('desktopCloseTripBtn').addEventListener('click',()=>{selectedHistoryTripId=null;historyTripDetail=null;historyTrackPoints=[];$('desktopTripDetail').classList.add('hidden');renderDesktopTrips();renderTrack()});$('desktopThemeBtn').addEventListener('click',()=>setTheme(theme==='night'?'day':'night'));$('desktopSyncBtn').addEventListener('click',()=>syncState());$('desktopAddPlannedBtn').addEventListener('click',()=>beginPlacement('new-planned'));$('desktopHeatmapBtn').addEventListener('click',toggleHeatmap);$('desktopFitPlanBtn').addEventListener('click',fitAll);$('desktopAddTrapBtn').addEventListener('click',()=>beginPlacement('new-trap-map'));$('desktopTrapSearch').addEventListener('input',e=>{desktopSearch=e.target.value;renderDesktopTraps()});$('desktopActiveFilter').addEventListener('click',()=>{desktopFilterActive=true;$('desktopActiveFilter').classList.add('active');$('desktopAllFilter').classList.remove('active');renderDesktopTraps();renderTrapMarkers()});$('desktopAllFilter').addEventListener('click',()=>{desktopFilterActive=false;$('desktopAllFilter').classList.add('active');$('desktopActiveFilter').classList.remove('active');renderDesktopTraps();renderTrapMarkers()});$('desktopExportBtn').addEventListener('click',()=>location.href='/api/export');$('desktopLogoutBtn').addEventListener('click',logout);document.querySelectorAll('.desktop-tab').forEach(btn=>btn.addEventListener('click',()=>switchDesktopTab(btn.dataset.desktopTab)));
  window.addEventListener('online',()=>{renderSystemStatus();syncState({quiet:true})});window.addEventListener('offline',renderSystemStatus);window.addEventListener('resize',()=>{applyMobileMode();map?.resize();renderAll()});document.addEventListener('visibilitychange',()=>{if(!document.hidden)syncState({quiet:true})});document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(placementMode)cancelPlacement();else if(!$('tripHistoryView').classList.contains('hidden'))closeTripHistory();else if(!$('reportsView').classList.contains('hidden'))closeReports();else closeSheets()}});
}

function initMap(){
  if(!window.maptilersdk){setSync('MapTiler kunde inte laddas',false);return}
  maptilersdk.config.apiKey=MAPTILER_API_KEY;map=new maptilersdk.Map({container:'map',style:maptilersdk.MapStyle.STREETS,center:WEST_COAST_CENTER,zoom:START_ZOOM,bearing:0,pitch:0,maxPitch:0,dragRotate:false,pitchWithRotate:false,touchPitch:false,geolocateControl:false,attributionControl:true,doubleClickZoom:false});map.touchZoomRotate?.disableRotation?.();map.keyboard?.disableRotation?.();map.dragRotate?.disable?.();map.touchPitch?.disable?.();map.addControl(new maptilersdk.NavigationControl({showCompass:false}),'bottom-right');
  map.on('load',async()=>{initNauticalDepth(map,MAPTILER_API_KEY,theme);ensureHeatmapLayer();ensureTrackingLayer();ensureMapPointLayers();restoreActiveTrip();if(!isDesktop())startGps();await syncState({quiet:true});await Promise.all([loadHeatmap({quiet:true}),loadReports(reportYear,{quiet:true})]);updateHeatmapSource();renderAll()});
  map.on('click',e=>{if(placementMode)return;const layers=[TRAP_HIT_LAYER_ID,TRAP_POINT_LAYER_ID,TRAP_FOCUS_LABEL_LAYER_ID,TRAP_LABEL_LAYER_ID,PLANNED_HIT_LAYER_ID,PLANNED_POINT_LAYER_ID,PLANNED_FOCUS_LABEL_LAYER_ID,PLANNED_LABEL_LAYER_ID].filter(id=>map.getLayer(id));const hit=(layers.length?map.queryRenderedFeatures(e.point,{layers}):[])[0];if(hit){const id=hit.properties?.id;if(hit.source===TRAP_SOURCE_ID&&id){selectTrap(id);if(isDesktop())openTrapDetail();return}if(hit.source===PLANNED_SOURCE_ID&&id){selectPlanned(id);if(isDesktop())openPlannedDetail();return}}clearSelection()});
}

bindUi();setTheme(theme);applyMobileMode();initMap();
syncTimer=setInterval(()=>syncState({quiet:true}),15000);setInterval(()=>{if(activeTrip)flushTrackBatch()},10000);if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js?v=3.6.2').catch(()=>{});
