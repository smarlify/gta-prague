import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {Matrix4,Vector3} from 'three';
import {stationPlacements,createStationStreetLife} from '../src/station-street-life.js';
import {SpatialIndex,pointInPolygon} from '../src/geo.js';
import {Mobility,inStationTrafficArea} from '../src/mobility.js';
import {vehicleFitsRoad,correctHarbourLanes,trafficFootprintsOverlap} from '../src/road-safety.js';
if (true) {
 test('Finland city pack', {skip: 'Finland city is not part of this build'}, () => {});
} else {
const city=JSON.parse(gunzipSync(readFileSync('public/data/city.pack'))),trams=JSON.parse(readFileSync('public/data/trams.json')),data=JSON.parse(readFileSync('public/data/mobility.json'));
const kit=createStationStreetLife(city,trams);
test('station kit tolerates startup before the player exists',()=>{
 kit.update(undefined);assert.equal(kit.group.visible,false);
 kit.update({x:-660,z:-60});assert.equal(kit.group.visible,true);
});
test('every parked taxi body stays upright and every wheel uses a horizontal axle',()=>{
 const fleet=kit.group.getObjectByName('Parked station taxi queue');
 for(const mesh of fleet.children)for(let i=0;i<mesh.count;i++){
  const matrix=new Matrix4();mesh.getMatrixAt(i,matrix);
  const up=new Vector3(0,1,0).transformDirection(matrix);assert.ok(up.y>.99999,`tilted instance ${i}`);
  if(mesh===fleet.children[2]){
   mesh.geometry.computeBoundingBox();const size=mesh.geometry.boundingBox.getSize(new Vector3());assert.ok(size.x<size.y,'wheel thickness runs along horizontal axle');
   assert.ok(Math.abs(matrix.elements[13]-.44)<.001);
  }
 }
});
test('both HSL station tram islands have three safe shelter bays without blocking track or pavement access',()=>{
 assert.equal(kit.plan.stops.length,2);const road=new SpatialIndex(city.roads);
 for(const stop of kit.plan.stops){assert.equal(stop.shelters.length,3);for(const s of stop.shelters)for(const [x,z]of s.ring){assert.ok(pointInPolygon(x,z,stop.platform.rings));assert.ok(!road.at(x,z));}}
});
test('dense taxi rank fits only the Asema-aukio apron, with separate car collisions',()=>{
 const road=new SpatialIndex(city.roads),pavement=new SpatialIndex(city.pavement);
 assert.equal(kit.plan.taxis.length,17);assert.ok(kit.plan.signs.length>=1);
 for(const t of kit.plan.taxis){for(const [x,z]of t.ring){assert.equal(road.at(x,z)?.name,'Asema-aukio');assert.ok(!pavement.at(x,z));}for(const other of kit.plan.taxis)if(t!==other)assert.ok(!trafficFootprintsOverlap(t,other));}
});
test('station kit is finite, batched and hidden beyond the local area',()=>{
 assert.equal(kit.group.userData.foodStands,6);assert.equal(kit.group.userData.metroEntrance,true);assert.ok(kit.group.userData.people>=40);
 kit.update({x:-620,z:-45});assert.equal(kit.group.visible,true);
 let calls=0,triangles=0;kit.group.traverse(m=>{if(!m.isMesh)return;calls++;const p=m.geometry.attributes.position;assert.ok(p.array.every(Number.isFinite));triangles+=(m.geometry.index?.count??p.count)/3*(m.isInstancedMesh?m.count:1);});
 assert.ok(calls<=30,`draw calls ${calls}`); // +1 instanced taxi roof-sign batch keeps signs attached to cars when they are taken.
 kit.update({x:200,z:1000});assert.equal(kit.group.visible,false);
});
test('station-only traffic slots stay dormant outside the area and follow safe local road lanes',()=>{
 const world={roads:new SpatialIndex(city.roads.filter(p=>p.kind!=='Koroke')),pavement:new SpatialIndex(city.pavement),buildings:new SpatialIndex([...city.buildings,...kit.obstacles]),trafficForbidden:new SpatialIndex([...city.pavement,...city.roads.filter(p=>p.kind==='Koroke')])};
 let seed=41;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
 const sim=new Mobility(correctHarbourLanes(data),world,{cars:0,people:0,stationCars:16,random}),away={x:200,z:1000,heading:0,speed:0};sim.reset(away);assert.equal(sim.cars.filter(c=>c.edge).length,0);
 const player={x:-540,z:-48,heading:Math.PI/2,speed:0};sim.reset(player);assert.ok(sim.cars.filter(c=>c.edge).length>=10);
 let moved=false;const positions=sim.cars.map(c=>[c.x,c.z]);
 for(let frame=0;frame<90;frame++){sim.step(1/30,player);for(const c of sim.cars.filter(c=>c.edge)){assert.ok(vehicleFitsRoad(c,world));assert.ok(c.speed<=50/3.6);if(Math.hypot(c.x-positions[c.id][0],c.z-positions[c.id][1])>3)moved=true;}}
 assert.ok(moved);sim.step(1/30,away);assert.ok(sim.cars.some(c=>c.edge),'leaving the area must not instantly delete visible traffic');
 for(let i=0;i<65;i++)sim.step(1/30,away);
 assert.equal(sim.cars.filter(c=>c.edge).length,0,'distant traffic can retire after remaining unseen');
});

test('a station taxi can be claimed with all body, wheel and roof-sign instances hidden, then restored',()=>{
 assert.equal(kit.enterableCars.length,kit.plan.taxis.length);
 const source=kit.enterableCars[0],fleet=kit.group.getObjectByName('Parked station taxi queue'),before=fleet.children.map(m=>Array.from(m.instanceMatrix.array));
 assert.equal(source.visual.type,'taxi');assert.ok(kit.obstacles.includes(source.obstacle));
 try{
  assert.equal(source.claim(),true);assert.equal(source.obstacle.disabled,true);
  for(const [i,mesh]of fleet.children.entries())for(let j=0;j<(i===2?4:1);j++){const matrix=new Matrix4();mesh.getMatrixAt(j,matrix);assert.equal(matrix.determinant(),0);}
  for(const [i,mesh]of fleet.children.entries()){const start=i===2?4:1;assert.deepEqual(Array.from(mesh.instanceMatrix.array.slice(start*16)),before[i].slice(start*16),'other taxis stay visible');}
 }finally{source.release();}
 for(const [i,mesh]of fleet.children.entries())assert.deepEqual(Array.from(mesh.instanceMatrix.array),before[i]);
 assert.equal(source.obstacle.disabled,false);
});

}
