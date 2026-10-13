import test from 'node:test';
import assert from 'node:assert/strict';
import {SpatialIndex} from '../src/geo.js';
import {makeCar} from '../src/physics.js';
import {PlayerTravel,exitPosition} from '../src/player-travel.js';
import {ImpactSystem,impactSeverity} from '../src/impacts.js';
import {createCrowdReaction} from '../src/crowd-reaction.js';
import {PoliceSimulation,incidentHeat} from '../src/police.js';

const rect=(x,z,w,d)=>({rings:[[[x,z],[x+w,z],[x+w,z+d],[x,z+d]]]});
const world=()=>({buildings:new SpatialIndex([]),roads:new SpatialIndex([rect(-200,-200,400,400)]),pavement:new SpatialIndex([rect(-200,-200,400,400)]),water:[]});
const person=(id,x,z)=>({id,x,z,heading:Math.PI/2,speed:1,edge:{}});
const police=()=>{const reports=[];return {reports,report:(kind,id,speed)=>{reports.push({kind,id,speed});return true;}};};
// Player just short of contact (0,2) heading north (-z) towards a person at the origin, in the given mode and speed.
function setup(mode,speed){
 const travel=new PlayerTravel(makeCar(60,60),world());travel.interact();
 if(mode!=='walk'){const r=travel.rides.find(r=>r.id===mode);Object.assign(travel.actor,exitPosition(r,mode,travel.world,travel.parked().filter(p=>p!==r)));assert.equal(travel.interact(mode).ok,true);}
 travel.transition=null;Object.assign(travel.actor,{x:0,z:2,heading:0,speed});
 return travel;
}
// Ride forward, checking contact every step as the frame loop does.
function ride(travel,people,impacts,cops,seconds=3,dt=1/60){
 for(let t=0;t<seconds;t+=dt){
  const from={...travel.actor},r=travel.step(new Set(['KeyW']),dt);impacts.step(dt);
  if(r.crashed)continue;const h=travel.hitPeople(from,people,impacts,{police:cops});if(h)return h;
 }
 return null;
}

test('contact: the player body only hits a person it actually sweeps into',()=>{
 const impacts=new ImpactSystem(),travel=setup('bike',6),near=person(1,0,0),aside=person(2,3,0),cops=police();
 const h=ride(travel,[aside,near],impacts,cops);
 assert.equal(h.actor,near);assert.equal(h.kind,'bicycle');assert.ok(near.knockdown);assert.equal(aside.knockdown,undefined,'three metres to the side is a miss');
 // Someone already down is not hit again; a parked car mode does nothing.
 const again=setup('bike',6);assert.equal(ride(again,[near],impacts,cops,1),null);
 const car=new PlayerTravel(makeCar(0,10),world());assert.equal(car.hitPeople({...car.actor,speed:8},[person(3,0,8)],impacts),null);
});

test('severity follows the ride: bicycle 95 kg, scooter 90 kg, walker 75 kg, and speed',()=>{
 const e=(k,v)=>impactSeverity(k,v).energy;
 assert.ok(e('bicycle',6)>e('scooter',6)&&e('scooter',6)>e('walker',6));assert.ok(e('bicycle',3)<e('bicycle',6));
 for(const [mode,kind] of [['bike','bicycle'],['scooter','scooter']]){
  const slow=ride(setup(mode,2),[person(1,0,0)],new ImpactSystem(),police()),fast=ride(setup(mode,6.5),[person(1,0,0)],new ImpactSystem(),police());
  assert.equal(slow.kind,kind);assert.equal(slow.severity.level,'stumble');assert.equal(fast.severity.level,'down');assert.ok(fast.severity.energy>slow.severity.energy);
 }
});

test('a hard bike hit throws the rider off: the bike tips over, the rider is down briefly',()=>{
 const impacts=new ImpactSystem(),cops=police(),travel=setup('bike',7),victim=person(1,0,0);
 const h=ride(travel,[victim],impacts,cops);
 assert.ok(h.fell>3);assert.equal(h.severity.riderFalls,true);assert.equal(travel.mode,'walk');
 const bike=travel.rides.find(r=>r.id==='bike');assert.ok(bike.fallen&&bike.parked,'the bike lies on its side');
 assert.ok(travel.actor.knockdown,'rider knocked down');const d=travel.actor.knockdown.duration;assert.ok(d>=2&&d<=4.5);
 for(let t=0;t<5;t+=1/30)travel.step(new Set(),1/30);assert.equal(travel.actor.knockdown,undefined,'back on their feet');
 assert.deepEqual(cops.reports.map(r=>r.kind),['pedestrian']);assert.ok(incidentHeat('pedestrian',cops.reports[0].speed)>=4);
 // A gentle ride into someone keeps the rider upright and only slows the bike.
 const soft=setup('bike',2),s=ride(soft,[person(2,0,0)],new ImpactSystem(),police());
 assert.equal(s.fell,undefined);assert.equal(soft.mode,'bike');assert.ok(soft.actor.speed<2.4);
});

test('walking into someone is a bump: a stumble and a "Sorry!", never a knock-down',()=>{
 for(const speed of [2,4.8]){
  const impacts=new ImpactSystem(),cops=police(),travel=setup('walk',speed),victim=person(1,0,0);
  travel.sprint=speed>2;const h=ride(travel,[victim],impacts,cops);
  assert.equal(h.kind,'walker');assert.equal(h.bumped,true);assert.equal(h.severity.level,'stumble');assert.equal(victim.knockdown.prone,false);
  assert.equal(travel.actor.speed,0,'the player stops');assert.equal(travel.actor.knockdown,undefined,'and stays up');
  assert.deepEqual(cops.reports.map(r=>r.kind),['bump'],'a mild report');
 }
 // Barely moving: people just step around each other.
 assert.equal(setup('walk',.5).hitPeople({x:0,z:.6,heading:0,speed:.5},[person(1,0,0)],new ImpactSystem()),null);
});

test('police heat scales: a bump is mild, a bike knock-down is a pedestrian incident; bystanders react',()=>{
 const p=new PoliceSimulation({nodes:[],edges:[]},world());p.grace=0;p.report('bump','a');assert.equal(p.level,0);assert.equal(p.message,null);
 const impacts=new ImpactSystem(),crowd=createCrowdReaction({random:()=>.1}),near=person(5,1.5,-2),victim=person(1,0,0);
 impacts.onHit=e=>crowd.alarm(e,[[near,victim]]);
 ride(setup('scooter',6.5),[victim],impacts,police());assert.equal(victim.knockdown.level,'down');assert.ok(near.reaction,'a bystander reacts');
 const calm=createCrowdReaction({random:()=>.1}),onlooker=person(6,2,-2),bumped=person(2,0,0),i2=new ImpactSystem();i2.onHit=e=>calm.alarm(e,[[onlooker,bumped]]);
 ride(setup('walk',2),[bumped],i2,police());assert.ok(['stare','shout'].includes(onlooker.reaction?.kind),'a bump only gets looks');
});
