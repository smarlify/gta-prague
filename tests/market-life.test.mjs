import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import {marketStallPlacements} from '../src/kauppatori.js';
import {createMarketLife,marketLifePlacements,marketPlacementValidator} from '../src/market-life.js';
if (!fs.existsSync('public/data')) {
 test('local city pack', {skip: 'local Helsinki or Tampere fixture is not in this checkout'}, () => {});
} else {
const city=JSON.parse(zlib.gunzipSync(fs.readFileSync('public/data/city.pack'))),stalls=marketStallPlacements(city);
test('busy market placements avoid mapped road, cycleway, water, structures and monuments',()=>{
 const {people,scooters,safe}=marketLifePlacements(city,stalls);
 assert.equal(people.length,140);assert.equal(scooters.length,12);
 for(const p of people)assert.ok(safe(p.x,p.z),p.id);
 for(const p of scooters)assert.ok(safe(p.x,p.z,.85),'entire parked scooter envelope');
 assert.ok(new Set(people.map(p=>p.pose)).size>=3);assert.ok(new Set(people.map(p=>p.shirt)).size>=8);
 assert.equal(new Set(people.map(p=>p.id)).size,140);
});
test('market geometry stays instanced and simulated movement remains within validated plaza',()=>{
 const m=createMarketLife(city,stalls),safe=marketPlacementValidator(city,stalls);let draws=0,triangles=0;
 m.group.traverse(o=>{if(o.isMesh){draws++;assert.ok(o.isInstancedMesh);triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3*o.count;}});
 assert.ok(draws<=15,`${draws} draws`);assert.ok(triangles<250000,`${triangles} triangles`); // 6 near + 3 distant-level person meshes (person-model.js PERSON_LOD) + scooters
 const start=m.people.map(p=>[p.x,p.z]);
 for(let i=0;i<120;i++)m.update(.08,{x:100+Math.sin(i*.1)*15,z:275,speed:12});
 assert.ok(m.people.some((p,i)=>Math.hypot(p.x-start[i][0],p.z-start[i][1])>.1));
 for(const p of m.people)assert.ok(safe(p.x,p.z),p.id);
 m.reset();assert.deepEqual(m.people.map(p=>[p.x,p.z]),start);
});

}
