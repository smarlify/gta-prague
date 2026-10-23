import test from 'node:test';
import assert from 'node:assert/strict';
import {SpatialIndex,pointInPolygon,setPlayableRadius} from '../src/geo.js';
import {makeCar} from '../src/physics.js';
import {PlayerTravel,travelCollision,TRAVEL_MODES,exitPosition,slopeFactor,cameraBody} from '../src/player-travel.js';
import {GENERIC_JACKET,characterLook,genericPlayerLook} from '../src/character-looks.js';
import {createDriveCameraState,stepDriveCamera} from '../src/driving-camera.js';
import {setTerrain} from '../src/terrain.js';
import {trafficFootprintsOverlap,sweptContact} from '../src/contact-geometry.js';
import {carBox} from '../src/lane-model.js';
import {busOverlaps} from '../src/bus-simulation.js';
import {createJoints,posePerson,personLook,JOINT} from '../src/person-model.js';

const rect=(x,z,w,d)=>({rings:[[[x,z],[x+w,z],[x+w,z+d],[x,z+d]]]});
function world({walls=[],water=[]}={}){return {buildings:new SpatialIndex(walls),roads:new SpatialIndex([rect(-200,-200,400,400)]),pavement:new SpatialIndex([rect(-200,-200,400,400)]),water};}
const press=(...keys)=>new Set(keys);
const mount=(travel,id)=>{const r=travel.rides.find(r=>r.id===id),side=exitPosition(r,id,travel.world,travel.parked().filter(p=>p!==r));assert.ok(side,'the ride has a clear side to approach');Object.assign(travel.actor,side);assert.equal(travel.interact(id).ok,true);};

test('getting out leaves the car parked and walking never moves or drains it',()=>{
 const car=makeCar(0,0),travel=new PlayerTravel(car,world());car.speed=5;
 assert.equal(travel.interact().ok,false);assert.equal(travel.mode,'car');car.speed=0;
 assert.equal(travel.interact().ok,true);assert.equal(travel.mode,'walk');
 const parked={...car},start={...travel.actor};
 for(let i=0;i<90;i++)travel.step(press('KeyW'),1/60);
 assert.ok(Math.hypot(travel.actor.x-start.x,travel.actor.z-start.z)>2);
 assert.deepEqual(car,parked);assert.ok(travel.parkedBodies().some(b=>b.x===0&&b.z===0));
});

test('a flying Roadster has to land before the driver can step out',()=>{
 const car=makeCar(0,0);car.flying=true;car.alt=4;car.speed=0;
 const travel=new PlayerTravel(car,world());
 const blocked=travel.interact();
 assert.equal(blocked.ok,false);assert.match(blocked.message,/Land/);assert.equal(travel.mode,'car');
 car.flying=false;car.alt=0;assert.equal(travel.interact().ok,true);assert.equal(travel.mode,'walk');
});

test('rides need proximity; bicycle and scooter remain where dismounted and can be used again',()=>{
 const travel=new PlayerTravel(makeCar(0,0),world());travel.interact();
 Object.assign(travel.actor,{x:100,z:100});assert.equal(travel.interact('car').ok,false);
 for(const id of ['bike','scooter']){
  mount(travel,id);assert.equal(travel.mode,id);
  // Move on a clear stretch with the starter car and other ride behind us.
  Object.assign(travel.actor,{x:id==='bike'?30:36,z:30,heading:0}); // separate lanes: riding into the parked bike at speed would be a crash
  for(let i=0;i<180;i++)travel.step(press('KeyW'),1/60);
  assert.ok(travel.actor.distance>10);assert.ok(travel.actor.speed>5);
  assert.equal(travel.interact().ok,false,'cannot jump off a moving ride');
  for(let i=0;i<90;i++)travel.step(press('Space'),1/60);
  const position={x:travel.actor.x,z:travel.actor.z};
  assert.equal(travel.interact().ok,true);assert.equal(travel.mode,'walk');
  const ride=travel.rides.find(r=>r.id===id);assert.equal(ride.x,position.x);assert.equal(ride.z,position.z);
  assert.equal(travel.interact(id).ok,true);assert.equal(travel.mode,id);assert.equal(travel.interact().ok,true);
 }
});

test('a wall on the door side chooses another exit; boxed-in vehicles keep the player inside',()=>{
 const car=makeCar(0,0),oneSide=world({walls:[rect(-3,-3,1.8,6)]});
 assert.ok(exitPosition(car,'car',oneSide).x>0);
 const blocked=world({walls:[rect(-5,-5,10,10)]});
 assert.equal(exitPosition(car,'car',blocked),null);
});

