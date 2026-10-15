import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import * as THREE from 'three';
import {createEtelarantaGantry,ETELARANTA_GANTRY_REFERENCE as ref,ETELARANTA_GANTRY_POLE as pole} from '../src/etelaranta-gantry.js';
test('Eteläranta gantry matches observed arrows, route numbers and restriction, without invented destinations',()=>{
  assert.deepEqual(ref.left.routes,['1','3','51']);assert.deepEqual(ref.right.routes,['4','7','E75']);
  assert.equal(ref.left.arrow,'bent-up-left');assert.equal(ref.left.upperArrow,'bent-up-right');assert.equal(ref.left.restriction,'12 m');
  assert.deepEqual(ref.right.symbols,['truck','airplane','tent','cabin','caravan']);
  assert.equal(ref.capture,'2024-08');assert.equal(ref.cameraCoordinates,null);assert.match(ref.accuracy,/not surveyed/);
});
test('gantry has three batches, one-sided faces and more than5.2m clearance',()=>{
  const g=createEtelarantaGantry({canvasFactory:()=>null});g.updateMatrixWorld(true);assert.equal(g.children.length,3);
  const faces=g.children.find(m=>m.name.includes('route-shield'));assert.ok(new THREE.Box3().setFromObject(faces).min.y>=g.userData.clearance);
  assert.ok(new THREE.Vector3(0,0,1).applyQuaternion(g.quaternion).z>.99);
  g.traverse(o=>{if(o.isMesh){assert.ok(Array.from(o.geometry.attributes.position.array).every(Number.isFinite));assert.equal(o.material.side,THREE.FrontSide);o.geometry.dispose();o.material.dispose();}});
});
test('support pole footprint lies in mapped pavement, outside motor roads and hall building', {skip:'Finland city is not part of this build'},()=>{
  const data=JSON.parse(zlib.gunzipSync(fs.readFileSync(new URL('../public/data/city.pack',import.meta.url))));
  function contains(x,z,rings){const inside=ring=>{let yes=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;};return inside(rings[0])&&!rings.slice(1).some(inside);}
  for(const dx of [-pole.radius,pole.radius])for(const dz of [-pole.radius,pole.radius]){
    const x=pole.x+dx,z=pole.z+dz;assert.ok(data.pavement.some(r=>contains(x,z,r.rings)));assert.ok(!data.roads.some(r=>contains(x,z,r.rings)));assert.ok(!data.buildings.some(r=>contains(x,z,r.rings)));
  }
});
