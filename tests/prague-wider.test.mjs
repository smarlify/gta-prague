import test from 'node:test';
import assert from 'node:assert/strict';
import {waterGain} from '../src/audio-math.js';
import {nearestWaterDistance} from '../src/water-proximity.js';
import {onPavlovaRun,stepPavlova} from '../src/pavlova.js';
import {planWaterfowl} from '../src/waterfowl.js';
import {policeLiveryFor,policeAgencyFor,SKODA_PAINT} from '../src/czech-fleet.js';
import {uniformLabelLines} from '../src/person-model.js';
import {passageDeck,liftedBridgeHeight} from '../src/passage.js';
import {groundAt,setCorridorHeights,setTerrain} from '../src/terrain.js';
import {PoliceSimulation,TRAFFIC_HEAT_CAP,wantedLevel,incidentHeat,HEAT_LEVELS} from '../src/police.js';
import {prepareGraph} from '../src/mobility.js';
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

test('the museum-to-Pavlova run faces south and ambulances drive into Filip only',()=>{
 assert.equal(onPavlovaRun(670,1100,Math.PI),true);
 assert.equal(onPavlovaRun(670,1100,0),false);
 assert.equal(onPavlovaRun(20,20,Math.PI),false);
 const quiet=stepPavlova({phase:'idle'},{x:670,z:1200,heading:Math.PI,speed:8,mode:'car'},.5);
 assert.equal(quiet.phase,'idle');
 assert.equal(quiet.driver,false);
 const filip={x:670,z:1200,heading:Math.PI,speed:8,mode:'car',ram:true};
 const cut=stepPavlova({phase:'idle'},filip,.5);
 assert.equal(cut.phase,'cut');
 assert.equal(cut.driver,false);
 assert.equal(cut.units.length,2);
 const done=stepPavlova({phase:'cut',units:cut.units,x:cut.x,z:cut.z,heading:cut.heading},filip,2);
 assert.equal(done.phase,'done');
 assert.ok(done.units.some(unit=>Math.hypot(unit.x-filip.x,unit.z-filip.z)<2.2));
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
