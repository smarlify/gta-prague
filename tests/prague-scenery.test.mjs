import test from 'node:test';
import assert from 'node:assert/strict';
import {pragueSceneryTrees,kruhacTrees,cherryBlossomTrees,KRUHAC,PETRIN,LETNA} from '../src/prague-scenery.js';
import {speciesFamily} from '../src/place-data.js';
import {FAMILY,treeInstance} from '../src/tree-species.js';
import {blocksDriveSample} from '../src/physics.js';
import {SpatialIndex} from '../src/geo.js';
import {PlayerTravel,TRAVEL_MODES} from '../src/player-travel.js';
import {makeCar} from '../src/physics.js';

test('Kruháč trees sit in the Vítězné náměstí island',()=>{
 const trees=kruhacTrees();
 assert.ok(trees.length>=18);
 for(const t of trees){
  assert.ok(Math.hypot(t.p[0]-KRUHAC.x,t.p[1]-KRUHAC.z)<=KRUHAC.radius+1);
  assert.ok(['lime','maple'].includes(t.family));
 }
});

test('Petřín and Letná get pink cherry blossom clusters',()=>{
 assert.ok(FAMILY.cherry.leaf.toLowerCase().includes('e8')||FAMILY.cherry.leaf.startsWith('#'));
 assert.equal(speciesFamily('PRUNUS SERRULATA'),'cherry');
 assert.equal(treeInstance({p:[0,0],species:'PRUNUS SERRULATA',height:6}).family,'cherry');
 const trees=cherryBlossomTrees();
 assert.ok(trees.length>=40);
 const near=(c,r)=>trees.filter(t=>Math.hypot(t.p[0]-c.x,t.p[1]-c.z)<r);
 assert.ok(near(PETRIN,PETRIN.radius).length>=20);
 assert.ok(near(LETNA,LETNA.radius).length>=20);
 assert.ok(trees.every(t=>t.family==='cherry'));
 assert.ok(pragueSceneryTrees().length===kruhacTrees().length+cherryBlossomTrees().length);
});

test('building footprints on asphalt do not block driving; off-road buildings still do',()=>{
 const building={rings:[[[-2,-2],[2,-2],[2,2],[-2,2],[-2,-2]]],bbox:[-2,-2,2,2]};
 const road={rings:[[[-20,-4],[20,-4],[20,4],[-20,4],[-20,-4]]],bbox:[-20,-4,20,4]};
 const world={buildings:new SpatialIndex([building]),collisionBuildings:new SpatialIndex([building]),roads:new SpatialIndex([road]),pavement:new SpatialIndex([])};
 assert.equal(blocksDriveSample(0,0,world),false,'phantom building on the carriageway');
 assert.equal(blocksDriveSample(0,10,world),false,'empty');
 const wall={rings:[[[8,6],[12,6],[12,12],[8,12],[8,6]]],bbox:[8,6,12,12]};
 world.buildings=new SpatialIndex([wall]);world.collisionBuildings=world.buildings;
 assert.equal(blocksDriveSample(10,8,world),true,'real building off the asphalt');
});

test('driving into water sinks the car and starts swimming; shore returns to walking',()=>{
 assert.ok(TRAVEL_MODES.swim);
 const water={rings:[[[-5,-5],[5,-5],[5,5],[-5,5],[-5,-5]]],bbox:[-5,-5,5,5]};
 const road={rings:[[[6,-2],[20,-2],[20,2],[6,2],[6,-2]]],bbox:[6,-2,20,2]};
 const world={buildings:new SpatialIndex([]),roads:new SpatialIndex([road]),pavement:new SpatialIndex([]),water:[water]};
 const travel=new PlayerTravel(makeCar(0,0),world);
 const sink=travel.sinkInWater();
 assert.equal(sink.ok,true);assert.equal(travel.mode,'swim');assert.ok(travel.sunkCar?.sunk);
 travel.actor.x=10;travel.actor.z=0;
 travel.step(new Set(),.05);
 assert.equal(travel.mode,'walk','leaving the river stands the player up');
});
