import test from 'node:test';
import assert from 'node:assert/strict';
import {waterGain} from '../src/audio-math.js';
import {nearestWaterDistance} from '../src/water-proximity.js';
import {PAVLOVA_RUN,placeWaitingAmbulances,resolveDriverStart,stepPavlova} from '../src/pavlova.js';
import {startCycleKey} from '../src/cities.js';
import {prepareGraph} from '../src/mobility.js';
import {annotateJunctions} from '../src/lane-model.js';
import {planWaterfowl} from '../src/waterfowl.js';
import {policeLiveryFor,policeAgencyFor,SKODA_PAINT} from '../src/czech-fleet.js';
import {uniformLabelLines} from '../src/person-model.js';
import {passageDeck,liftedBridgeHeight} from '../src/passage.js';
import {groundAt,setCorridorHeights,setTerrain} from '../src/terrain.js';
import {PoliceSimulation,TRAFFIC_HEAT_CAP,wantedLevel,incidentHeat,HEAT_LEVELS} from '../src/police.js';
test('a bridge does not drop into the river beside its deck',()=>{
 const ground=(x,z)=>Math.hypot(x,z)<6?-6:-1;
 assert.equal(liftedBridgeHeight(ground,0,0),-1);
 assert.equal(liftedBridgeHeight(()=>3,0,0),3);
});

test('a passage deck stays on the line between its portals',()=>{
 const roads={at:()=>({passage:'yes',deck:[[0,0,10],[0,100,20]]})};
 assert.equal(passageDeck(roads,0,50),15);
 assert.equal(passageDeck({at:()=>null},0,0),null);
});

test('river audio is loud in the water and silent far away',()=>{
 assert.equal(waterGain(0),1);
 assert.ok(waterGain(35)>waterGain(60));
 assert.equal(waterGain(70),0);
 assert.equal(waterGain(400),0);
 assert.equal(waterGain(Infinity),0);
});

test('water distance is zero inside a polygon and positive beside it',()=>{
 const water=[{bbox:[0,0,100,40],rings:[[[0,0],[100,0],[100,40],[0,40],[0,0]]]}];
 assert.equal(nearestWaterDistance(20,10,water),0);
 assert.ok(nearestWaterDistance(20,50,water)>0);
 assert.ok(nearestWaterDistance(20,50,water)<20);
 assert.ok(nearestWaterDistance(500,500,water)>500);
});

test('Prague police and traffic colours',()=>{
 assert.equal(policeLiveryFor('prague'),'praha');
 assert.equal(policeLiveryFor('helsinki'),'fi');
 assert.ok(SKODA_PAINT.includes('#f4f5f2'));
 assert.ok(SKODA_PAINT.includes('#1c1e21'));
 assert.equal(policeAgencyFor('prague',1).word,'MĚSTSKÁ POLICIE');
 assert.equal(policeAgencyFor('prague',1).livery,'praha-mestska');
 assert.equal(policeAgencyFor('prague',1).uniform,'Městská POLICIE hl. m. Prahy');
 assert.equal(policeAgencyFor('prague',2).livery,'praha-mestska');
 assert.equal(policeAgencyFor('prague',3).word,'POLICIE');
 assert.equal(policeAgencyFor('prague',3).livery,'praha');
 assert.equal(policeAgencyFor('prague',5).livery,'praha');
 assert.equal(policeAgencyFor('helsinki',5).word,'POLIISI');
});

test('traffic heat stays municipal; only pedestrian kills bring state Policie',()=>{
 assert.equal(TRAFFIC_HEAT_CAP,HEAT_LEVELS[3]-1);
 assert.equal(wantedLevel(TRAFFIC_HEAT_CAP),2);
 assert.equal(wantedLevel(HEAT_LEVELS[3]),3);
 assert.equal(incidentHeat('vehicle',9),3);
 assert.equal(incidentHeat('pedestrian',6),4);
 const graph=prepareGraph({nodes:[[0,0],[0,-50]],edges:[{from:0,to:1,lane:0,points:[[0,0],[0,-50]]}]});
 const world={roads:{at:()=>true},buildings:{at:()=>false}};
 const traffic=new PoliceSimulation(graph,world);
 for(let i=0;i<8;i++){traffic.time=i*2;traffic.report('vehicle',i,12);}
 assert.equal(traffic.level,2);
 assert.equal(policeAgencyFor('prague',traffic.level).livery,'praha-mestska');
 const kills=new PoliceSimulation(graph,world);
 for(let i=0;i<3;i++){kills.time=i*2;kills.report('pedestrian',i);}
 assert.ok(kills.level>=3);
 assert.equal(policeAgencyFor('prague',kills.level).livery,'praha');
});

