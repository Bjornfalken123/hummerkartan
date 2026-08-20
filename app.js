import { initNauticalDepth, setNauticalDepthTheme } from './depth.js';

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

const $=id=>document.getElementById(id);
const state={traps:[],checks:[],trips:[],planned:[],user:'familj',serverTime:null};
let map=null,boatMarker=null,watchId=null,currentPosition=null,currentAccuracy=null,lastPosition=null,lastPositionAt=0;
let trapMarkers=new Map(),plannedMarkers=new Map(),selectedTrapId=null,selectedPlannedId=null;
let activeTrip=loadJson(TRIP_KEY,null),tripPoints=[],trackBatch=[],trackSeq=0,tripDistanceNm=0;
let theme=localStorage.getItem('hummerkartan:theme')==='night'?'night':'day';
let mobileMode=localStorage.getItem(MOBILE_MODE_KEY)==='planning'?'planning':'fishing';
let filterActiveOnly=true,desktopFilterActive=true,desktopSearch='',placementMode=null,pendingSet=null,toastTimer=null,syncTimer=null,actionBusy=false;
let heatData=loadJson(HEAT_CACHE_KEY,{points:[],totals:{checks:0,lobsters:0,average:0}}),heatmapVisible=false;
let reportData=loadJson(REPORT_CACHE_KEY,null),reportYear=String(new Date().getFullYear());