test('walking and riding cannot tunnel through buildings or enter open water or leave the map',()=>{
 for(const mode of ['walk','bike','scooter']){
  const w=world({walls:[rect(-2,-3,4,.1)]}),travel=new PlayerTravel(makeCar(20,20),w);
  travel.interact();if(mode!=='walk')mount(travel,mode);
  Object.assign(travel.actor,{x:0,z:0,heading:0,speed:TRAVEL_MODES[mode].speed});
  for(let i=0;i<30;i++)travel.step(press('KeyW'),.1);
  assert.ok(travel.actor.z>-3,mode);assert.equal(travel.actor.speed,0);
  const wet={...world(),roads:new SpatialIndex([]),pavement:new SpatialIndex([]),water:[rect(-5,-5,10,10)]};
  assert.equal(travelCollision({x:0,z:0,heading:0},mode,wet),'water');
  setPlayableRadius(100);assert.equal(travelCollision({x:101,z:0,heading:0},mode,world()),'boundary');setPlayableRadius(2000);
 }
});

test('riders have bounded speeds at different frame rates, stop promptly, and can reverse',()=>{
 for(const mode of ['walk','bike','scooter'])for(const fps of [20,60,120]){
  const travel=new PlayerTravel(makeCar(0,0),world());travel.interact();if(mode!=='walk')mount(travel,mode);
  Object.assign(travel.actor,{x:50,z:50,heading:0});
  for(let i=0;i<fps*4;i++)travel.step(press('KeyW'),1/fps);
  assert.ok(travel.actor.speed<=TRAVEL_MODES[mode].speed+1e-9);
  for(let i=0;i<fps*2;i++)travel.step(press('Space'),1/fps);
  assert.equal(travel.actor.speed,0);
  for(let i=0;i<fps;i++)travel.step(press('KeyS'),1/fps);
  assert.ok(travel.actor.speed<-.5);
 }
});

test('on flat ground Shift reaches the run cap and W alone stays at walk speed',()=>{
 const travel=new PlayerTravel(makeCar(0,0),world());travel.interact();
 Object.assign(travel.actor,{x:50,z:50,heading:0,speed:0});
 for(let i=0;i<240;i++)travel.step(press('KeyW'),1/60);
 assert.ok(Math.abs(travel.actor.speed-2)<.05,`walk without Shift tops out near 2 m/s: ${travel.actor.speed}`);
 travel.actor.speed=0;
 for(let i=0;i<240;i++)travel.step(press('KeyW','ShiftLeft'),1/60);
 assert.ok(Math.abs(travel.actor.speed-9.6)<.05,`Shift on flat ground reaches about 9.6 m/s: ${travel.actor.speed}`);
});

test('a new starting point resets all travel modes, and generation works away from Helsinki coordinates',()=>{
 const travel=new PlayerTravel(makeCar(0,0),world());travel.interact();mount(travel,'bike');
 const fresh=makeCar(85,-90,1.2);travel.reset(fresh,world());
 assert.equal(travel.mode,'car');assert.equal(travel.actor,fresh);assert.equal(travel.rides.length,2);
 for(const r of travel.rides){assert.ok(Math.hypot(r.x-85,r.z+90)<23);assert.equal(travelCollision(r,r.mode,world()),null);}
});

test('traffic uses the player’s small footprint without changing existing car contact',()=>{
 const npc={x:0,z:0,heading:0},person={x:1.6,z:0,heading:0,halfWidth:.28,halfLength:.28};
 assert.equal(trafficFootprintsOverlap(npc,person),false);
 assert.equal(trafficFootprintsOverlap(npc,{...person,halfWidth:.98,halfLength:2.36}),true);
 assert.equal(sweptContact(person,{...person,x:1.5},npc),false);
 assert.equal(sweptContact(person,{...person,x:.5},npc),true);
 assert.equal(carBox(person).hw,.28);
 assert.equal(busOverlaps({x:0,z:0,heading:0,kind:'city'},{...person,x:1.7}),false);
});

test('the scooter rider holds the handlebars with finite attached limbs',()=>{
 const look=personLook(2026,{height:1.75,coat:0,skirt:false}),joints=createJoints();
 posePerson({pose:'scooter',speed:6},look,{gaitWalk:1,gaitRun:1,gaitPhase:2},joints);
 assert.ok(joints.every(Number.isFinite));
 for(const side of [0,3]){assert.ok(Math.abs(joints[JOINT.wristL+side+1]-.95)<.03);assert.ok(Math.abs(joints[JOINT.wristL+side+2]+.455)<.03);}
});

