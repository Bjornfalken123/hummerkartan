export const SOAK_MS = {
  HOUR: 60 * 60 * 1000,
  DAY: 24 * 60 * 60 * 1000,
  FRESH_MAX: 24 * 60 * 60 * 1000,
  DUE_MAX: 72 * 60 * 60 * 1000,
};

function timeMs(value){
  if(!value)return null;
  const ms=new Date(value).getTime();
  return Number.isFinite(ms)?ms:null;
}

export function soakStartMs(trap){
  const set=timeMs(trap?.set_at);
  const checked=timeMs(trap?.last_checked_at);
  if(set==null)return checked;
  if(checked==null)return set;
  return Math.max(set,checked);
}

export function soakAgeMs(trap,now=Date.now()){
  const start=soakStartMs(trap);
  if(start==null)return null;
  return Math.max(0,Number(now)-start);
}

export function soakStatus(trap,now=Date.now()){
  if(trap?.status==='retrieved')return 'retrieved';
  const age=soakAgeMs(trap,now);
  if(age==null)return 'unknown';
  if(age<SOAK_MS.FRESH_MAX)return 'fresh';
  if(age<SOAK_MS.DUE_MAX)return 'due';
  return 'priority';
}

export function soakStatusLabel(status){
  return ({fresh:'Ny / nyvittjad',due:'Snart dags',priority:'Prioritera',retrieved:'Upptagen',unknown:'Okänd tid'})[status]||'Okänd tid';
}

export function formatSoakAge(ageMs){
  if(ageMs==null||!Number.isFinite(Number(ageMs)))return 'Okänd tid';
  const ms=Math.max(0,Number(ageMs));
  const hours=Math.floor(ms/SOAK_MS.HOUR);
  if(hours<1)return '<1 h';
  if(hours<24)return `${hours} h`;
  const days=Math.floor(hours/24),rest=hours%24;
  return rest?`${days} dygn ${rest} h`:`${days} dygn`;
}

export function soakSummary(traps,now=Date.now()){
  const summary={fresh:0,due:0,priority:0,unknown:0};
  for(const trap of traps||[]){
    if(trap?.status!=='active')continue;
    const status=soakStatus(trap,now);
    if(status in summary)summary[status]++;
  }
  return summary;
}
