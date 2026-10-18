import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {SpatialIndex} from '../src/geo.js';
import {makeCar,driveStep,PLAYER_MAX_SPEED} from '../src/physics.js';
import {roadsterStep,ROADSTER_CLEARANCE,ROADSTER_CEILING} from '../src/roadster-flight.js';
import {createVehicle,animateVehicle} from '../src/vehicles.js';

const rect=(x,z,w,h)=>({rings:[[[x,z],[x+w,z],[x+w,z+h],[x,z+h],[x,z]]],kind:'Ajorata'});
const empty=new SpatialIndex([]);
const world=(buildings=[],water=[],roads=[rect(-2500,-2500,5000,5000)])=>({buildings:new SpatialIndex(buildings),roads:new SpatialIndex(roads),pavement:empty,water});
const hold=(car,keys,seconds,hz=60)=>{for(let i=0;i<seconds*hz;i++)roadsterStep(car,keys,1/hz,world());return car;};

test('the starting Roadster is an original wedge with a T mark, ten nozzles and four fans',()=>{
 const model=createVehicle(0,true,'roadster'),box=new THREE.Box3().setFromObject(model),size=box.getSize(new THREE.Vector3());
 assert.equal(model.userData.type,'roadster');assert.equal(model.name,'Roadster');
 assert.equal(model.userData.spec.wb,2.825);assert.ok(Math.abs(model.userData.spec.w-1.98)<1e-9);
 assert.ok(size.x>1.7&&size.x<2.35&&size.z>4.2&&size.z<5.1&&size.y<1.6,size.toArray().join(','));
 const marks=[];model.traverse(o=>{if(o.name==='tesla-mark')marks.push(o);});
 assert.ok(marks.length>=7,'nose, tail, deck and four hub caps');
 const nozzle=model.getObjectByName('nozzle');
 assert.ok(nozzle);assert.equal(nozzle.geometry.attributes.position.count>80,true);
 assert.equal(model.getObjectByName('fans').children.length,4);
 assert.equal(model.getObjectByName('wing').name,'wing');
 assert.equal(model.userData.wheels.length,4);
 assert.equal(model.getObjectByName('paint').material.color.getHexString(),'f2efe6');
 let tris=0;model.traverse(o=>{if(o.isMesh)tris+=o.geometry.index?o.geometry.index.count/3:o.geometry.attributes.position.count/3;});
 assert.ok(tris<9000,`roadster is ${tris} triangles`);
 model.userData.nozzle=1;model.userData.lift=1;model.userData.flying=true;model.userData.flightPitch=.4;
 animateVehicle(model,12,.2,1/60,false);
 assert.equal(model.userData.nozzleMat.color.getHexString(),'d7f6ff');
 assert.ok(model.userData.fanPivots[0].rotation.y>0);
 assert.ok(model.getObjectByName('wing').rotation.x<0);
});

test('rockets lift off, hold a hover, and gravity lands the car when they stop',()=>{
 const car=hold(makeCar(0,0),new Set(['ShiftLeft']),1);
 assert.equal(car.flying,true);assert.ok(car.alt>2&&car.alt<12,`alt ${car.alt}`);
 const mid=car.alt;hold(car,new Set(['ShiftLeft']),1);
 assert.ok(car.flying&&car.alt>mid-1);
 const high=car.alt;hold(car,new Set(),4);
 assert.equal(car.flying,false);assert.equal(car.alt,0);assert.ok(car.y<=high);
});

test('throttle pitches the nose up and steering rolls, the way the flying-cars cheat does',()=>{
 const car=hold(makeCar(0,0),new Set(['ShiftLeft']),1);
 hold(car,new Set(['ShiftLeft','KeyW']),.7);
 assert.ok(car.pitch>.35,`pitch ${car.pitch}`);assert.ok(car.alt>3);
 const level=car.pitch;hold(car,new Set(['ShiftLeft','Space']),.8);
 assert.ok(Math.abs(car.pitch)<level*.5,`space levels, pitch ${car.pitch}`);
 const rolled=hold(makeCar(0,0),new Set(['ShiftLeft']),1);
 hold(rolled,new Set(['ShiftLeft','KeyA']),.6);
 assert.ok(rolled.roll>.3,`roll ${rolled.roll}`);
 const held=hold(makeCar(0,0),new Set(['ShiftLeft','KeyW']),3);
 assert.ok(held.pitch>.5&&held.pitch<=.95,`pitch stays nose-up, got ${held.pitch}`);
 assert.ok(held.speed>0,`still flying forward at ${held.speed}`);
 const peaked=held.pitch;hold(held,new Set(['ShiftLeft']),1.2);
 assert.ok(held.pitch<peaked*.7,`releasing the nose lets it ease back, ${held.pitch} from ${peaked}`);
 hold(held,new Set(),10);
 assert.equal(held.flying,false);assert.equal(held.alt,0);
});

test('the same lift reaches a similar height at 30 and 60 Hz and stays under the ceiling',()=>{
 const a=hold(makeCar(0,0),new Set(['ShiftLeft']),2,30),b=hold(makeCar(0,0),new Set(['ShiftLeft']),2,60);
 assert.ok(Math.abs(a.alt-b.alt)/b.alt<.2,`${a.alt} vs ${b.alt}`);
 const ceiling=hold(makeCar(0,0),new Set(['ShiftLeft']),12);
 assert.ok(ceiling.alt<=ROADSTER_CEILING+1e-6);assert.ok(ceiling.alt>ROADSTER_CEILING-1);
});

test('street walls and water stop the wheels, and the same obstacles are clear once the car is above them',()=>{
 const wall=world([rect(-8,-6,16,1)]);
 const ground=makeCar(0,0);ground.roadster=true;ground.speed=12;
 assert.equal(roadsterStep(ground,new Set(['KeyW']),.3,wall).collision,'building');assert.ok(ground.z>-6);
 const over=makeCar(0,0);over.flying=true;over.alt=8;over.vx=0;over.vz=-25;over.speed=25;over.battery=1;
 for(let i=0;i<40;i++)roadsterStep(over,new Set(),1/60,wall);
 assert.ok(over.z<-8,`flew to ${over.z}`);assert.equal(over.flying,true);
 const wet=world([], [rect(-20,-30,40,28)], []);
 const splash=makeCar(0,0);splash.speed=16;
 assert.equal(roadsterStep(splash,new Set(['KeyW']),.25,wet).collision,'water');
 const bridge=makeCar(0,-2);bridge.flying=true;bridge.alt=ROADSTER_CLEARANCE+4;bridge.vx=0;bridge.vz=-20;bridge.speed=20;bridge.battery=1;
 for(let i=0;i<30;i++)roadsterStep(bridge,new Set(),1/60,wet);
 assert.ok(bridge.z<-8,`over water at ${bridge.z}`);assert.equal(bridge.flying,true);
});

test('on the ground the motors pick up quicker than a normal car and still stop at the shared top speed',()=>{
 const plain=makeCar(0,0),fast=makeCar(0,0);fast.roadster=true;
 for(let i=0;i<60;i++){driveStep(plain,new Set(['KeyW']),1/60,world());roadsterStep(fast,new Set(['KeyW']),1/60,world());}
 assert.ok(fast.speed>plain.speed+3,`${fast.speed} vs ${plain.speed}`);
 assert.ok(fast.speed<=PLAYER_MAX_SPEED+1e-6);assert.equal(fast.flying,false);
});
