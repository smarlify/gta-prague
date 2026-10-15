import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import * as THREE from 'three';
import {SpatialIndex} from '../src/geo.js';
import {routePoint} from '../src/mobility.js';
import {HARBOUR_START} from '../src/demo-route.js';
import {ImpactSystem} from '../src/impacts.js';
import {WorldObjects,solidBox,objectBehavior} from '../src/world-objects.js';
import {posePerson,createJoints,JOINT,PROPORTIONS} from '../src/person-model.js';
import {PLAYER_SCOOTER} from '../src/player-ride-models.js';
import {ScooterRiders,collectScooterRoutes,createScooterSafety,createScooterRiderRenderer,scooterRiderLook,scooterRiderPose,SCOOTER_RIDER_LIMIT} from '../src/scooter-riders.js';

const box=(x0,z0,x1,z1,kind='Erotettu pyörätie')=>({kind,rings:[[[x0,z0],[x1,z0],[x1,z1],[x0,z1],[x0,z0]]]});
const empty=()=>new SpatialIndex([]);
const synthetic=()=>({graph:{nodes:[[0,0],[140,0]],edges:[{from:0,to:1,points:[[0,0],[140,0]],crossing:false}]},
 world:{pavement:new SpatialIndex([box(-5,-4,145,4)]),roads:empty(),buildings:empty(),water:[]},player:{x:15,z:20,heading:0,speed:0}});

for(const [name,root] of [['Helsinki','public/data'],['Tampere','public/cities/tampere']])test(`${name} scooter riders follow the city's mapped paths and stay out of roads and buildings`,{skip:!existsSync(`${root}/city.pack`)},()=>{
 const city=JSON.parse(gunzipSync(readFileSync(`${root}/city.pack`))),mobility=JSON.parse(readFileSync(`${root}/mobility.json`));
 const world={buildings:new SpatialIndex(city.buildings),pavement:new SpatialIndex(city.pavement),roads:new SpatialIndex(city.roads.filter(r=>!/Koroke/.test(r.kind))),water:city.water};
 const player=name==='Helsinki'?HARBOUR_START:city.landmarks[0],sim=new ScooterRiders(mobility.walks,world,{count:6});sim.reset(player);
 assert.equal(sim.riders.length,6);assert.ok(sim.routes.length>=6);
 const starts=new Map(sim.riders.map(r=>[r.id,{x:r.x,z:r.z}]));
 for(let frame=0;frame<600;frame++){
  sim.step(1/30,player);
  for(const actor of sim.riders){assert.ok(sim.safety.footprint(actor),`${name} rider remains on a safe mapped surface`);assert.ok(mobility.walks.edges.includes(actor.route.sourceEdge));}
 }
 assert.ok(sim.riders.filter(r=>Math.hypot(r.x-starts.get(r.id).x,r.z-starts.get(r.id).z)>3).length>=3,'riders make visible progress');
 assert.ok(sim.riders.every(r=>r.distance>2));
});

test('route validation splits around stairs, buildings, roads and open water',()=>{
 const {graph,world,player}=synthetic();
 world.pavement=new SpatialIndex([box(30,-4,35,4,'Portaat'),box(-5,-4,145,4)]);
 world.roads=new SpatialIndex([box(65,-4,70,4,'Ajorata')]);
 world.buildings=new SpatialIndex([box(100,-4,105,4,'Building')]);world.water=[box(130,-5,135,5,'Water')];
 const routes=collectScooterRoutes(graph,world,player),safety=createScooterSafety(world);
 assert.ok(routes.length>=3);
 for(const route of routes)for(let s=route.start;s<=route.end;s+=.2)assert.ok(safety.footprint(routePoint(route.path,s,0)));
 const stairs={...graph,edges:[{...graph.edges[0],kind:'steps'}]},crossing={...graph,edges:[{...graph.edges[0],crossing:true}]};
 assert.deepEqual(collectScooterRoutes(stairs,world,player),[]);assert.deepEqual(collectScooterRoutes(crossing,world,player),[]);
});

test('missing routes stay empty and rider count is bounded',()=>{
 const {world,player}=synthetic(),sim=new ScooterRiders({edges:[]},world,{count:1000});sim.reset(player);sim.step(.1,player);
 assert.equal(sim.capacity,SCOOTER_RIDER_LIMIT);assert.equal(sim.riders.length,0);assert.ok(sim.rideSources.every(s=>!s.claim()));
});

