import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {SpatialIndex,segmentDistance} from '../src/geo.js';
import {prepareGraph,routePoint} from '../src/mobility.js';
import {correctHarbourLanes,vehicleFitsRoad,safeVehicleSegment,olympiaTramOnlySurfaces} from '../src/road-safety.js';
import {createTerminalDetails,TERMINAL_POSTS} from '../src/terminal-details.js';
if (!existsSync('public/data')) {
 test('local city pack', {skip: 'local Helsinki or Tampere fixture is not in this checkout'}, () => {});
} else {
const city=JSON.parse(gunzipSync(readFileSync('public/data/city.pack')));
const data=JSON.parse(readFileSync('public/data/mobility.json'));
const graph=prepareGraph(correctHarbourLanes(data).roads);
const world={roads:new SpatialIndex(city.roads.filter(r=>r.kind!=='Koroke')),buildings:new SpatialIndex(city.buildings),trafficForbidden:new SpatialIndex([...city.pavement,...city.roads.filter(r=>r.kind==='Koroke')])};
test('one-way roundabout paths fit the municipal carriageway through every arc and join',()=>{
 for(const edge of graph.edges.filter(e=>e.roundabout)){
  for(let s=0;s<edge.length;s+=.5)assert.ok(vehicleFitsRoad(routePoint(edge,s),world),`${edge.from}:${edge.to} at ${s}`);
  const next=graph.outgoing[edge.to].find(e=>e.roundabout);
  assert.ok(safeVehicleSegment(routePoint(edge,edge.length),routePoint(next,.1),world),`join ${edge.to}`);
 }
});
test('cars enter and exit outside the Olympia tram reservation, including full body turns',()=>{
 const detail=createTerminalDetails(city);
 const local={...world,buildings:new SpatialIndex([...city.buildings,...detail.obstacles]),trafficForbidden:new SpatialIndex([...city.pavement,...city.roads.filter(p=>p.kind==='Koroke'),...olympiaTramOnlySurfaces(city)])};
 const approaches=graph.edges.filter(e=>e.olympiaApproach);assert.equal(approaches.length,2);
 assert.ok(!graph.edges.some(e=>(e.from===146&&e.to===145)||(e.from===145&&e.to===146)));
 for(const e of approaches){let last=routePoint(e,0);assert.ok(vehicleFitsRoad(last,local));
  for(let s=.2;s<e.length;s+=.2){const p=routePoint(e,s);assert.ok(safeVehicleSegment(last,p,local),`${e.from}:${e.to} at ${s}`);last=p;}
  for(const next of graph.outgoing[e.to].filter(n=>n.to!==e.from))assert.ok(safeVehicleSegment(routePoint(e,e.length),routePoint(next,.1),local));
 }
});
test('the whole Olympia destination board stays over its island and outside the tram envelope',()=>{
 const p=TERMINAL_POSTS.find(p=>p.kind==='destination'),details=createTerminalDetails(city);
 assert.ok(details.group.userData.signs.some(s=>s.kind==='destination'));
 const roads=new SpatialIndex(city.roads.filter(p=>p.kind!=='Koroke')),paths=JSON.parse(readFileSync('public/data/trams.json')).paths;
 for(let a=-1.5;a<=1.65;a+=.05)for(const b of [-.15,.15]){
  const x=p.x+a*Math.cos(p.yaw)+b*Math.sin(p.yaw),z=p.z-a*Math.sin(p.yaw)+b*Math.cos(p.yaw);
  assert.ok(!roads.at(x,z),'board may not hang over a carriageway or tram reservation');
  for(const path of paths)for(let i=1;i<path.points.length;i++)assert.ok(segmentDistance(x,z,path.points[i-1],path.points[i])>1.8,'full tram body plus margin clears sign');
 }
});

}
