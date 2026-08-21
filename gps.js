export const GPS_DEFAULTS = Object.freeze({
  setMaxAccuracyM: 40,
  setMaxBracketMs: 5000,
  setMaxNearestMs: 1800,
  trackMaxAccuracyM: 60,
  trackMaxSpeedKn: 80,
  trackHeartbeatMs: 30000
});

function finite(value){const n=Number(value);return Number.isFinite(n)?n:null}
function clamp(n,a,b){return Math.max(a,Math.min(b,n))}
function toRad(d){return d*Math.PI/180}

export function distanceNm(a,b){
  if(!a||!b)return Infinity;
  const lat1=finite(a.lat),lon1=finite(a.lon),lat2=finite(b.lat),lon2=finite(b.lon);
  if([lat1,lon1,lat2,lon2].some(v=>v==null))return Infinity;
  const R=3440.065,dLat=toRad(lat2-lat1),dLon=toRad(lon2-lon1),p1=toRad(lat1),p2=toRad(lat2);
  const h=Math.sin(dLat/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.min(1,Math.sqrt(h)));
}

export function normalizeGpsFix(position){
  const c=position?.coords||{};
  const lat=finite(c.latitude),lon=finite(c.longitude);
  if(lat==null||lon==null||Math.abs(lat)>90||Math.abs(lon)>180)return null;
  const speedMs=finite(c.speed);
  return {
    pos:{lat,lon},
    accuracy:finite(c.accuracy),
    timestamp:finite(position?.timestamp)??Date.now(),
    speed_kn:speedMs==null?null:speedMs*1.943844,
    course:finite(c.heading)
  };
}

function validActionFix(fix,maxAccuracyM){
  return Boolean(fix&&fix.pos&&Number.isFinite(fix.timestamp)&&Number.isFinite(fix.accuracy)&&fix.accuracy>=0&&fix.accuracy<=maxAccuracyM);
}

export function chooseActionFix(fixes, actionAt, options={}){
  const maxAccuracyM=finite(options.maxAccuracyM)??GPS_DEFAULTS.setMaxAccuracyM;
  const maxBracketMs=finite(options.maxBracketMs)??GPS_DEFAULTS.setMaxBracketMs;
  const maxNearestMs=finite(options.maxNearestMs)??GPS_DEFAULTS.setMaxNearestMs;
  const list=(Array.isArray(fixes)?fixes:[]).filter(f=>validActionFix(f,maxAccuracyM)).sort((a,b)=>a.timestamp-b.timestamp);
  if(!list.length)return null;
  const before=[...list].reverse().find(f=>f.timestamp<=actionAt);
  const after=list.find(f=>f.timestamp>=actionAt);
  if(before&&after&&after.timestamp>=before.timestamp&&after.timestamp-before.timestamp<=maxBracketMs){
    const span=Math.max(1,after.timestamp-before.timestamp);
    const t=clamp((actionAt-before.timestamp)/span,0,1);
    const nearest=Math.abs(actionAt-before.timestamp)<=Math.abs(after.timestamp-actionAt)?before:after;
    return {
      pos:{lat:before.pos.lat+(after.pos.lat-before.pos.lat)*t,lon:before.pos.lon+(after.pos.lon-before.pos.lon)*t},
      accuracy:Math.max(before.accuracy,after.accuracy),timestamp:actionAt,
      speed_kn:nearest.speed_kn??null,course:nearest.course??null,
      method:before.timestamp===after.timestamp?'exact-fix':'time-interpolated',timing_error_ms:0,
      source_before_at:before.timestamp,source_after_at:after.timestamp
    };
  }
  const nearest=list.reduce((best,f)=>!best||Math.abs(f.timestamp-actionAt)<Math.abs(best.timestamp-actionAt)?f:best,null);
  const error=nearest?Math.abs(nearest.timestamp-actionAt):Infinity;
  if(!nearest||error>maxNearestMs)return null;
  return {...nearest,method:'nearest-fix',timing_error_ms:Math.round(error),source_before_at:nearest.timestamp<=actionAt?nearest.timestamp:null,source_after_at:nearest.timestamp>=actionAt?nearest.timestamp:null};
}

export function trackPointDecision(previous,current,options={}){
  const maxAccuracyM=finite(options.maxAccuracyM)??GPS_DEFAULTS.trackMaxAccuracyM;
  const maxSpeedKn=finite(options.maxSpeedKn)??GPS_DEFAULTS.trackMaxSpeedKn;
  const heartbeatMs=finite(options.heartbeatMs)??GPS_DEFAULTS.trackHeartbeatMs;
  if(!current?.pos||!Number.isFinite(current.timestamp))return {accept:false,addDistance:false,distanceNm:0,reason:'invalid'};
  if(Number.isFinite(current.accuracy)&&current.accuracy>maxAccuracyM)return {accept:false,addDistance:false,distanceNm:0,reason:'accuracy'};
  if(!previous)return {accept:true,addDistance:false,distanceNm:0,reason:'first'};
  const dt=current.timestamp-Number(previous.recorded_ms??Date.parse(previous.recorded_at));
  if(!Number.isFinite(dt)||dt<=0)return {accept:false,addDistance:false,distanceNm:0,reason:'time'};
  const dNm=distanceNm({lat:+previous.lat,lon:+previous.lon},current.pos);
  if(!Number.isFinite(dNm))return {accept:false,addDistance:false,distanceNm:0,reason:'distance'};
  const derivedSpeed=dNm/(dt/36e5);
  if(Number.isFinite(derivedSpeed)&&derivedSpeed>maxSpeedKn)return {accept:false,addDistance:false,distanceNm:0,reason:'jump'};
  const prevAcc=Number.isFinite(+previous.accuracy)?+previous.accuracy:15;
  const currAcc=Number.isFinite(current.accuracy)?current.accuracy:15;
  const noiseThresholdM=clamp((prevAcc+currAcc)*0.35,3,15);
  const dM=dNm*1852;
  const moved=dM>=noiseThresholdM;
  const heartbeat=dt>=heartbeatMs;
  if(!moved&&!heartbeat)return {accept:false,addDistance:false,distanceNm:0,reason:'jitter'};
  return {accept:true,addDistance:moved,distanceNm:moved?dNm:0,reason:moved?'move':'heartbeat'};
}