test('solid world objects split scooter routes and a newly placed narrow post stops movement',()=>{
 const {graph,world,player}=synthetic();
 const post=solidBox({id:'post',x:65,z:0,width:.1,depth:.1}),overhead=objectBehavior(solidBox({id:'gantry',x:90,z:0,width:8,depth:8}),'overhead');
 world.collisionBuildings=empty();world.buildings=new SpatialIndex([overhead]);world.objects=new WorldObjects([post,overhead]);
 const routes=collectScooterRoutes(graph,world,player);assert.ok(routes.length>=2);
 assert.ok(routes.every(r=>r.start>65||r.end<65),'solid post splits the route');
 assert.ok(routes.some(r=>r.start<90&&r.end>90),'the road under an overhead object stays usable');
 const sim=new ScooterRiders(graph,world,{count:1});sim.reset(player);const actor=sim.actors[0];
 const stop=solidBox({id:'new-post',x:actor.x+2,z:actor.z,width:.06,depth:1});world.objects.add([stop]);
 for(let i=0;i<180;i++){sim.step(1/30,player);assert.equal(world.objects.overlap(actor,{halfWidth:.24,halfLength:.56}),null);}
 assert.ok(actor.x<stop.bbox[0],'rider stops and turns before a solid post added after route discovery');
});

test('a walking player can approach a rider from beside the path and take its stopped scooter',()=>{
 const {graph,world,player}=synthetic(),sim=new ScooterRiders(graph,world,{count:1});sim.reset(player);
 const actor=sim.actors[0];actor.speed=actor.cruise;
 const walker={x:actor.x,z:actor.z+2,heading:0,speed:0,walking:true,travelMode:'walk'};
 for(let i=0;i<30;i++)sim.step(1/30,walker);
 assert.equal(actor.speed,0,'courtesy stop works even when the player is beside the rider');
 assert.equal(sim.rideSources[0].claim(),true);
});

test('cached coastline queries agree with polygon tests at band boundaries and holes',()=>{
 const ring=(cx,cz,r,n,shape=0)=>Array.from({length:n},(_,i)=>{const a=i/n*Math.PI*2,k=1+shape*Math.sin(a*5);return [cx+Math.cos(a)*r*k,cz+Math.sin(a)*r*k];});
 const pavement={kind:'Erotettu pyörätie',rings:[ring(0,0,100,128),ring(-60,10,7,48)]};
 const water=[{rings:[ring(15,-10,45,192,.18),ring(15,-10,12,64)]}];
 const world={pavement:new SpatialIndex([pavement]),buildings:new SpatialIndex([{rings:[ring(-30,35,8,64)]}]),roads:empty(),water};
 const testWater=new SpatialIndex(water),safety=createScooterSafety(world);
 for(const z of [-64.001,-64,-63.999,-32.001,-32,-31.999,-.001,0,.001,31.999,32,32.001,63.999,64,64.001])for(let x=-101;x<=101;x+=1.3){
  const expected=!!world.pavement.at(x,z)&&!world.buildings.at(x,z)&&!testWater.at(x,z);
  assert.equal(safety.safe(x,z),expected,`water/coastline agreement at ${x},${z}`);
 }
 pavement.disabled=true;assert.equal(safety.safe(-80,-30),false,'disabled source surfaces remain disabled');
});

test('riders stop for pedestrians and player takeover removes the original until released',()=>{
 const {graph,world,player}=synthetic(),sim=new ScooterRiders(graph,world,{count:1});sim.reset(player);
 const actor=sim.riders[0],source=sim.rideSources[0];actor.speed=actor.cruise;
 assert.equal(source.claim(),false,'a moving rider cannot be taken over');
 const person={id:'walker',x:actor.x+8,z:actor.z,heading:0,speed:0,edge:{}};
 for(let i=0;i<180;i++)sim.step(1/30,player,{people:[person]});
 assert.ok(actor.speed<.01,'braked to a stop');assert.ok(person.x-actor.x>.68,'stopped before contact');
 assert.equal(source.claim(),true);const held={x:actor.x,z:actor.z,s:actor.s};
 assert.equal(source.claim(),false);assert.equal(sim.riders.length,0);
 sim.step(.1,player);assert.deepEqual({x:actor.x,z:actor.z,s:actor.s},held);
 assert.equal(source.visual.kind,'scooter');assert.equal(source.visual.accent,actor.operator.accent);
 source.release();assert.equal(sim.riders.length,1);assert.equal(actor.playerTaken,false);assert.deepEqual({x:actor.x,z:actor.z,s:actor.s},held);
});

