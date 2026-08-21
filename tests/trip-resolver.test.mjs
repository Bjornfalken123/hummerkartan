import assert from 'node:assert/strict';
import { resolveTripId } from '../functions/_lib/common.js';

function fakeDb(trips){
  return {
    prepare(sql){
      return {
        args:[],
        bind(...args){this.args=args;return this},
        async first(){
          if(sql.includes('WHERE id=?')){
            const [id]=this.args;return trips.find(t=>t.id===id)||null;
          }
          if(sql.includes('started_at<=?')){
            const [at]=this.args;
            return [...trips].filter(t=>t.started_at<=at&&(!t.ended_at||t.ended_at>=at)).sort((a,b)=>b.started_at.localeCompare(a.started_at))[0]||null;
          }
          throw new Error(`Unexpected SQL: ${sql}`);
        }
      };
    }
  };
}

const trips=[
  {id:'trip-old',started_at:'2026-08-20T08:00:00.000Z',ended_at:'2026-08-20T12:00:00.000Z'},
  {id:'trip-live',started_at:'2026-08-21T08:00:00.000Z',ended_at:'2026-08-21T18:00:00.000Z'}
];
assert.equal(await resolveTripId(fakeDb(trips),'trip-live','2026-08-21T10:00:00.000Z'),'trip-live');
assert.equal(await resolveTripId(fakeDb(trips),'deleted-trip','2026-08-21T10:00:00.000Z'),'trip-live');
assert.equal(await resolveTripId(fakeDb(trips),'trip-old','2026-08-21T10:00:00.000Z'),'trip-live');
assert.equal(await resolveTripId(fakeDb(trips),'deleted-trip','2026-08-22T10:00:00.000Z'),'');
console.log('Stale/missing trip id resolution OK');