test('municipal uniform titles split into string lines, not nested arrays',()=>{
 const lines=uniformLabelLines(policeAgencyFor('prague',1).uniform);
 assert.deepEqual(lines,['Městská POLICIE','hl. m. Prahy']);
 assert.equal(typeof lines[0],'string');
 assert.equal(lines[0].split(/\s+/)[0],'Městská');
 assert.deepEqual(uniformLabelLines('POLIISI'),['POLIISI']);
 assert.deepEqual(uniformLabelLines('POLICIE'),['POLICIE']);
});

function memoryStorage(){
 const data=new Map();
 return {getItem(key){return data.has(key)?data.get(key):null;},setItem(key,value){data.set(key,String(value));}};
}
function crossRoads(places){
 const nodes=[],edges=[];
 for(const {x,z} of places){
  const c=nodes.length;
  nodes.push([x,z],[x,z-30],[x+30,z],[x,z+30],[x-30,z]);
  const link=(from,to,a,b)=>edges.push({from,to,lane:1.5,points:[a,b],signal:-1});
  link(c+1,c,[x,z-30],[x,z]);
  link(c,c+1,[x,z],[x,z-30]);
  link(c+2,c,[x+30,z],[x,z]);
  link(c,c+2,[x,z],[x+30,z]);
  link(c+3,c,[x,z+30],[x,z]);
  link(c,c+3,[x,z],[x,z+30]);
  link(c+4,c,[x-30,z],[x,z]);
  link(c,c+4,[x,z],[x-30,z]);
 }
 const graph=prepareGraph({nodes,edges});
 annotateJunctions(graph,[]);
 return graph;
}
const starts=[
 {name:'Petřín',x:1,z:2,heading:-1.57},
 {name:'Národní muzeum',x:668.95,z:856.6,heading:2.4308},
 {name:'Anděl',x:9,z:8,heading:.4},
];

test('Pavlova junctions inside the disk each get one waiting ambulance',()=>{
 const center={x:0,z:0};
 const graph=crossRoads([{x:0,z:0},{x:10,z:0},{x:80,z:0},{x:200,z:0}]);
 const spots=placeWaitingAmbulances(graph,center);
 assert.equal(spots.length,2,'nodes 10 m apart share one ambulance; the far crossroad is outside the disk');
 assert.ok(spots.every(spot=>Math.hypot(spot.junction.x-center.x,spot.junction.z-center.z)<=150));
 assert.ok(spots.every(spot=>Math.hypot(spot.junction.x-200,spot.junction.z)>1));
 assert.ok(Math.hypot(spots[0].junction.x-5,spots[0].junction.z)<1,'the close pair clusters on its centroid');
 assert.ok(Math.hypot(spots[1].junction.x-80,spots[1].junction.z)<1);
});

test('a Pavlova ambulance waits on the side street, short of the stop line',()=>{
 const {ax,az,bx,bz}=PAVLOVA_RUN;
 const t=.82,x=ax+(bx-ax)*t,z=az+(bz-az)*t;
 const spots=placeWaitingAmbulances(crossRoads([{x,z}]),{x,z});
 assert.equal(spots.length,1);
 const spot=spots[0];
 assert.ok(Math.abs(spot.z-z)<3,'parked across the museum road');
 assert.ok(Math.abs(spot.x-x)>4,'not in the southbound lane');
 assert.ok(Math.hypot(spot.x-x,spot.z-z)>6,'short of the crossing');
});

