import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import * as THREE from 'three';
import {analyseBuilding} from '../src/building-detail.js';
import {pointInPolygon} from '../src/geo.js';
import {isLasipalatsiFront,createLasipalatsiFront,LASIPALATSI_STREET_PROFILE,LASIPALATSI_PLANES} from '../src/lasipalatsi-building.js';

test('Lasipalatsi replacement selects measured street planes, not roof/courtyard shells', {skip:!existsSync('public/data')},()=>{
 const index=JSON.parse(readFileSync('public/data/buildings3d-index.json'));
 let selected=0,retained=0;
 for(const t of index.tiles)for(const p of t.parts.filter(p=>p.ratu===944)){
  const bytes=gunzipSync(readFileSync('public/data/'+t.file)),array=new Float32Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/4);
  for(const f of analyseBuilding(array,p,null).faces){
   if(isLasipalatsiFront(944,f)){selected++;assert.ok(f.normal.x>.79);assert.ok(Math.abs(f.d+657)<.1||Math.abs(f.d+671.1)<.1);}
   else retained++;
   assert.equal(isLasipalatsiFront(943,f),false);
  }
 }
 assert.equal(selected,3);assert.ok(retained>25);
});
test('measured roof steps and open terrace are not filled with a bounding rectangle',()=>{
 const shape=[LASIPALATSI_STREET_PROFILE];
 assert.equal(pointInPolygon(482,8.5,shape),false);
 assert.equal(pointInPolygon(490,11,shape),true);
 assert.equal(pointInPolygon(510,11,shape),false);
 assert.equal(pointInPolygon(585,8,shape),false);
 assert.equal(pointInPolygon(585,3,shape),true);
 assert.ok(LASIPALATSI_PLANES.street.d-LASIPALATSI_PLANES.cinema.d>14);
});
test('physical façade batches are finite, opaque, texture-independent and small',()=>{
 const meshes=createLasipalatsiFront();assert.ok(meshes.length<=16);
 let count=0;
 for(const m of meshes){
  assert.equal(m.material.map,null);assert.equal(m.material.transparent,false);
  const p=m.geometry.attributes.position;count+=p.count;
  for(let i=0;i<p.count;i++)assert.ok(Number.isFinite(p.getX(i))&&Number.isFinite(p.getY(i))&&Number.isFinite(p.getZ(i)));
  assert.ok(m.geometry.boundingBox.min.x>-930&&m.geometry.boundingBox.max.x<-800);
 }
 assert.ok(count<30000);
});
test('shopfront glass is visible in front of the yellow backing, not hidden inside it',()=>{
 const meshes=createLasipalatsiFront();meshes.forEach(m=>m.updateMatrixWorld(true));
 const p=LASIPALATSI_PLANES.street,s=496.26;
 const ray=new THREE.Raycaster(new THREE.Vector3(p.nz*s+p.nx*(p.d+5),2.20,-p.nx*s+p.nz*(p.d+5)),new THREE.Vector3(-p.nx,0,-p.nz));
 const hits=ray.intersectObjects(meshes);assert.ok(hits.length);
 assert.equal(hits[0].object.material.color.getHexString(),'34484b');
});