function loadJson(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}}
function saveJson(key,value){try{localStorage.setItem(key,JSON.stringify(value))}catch{}}
function esc(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function isoNow(){return new Date().toISOString()}
function fmtDate(value){if(!value)return 'Inte vittjad';const d=new Date(value);return Number.isNaN(d.valueOf())?'—':d.toLocaleString('sv-SE',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}
function fmtDay(value){if(!value)return '—';const d=new Date(value);return Number.isNaN(d.valueOf())?'—':d.toLocaleDateString('sv-SE',{year:'numeric',month:'short',day:'numeric'})}
function fmtClock(value){if(!value)return '—';const d=new Date(value);return Number.isNaN(d.valueOf())?'—':d.toLocaleTimeString('sv-SE',{hour:'2-digit',minute:'2-digit'})}
function clamp(n,a,b){return Math.max(a,Math.min(b,n))}
function toRad(d){return d*Math.PI/180}
function distanceNm(a,b){if(!a||!b)return Infinity;const R=3440.065,lat1=toRad(a.lat),lat2=toRad(b.lat),dLat=lat2-lat1,dLon=toRad(b.lon-a.lon),h=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;return 2*R*Math.asin(Math.min(1,Math.sqrt(h)))}
function knots(ms){return Number.isFinite(ms)?ms*1.943844:null}
function isDesktop(){return window.innerWidth>=DESKTOP_BREAKPOINT}
function activeTraps(){return state.traps.filter(t=>t.status==='active')}
function toast(text,ms=2400){const el=$('toast');if(!el)return;el.textContent=text;el.classList.remove('hidden');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.add('hidden'),ms)}
function setSync(text,ok=true){if($('desktopSyncText')){$('desktopSyncText').textContent=text;$('desktopSyncText').style.color=ok?'':'#e9a18f'}}
function saveState(){saveJson(CACHE_KEY,state)}

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
    if(queue&&method!=='GET'&&error?.status==null){const pending=loadJson(PENDING_KEY,[]);pending.push({id:crypto.randomUUID(),method,url,body,queued_at:isoNow()});saveJson(PENDING_KEY,pending);setSync('Offline · sparar lokalt',false);return {ok:true,queued:true}}
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
  state.traps=Array.isArray(data.traps)?data.traps:[];state.checks=Array.isArray(data.checks)?data.checks:[];state.trips=Array.isArray(data.trips)?data.trips:[];state.planned=Array.isArray(data.planned_traps)?data.planned_traps:[];state.user=data.user||'familj';state.serverTime=data.serverTime||null;saveState();renderAll();
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
function trapAgeClass(trap){if(trap.status==='retrieved')return 'retrieved';if(trapCheckedThisTrip(trap.id))return 'checked-trip';if(!trap.last_checked_at)return 'old';const hours=(Date.now()-new Date(trap.last_checked_at).getTime())/36e5;return hours<36?'recent':hours>96?'old':''}
function trapCheckedThisTrip(id){if(!activeTrip?.started_at)return false;const start=new Date(activeTrip.started_at).getTime();return state.checks.some(c=>c.trap_id===id&&new Date(c.checked_at).getTime()>=start)}
function shortLabel(name,fallback='B'){const s=String(name||fallback).trim();return s.length>3?s.slice(0,3):s}
function nextTrapName(){const nums=state.traps.map(t=>String(t.name||'').match(/^B(\d+)$/i)).filter(Boolean).map(m=>+m[1]);return `B${Math.max(0,...nums)+1}`}
function nextPlannedName(){const nums=state.planned.map(t=>String(t.name||'').match(/^P(\d+)$/i)).filter(Boolean).map(m=>+m[1]);return `P${Math.max(0,...nums)+1}`}

function renderAll(){renderTrapMarkers();renderPlannedMarkers();renderSelections();renderOverview();renderTrapLists();renderDesktopPlan();renderDesktopTraps();renderTripLists();renderTripUi();renderReports();}

function renderTrapMarkers(){
  if(!map)return;const ids=new Set(state.traps.map(t=>t.id));for(const [id,item] of trapMarkers){if(!ids.has(id)){item.marker.remove();trapMarkers.delete(id)}}
  for(const trap of state.traps){
    const lat=+trap.lat,lon=+trap.lon;if(!Number.isFinite(lat)||!Number.isFinite(lon))continue;
    let item=trapMarkers.get(trap.id);
    if(!item){const el=document.createElement('button');el.type='button';el.className='trap-marker';el.setAttribute('aria-label',trap.name||'Tina');el.innerHTML='<span></span>';el.addEventListener('click',ev=>{ev.stopPropagation();selectTrap(trap.id);if(isDesktop())openTrapDetail()});const marker=new maptilersdk.Marker({element:el,anchor:'bottom'}).setLngLat([lon,lat]).addTo(map);item={el,marker};trapMarkers.set(trap.id,item)}else item.marker.setLngLat([lon,lat]);
    item.el.className=`trap-marker ${trapAgeClass(trap)}${trap.id===selectedTrapId?' selected':''}`;item.el.querySelector('span').textContent=shortLabel(trap.name);
    const visible=trap.status==='active'||(isDesktop()&&!desktopFilterActive);item.el.style.display=visible?'':'none';
  }
}
function renderPlannedMarkers(){
  if(!map)return;const ids=new Set(state.planned.map(p=>p.id));for(const [id,marker] of plannedMarkers){if(!ids.has(id)){marker.remove();plannedMarkers.delete(id)}}
  for(const planned of state.planned){const lat=+planned.lat,lon=+planned.lon;if(!Number.isFinite(lat)||!Number.isFinite(lon))continue;let marker=plannedMarkers.get(planned.id);if(!marker){const el=document.createElement('button');el.type='button';el.className='planned-marker';el.addEventListener('click',ev=>{ev.stopPropagation();selectPlanned(planned.id);if(isDesktop())openPlannedDetail()});marker=new maptilersdk.Marker({element:el,anchor:'center'}).setLngLat([lon,lat]).addTo(map);plannedMarkers.set(planned.id,marker)}else marker.setLngLat([lon,lat]);const el=marker.getElement();el.className=`planned-marker${planned.id===selectedPlannedId?' selected':''}`;el.textContent=shortLabel(planned.name,'P');el.title=planned.name||'Planerad tina'}
}

function selectTrap(id,{center=false}={}){selectedPlannedId=null;selectedTrapId=id;renderSelections();renderTrapMarkers();renderPlannedMarkers();renderDesktopTraps();const t=state.traps.find(x=>x.id===id);if(center&&t)map?.easeTo({center:[+t.lon,+t.lat],zoom:Math.max(map.getZoom(),13.8),duration:450})}
function selectPlanned(id,{center=false}={}){selectedTrapId=null;selectedPlannedId=id;renderSelections();renderTrapMarkers();renderPlannedMarkers();renderDesktopPlan();const p=state.planned.find(x=>x.id===id);if(center&&p)map?.easeTo({center:[+p.lon,+p.lat],zoom:Math.max(map.getZoom(),13.8),duration:450})}
function clearSelection(){selectedTrapId=null;selectedPlannedId=null;renderSelections();renderTrapMarkers();renderPlannedMarkers();renderDesktopTraps();renderDesktopPlan()}
function formatDistance(target){const d=distanceNm(currentPosition,target);return Number.isFinite(d)?(d<0.1?`${Math.round(d*1852)} m`:`${d.toFixed(2)} NM`):'—'}
function renderSelections(){
  const trap=state.traps.find(t=>t.id===selectedTrapId),planned=state.planned.find(p=>p.id===selectedPlannedId);
  if(!trap||isDesktop())$('trapCard')?.classList.add('hidden');else{
    $('trapCard').classList.remove('hidden');$('trapCardName').textContent=trap.name;$('trapCardDistance').textContent=formatDistance({lat:+trap.lat,lon:+trap.lon});const last=trapLastCheck(trap);$('trapCardMeta').textContent=last?`${fmtDate(last.checked_at)} · ${Number(last.lobster_count)||0} hummer`:'Inte vittjad';
    if(mobileMode==='fishing'){$('trapPrimaryBtn').textContent='Vittja';$('trapSecondaryBtn').textContent='Detaljer'}else{$('trapPrimaryBtn').textContent='Detaljer';$('trapSecondaryBtn').textContent='Stäng'}
  }
  if(!planned||isDesktop())$('plannedCard')?.classList.add('hidden');else{
    $('plannedCard').classList.remove('hidden');$('plannedCardName').textContent=planned.name;$('plannedCardDistance').textContent=formatDistance({lat:+planned.lat,lon:+planned.lon});$('plannedCardMeta').textContent=planned.notes||'Planerad placering';
    if(mobileMode==='fishing'){$('plannedPrimaryBtn').textContent='Sätt tina';$('plannedSecondaryBtn').textContent='Ta bort plan'}else{$('plannedPrimaryBtn').textContent='Flytta';$('plannedSecondaryBtn').textContent='Ta bort'}
  }
}

function rowHtml(item,{planned=false,value='' }={}){return `<button class="list-row" data-${planned?'planned':'trap'}-row="${esc(item.id)}"><span class="row-dot ${planned?'planned':''}">${esc(shortLabel(item.name,planned?'P':'B'))}</span><span><strong>${esc(item.name)}</strong><small>${planned?esc(item.notes||'Planerad'):item.status==='retrieved'?'Upptagen':`Senast ${esc(fmtDate(item.last_checked_at))}`}</small></span><span class="row-value">${esc(value)}</span></button>`}
function renderOverview(){if($('plannedCountBadge'))$('plannedCountBadge').textContent=String(state.planned.length)}
function renderTrapLists(){const traps=state.traps.filter(t=>!filterActiveOnly||t.status==='active'),list=$('trapList');if(!list)return;list.innerHTML=traps.length?traps.map(t=>rowHtml(t,{value:formatDistance({lat:+t.lat,lon:+t.lon})})).join(''):'<div class="empty-state"><strong>Inga tinor ännu</strong></div>';bindRows(list)}
function bindRows(root){root.querySelectorAll('[data-trap-row]').forEach(btn=>btn.addEventListener('click',()=>{closeSheets();selectTrap(btn.dataset.trapRow,{center:true})}));root.querySelectorAll('[data-planned-row]').forEach(btn=>btn.addEventListener('click',()=>{closeSheets();selectPlanned(btn.dataset.plannedRow,{center:true})}))}

function renderDesktopPlan(){
  if($('desktopPlannedCount'))$('desktopPlannedCount').textContent=String(state.planned.length);if($('desktopActiveCount'))$('desktopActiveCount').textContent=String(activeTraps().length);
  const list=$('desktopPlannedList');if(!list)return;list.innerHTML=state.planned.length?state.planned.map(p=>`<button class="desktop-row ${p.id===selectedPlannedId?'selected':''}" data-desktop-planned="${esc(p.id)}"><span class="row-dot planned">${esc(shortLabel(p.name,'P'))}</span><span><strong>${esc(p.name)}</strong><small>${esc(p.notes||'Planerad placering')}</small></span><span class="row-value">Redigera</span></button>`).join(''):'<div class="empty-state"><strong>Inga planerade tinor</strong><span>Placera en på kartan.</span></div>';list.querySelectorAll('[data-desktop-planned]').forEach(btn=>btn.addEventListener('click',()=>{selectPlanned(btn.dataset.desktopPlanned,{center:true});openPlannedDetail()}))
}
function renderDesktopTraps(){const list=$('desktopTrapList');if(!list)return;const q=desktopSearch.trim().toLowerCase(),traps=state.traps.filter(t=>(!desktopFilterActive||t.status==='active')&&(!q||String(t.name).toLowerCase().includes(q)||String(t.notes||'').toLowerCase().includes(q)));list.innerHTML=traps.length?traps.map(t=>`<button class="desktop-row ${t.id===selectedTrapId?'selected':''}" data-desktop-trap="${esc(t.id)}"><span class="row-dot">${esc(shortLabel(t.name))}</span><span><strong>${esc(t.name)}</strong><small>${t.status==='retrieved'?'Upptagen':`Senast ${esc(fmtDate(t.last_checked_at))}`}</small></span><span class="row-value">${t.status==='active'?'I vattnet':'Upptagen'}</span></button>`).join(''):'<div class="empty-state"><strong>Inga träffar</strong></div>';list.querySelectorAll('[data-desktop-trap]').forEach(btn=>btn.addEventListener('click',()=>{selectTrap(btn.dataset.desktopTrap,{center:true});openTrapDetail()}))}

function openSheet(id){document.querySelectorAll('.sheet').forEach(s=>s.classList.add('hidden'));$('backdrop').classList.remove('hidden');$(id).classList.remove('hidden')}
function closeSheets(){$('backdrop').classList.add('hidden');document.querySelectorAll('.sheet').forEach(s=>s.classList.add('hidden'));pendingSet=null}

function beginPlacement(mode){placementMode=mode;document.body.classList.add('placement-mode');$('placementCrosshair').classList.remove('hidden');$('placementBar').classList.remove('hidden');closeSheets();if(mode==='new-planned')$('placeHereBtn').textContent='Planera här';else if(String(mode).startsWith('move-planned:'))$('placeHereBtn').textContent='Flytta hit';else $('placeHereBtn').textContent='Sätt här'}
function cancelPlacement({silent=false}={}){placementMode=null;document.body.classList.remove('placement-mode');$('placementCrosshair')?.classList.add('hidden');$('placementBar')?.classList.add('hidden');if(!silent)toast('Avbrutet')}
async function placeHere(){
  if(!placementMode||!map||actionBusy)return;const center=map.getCenter(),pos={lat:+center.lat,lon:+center.lng};actionBusy=true;
  try{
    if(placementMode==='new-planned') await createPlanned(pos);
    else if(placementMode.startsWith('move-planned:')) await movePlanned(placementMode.slice('move-planned:'.length),pos);
    else if(placementMode==='new-trap-map') await createTrapAt(pos);
  }finally{actionBusy=false;cancelPlacement({silent:true})}
}
async function createPlanned(pos){const planned={id:crypto.randomUUID(),name:nextPlannedName(),lat:+pos.lat,lon:+pos.lon,notes:'',created_at:isoNow(),updated_at:isoNow(),updated_by:state.user};state.planned.push(planned);saveState();renderAll();selectedPlannedId=planned.id;await api('POST','/api/planned-traps',planned,{queue:true});renderAll();toast(`${planned.name} planerad`)}
async function movePlanned(id,pos){const planned=state.planned.find(p=>p.id===id);if(!planned)return;planned.lat=+pos.lat;planned.lon=+pos.lon;planned.updated_at=isoNow();saveState();renderAll();await api('PATCH',`/api/planned-traps/${encodeURIComponent(id)}`,{lat:planned.lat,lon:planned.lon},{queue:true});toast(`${planned.name} flyttad`)}
async function deletePlanned(id=selectedPlannedId){const planned=state.planned.find(p=>p.id===id);if(!planned)return;if(!confirm(`Ta bort ${planned.name}?`))return;state.planned=state.planned.filter(p=>p.id!==id);if(selectedPlannedId===id)selectedPlannedId=null;saveState();renderAll();closeSheets();await api('DELETE',`/api/planned-traps/${encodeURIComponent(id)}`,null,{queue:true});toast('Planen borttagen')}
function fitAll(){const points=[...activeTraps(),...state.planned].map(x=>[+x.lon,+x.lat]).filter(c=>c.every(Number.isFinite));if(!points.length){toast('Inga tinor att visa');return}if(points.length===1){map?.easeTo({center:points[0],zoom:14,duration:450});return}const bounds=points.reduce((b,c)=>b.extend(c),new maptilersdk.LngLatBounds(points[0],points[0]));map?.fitBounds(bounds,{padding:isDesktop()?70:45,maxZoom:14.5,duration:550})}

function openPlannedDetail(){const p=state.planned.find(x=>x.id===selectedPlannedId);if(!p)return;$('detailPlannedId').value=p.id;$('detailPlannedTitle').textContent=p.name;$('detailPlannedName').value=p.name;$('detailPlannedNotes').value=p.notes||'';openSheet('plannedDetailSheet')}
async function savePlannedEdit(ev){ev.preventDefault();const id=$('detailPlannedId').value,p=state.planned.find(x=>x.id===id);if(!p)return;const name=$('detailPlannedName').value.trim();if(!name)return;Object.assign(p,{name,notes:$('detailPlannedNotes').value.trim(),updated_at:isoNow()});saveState();renderAll();await api('PATCH',`/api/planned-traps/${encodeURIComponent(id)}`,{name:p.name,notes:p.notes},{queue:true});closeSheets();toast('Plan uppdaterad')}

function openTrapDetail(){const t=state.traps.find(x=>x.id===selectedTrapId);if(!t)return;$('detailTrapId').value=t.id;$('detailTrapTitle').textContent=t.name;$('detailTrapName').value=t.name;$('detailTrapNotes').value=t.notes||'';$('retrieveTrapBtn').classList.toggle('hidden',t.status!=='active');openSheet('trapDetailSheet')}
async function saveTrapEdit(ev){ev.preventDefault();const id=$('detailTrapId').value,t=state.traps.find(x=>x.id===id);if(!t)return;const name=$('detailTrapName').value.trim();if(!name)return;Object.assign(t,{name,notes:$('detailTrapNotes').value.trim(),updated_at:isoNow()});saveState();renderAll();await api('PATCH',`/api/traps/${encodeURIComponent(id)}`,{name:t.name,notes:t.notes},{queue:true});closeSheets();toast('Tina uppdaterad')}
async function retrieveTrap(){const id=$('detailTrapId').value||selectedTrapId,t=state.traps.find(x=>x.id===id);if(!t)return;if(!confirm(`Ta upp ${t.name}?`))return;t.status='retrieved';t.updated_at=isoNow();saveState();renderAll();await api('DELETE',`/api/traps/${encodeURIComponent(id)}`,null,{queue:true});closeSheets();toast(`${t.name} upptagen`)}

function getGpsFix(){return new Promise((resolve,reject)=>{if(!navigator.geolocation)return reject(new Error('GPS stöds inte'));navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,maximumAge:2000,timeout:15000})})}
async function freshPosition(){if(currentPosition&&Date.now()-lastPositionAt<12000)return {pos:currentPosition,accuracy:currentAccuracy};const fix=await getGpsFix();handlePosition(fix);return {pos:{lat:fix.coords.latitude,lon:fix.coords.longitude},accuracy:Number.isFinite(fix.coords.accuracy)?fix.coords.accuracy:null}}
async function requestSetTrap(plannedId=null){
  if(actionBusy)return;pendingSet={plannedId,name:nextTrapName(),pos:null,accuracy:null};$('setTrapName').textContent=pendingSet.name;$('setTrapPosition').textContent='Hämtar GPS…';$('setTrapAccuracy').textContent='';$('confirmSetTrapBtn').disabled=true;openSheet('setTrapSheet');
  try{const fix=await freshPosition();if(!pendingSet)return;pendingSet.pos=fix.pos;pendingSet.accuracy=fix.accuracy;$('setTrapPosition').textContent=`${fix.pos.lat.toFixed(5)}, ${fix.pos.lon.toFixed(5)}`;$('setTrapAccuracy').textContent=Number.isFinite(fix.accuracy)?`GPS ±${Math.round(fix.accuracy)} m`:'';$('confirmSetTrapBtn').disabled=false}catch(error){if(pendingSet){$('setTrapPosition').textContent='GPS kunde inte hämtas';$('setTrapAccuracy').textContent=error.message||'Kontrollera platsbehörighet'}}
}
async function confirmSetTrap(){if(!pendingSet?.pos||actionBusy)return;actionBusy=true;$('confirmSetTrapBtn').disabled=true;const planned=pendingSet.plannedId?state.planned.find(p=>p.id===pendingSet.plannedId):null;const body={id:crypto.randomUUID(),name:pendingSet.name,lat:+pendingSet.pos.lat,lon:+pendingSet.pos.lon,notes:planned?.notes||'',set_at:isoNow()};try{if(!activeTrip&&!isDesktop())await startTrip({quiet:true});state.traps.unshift({...body,status:'active',last_checked_at:null,created_at:isoNow(),updated_at:isoNow(),updated_by:state.user});await api('POST','/api/traps',body,{queue:true});if(planned){state.planned=state.planned.filter(p=>p.id!==planned.id);await api('DELETE',`/api/planned-traps/${encodeURIComponent(planned.id)}`,null,{queue:true});selectedPlannedId=null}selectedTrapId=body.id;saveState();renderAll();closeSheets();toast(`${body.name} satt`)}finally{actionBusy=false;pendingSet=null}}
async function createTrapAt(pos){const body={id:crypto.randomUUID(),name:nextTrapName(),lat:+pos.lat,lon:+pos.lon,notes:'',set_at:isoNow()};state.traps.unshift({...body,status:'active',last_checked_at:null,created_at:isoNow(),updated_at:isoNow(),updated_by:state.user});saveState();renderAll();await api('POST','/api/traps',body,{queue:true});selectedTrapId=body.id;renderAll();toast(`${body.name} skapad`)}

