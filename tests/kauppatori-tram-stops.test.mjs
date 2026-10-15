import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import {createKauppatoriTramStops} from '../src/kauppatori-tram-stops.js';
if (!fs.existsSync('public/data')) {
 test('local city pack', {skip: 'local Helsinki or Tampere fixture is not in this checkout'}, () => {});
} else {
const city=JSON.parse(zlib.gunzipSync(fs.readFileSync('public/data/city.pack')));
test('Havis Amanda has three safe Kauppatori tram shelters, including the eastern branch',()=>{
 const result=createKauppatoriTramStops(city);
 assert.equal(result.group.userData.placed,3);
 for(const stop of result.stops){
  assert.equal(stop.group.userData.name,'Kauppatori');
  assert.ok(stop.safe(stop.shelter.x,stop.shelter.z,1.4,5.4));
  assert.ok(stop.shelter.score<=49);assert.ok(stop.railings.length>=2);
  for(const p of stop.railings)assert.ok(stop.safe(p.x,p.z,.18,1.85));
 }
 result.group.traverse(m=>{if(m.isMesh)assert.ok(m.geometry.attributes.position.array.every(Number.isFinite));});
 for(const [i,a] of result.stops.entries())for(const b of result.stops.slice(i+1))assert.ok(Math.hypot(a.shelter.x-b.shelter.x,a.shelter.z-b.shelter.z)>5);
 const east=result.stops.find(s=>s.group.userData.id==='1030425');
 assert.equal(east.group.userData.heading,0);
 assert.ok(east.shelter.x>2&&east.shelter.x<7);
 assert.ok(east.shelter.z>262&&east.shelter.z<295);
});

}
