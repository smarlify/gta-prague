import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import * as THREE from 'three';
import {Mobility,prepareGraph,routePoint} from '../src/mobility.js';
import {correctHarbourLanes} from '../src/road-safety.js';
import {createVehicle,VEHICLE_TYPES,animateVehicle} from '../src/vehicles.js';
import {BIND_BILLBOARDS} from '../src/bind-ads.js';
test('both directions keep right on north/south and east/west streets',()=>{
 for(const [x,z]of[[0,-50],[0,50],[-50,0],[50,0]]){
  const graph=prepareGraph({nodes:[[0,0],[x,z]],edges:[{from:0,to:1,points:[[0,0],[x,z]],lane:1.45},{from:1,to:0,points:[[x,z],[0,0]],lane:1.45}]});
  for(const e of graph.edges){const p=routePoint(e,25),c=routePoint(e,25,0);assert.ok((p.x-c.x)*Math.cos(p.heading)-(p.z-c.z)*Math.sin(p.heading)>1.4);}
 }
});
test('a blocked right lane cannot fall back to the middle of a two-way road',()=>{
 const graph={nodes:[[0,0],[0,-50]],edges:[{from:0,to:1,points:[[0,0],[0,-50]],lane:1.45}]};
 const sim=new Mobility({roads:graph,walks:{nodes:[],edges:[]},signals:[]},{roads:{at:x=>Math.abs(x)<1},buildings:{at:()=>false}},{cars:0,people:0});
 assert.equal(sim.position({edge:sim.roads.edges[0],s:20,walking:false}).x,1.45);
});
test('Olympia separate carriageways only route north on east, south on west', {skip:'Finland city is not part of this build'},()=>{
 const original=JSON.parse(readFileSync('public/data/mobility.json')),corrected=correctHarbourLanes(original),ids=new Set(corrected.roads.edges.map(e=>`${e.from}:${e.to}`));
 for(const id of ['1057:1058','1058:1056','1056:1055','1055:785'])assert.ok(!ids.has(id));
 for(const id of ['1058:1057','1056:1058','1055:1056','785:1055']){assert.ok(ids.has(id));assert.equal(corrected.roads.edges.find(e=>`${e.from}:${e.to}`===id).lane,0);}
 assert.equal(original.roads.edges.length,corrected.roads.edges.length+13);
});
test('player crossover proportions, steering and wheels differ from traffic body styles',()=>{
 const player=createVehicle(0,true);assert.equal(player.userData.type,'crossover');assert.equal(player.userData.spec.l,4.172);assert.equal(player.userData.spec.wb,2.56);
 animateVehicle(player,-3,.5,.5);assert.ok(player.userData.wheels[0].spin.rotation.x>0);assert.ok(player.userData.wheels[0].pivot.rotation.y>0);
 const sizes=VEHICLE_TYPES.map(type=>{const m=createVehicle(2,false,type),b=new THREE.Box3().setFromObject(m),s=b.getSize(new THREE.Vector3());assert.ok(s.x<2.2&&s.z<4.7);m.traverse(o=>{if(o.isMesh)assert.ok(o.geometry.attributes.position.array.every(Number.isFinite));});return s.toArray().map(n=>n.toFixed(2)).join(',');});assert.ok(new Set(sizes).size>=6);
});
test('terminal roundabout is a closed counter-clockwise ring with a connected southern entrance', {skip:'Finland city is not part of this build'},()=>{
 const original=JSON.parse(readFileSync('public/data/mobility.json')),graph=prepareGraph(correctHarbourLanes(original).roads),ring=graph.edges.filter(e=>e.roundabout);
 assert.equal(ring.length,11);
 for(const e of ring){
  assert.equal(e.signal,-1);assert.ok(e.separateCarriageway);
  assert.ok(!graph.outgoing[e.to].some(q=>q.to===e.from),'no reverse ring edge');
  assert.equal(graph.outgoing[e.to].filter(q=>q.roundabout).length,1,'continuous ring');
  for(let i=1;i<e.points.length;i++){
   const a=e.points[i-1],b=e.points[i],x=(a[0]+b[0])/2-236.25,z=(a[1]+b[1])/2-992.97;
   assert.ok(x*(b[1]-a[1])-z*(b[0]-a[0])<0,'island stays to left');
  }
 }
 assert.ok(graph.outgoing[145].some(e=>e.roundabout));assert.ok(graph.outgoing[146].some(e=>e.to===4404));
 assert.ok(!graph.outgoing[146].some(e=>e.to===145),'car entry must not use the central tram strip');
});
test('opening billboard is huge, Helsinki-themed and faces approaching traffic',()=>{
 const b=BIND_BILLBOARDS[0];assert.equal(b.brand,'helsinki');assert.ok(b.width>=24&&b.height>=10);assert.ok(Math.abs(b.yaw-.64)<.01);assert.ok(b.x<120);
});