function openCheck(){const t=state.traps.find(x=>x.id===selectedTrapId);if(!t)return;$('checkTrapName').textContent=t.name;$('lobsterCount').value='0';$('lobsterCount').textContent='0';$('releasedCount').value='0';$('checkNotes').value='';const details=$('checkSheet').querySelector('details');if(details)details.open=false;openSheet('checkSheet')}
async function saveCheck(ev){ev.preventDefault();const trap=state.traps.find(x=>x.id===selectedTrapId);if(!trap||actionBusy)return;actionBusy=true;try{if(!activeTrip&&!isDesktop())await startTrip({quiet:true});const body={id:crypto.randomUUID(),trap_id:trap.id,checked_at:isoNow(),lobster_count:Math.max(0,Number($('lobsterCount').value||$('lobsterCount').textContent||0)),released_count:Math.max(0,Number($('releasedCount').value||0)),notes:$('checkNotes').value.trim(),lat:currentPosition?.lat??null,lon:currentPosition?.lon??null};state.checks.unshift({...body,actor:state.user,trap_name:trap.name});trap.last_checked_at=body.checked_at;trap.updated_at=body.checked_at;saveState();renderAll();await api('POST','/api/checks',body,{queue:true});closeSheets();toast(`${trap.name} · ${body.lobster_count} hummer`);loadHeatmap({quiet:true});loadReports(reportYear,{quiet:true})}finally{actionBusy=false}}

