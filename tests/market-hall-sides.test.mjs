import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {readFileSync,existsSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {analyseBuilding} from '../src/building-detail.js';
import {isWaterfrontFront} from '../src/kauppatori-buildings.js';
import {createMarketHallSides,isMarketHallSide,MARKET_HALL_SIDE_PLANES} from '../src/market-hall-sides.js';
test('only four measured west side records replaced, existing hero ends remain disjoint', {skip:'Finland city is not part of this build'},()=>{
 const idx=JSON.parse(readFileSync('public/data/buildings3d-index.json'));let selected=0,retained=0;
 for(const t of idx.tiles)for(const p of t.parts.filter(p=>p.ratu===410)){
  const b=gunzipSync(readFileSync('public/data/'+t.file)),a=new Float32Array(b.buffer,b.byteOffset,b.byteLength/4);
  for(const f of analyseBuilding(a,p,null).faces){if(isMarketHallSide(410,f)){selected++;assert.equal(isWaterfrontFront(410,f),false);assert.ok(f.normal.x<-.99);}else retained++;assert.equal(isMarketHallSide(488,f),false);}
 }
 assert.equal(selected,4);assert.ok(retained>=20);
});
test('clerestory gap and narrow high return preserve measured silhouette',()=>{
 const p=MARKET_HALL_SIDE_PLANES,upper=p[3];assert.equal(upper.profiles.length,2);assert.ok(upper.runs[1][0]-upper.runs[0][1]>12);
 assert.ok(upper.d<p[0].d-4.7);const south=p[1].profiles[0];assert.ok(south.filter(v=>v[1]>6).every(v=>v[0]<446.6));
});
test('world geometry is finite, untextured, bounded and batched',()=>{
 const ms=createMarketHallSides();assert.equal(ms.length,8);let tri=0;
 for(const mesh of ms){const p=mesh.geometry.attributes.position;tri+=p.count/3;assert.equal(mesh.parent,null);assert.equal(mesh.material.map,null);assert.ok([...p.array].every(Number.isFinite));
  const b=mesh.geometry.boundingBox;assert.ok(b.min.x>20&&b.max.x<33);assert.ok(b.min.z>396&&b.max.z<484);assert.ok(b.min.y>=.1&&b.max.y<13);
 }
 assert.ok(tri<30000,tri);
});
test('lower and clerestory glass are not hidden by solid backing',()=>{
 const ms=createMarketHallSides();ms.forEach(m=>m.updateMatrixWorld(true));
 for(const [p,y] of [[MARKET_HALL_SIDE_PLANES[0],4.05],[MARKET_HALL_SIDE_PLANES[3],7.9]]){
  const s=p.runs[0][0]+.52,d=p.d+5;
  const hits=new THREE.Raycaster(new THREE.Vector3(p.nz*s+p.nx*d,y,-p.nx*s+p.nz*d),new THREE.Vector3(-p.nx,0,-p.nz)).intersectObjects(ms);
  assert.ok(hits.length);assert.equal(hits[0].object.material.color.getHexString(),'627b78');
 }
});
