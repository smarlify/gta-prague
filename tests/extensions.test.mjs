import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {SpatialIndex,insidePlayable,registerPlayableArea,clearPlayableAreas,registerWaterClip,clipLinesFor,onClipLine,WORLD_EXTENT,RADIUS} from '../src/geo.js';
import {makeCar,driveStep} from '../src/physics.js';
import {mergeGraph,applyExtensions} from '../src/extensions.js';

const square=(x,z,s)=>[[[[x,z],[x+s,z],[x+s,z+s],[x,z+s],[x,z]]]];
test('playable areas extend the circle without opening the rest of the map',()=>{
 clearPlayableAreas();
 assert.ok(!insidePlayable(-3000,0));
 registerPlayableArea(square(-3100,-100,200));
 assert.ok(insidePlayable(-3000,0)&&insidePlayable(-3000,0,50)&&!insidePlayable(-3000,0,150));
 assert.ok(insidePlayable(0,RADIUS-5)&&!insidePlayable(0,RADIUS+50));
 clearPlayableAreas();
});
test('extension graphs join the main graph at shared seam nodes',()=>{
 const base={nodes:[[0,0],[2390,10]],edges:[{from:0,to:1,signal:3}]};
 const extra={nodes:[[2390.4,10.2],[2600,10]],edges:[{from:0,to:1,signal:0},{from:1,to:0,signal:-1}]};
 const remap=mergeGraph(base,extra,5);
 assert.deepEqual(remap,[1,2]);assert.equal(base.nodes.length,3);
 assert.deepEqual(base.edges.slice(1).map(e=>[e.from,e.to,e.signal]),[[1,2,5],[2,1,-1]]);
});
test('water clipped at an extension box is a data edge, not a shoreline',()=>{
 registerWaterClip([-5500,-3600,WORLD_EXTENT,WORLD_EXTENT]);
 const lines=clipLinesFor(WORLD_EXTENT);
 assert.ok(onClipLine([-5500,0],[-5500,100],lines)&&onClipLine([-2400,5],[-2400,50],lines));
 assert.ok(!onClipLine([-3000,5],[-2990,50],lines));
});

const INDEX='public/data/extensions/index.json';
test('Seurasaari: the wooden bridge deck carries a car to the island',{skip:'Finland city is not part of this build'},async()=>{
 clearPlayableAreas();
 const unpack=f=>JSON.parse(gunzipSync(readFileSync(f))),index=JSON.parse(readFileSync(INDEX)),e=index.extensions.find(x=>x.id==='seurasaari');
 const data=unpack('public/data/city.pack'),ext={...e,city:unpack(`public/data/${e.dir}/city.pack`),buildings:{tiles:[],buildings:0},surfaces:[],mobility:{signals:[],roads:{nodes:[],edges:[]},walks:{nodes:[],edges:[]}}};
 applyExtensions([ext],{data,roofIndex:{tiles:[],buildings:0},surfaceIndex:[],mobility:{signals:[],roads:{nodes:[],edges:[]},walks:{nodes:[],edges:[]}}});
 const world={buildings:new SpatialIndex(data.buildings),roads:new SpatialIndex(data.roads.filter(r=>!/Koroke/.test(r.kind))),pavement:new SpatialIndex(data.pavement),water:data.water};
 const deck=data.pavement.filter(p=>/Seurasaaren silta|Pukkisaari/.test(p.name)&&/Silta/.test(p.kind));
 assert.ok(deck.length>=3&&deck.every(p=>p.material==='Puu'),'municipal wooden bridge polygons');
 // Follow the deck centre line from the mainland end to the island end.
 const path=[[-3746,-2030],[-3746.5,-2005],[-3746.5,-1968],[-3747.5,-1912],[-3747.5,-1828]];
 const car=makeCar(...path[0],Math.PI);let target=1;
 for(let i=0;i<2000&&target<path.length;i++){
  const [tx,tz]=path[target];if(Math.hypot(tx-car.x,tz-car.z)<3){target++;continue;}
  car.heading=Math.atan2(-(tx-car.x),-(tz-car.z));car.speed=6;car.steer=0;
  const {collision}=driveStep(car,new Set(),1/30,world);
  assert.equal(collision,null,`blocked at ${car.x.toFixed(1)},${car.z.toFixed(1)}`);
 }
 assert.ok(car.z>-1835,`reached the island end (${car.z.toFixed(1)})`);
 assert.ok(Math.hypot(car.x,car.z)>RADIUS,'beyond the original 2 km circle');
 clearPlayableAreas();
});