function ensureTrackingLayer(){if(!map.getSource('track'))map.addSource('track',{type:'geojson',data:{type:'FeatureCollection',features:[]}});if(!map.getLayer('track-line'))map.addLayer({id:'track-line',type:'line',source:'track',paint:{'line-color':'#f2c76d','line-width':['interpolate',['linear'],['zoom'],8,2,15,4],'line-opacity':.9},layout:{'line-join':'round','line-cap':'round'}})}
function renderTrack(){if(!map?.getSource('track'))return;const coords=tripPoints.map(p=>[+p.lon,+p.lat]).filter(c=>c.every(Number.isFinite));map.getSource('track').setData({type:'FeatureCollection',features:coords.length>1?[{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:coords}}]:[]});map.setLayoutProperty('track-line','visibility',(!isDesktop()&&mobileMode!=='fishing')?'none':'visible')}
function updateBoat(pos,course){if(!map)return;if(!boatMarker){const el=document.createElement('div');el.className='boat-marker';el.innerHTML='<div class="boat-arrow"></div>';boatMarker=new maptilersdk.Marker({element:el,anchor:'center'}).setLngLat([pos.lon,pos.lat]).addTo(map)}else boatMarker.setLngLat([pos.lon,pos.lat]);const arrow=boatMarker.getElement().querySelector('.boat-arrow');if(arrow&&Number.isFinite(course))arrow.style.transform=`rotate(${course}deg)`}
function handlePosition(position){const c=position.coords,now=position.timestamp||Date.now(),pos={lat:c.latitude,lon:c.longitude};let speed=knots(c.speed);if(!Number.isFinite(speed)&&lastPosition&&now-lastPositionAt>1000){const d=distanceNm(lastPosition,pos),hours=(now-lastPositionAt)/36e5;if(hours>0)speed=d/hours}currentPosition=pos;currentAccuracy=Number.isFinite(c.accuracy)?c.accuracy:null;updateBoat(pos,Number.isFinite(c.heading)?c.heading:null);$('speedValue').textContent=Number.isFinite(speed)?clamp(speed,0,99).toFixed(1):'0.0';renderSelections();renderOverview();if(activeTrip){const prev=tripPoints.at(-1),increment=prev?distanceNm(prev,pos):0;if(Number.isFinite(increment)&&increment<.25)tripDistanceNm+=increment;const point={seq:trackSeq++,lat:pos.lat,lon:pos.lon,speed_kn:Number.isFinite(speed)?speed:null,course:Number.isFinite(c.heading)?c.heading:null,accuracy:currentAccuracy,recorded_at:new Date(now).toISOString()};tripPoints.push(point);trackBatch.push(point);if(tripPoints.length>12000)tripPoints.splice(0,tripPoints.length-12000);saveActiveTrip();renderTrack();renderTripUi();if(trackBatch.length>=12)flushTrackBatch()}lastPosition=pos;lastPositionAt=now}
function handlePositionError(error){if(!currentPosition)toast(`GPS: ${error.message||'kunde inte starta'}`,3200)}
function startGps(){if(!navigator.geolocation)return;if(watchId!=null)return;watchId=navigator.geolocation.watchPosition(handlePosition,handlePositionError,{enableHighAccuracy:true,maximumAge:1500,timeout:15000})}
function centerBoat(){if(!currentPosition){startGps();toast('Hämtar GPS…');return}map?.easeTo({center:[currentPosition.lon,currentPosition.lat],zoom:Math.max(map.getZoom(),NAV_ZOOM),duration:500})}

