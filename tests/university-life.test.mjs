import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import {universityLifePlacements,createUniversityLife,universityPlacementValidator} from '../src/university-life.js';
if (!fs.existsSync('public/data')) {
 test('local city pack', {skip: 'local Helsinki or Tampere fixture is not in this checkout'}, () => {});
} else {
const city=JSON.parse(zlib.gunzipSync(fs.readFileSync(new URL('../public/data/city.pack',import.meta.url))));
test('university bikes, scooters and crowd stay on pavement with central route clear',()=>{
  const p=universityLifePlacements(city);assert.equal(p.bicycles.length,25);assert.equal(p.scooters.length,20);assert.equal(p.people.length,40);
  for(const b of p.bicycles)assert.ok(p.safe(b.x,b.z,.98));for(const s of p.scooters)assert.ok(p.safe(s.x,s.z,.65));for(const person of p.people)assert.ok(p.crowdSafe(person.x,person.z));
  assert.ok(new Set(p.bicycles.map(b=>b.color)).size>=4);assert.ok(new Set(p.scooters.map(b=>b.color)).size>=3);
  for(const r of p.rails)for(let t=0;t<=1;t+=.1)assert.ok(p.safe(r.a.x+(r.b.x-r.a.x)*t,r.a.z+(r.b.z-r.a.z)*t,.06));
});
test('university kit uses shared instanced builders; people cannot wander into cars, buildings or water',()=>{
  const u=createUniversityLife(city),safe=universityPlacementValidator(city),start=u.people.map(p=>[p.x,p.z]);let draws=0;
  u.group.traverse(o=>{if(o.isMesh){draws++;assert.ok(Array.from(o.geometry.attributes.position.array).every(Number.isFinite));}});assert.ok(draws<=19); // three distant-level person meshes (PERSON_LOD)
  for(let i=0;i<100;i++)u.update(.08,{x:-200+i*.1,z:25,speed:8});for(const p of u.people)assert.ok(safe(p.x,p.z,.38));
  u.reset();assert.deepEqual(u.people.map(p=>[p.x,p.z]),start);
});

}
