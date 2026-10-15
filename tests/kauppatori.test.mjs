import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import * as THREE from 'three';
import {createKauppatori,MARKET_MONUMENTS} from '../src/kauppatori.js';
import {SpatialIndex,pointInPolygon} from '../src/geo.js';
import {createWaterfrontFront,isWaterfrontFront} from '../src/kauppatori-buildings.js';
import {createModelledBuilding} from '../src/building-detail.js';
if (!fs.existsSync('public/data')) {
 test('local city pack', {skip: 'local Helsinki or Tampere fixture is not in this checkout'}, () => {});
} else {
const city=JSON.parse(zlib.gunzipSync(fs.readFileSync('public/data/city.pack')));
test('Kauppatori preserves all 27 mapped sections and keeps stalls off roads, buildings and water',()=>{
 const market=createKauppatori(city),roads=new SpatialIndex(city.roads),buildings=new SpatialIndex(city.buildings);
 assert.equal(market.group.userData.mappedPavingSections,27);assert.ok(market.stalls.length>=30);assert.ok(market.group.userData.quaySegments>30);
 for(const p of market.obstacles.slice(0,market.stalls.length))for(const [x,z] of p.rings[0]){assert.ok(!roads.at(x,z));assert.ok(!buildings.at(x,z));assert.ok(!city.water.some(w=>pointInPolygon(x,z,w.rings)));}
 const collisions=new SpatialIndex(market.obstacles);for(const m of Object.values(MARKET_MONUMENTS))assert.ok(collisions.at(m.x,m.z));
 assert.ok(market.group.children.length<20,'geometry batched by material, not hundreds of individual objects');
});
test('waterfront frontages use physical geometry in measured bounds, without filling courtyards',()=>{
 for(const ratu of [216,18,24,23,410]){
  const meshes=createWaterfrontFront(ratu),box=new THREE.Box3();assert.ok(meshes.length>3);
  for(const mesh of meshes){mesh.geometry.computeBoundingBox();box.union(mesh.geometry.boundingBox);assert.equal(mesh.material.map,null);assert.ok([...mesh.geometry.attributes.position.array].every(Number.isFinite));}
  assert.ok(box.max.y>10&&box.max.y<26);assert.ok(box.min.x> -2&&box.max.x<260);assert.ok(box.min.z>190&&box.max.z<485);
 }
 const n=new THREE.Vector3(.052,0,.9986);assert.ok(isWaterfrontFront(216,{normal:n,d:234}));assert.ok(!isWaterfrontFront(216,{normal:n,d:190}));assert.ok(!isWaterfrontFront(23,{normal:n,d:233,s0:205,s1:235}),'palace main front is set back, not placed over street wings');
});
test('multi-material municipal parts add a hero frontage only once',()=>{
 const array=new Float32Array([0,0,0,0,0,1,0,0,1,0,0,1,0,0,1]),part={ratu:216,start:0,count:3,bbox:[0,156,74,235],height:19};
 const first=createModelledBuilding(array,part,null,null,true),second=createModelledBuilding(array,part,null,null,false);
 assert.ok(first.meshes.length>second.meshes.length+3);
});

}