test('existing impact knockdowns stop an NPC scooter and recover onto its route',()=>{
 const {graph,world,player}=synthetic(),sim=new ScooterRiders(graph,world,{count:1});sim.reset(player);
 const actor=sim.riders[0],impacts=new ImpactSystem(),s=actor.s;
 impacts.hit(actor,{x:actor.x-2,z:actor.z,heading:-Math.PI/2,speed:4},{kind:'car'});
 assert.ok(actor.knockdown);assert.equal(sim.rideSources[0].canClaim(),false);assert.equal(sim.rideSources[0].claim(),false);
 for(let i=0;i<30;i++){sim.step(1/30,player);impacts.step(1/30,world);}
 assert.equal(actor.s,s);assert.equal(actor.speed,0);
 for(let i=0;i<1200&&actor.knockdown;i++)impacts.step(1/30,world);
 assert.equal(actor.knockdown,undefined);for(let i=0;i<60;i++)sim.step(1/30,player);
 assert.ok(actor.speed>0);assert.ok(sim.safety.footprint(actor));
});

test('streamed route refresh keeps taken and active actor identities',()=>{
 const {graph,world,player}=synthetic(),sim=new ScooterRiders(graph,world,{count:2});sim.reset(player);
 const source=sim.rideSources[0],actor=source.actor;assert.equal(source.claim(),true);
 const second=sim.actors[1],oldRoute=second.route;
 sim.refreshRoutes({edges:[...graph.edges,{from:2,to:3,points:[[0,2],[140,2]]}]},world);sim.step(.1,player);
 assert.equal(sim.rideSources[0],source);assert.equal(source.actor,actor);assert.equal(actor.playerTaken,true);
 assert.equal(second.route,oldRoute,'installing another region does not reset existing movement');
});

test('NPC scooter hands meet the grips and feet stay on the shared deck across rider heights',()=>{
 const J=createJoints();
 for(let i=0;i<12;i++)for(const speed of [0,2,4]){
  const look=scooterRiderLook(i),actor=scooterRiderPose({x:0,z:0,heading:0,speed},look);posePerson(actor,look,{},J);
  assert.ok(J.every(Number.isFinite));
  for(const [side,sign] of [[0,-1],[3,1]]){
   const hand=JOINT.handL+side,wrist=JOINT.wristL+side,grip=new THREE.Vector3(sign*PLAYER_SCOOTER.barX,PLAYER_SCOOTER.barY,PLAYER_SCOOTER.barZ);
   const fingers=new THREE.Vector3(...J.slice(hand,hand+3)),palm=new THREE.Line3(new THREE.Vector3(...J.slice(wrist,wrist+3)),fingers),closest=new THREE.Vector3();
   palm.closestPointToPoint(grip,true,closest);assert.ok(closest.distanceTo(grip)<.006,'the handlebar passes through the palm');assert.ok(fingers.distanceTo(grip)<.035,'fingers wrap just beyond the bar');
   const ankle=JOINT.ankleL+side;
   assert.ok(Math.abs(J[ankle+1]-PROPORTIONS.ankle*look.height)<.01,'both feet retain deck height');
   assert.ok(Math.abs(J[ankle]-sign*PLAYER_SCOOTER.footX)<.01,'feet fit within the narrow deck');
   for(const joint of [JOINT.heelL+side,JOINT.toeL+side]){assert.ok(Math.abs(J[joint])+.046*look.height/1.75<.086);assert.ok(J[joint+2]>-.30&&J[joint+2]<.26,'whole shoe remains above deck');}
  }
 }
});

test('renderer batches scooters and people, hides claimed/offscreen actors and retains fallen pose',()=>{
 const {graph,world,player}=synthetic(),sim=new ScooterRiders(graph,world,{count:3});sim.reset(player);
 const scene=new THREE.Scene(),renderer=createScooterRiderRenderer(scene,sim);renderer.update(player,.1);
 assert.equal(renderer.scooters.count,3);assert.ok(renderer.people.list.length<=9);assert.equal(renderer.group.children.length,2);
 assert.ok(renderer.scooters.instanceMatrix.array.every(Number.isFinite));
 assert.equal(sim.rideSources[0].claim(),true);renderer.update(player,.1);assert.equal(renderer.scooters.count,2);
 const a=sim.actors[1];a.knockdown={elapsed:1,duration:4,side:1};renderer.update(player,.1);
 const matrix=new THREE.Matrix4();renderer.scooters.getMatrixAt(0,matrix);assert.ok(Math.abs(matrix.elements[5])<.2,'the struck scooter falls with its rider');
 renderer.update({x:1000,z:1000},.1);assert.equal(renderer.scooters.count,0);assert.ok(renderer.people.list.every(m=>m.count===0));
 renderer.dispose();assert.equal(scene.children.length,0);
});
