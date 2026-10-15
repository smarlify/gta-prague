import test from 'node:test';
import assert from 'node:assert/strict';
import {SpatialIndex} from '../src/geo.js';
import {makeCar,driveStep,sampleStopsForWater} from '../src/physics.js';
import {setTerrain} from '../src/terrain.js';
import {
 bridgeDeckHeight,approachBlend,bridgeDriveHeight,isBridgeSurface,isApproachStreet,isFeaturedBridge,
 openRiverSample,parapetSamples,APPROACH_REACH,
} from '../src/passage.js';
import {createPragueBridgeDecks} from '../src/passage-deck.js';
import {charlesStatuePoints} from '../src/prague-scenery.js';

const rect=(x,z,w,h,extra)=>({rings:[[[x,z],[x+w,z],[x+w,z+h],[x,z+h],[x,z]]],bbox:[x,z,x+w,z+h],...extra});

test('dry-bank search lifts a channel sample and leaves a bank sample alone',()=>{
 const ground=(x,z)=>z>20?4:0;
 const dry=(x,z)=>z>18;
 const channel=(x,z)=>z<=18;
 const lifted=bridgeDeckHeight(ground,0,0,{dry,inChannel:channel});
 assert.equal(lifted,4,'the highest dry bank within 72 m');
 assert.equal(bridgeDeckHeight(ground,0,30,{dry:()=>true,inChannel:()=>false}),4,'already at bank height');
 const flat=(x,z)=>x*0+z*0-2;
 assert.equal(bridgeDeckHeight(flat,0,0,{dry:()=>false,inChannel:()=>true}),-1.65,'channel fallback is local plus 0.35');
 assert.equal(bridgeDeckHeight(flat,0,0,{dry:()=>false,inChannel:()=>false}),-2,'no lift outside the channel');
});

test('approaches blend onto the bridge over 40 m and stop there',()=>{
 assert.equal(approachBlend(1,5,0),5);
 assert.equal(approachBlend(1,5,APPROACH_REACH),1);
 assert.ok(Math.abs(approachBlend(1,5,20)-3)<1e-9);
 const bridge=rect(-10,-4,80,8,{kind:'Jalkakäytävä (Silta)',name:'Karlův most'});
 const street=rect(-50,-3,40,6,{kind:'Ajorata',name:'Mostecká'});
 const ground=x=>x>-12?5:1;
 const height=bridgeDriveHeight(-30,0,{
  groundAt:ground,
  surface:street,
  featured:[bridge],
  dry:()=>true,
  inChannel:()=>false,
 });
 assert.ok(height>1&&height<5,'the ramp is between the street and the deck');
 const far=bridgeDriveHeight(-80,0,{groundAt:ground,surface:street,featured:[bridge],dry:()=>true,inChannel:()=>false});
 assert.equal(far,1,'Mostecká away from the bridge stays at street height');
});

test('Silta and most are bridges, including Karlův most pavement',()=>{
 assert.equal(isBridgeSurface({kind:'Jalkakäytävä (Silta)',name:'Karlův most'}),true);
 assert.equal(isBridgeSurface({kind:'Ajorata (Silta)',name:'Hlávkův most'}),true);
 assert.equal(isBridgeSurface({kind:'Ajorata',name:'Mostecká'}),false);
 assert.equal(isApproachStreet({name:'Křižovnická'}),true);
 assert.equal(isApproachStreet({name:'nábřeží Ludvíka Svobody'}),true);
 assert.equal(isApproachStreet({name:'Vltavská'}),true);
 assert.equal(isFeaturedBridge({name:'Karlův most'}),true);
 assert.equal(isFeaturedBridge({name:'Prašný most'}),false);
});

test('water on a bridge uses the open channel beside it',()=>{
 const onBridge=(x,z)=>Math.abs(z)<3;
 const level=openRiverSample(0,0,{
  onBridge,
  inChannel:(x,z)=>Math.abs(z)<20,
  levelAt:(x,z)=>Math.abs(z)<3?2:-6,
 });
 assert.equal(level,-6);
 assert.equal(openRiverSample(0,30,{onBridge,inChannel:()=>true,levelAt:()=>0}),null);
});

test('statue rows sit on both parapets of a long deck',()=>{
 const deck=rect(0,0,200,12,{kind:'Jalkakäytävä (Silta)',name:'Karlův most'});
 const points=parapetSamples(deck.rings);
 const sides=new Set(points.map(p=>p.side));
 assert.ok(points.length>=8);
 assert.equal(sides.size,2);
 assert.ok(points.every(p=>p.x>0&&p.x<200&&p.z>0&&p.z<12));
 const statues=charlesStatuePoints([deck,rect(0,20,30,8,{kind:'Ajorata',name:'Mostecká'})]);
 assert.ok(statues.length>=8);
 assert.equal(new Set(statues.map(p=>p.side)).size,2);
});

test('featured decks are thin meshes and other bridges are not drawn',()=>{
 const group=createPragueBridgeDecks([
  rect(0,0,40,8,{kind:'Jalkakäytävä (Silta)',name:'Karlův most'}),
  rect(0,30,40,8,{kind:'Ajorata (Silta)',name:'Hlávkův most'}),
  rect(0,60,40,8,{kind:'Ajorata (Silta)',name:'Čechův most'}),
 ],()=>3);
 assert.equal(group.children.length,2);
 assert.ok(group.children.every(m=>m.isMesh&&m.geometry.attributes.position.count>2));
});

test('a car on a bridge or its shoulder does not sink; open water still stops it',()=>{
 setTerrain(null);
 const water=rect(-100,-100,200,200,{kind:'river'});
 const deck=rect(-4,-30,8,60,{kind:'Jalkakäytävä (Silta)',name:'Karlův most'});
 const world={
  buildings:new SpatialIndex([]),
  roads:new SpatialIndex([]),
  pavement:new SpatialIndex([deck]),
  water:[water],
  featuredBridges:[deck],
 };
 assert.equal(sampleStopsForWater(0,0,world),false,'on the deck');
 assert.equal(sampleStopsForWater(6,0,world),false,'shoulder beside the deck');
 assert.equal(sampleStopsForWater(40,0,world),true,'open water');
 const onDeck=makeCar(0,0);onDeck.speed=8;
 assert.equal(driveStep(onDeck,new Set(['KeyW']),.2,world).collision,null);
 const sunk=makeCar(40,0);sunk.speed=8;
 assert.equal(driveStep(sunk,new Set(['KeyW']),.2,world).collision,'water');
});
