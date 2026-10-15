import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {SpatialIndex} from '../src/geo.js';
import {sofiankatuSignSafe} from '../src/sofiankatu-signs.js';
import {createKaivokatuDetails,KAIVOKATU_ROUNDELS,KAIVOKATU_ROAD_FRAME} from '../src/kaivokatu-details.js';
if (!existsSync('public/data')) {
 test('local city pack', {skip: 'local Helsinki or Tampere fixture is not in this checkout'}, () => {});
} else {
const city=JSON.parse(gunzipSync(readFileSync(new URL('../public/data/city.pack',import.meta.url))));
test('reference station markings have three 30 roundels and correct lane arrows',()=>{
 assert.equal(KAIVOKATU_ROUNDELS.length,3);assert.deepEqual(KAIVOKATU_ROUNDELS.map(p=>p.arrow),['left','straight','straight']);
 assert.ok(KAIVOKATU_ROAD_FRAME.right[1]<0,'westbound driver right is north; letters must not mirror');
 const {group}=createKaivokatuDetails(city);assert.equal(group.userData.reference.photography,'2025-09');assert.equal(group.userData.regulatesSimulation,false);
});
test('all three physical sign poles stand on mapped safe surfaces',()=>{
 const {group,obstacles}=createKaivokatuDetails(city);assert.equal(group.userData.placed.length,3);assert.deepEqual(group.userData.omitted,[]);assert.equal(obstacles.length,3);assert.ok(obstacles.every(o=>o.breakable),'posts bend/snap, footprints guide placement only');
 for(const p of group.userData.placed)assert.ok(sofiankatuSignSafe(p,city));
 const parking=group.userData.placed.find(p=>p.type==='parking');assert.ok(parking.x>-530,'parking boards belong at station, not Sokos');
 assert.deepEqual(group.userData.parkingDestinations,['FORUM','KAMPPI','ELIEL']);assert.equal(group.userData.parkingDirection,'straight');
});
test('road paint triangles face up and centroids stay on roads, off pavement',()=>{
 const {group}=createKaivokatuDetails(city),road=new SpatialIndex(city.roads.filter(p=>p.kind!=='Koroke')),pavement=new SpatialIndex(city.pavement);
 for(const mesh of group.children.filter(m=>m.name.includes('paint'))){const p=mesh.geometry.attributes.position;
  for(let i=0;i<p.count;i+=3){const x=(p.getX(i)+p.getX(i+1)+p.getX(i+2))/3,z=(p.getZ(i)+p.getZ(i+1)+p.getZ(i+2))/3;
   assert.ok(road.at(x,z));assert.ok(!pavement.at(x,z));
   const up=(p.getZ(i+1)-p.getZ(i))*(p.getX(i+2)-p.getX(i))-(p.getX(i+1)-p.getX(i))*(p.getZ(i+2)-p.getZ(i));assert.ok(up>=-1e-7);
  }
 }
});
test('bounded, finite geometry with no image/texture dependency',()=>{
 const {group}=createKaivokatuDetails(city),meshes=group.children.filter(m=>m.isMesh);assert.ok(meshes.length<=8);let triangles=0; // plus the breakable posts' stump group
 for(const m of meshes){assert.equal(m.material.map,null);assert.ok([...m.geometry.attributes.position.array].every(Number.isFinite));triangles+=m.geometry.attributes.position.count/3;}
 assert.ok(triangles<4000);
});

}