async function startTrip({quiet=false}={}){if(activeTrip){if(!quiet)openSheet('tripSheet');return activeTrip}const trip={id:crypto.randomUUID(),name:`Hummertur ${new Date().toLocaleDateString('sv-SE')}`,started_at:isoNow()};activeTrip=trip;tripPoints=[];trackBatch=[];trackSeq=0;tripDistanceNm=0;saveActiveTrip();renderTripUi();await api('POST','/api/trips',trip,{queue:true});if(!quiet){toast('Turen startad');centerBoat()}return trip}
function saveActiveTrip(){saveJson(TRIP_KEY,activeTrip?{...activeTrip,tripPoints,trackSeq,tripDistanceNm}:null)}
function restoreActiveTrip(){const stored=loadJson(TRIP_KEY,null);if(!stored?.id)return;activeTrip={id:stored.id,name:stored.name,started_at:stored.started_at};tripPoints=Array.isArray(stored.tripPoints)?stored.tripPoints:[];trackSeq=Number(stored.trackSeq)||tripPoints.length;tripDistanceNm=Number(stored.tripDistanceNm)||0;renderTrack();renderTripUi()}
async function flushTrackBatch(){if(!activeTrip||!trackBatch.length)return;const points=trackBatch.splice(0,trackBatch.length);try{await api('POST',`/api/trips/${encodeURIComponent(activeTrip.id)}/points`,{points},{queue:true})}catch(error){trackBatch.unshift(...points);throw error}}
async function finishTrip(){if(!activeTrip||actionBusy)return;actionBusy=true;try{await flushTrackBatch();await api('POST',`/api/trips/${encodeURIComponent(activeTrip.id)}/finish`,{ended_at:isoNow(),distance_nm:tripDistanceNm},{queue:true});const d=tripDistanceNm;activeTrip=null;tripPoints=[];trackBatch=[];trackSeq=0;tripDistanceNm=0;saveJson(TRIP_KEY,null);renderTrack();renderTripUi();renderTrapMarkers();closeSheets();toast(`Tur sparad · ${d.toFixed(1)} NM`);syncState({quiet:true});loadReports(reportYear,{quiet:true})}finally{actionBusy=false}}
function renderTripUi(){if(!$('tripPill'))return;if(activeTrip){$('tripPill').classList.add('running');$('tripPillText').textContent='Tur pågår';$('tripPillMeta').textContent=`${tripDistanceNm.toFixed(1)} NM`;$('tripStarted').textContent=fmtClock(activeTrip.started_at);$('tripDistance').textContent=`${tripDistanceNm.toFixed(2)} NM`}else{$('tripPill').classList.remove('running');$('tripPillText').textContent='Starta tur';$('tripPillMeta').textContent='';$('tripStarted').textContent='—';$('tripDistance').textContent='0.0 NM'}}

