import assert from 'node:assert/strict';
import { chooseActionFix, trackPointDecision } from '../gps.js';

const mk=(lat,lon,t,accuracy=8)=>({pos:{lat,lon},timestamp:t,accuracy,speed_kn:6,course:90});
const t=1_000_000;
const interpolated=chooseActionFix([mk(58,11,t-1000),mk(58.001,11.002,t+1000)],t);
assert(interpolated,'interpolated fix missing');
assert.equal(interpolated.method,'time-interpolated');
assert(Math.abs(interpolated.pos.lat-58.0005)<1e-9);
assert(Math.abs(interpolated.pos.lon-11.001)<1e-9);
assert.equal(interpolated.timing_error_ms,0);

const poor=chooseActionFix([mk(58,11,t,75)],t);
assert.equal(poor,null,'poor accuracy must be rejected');

const nearest=chooseActionFix([mk(58,11,t-900)],t);
assert(nearest&&nearest.method==='nearest-fix','near recent fix should be accepted');

const prev={lat:58,lon:11,accuracy:10,recorded_ms:t};
const jitter=trackPointDecision(prev,mk(58.00001,11.00001,t+1000,10));
assert.equal(jitter.accept,false,'small movement inside GPS noise should be rejected');
const move=trackPointDecision(prev,mk(58.0002,11.0002,t+5000,8));
assert.equal(move.accept,true,'realistic movement should be accepted');
assert.equal(move.addDistance,true);
const jump=trackPointDecision(prev,mk(59,12,t+1000,8));
assert.equal(jump.accept,false,'impossible jump should be rejected');
assert.equal(jump.reason,'jump');

console.log('GPS selection/interpolation and trip jitter filters OK');
