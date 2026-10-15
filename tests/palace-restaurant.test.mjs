import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {readFileSync,existsSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {analyseBuilding} from '../src/building-detail.js';
import {isPalaceRestaurantFront,createPalaceRestaurantFront,PALACE_RESTAURANT_PLANES} from '../src/palace-restaurant.js';
test('Palace restaurant only replaces its verified harbour planes, never Presidential Palace', {skip:!existsSync('public/data')},()=>{
 const idx=JSON.parse(readFileSync('public/data/buildings3d-index.json'));let selected=0,retained=0;
 for(const t of idx.tiles)for(const p of t.parts.filter(p=>p.ratu===488)){
  const buf=gunzipSync(readFileSync('public/data/'+t.file)),array=new Float32Array(buf.buffer,buf.byteOffset,buf.byteLength/4);
  for(const f of analyseBuilding(array,p,null).faces){
   if(isPalaceRestaurantFront(488,f)){selected++;assert.ok(f.normal.x>.997&&f.normal.z<0);}
   else retained++;
   assert.equal(isPalaceRestaurantFront(23,f),false);
  }
 }
 assert.equal(selected,8);assert.ok(retained>20);
});
test('upper hotel/restaurant bands retain their increasing setback and separate roof wings',()=>{
 const p=PALACE_RESTAURANT_PLANES;
 assert.ok(p[1].d<p[0].d-1.9);assert.ok(p[2].d<p[1].d-2);assert.ok(p[4].d<p[2].d-4);
 assert.ok(p[4].s1<p[5].s0-8,'no invented wall across the upper roof gap');
});
test('Palace model is bounded, finite, texture-free and batched',()=>{
 const meshes=createPalaceRestaurantFront();assert.equal(meshes.length,8);let triangles=0;
 for(const m of meshes){const p=m.geometry.attributes.position;triangles+=p.count/3;assert.equal(m.material.map,null);assert.equal(m.parent,null);
  for(let i=0;i<p.count;i++)assert.ok(Number.isFinite(p.getX(i))&&Number.isFinite(p.getY(i))&&Number.isFinite(p.getZ(i)));
  assert.ok(m.geometry.boundingBox.min.x>-44&&m.geometry.boundingBox.max.x<14);
  assert.ok(m.geometry.boundingBox.min.z>490&&m.geometry.boundingBox.max.z<583);
 }
 assert.ok(triangles<18000);
});
test('upper glass sits ahead of solid spandrel backing and lower floor has a real recess',()=>{
 const meshes=createPalaceRestaurantFront();meshes.forEach(m=>m.updateMatrixWorld(true));const p=PALACE_RESTAURANT_PLANES[0],s=-570.3;
 const hitAt=y=>new THREE.Raycaster(new THREE.Vector3(p.nz*s+p.nx*(p.d+5),y,-p.nx*s+p.nz*(p.d+5)),new THREE.Vector3(-p.nx,0,-p.nz)).intersectObjects(meshes);
 const glass=hitAt(8.69);assert.ok(glass.length);assert.equal(glass[0].object.material.color.getHexString(),'657e86');
 const gallery=hitAt(2.2);assert.ok(gallery.length);assert.ok(gallery[0].distance>7.5,'glazing is recessed behind column line');
});