test('a bike or scooter that hits something at speed falls over and the rider gets up again',async()=>{
 const {PlayerTravel,CRASH_SPEED}=await import('../src/player-travel.js');
 const {makeCar}=await import('../src/physics.js');const {SpatialIndex}=await import('../src/geo.js');
 const big=[[[-500,-500],[500,-500],[500,500],[-500,500],[-500,-500]]],wall=[[[-3,-12],[3,-12],[3,-11],[-3,-11],[-3,-12]]];
 const world={buildings:new SpatialIndex([{rings:wall}]),roads:new SpatialIndex([{rings:big,kind:'Ajorata'}]),pavement:new SpatialIndex([]),water:[]};
 const travel=new PlayerTravel(makeCar(0,10,0),world);travel.interact();assert.equal(travel.mode,'walk');
 const ride=travel.rides[0];Object.assign(travel.actor,{x:ride.x,z:ride.z});const res=travel.interact(ride.id);
 assert.ok(res.ok,res.message);
 Object.assign(travel.actor,{x:0,z:-4,heading:0,speed:CRASH_SPEED+3});Object.assign(travel.riding,travel.actor);
 let crashed=null;for(let i=0;i<120&&!crashed;i++)crashed=travel.step(new Set(['KeyW']),1/60).crashed;
 assert.ok(crashed>=CRASH_SPEED,'hit the wall at speed');assert.equal(travel.mode,'walk');assert.ok(travel.actor.knockdown);assert.ok(ride.fallen,'ride tipped over');
 const before=travel.actor.heading,parked=travel.car.heading;
 travel.step(new Set(['KeyA']),.25);
 assert.ok(travel.actor.knockdown,'still getting up');
 assert.ok(travel.actor.heading>before+.05,'turning while getting up changes heading');
 assert.equal(travel.car.heading,parked,'the parked car stays put');
 assert.equal(cameraBody(travel,travel.car),travel.actor);
 const cam=createDriveCameraState(before);
 stepDriveCamera(cam,cameraBody(travel,travel.car),.25,{drive:true});
 assert.ok(Math.abs(cam.heading-before)>.02,'chase camera follows the rider, not the parked car');
 for(let i=0;i<60*5;i++)travel.step(new Set(['KeyW']),1/60);assert.ok(!travel.actor.knockdown,'rider gets up');
});

test('walking, cycling and scooting feel the slope: slower uphill, a little faster downhill, capped',()=>{
 const size=201,cell=2,extent=200,ground=new Float32Array(size*size);
 for(let j=0;j<size;j++)for(let i=0;i<size;i++)ground[j*size+i]=-.08*(j*cell-extent); // rises towards -z, ahead at heading 0
 const run=(mode,heading,hill)=>{setTerrain(hill?{size,cell,extent,base:0,ground,water:null,lake:null}:null);
  const travel=new PlayerTravel(makeCar(60,60),world());travel.interact();if(mode!=='walk')mount(travel,mode);
  Object.assign(travel.actor,{x:0,z:heading?-40:40,heading,speed:0});for(let i=0;i<240;i++)travel.step(press('KeyW'),1/60);
  setTerrain(null);return travel.actor.speed;};
 for(const mode of ['walk','bike','scooter']){
  const flat=run(mode,0,false),up=run(mode,0,true),down=run(mode,Math.PI,true);
  assert.ok(Math.abs(flat-TRAVEL_MODES[mode].speed)<.05,`${mode} flat ${flat}`);
  assert.ok(up<flat*.85,`${mode} uphill ${up.toFixed(2)} < flat ${flat.toFixed(2)}`);
  if(mode==='walk')assert.ok(down<=flat*1.1+1e-6,`walking downhill stays near walking pace: ${down.toFixed(2)}`);
  else assert.ok(down>flat*1.05&&down<=flat*1.35+1e-6,`${mode} downhill ${down.toFixed(2)} vs ${flat.toFixed(2)}`);
 }
 assert.equal(slopeFactor('walk',0),1);assert.ok(slopeFactor('walk',-.05)>1&&slopeFactor('walk',-.25)<.6,'a gentle descent is easiest, a steep one is careful');assert.ok(slopeFactor('bike',-1)<=1.35&&slopeFactor('scooter',-1)<=1.15&&slopeFactor('bike',1)>=.3,'capped');
 assert.equal(slopeFactor('car',.2),1);
});

