import test from 'node:test';
import assert from 'node:assert/strict';
import {createKauppatoriFingerpost,KAUPPATORI_CYCLE_DESTINATIONS as signs,KAUPPATORI_FINGERPOST_REFERENCE as source} from '../src/kauppatori-fingerpost.js';
test('Kauppatori bicycle fingers retain observed destinations, distances and four directions', {skip:'Finland city is not part of this build'},()=>{
  assert.equal(signs.length,9);assert.equal(new Set(signs.map(s=>s.direction)).size,4);
  assert.deepEqual(signs.slice(0,3).map(s=>s.distance),['0,4','0,8','1']);
  const zoo=signs.find(s=>s.fi==='Korkeasaari');assert.equal(zoo.suffix,'Zoo');assert.equal(zoo.distance,undefined);
  assert.equal(signs.find(s=>s.fi==='Katajanokan terminaali').sv,'Skatuddens terminal');
  assert.equal(source.capture,'2024-08');assert.equal(source.corroboratingCapture,'2022-09');
});
test('physical fingerpost is two batches with finite geometry and bounded atlas coordinates', {skip:'Finland city is not part of this build'},()=>{
  const root=createKauppatoriFingerpost({canvasFactory:()=>null});assert.equal(root.children.filter(o=>o.isMesh).length,2);assert.equal(root.breakable.bodies.length,1);assert.equal(root.userData.collision,'breakable');assert.equal(root.worldObjects[0].collisionMode,'breakable');
  root.traverse(o=>{if(o.isMesh){assert.ok(Array.from(o.geometry.attributes.position.array).every(Number.isFinite));const uv=o.geometry.attributes.uv;assert.ok(Array.from(uv.array).every(v=>v>=0&&v<=1));o.geometry.dispose();o.material.dispose();}});
});
