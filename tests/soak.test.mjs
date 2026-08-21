import assert from 'node:assert/strict';
import { SOAK_MS, soakStartMs, soakAgeMs, soakStatus, soakStatusLabel, formatSoakAge, soakSummary } from '../soak.js';

const base=Date.parse('2026-08-21T10:00:00Z');
const trap=(setAt,lastCheckedAt=null,status='active')=>({set_at:setAt,last_checked_at:lastCheckedAt,status});
const iso=ms=>new Date(ms).toISOString();

assert.equal(soakStatus(trap(iso(base-23*SOAK_MS.HOUR)),base),'fresh');
assert.equal(soakStatus(trap(iso(base-24*SOAK_MS.HOUR)),base),'due');
assert.equal(soakStatus(trap(iso(base-71*SOAK_MS.HOUR)),base),'due');
assert.equal(soakStatus(trap(iso(base-72*SOAK_MS.HOUR)),base),'priority');
assert.equal(soakStatus(trap(iso(base-10*SOAK_MS.DAY),null,'retrieved'),base),'retrieved');

const reset=trap(iso(base-4*SOAK_MS.DAY),iso(base-5*SOAK_MS.HOUR));
assert.equal(soakStartMs(reset),Date.parse(reset.last_checked_at),'latest check resets soak age');
assert.equal(soakAgeMs(reset,base),5*SOAK_MS.HOUR);
assert.equal(soakStatus(reset,base),'fresh','recent check must reset status to fresh');

assert.equal(formatSoakAge(30*60*1000),'<1 h');
assert.equal(formatSoakAge(6*SOAK_MS.HOUR),'6 h');
assert.equal(formatSoakAge(27*SOAK_MS.HOUR),'1 dygn 3 h');
assert.equal(soakStatusLabel('priority'),'Prioritera');

const summary=soakSummary([
  trap(iso(base-3*SOAK_MS.HOUR)),
  trap(iso(base-30*SOAK_MS.HOUR)),
  trap(iso(base-80*SOAK_MS.HOUR)),
  trap(iso(base-80*SOAK_MS.HOUR),null,'retrieved'),
],base);
assert.deepEqual(summary,{fresh:1,due:1,priority:1,unknown:0});
console.log('Soak-age status thresholds and reset behavior OK');
