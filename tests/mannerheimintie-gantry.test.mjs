import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import * as THREE from 'three';
import {SpatialIndex} from '../src/geo.js';
import {createMannerheimintieGantry,MANNERHEIMINTIE_GANTRY_REFERENCE as ref,MANNERHEIMINTIE_GANTRY_POLE as pole,MANNERHEIMINTIE_GANTRY_PLACEMENT as placement} from '../src/mannerheimintie-gantry.js';
test('Sokos gantry preserves exact bilingual wording and September2025 reference date',()=>{
  assert.deepEqual(ref.destinations,[{fi:'TURKU',sv:'ÅBO',route:'1'},{fi:'HANKO',sv:'HANGÖ',route:'51'}]);
  assert.deepEqual(ref.right.routes,['3','E12']);assert.equal(ref.right.upper.symbol,'railway-station');assert.equal(ref.capture,'2025-09');assert.equal(ref.cameraCoordinates,null);
});
test('gantry is three batches, faces south-east and leaves driveable clearance',()=>{
  const g=createMannerheimintieGantry({canvasFactory:()=>null});g.updateMatrixWorld(true);assert.equal(g.children.length,3);
  const face=g.children.find(m=>m.name.includes('destination'));assert.ok(new THREE.Box3().setFromObject(face).min.y>5.9);
  const normal=new THREE.Vector3(0,0,1).applyQuaternion(g.quaternion);assert.ok(normal.x>.5&&normal.z>.7);
  const endpoint=new THREE.Vector3(placement.span,0,0).applyMatrix4(g.matrixWorld);assert.ok(Math.hypot(endpoint.x+793.329,endpoint.z+57)<.02);
  g.traverse(o=>{if(o.isMesh){assert.ok(Array.from(o.geometry.attributes.position.array).every(Number.isFinite));o.geometry.dispose();o.material.dispose();}});
});
test('single support stays within tram-platform pavement, outside roads, buildings and cycleway', {skip:!fs.existsSync('public/data')},()=>{
  const city=JSON.parse(zlib.gunzipSync(fs.readFileSync(new URL('../public/data/city.pack',import.meta.url))));
  const walk=new SpatialIndex(city.pavement.filter(p=>p.kind==='Jalankulkualue')),blocked=new SpatialIndex([...city.roads,...city.buildings,...city.water,...city.pavement.filter(p=>/pyör|cycle/i.test(p.kind))]);
  for(const dx of [-pole.radius,pole.radius])for(const dz of [-pole.radius,pole.radius]){assert.ok(walk.at(pole.x+dx,pole.z+dz));assert.ok(!blocked.at(pole.x+dx,pole.z+dz));}
});