test('only Filip in a car pulls one ambulance, and it returns to its wait',()=>{
 const spots=placeWaitingAmbulances(crossRoads([{x:0,z:0},{x:80,z:0}]),{x:0,z:0});
 const elon=stepPavlova({spots},{x:80,z:0,heading:0,speed:8,mode:'car'},.5);
 assert.equal(elon.units.length,0);
 assert.equal(elon.driver,false);
 const foot=stepPavlova({spots},{x:80,z:0,heading:0,speed:0,mode:'walk',ram:true},.5);
 assert.equal(foot.units.length,0);
 const player={x:spots[1].junction.x,z:spots[1].junction.z,heading:0,speed:8,mode:'car',ram:true};
 const nudge=stepPavlova({spots},player,.4);
 assert.equal(nudge.units[1].phase,'pull');
 assert.ok(Math.hypot(nudge.units[1].x-spots[1].x,nudge.units[1].z-spots[1].z)>1);
 assert.equal(nudge.units[0].phase,'wait');
 assert.ok(Math.hypot(nudge.units[0].x-spots[0].x,nudge.units[0].z-spots[0].z)<.01);
 let state=stepPavlova({spots},player,2);
 assert.equal(state.units[1].phase,'return');
 assert.ok(Math.hypot(state.units[1].x-player.x,state.units[1].z-player.z)<2.2);
 assert.equal(state.units[0].phase,'wait');
 state=stepPavlova(state,player,2);
 assert.equal(state.units[1].phase,'wait');
 assert.ok(Math.hypot(state.units[1].x-spots[1].x,state.units[1].z-spots[1].z)<1.2);
 state=stepPavlova(state,player,.2);
 assert.equal(state.units[1].phase,'wait','it stays parked while he is still in the crossing');
 state=stepPavlova(state,{...player,z:player.z+40},.2);
 assert.equal(state.units[1].phase,'wait');
 state=stepPavlova(state,player,.3);
 assert.equal(state.units[1].phase,'pull');
 assert.equal(state.units[0].phase,'wait');
});

test('Filip with no start opens at the museum facing south; a start URL still wins',()=>{
 const filip={pavlova:true},elon={pavlova:false};
 const storage=memoryStorage();
 const opened=resolveDriverStart(starts,null,storage,'prague',filip,null);
 assert.equal(opened.start.name,'Národní muzeum');
 assert.equal(opened.start.heading,Math.PI);
 assert.equal(opened.pinned,false);
 assert.equal(opened.unpinned,null);
 assert.equal(storage.getItem(startCycleKey('prague')),null,'Filip does not take a cycle step');
 assert.equal(starts[1].heading,2.4308,'the catalog heading stays on the landmark');
 const cycled=resolveDriverStart(starts,null,storage,'prague',elon,opened.unpinned);
 assert.equal(cycled.start.name,'Petřín');
 assert.equal(cycled.start.heading,-1.57);
 assert.equal(cycled.pinned,false);
 assert.equal(storage.getItem(startCycleKey('prague')),'0');
 const back=resolveDriverStart(starts,null,storage,'prague',filip,cycled.unpinned);
 assert.equal(back.start.name,'Národní muzeum');
 assert.equal(back.start.heading,Math.PI);
 assert.equal(back.unpinned,cycled.start);
 assert.equal(storage.getItem(startCycleKey('prague')),'0','switching to Filip leaves the cycle where it is');
 const restored=resolveDriverStart(starts,null,storage,'prague',elon,back.unpinned);
 assert.equal(restored.start,cycled.start);
 assert.equal(storage.getItem(startCycleKey('prague')),'0');
 const pinned=resolveDriverStart(starts,'Anděl',storage,'prague',filip,restored.unpinned);
 assert.equal(pinned.start.name,'Anděl');
 assert.equal(pinned.start.heading,.4);
 assert.equal(pinned.pinned,true);
 assert.equal(storage.getItem(startCycleKey('prague')),'0');
 const museum=resolveDriverStart(starts,'Národní muzeum',storage,'prague',filip,null);
 assert.equal(museum.start.name,'Národní muzeum');
 assert.equal(museum.start.heading,Math.PI);
 assert.equal(museum.pinned,true);
 const elonMuseum=resolveDriverStart(starts,'Národní muzeum',storage,'prague',elon,null);
 assert.equal(elonMuseum.start.heading,2.4308);
});

test('ducks and geese are placed inside water',()=>{
 const water=[{rings:[[[0,0],[200,0],[200,80],[0,80],[0,0]]]}];
 const birds=planWaterfowl(water,{seed:2,limit:6});
 assert.ok(birds.length>0);
 assert.ok(birds.every(b=>b.x>=0&&b.x<=200&&b.z>=0&&b.z<=80));
 assert.ok(birds.some(b=>b.kind==='duck'));
});

test('corridor heights apply outside the city grid',()=>{
 setTerrain(null);
 setCorridorHeights([{x:9000,z:1000,h:240}]);
 assert.equal(groundAt(9000,1000),240);
 assert.equal(groundAt(0,0),0);
});
