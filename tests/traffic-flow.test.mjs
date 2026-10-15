import test from 'node:test';
import assert from 'node:assert/strict';
import {FLOW_SPOTS,createScenario,runFlow,summarize} from '../scripts/traffic-harness.mjs';

// Headless flow check (scripts/traffic-harness.mjs): cars, trams and buses stepped together as in the game,
// seeded, around the busiest tram streets. A shortened run per spot keeps this to a few seconds each;
// `npm run traffic:check -- <city>` runs the long version and lists every hotspot.
const run=(city,names,seconds=70)=>FLOW_SPOTS[city].filter(s=>names.includes(s.name)).map(spot=>runFlow(createScenario(city,spot,{seed:3,people:20}),{seconds,dt:1/20,warmup:8}));
function check(reports){
 const total=summarize(reports),where=reports.flatMap(r=>r.episodes.map(e=>`${r.spot}: ${e.kind} ${e.id} at ${e.x},${e.z} ${e.street} (${e.cause})`));
 assert.equal(total.deadlocks,0,`vehicles waiting on each other in a loop: ${reports.flatMap(r=>r.cycles.map(c=>c.join(' → '))).join('; ')}`);
 assert.ok(total.stuckPer100VehicleMinutes<=2,`${total.stuck} stuck in ${total.vehicleMinutes} vehicle-minutes:\n${where.join('\n')}`);
 assert.ok(total.overlaps<=1,`bodies inside each other: ${reports.flatMap(r=>r.overlaps.map(o=>`${o.pair} ${o.kind} at ${o.x},${o.z} ${o.street}`)).join('; ')}`);
 for(const r of reports){
  assert.ok(r.tramBlockedShare<.05,`${r.spot}: trams held by other traffic ${(r.tramBlockedShare*100).toFixed(1)}% of the time`);
  assert.ok(!r.episodes.some(e=>e.kind==='tram'),`${r.spot}: a tram got stuck`);
  const moving=r.trams.filter(t=>t.travelled>0);
  if(moving.length)assert.ok(moving.reduce((n,t)=>n+t.travelled,0)/moving.length>120,`${r.spot}: trams barely moved (${moving.map(t=>t.travelled).join(', ')} m)`);
 }
}
test('Helsinki tram streets keep flowing: Mannerheimintie at Lasipalatsi and Kauppatori',{skip:'Finland city is not part of this build'},()=>{
 check(run('helsinki',['Mannerheimintie (Lasipalatsi)','Kauppatori']));
});
test('Tampere keeps flowing: Hämeenkatu at Keskustori and the railway station',{skip:'Finland city is not part of this build'},()=>{
 check(run('tampere',['Hämeenkatu (Keskustori)','Rautatieasema']));
});
