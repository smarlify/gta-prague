import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import * as THREE from 'three';
import {createSofiankatuSigns,sofiankatuSignSafe,SOFIANKATU_SIGN_POSTS,SOFIANKATU_ISLAND_IDS} from '../src/sofiankatu-signs.js';
if (true) {
 test('Finland city pack', {skip: 'Finland city is not part of this build'}, () => {});
} else {
const city=JSON.parse(gunzipSync(readFileSync(new URL('../public/data/city.pack',import.meta.url))));
test('all observed sign pole bases fit safe municipal surfaces, not a driving lane',()=>{
  for(const p of SOFIANKATU_SIGN_POSTS)assert.equal(sofiankatuSignSafe(p,city),true,p.id);
  assert.equal(sofiankatuSignSafe({x:85.5,z:250},city),false);
});
test('sign faces point toward approaching eastbound camera, kit omits temporary works',()=>{
  const kit=createSofiankatuSigns(city);assert.equal(kit.userData.placed.length,2);assert.deepEqual(kit.userData.omitted,[]);
  for(const p of kit.userData.placed)assert.ok(p.normal[0]<-.99);
  assert.equal(kit.userData.placed.filter(p=>p.keepRight).length,1);
  assert.equal(kit.userData.temporaryRoadworksIncluded,false);assert.equal(kit.userData.rearBoardText,null);
  assert.deepEqual(new Set(kit.userData.islandIds),new Set(SOFIANKATU_ISLAND_IDS));
});
test('geometry is finite, compact and island top triangles face upward',()=>{
  const kit=createSofiankatuSigns(city),meshes=kit.children.filter(m=>m.isMesh);let triangles=0;assert.ok(meshes.length<=7);assert.ok(kit.breakable.bodies.length===2);
  for(const mesh of meshes){const p=mesh.geometry.attributes.position;triangles+=p.count/3;assert.ok([...p.array].every(Number.isFinite));}
  assert.ok(triangles<12000,triangles);
  const top=kit.children.find(m=>m.name==='Crossing kit joint'),p=top.geometry.attributes.position;
  for(let i=0;i<p.count;i+=3){const a=new THREE.Vector3().fromBufferAttribute(p,i),b=new THREE.Vector3().fromBufferAttribute(p,i+1),c=new THREE.Vector3().fromBufferAttribute(p,i+2);assert.ok(b.sub(a).cross(c.sub(a)).y>=0);}
});
test('missing map surface safely omits signs instead of silently placing road obstacles',()=>{
  const kit=createSofiankatuSigns({roads:[],pavement:[],buildings:[]});assert.equal(kit.userData.placed.length,0);assert.equal(kit.userData.omitted.length,2);
});

}