test('a motorbike or Challenger mounts at the chosen place, and a later car choice is the car',()=>{
 const land=world();
 const bike=new PlayerTravel(makeCar(0,0),land,{ride:'motorbike'});
 assert.equal(bike.mode,'motorbike');assert.equal(bike.riding.visual.kind,'motorbike');
 assert.equal(bike.actor.x,0);assert.equal(bike.actor.z,0);
 assert.ok(Math.hypot(bike.car.x,bike.car.z)>1,'the home car waits off the motorbike');
 for(let i=0;i<10;i++)bike.step(press('KeyW'),1/60);
 assert.equal(bike.mode,'motorbike');
 bike.reset(makeCar(4,4),land,{ride:null});
 assert.equal(bike.mode,'car');assert.equal(bike.riding,null);assert.equal(bike.actor,bike.car);
 const river={buildings:new SpatialIndex([]),roads:new SpatialIndex([rect(40,-40,80,80)]),pavement:new SpatialIndex([]),water:[rect(-30,-30,60,60)]};
 const boat=new PlayerTravel(makeCar(0,0),river,{ride:'challenger'});
 assert.equal(boat.mode,'challenger');assert.equal(boat.riding.visual.kind,'challenger');
 assert.equal(boat.actor.x,0);assert.equal(boat.actor.z,0);
 assert.equal(travelCollision(boat.actor,'challenger',river),null);
 assert.ok(boat.car.x>30,'the home car waits on the bank');
 assert.equal(travelCollision({x:boat.car.x,z:boat.car.z,heading:boat.car.heading},'car',river),null);
 for(let i=0;i<10;i++)boat.step(press('KeyW'),1/60);
 assert.equal(boat.mode,'challenger');
 boat.reset(makeCar(50,0),land,{ride:null});
 assert.equal(boat.mode,'car');assert.equal(boat.riding,null);
 assert.equal(travelCollision({x:0,z:0,heading:0},'car',land),null);
 assert.throws(()=>travelCollision({x:0,z:0,heading:0},'hoverboard',land),/Unknown travel mode/);
});

test('Zeman steps from the Challenger onto a nearby shore and can board the boat again',()=>{
 const water=[{rings:[[[-40,-20],[3,-20],[3,20],[-40,20],[-40,-20]]]}];
 const shore={buildings:new SpatialIndex([]),roads:new SpatialIndex([]),pavement:new SpatialIndex([rect(3.5,-20,40,40)]),water};
 const near=new PlayerTravel(makeCar(0,0,0),shore,{ride:'challenger'});
 assert.equal(near.mode,'challenger');
 const boat={x:near.actor.x,z:near.actor.z,heading:near.actor.heading};
 const left=near.interact();
 assert.equal(left.ok,true,left.message);
 assert.equal(near.mode,'walk');
 assert.equal(travelCollision(near.actor,'walk',shore),null);
 assert.equal(water.some(w=>pointInPolygon(near.actor.x,near.actor.z,w.rings)),false);
 const dx=near.actor.x-boat.x,dz=near.actor.z-boat.z;
 assert.ok(-Math.sin(near.actor.heading)*dx-Math.cos(near.actor.heading)*dz>0,'he faces the shore he stepped onto');
 const parked=near.rides.find(r=>r.mode==='challenger');
 assert.equal(parked.x,boat.x);assert.equal(parked.z,boat.z);assert.equal(parked.parked,true);
 const standing=characterLook('zeman'),generic=genericPlayerLook();
 assert.equal(standing.shirt,GENERIC_JACKET);
 assert.equal(standing.shirt,generic.shirt);
 assert.equal(standing.glasses,null);
 assert.equal(standing.hairStyle,generic.hairStyle);
 near.car.x=80;near.car.z=80;
 const back=near.interact();
 assert.equal(back.ok,true,back.message);
 assert.equal(near.mode,'challenger');
 assert.equal(near.actor.x,boat.x);assert.equal(near.actor.z,boat.z);
 const far=new PlayerTravel(makeCar(-30,0,0),shore,{ride:'challenger'});
 const stay=far.interact();
 assert.equal(stay.ok,false);
 assert.match(stay.message,/shore/);
 assert.equal(far.mode,'challenger');
 assert.equal(far.actor.x,-30);assert.equal(far.actor.z,0);
});