function ensureHeatmapLayer(){if(!map.getSource('catch-heat'))map.addSource('catch-heat',{type:'geojson',data:{type:'FeatureCollection',features:[]}});if(!map.getLayer('catch-heat-layer'))map.addLayer({id:'catch-heat-layer',type:'heatmap',source:'catch-heat',maxzoom:18,layout:{visibility:'none'},paint:{'heatmap-weight':['interpolate',['linear'],['get','weight'],0,.08,.25,.42,.6,.76,1,1],'heatmap-intensity':['interpolate',['linear'],['zoom'],7,.9,11,1.25,14,1.65,17,1.9],'heatmap-radius':['interpolate',['linear'],['zoom'],7,12,10,22,12,38,14,62,16,88,18,110],'heatmap-color':['interpolate',['linear'],['heatmap-density'],0,'rgba(255,248,205,0)',.04,'rgba(255,237,137,.46)',.16,'rgba(255,203,89,.68)',.34,'rgba(246,145,61,.80)',.58,'rgba(222,76,53,.90)',.78,'rgba(177,36,50,.95)',1,'rgba(111,19,45,.98)'],'heatmap-opacity':['interpolate',['linear'],['zoom'],7,.76,12,.86,15,.90,18,.72]}})}
function updateHeatmapSource(){if(!map?.getSource('catch-heat'))return;const features=(heatData.points||[]).map(p=>({type:'Feature',properties:{weight:clamp(Number(p.weight)||0,0,1)},geometry:{type:'Point',coordinates:[+p.lon,+p.lat]}})).filter(f=>f.geometry.coordinates.every(Number.isFinite));map.getSource('catch-heat').setData({type:'FeatureCollection',features});const visible=heatmapVisible&&(isDesktop()||mobileMode==='planning');map.setLayoutProperty('catch-heat-layer','visibility',visible?'visible':'none');document.body.classList.toggle('heatmap-on',visible)}
async function loadHeatmap({quiet=false}={}){try{const data=await api('GET','/api/heatmap');heatData={points:Array.isArray(data.points)?data.points:[],totals:data.totals||{checks:0,lobsters:0,average:0}};saveJson(HEAT_CACHE_KEY,heatData);updateHeatmapSource();if(!quiet)toast('Fångstlagret uppdaterat')}catch{heatData=loadJson(HEAT_CACHE_KEY,heatData);updateHeatmapSource();if(!quiet)toast('Visar cachad fångstdata')}}
function toggleHeatmap(){if(!isDesktop()&&mobileMode!=='planning')return;heatmapVisible=!heatmapVisible;updateHeatmapSource();if(heatmapVisible&&!heatData.points?.length)loadHeatmap()}

function reportStatHtml(summary={}){const items=[['Humrar',summary.lobsters||0],['Snitt / vittjning',Number(summary.average||0).toFixed(2)],['Vittjningar',summary.checks||0],['Turer',summary.trips||0],['Distans',`${Number(summary.distance_nm||0).toFixed(1)} NM`],['Tid',`${Number(summary.hours||0).toFixed(1)} h`]];return items.map(([label,value])=>`<div><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('')}
function renderYearSelects(data){const current=String(new Date().getFullYear()),years=[...new Set([current,...(data?.years||[]).map(String)])].sort().reverse();for(const id of ['mobileReportYear','desktopReportYear']){const el=$(id);if(!el)continue;el.innerHTML=years.map(y=>`<option value="${esc(y)}" ${y===reportYear?'selected':''}>${esc(y)}</option>`).join('')}}
function renderReports(){if(!reportData)return;renderYearSelects(reportData);if($('mobileReportStats'))$('mobileReportStats').innerHTML=reportStatHtml(reportData.summary);if($('desktopReportStats'))$('desktopReportStats').innerHTML=reportStatHtml(reportData.summary);const best=reportData.best_traps||[],bestHtml=best.length?best.map(t=>`<div class="report-row"><div><strong>${esc(t.name)}</strong><small>${Number(t.checks)||0} vittjningar · ${Number(t.lobsters)||0} humrar</small></div><span>${Number(t.avg_catch||0).toFixed(2)}</span></div>`).join(''):'<div class="empty-state"><strong>Ingen fångstdata ännu</strong></div>';if($('mobileBestTraps'))$('mobileBestTraps').innerHTML=bestHtml;if($('desktopBestTraps'))$('desktopBestTraps').innerHTML=bestHtml;const days=reportData.days||[];if($('mobileReportDays'))$('mobileReportDays').innerHTML=days.length?days.map(d=>`<div class="report-row"><div><strong>${esc(d.day)}</strong><small>${Number(d.checks)||0} vittjningar</small></div><span>${Number(d.lobsters)||0}</span></div>`).join(''):'<div class="empty-state"><strong>Inga vittjningar</strong></div>';renderTripLists()}
async function loadReports(year=reportYear,{quiet=false}={}){reportYear=String(year||new Date().getFullYear());try{const data=await api('GET',`/api/reports?year=${encodeURIComponent(reportYear)}`);reportData=data;saveJson(REPORT_CACHE_KEY,data);renderReports();if(!quiet)toast('Rapport uppdaterad')}catch{reportData=loadJson(REPORT_CACHE_KEY,reportData);renderReports();if(!quiet)toast('Visar cachad rapport')}}
function tripRowHtml(t){return `<div class="report-row"><div><strong>${esc(fmtDay(t.started_at))}</strong><small>${t.ended_at?'Avslutad':'Pågående'} · ${esc(t.name||'Hummertur')}</small></div><span>${Number(t.distance_nm||0).toFixed(1)} NM</span></div>`}
function renderTripLists(){const trips=state.trips.filter(t=>String(t.started_at||'').slice(0,4)===reportYear),html=trips.length?trips.map(tripRowHtml).join(''):'<div class="empty-state"><strong>Inga turer</strong></div>';if($('mobileTripList'))$('mobileTripList').innerHTML=html;if($('desktopTripList'))$('desktopTripList').innerHTML=html}
function openReports(){closeSheets();$('reportsView').classList.remove('hidden');loadReports(reportYear,{quiet:true})}
function closeReports(){$('reportsView').classList.add('hidden')}

function switchDesktopTab(name){document.querySelectorAll('.desktop-tab').forEach(b=>b.classList.toggle('active',b.dataset.desktopTab===name));document.querySelectorAll('.desktop-pane').forEach(p=>p.classList.toggle('active',p.dataset.desktopPane===name));if(name==='reports')loadReports(reportYear,{quiet:true})}
function clearPrivateLocalData(){const keys=[];for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key)keys.push(key)}for(const key of keys)if(key.startsWith('hummerkartan:'))localStorage.removeItem(key)}
async function logout(){try{await fetch('/api/auth/logout',{method:'POST',headers:{accept:'application/json'}})}catch{}clearPrivateLocalData();try{const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith('hummerkartan-')).map(k=>caches.delete(k)))}catch{}location.replace('/login')}

function trapPrimaryAction(){const t=state.traps.find(x=>x.id===selectedTrapId);if(!t)return;if(mobileMode==='fishing')openCheck();else openTrapDetail()}
function trapSecondaryAction(){if(mobileMode==='fishing')openTrapDetail();else clearSelection()}
function plannedPrimaryAction(){const p=state.planned.find(x=>x.id===selectedPlannedId);if(!p)return;if(mobileMode==='fishing')requestSetTrap(p.id);else beginPlacement(`move-planned:${p.id}`)}
function plannedSecondaryAction(){deletePlanned(selectedPlannedId)}

function bindUi(){
  document.querySelectorAll('[data-mobile-mode]').forEach(btn=>btn.addEventListener('click',()=>setMobileMode(btn.dataset.mobileMode)));
  document.querySelectorAll('[data-close-sheet]').forEach(btn=>btn.addEventListener('click',closeSheets));$('backdrop').addEventListener('click',closeSheets);
  $('mobileMenuBtn').addEventListener('click',()=>openSheet('menuSheet'));$('menuReportsBtn').addEventListener('click',openReports);$('menuTrapsBtn').addEventListener('click',()=>{closeSheets();renderTrapLists();openSheet('trapsSheet')});$('menuThemeBtn').addEventListener('click',()=>{setTheme(theme==='night'?'day':'night');closeSheets()});$('menuBackupBtn').addEventListener('click',()=>location.href='/api/export');$('menuLogoutBtn').addEventListener('click',logout);
  $('centerBtn').addEventListener('click',centerBoat);$('mobileHeatmapBtn').addEventListener('click',toggleHeatmap);$('planAddBtn').addEventListener('click',()=>beginPlacement('new-planned'));$('planOverviewBtn').addEventListener('click',fitAll);$('fishSetTrapBtn').addEventListener('click',()=>requestSetTrap());
  $('closeTrapCardBtn').addEventListener('click',clearSelection);$('closePlannedCardBtn').addEventListener('click',clearSelection);$('trapPrimaryBtn').addEventListener('click',trapPrimaryAction);$('trapSecondaryBtn').addEventListener('click',trapSecondaryAction);$('plannedPrimaryBtn').addEventListener('click',plannedPrimaryAction);$('plannedSecondaryBtn').addEventListener('click',plannedSecondaryAction);
  $('cancelPlacementBtn').addEventListener('click',()=>cancelPlacement());$('placeHereBtn').addEventListener('click',placeHere);$('confirmSetTrapBtn').addEventListener('click',confirmSetTrap);
  $('checkForm').addEventListener('submit',saveCheck);document.querySelectorAll('[data-count]').forEach(btn=>btn.addEventListener('click',()=>{const out=$('lobsterCount'),v=Math.max(0,Number(out.value||out.textContent||0)+Number(btn.dataset.count));out.value=String(v);out.textContent=String(v)}));
  $('trapEditForm').addEventListener('submit',saveTrapEdit);$('retrieveTrapBtn').addEventListener('click',retrieveTrap);$('plannedEditForm').addEventListener('submit',savePlannedEdit);$('movePlannedBtn').addEventListener('click',()=>{const id=$('detailPlannedId').value;closeSheets();beginPlacement(`move-planned:${id}`)});$('deletePlannedBtn').addEventListener('click',()=>deletePlanned($('detailPlannedId').value));
  $('tripPill').addEventListener('click',()=>activeTrip?openSheet('tripSheet'):startTrip());$('finishTripBtn').addEventListener('click',finishTrip);
  $('showActiveBtn').addEventListener('click',()=>{filterActiveOnly=true;$('showActiveBtn').classList.add('active');$('showAllBtn').classList.remove('active');renderTrapLists()});$('showAllBtn').addEventListener('click',()=>{filterActiveOnly=false;$('showAllBtn').classList.add('active');$('showActiveBtn').classList.remove('active');renderTrapLists()});$('syncBtn').addEventListener('click',()=>syncState());
  $('closeReportsBtn').addEventListener('click',closeReports);$('mobileReportYear').addEventListener('change',e=>loadReports(e.target.value));$('desktopReportYear').addEventListener('change',e=>loadReports(e.target.value));
  $('desktopThemeBtn').addEventListener('click',()=>setTheme(theme==='night'?'day':'night'));$('desktopSyncBtn').addEventListener('click',()=>syncState());$('desktopAddPlannedBtn').addEventListener('click',()=>beginPlacement('new-planned'));$('desktopHeatmapBtn').addEventListener('click',toggleHeatmap);$('desktopFitPlanBtn').addEventListener('click',fitAll);$('desktopAddTrapBtn').addEventListener('click',()=>beginPlacement('new-trap-map'));$('desktopTrapSearch').addEventListener('input',e=>{desktopSearch=e.target.value;renderDesktopTraps()});$('desktopActiveFilter').addEventListener('click',()=>{desktopFilterActive=true;$('desktopActiveFilter').classList.add('active');$('desktopAllFilter').classList.remove('active');renderDesktopTraps();renderTrapMarkers()});$('desktopAllFilter').addEventListener('click',()=>{desktopFilterActive=false;$('desktopAllFilter').classList.add('active');$('desktopActiveFilter').classList.remove('active');renderDesktopTraps();renderTrapMarkers()});$('desktopExportBtn').addEventListener('click',()=>location.href='/api/export');$('desktopLogoutBtn').addEventListener('click',logout);document.querySelectorAll('.desktop-tab').forEach(btn=>btn.addEventListener('click',()=>switchDesktopTab(btn.dataset.desktopTab)));
  window.addEventListener('online',()=>syncState({quiet:true}));window.addEventListener('resize',()=>{applyMobileMode();map?.resize();renderAll()});document.addEventListener('visibilitychange',()=>{if(!document.hidden)syncState({quiet:true})});document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(placementMode)cancelPlacement();else if(!$('reportsView').classList.contains('hidden'))closeReports();else closeSheets()}});
}

function initMap(){
  if(!window.maptilersdk){setSync('MapTiler kunde inte laddas',false);return}
  maptilersdk.config.apiKey=MAPTILER_API_KEY;map=new maptilersdk.Map({container:'map',style:maptilersdk.MapStyle.STREETS,center:WEST_COAST_CENTER,zoom:START_ZOOM,geolocateControl:false,attributionControl:true,doubleClickZoom:false});map.addControl(new maptilersdk.NavigationControl({showCompass:false}),'bottom-right');
  map.on('load',async()=>{initNauticalDepth(map,MAPTILER_API_KEY,theme);ensureHeatmapLayer();ensureTrackingLayer();restoreActiveTrip();if(!isDesktop())startGps();await syncState({quiet:true});await Promise.all([loadHeatmap({quiet:true}),loadReports(reportYear,{quiet:true})]);updateHeatmapSource();renderAll()});
  map.on('click',()=>{if(!placementMode)clearSelection()});
}

bindUi();setTheme(theme);applyMobileMode();initMap();
syncTimer=setInterval(()=>syncState({quiet:true}),15000);setInterval(()=>{if(activeTrip)flushTrackBatch()},10000);if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js?v=3.1.0').catch(()=>{});
