import test from 'node:test';import assert from 'node:assert/strict';
import {crashImpulse,applyCrashImpulse,knockCar,playerSpeedAfter,stepKnocked,FRICTION} from '../src/crash-physics.js';
import {ImpactSystem} from '../src/impacts.js';
const world={roads:{at:()=>true},pavement:{at:()=>true},buildings:{at:()=>false},water:[]};
test('a published impulse shoves and spins the local car without an NPC knock',()=>{
 const car={x:0,z:0,heading:0,speed:2};
 const applied=applyCrashImpulse(car,{nx:0,nz:-1,speed:8,spin:1});
 assert.ok(applied);assert.ok(car.z<0,'shoved along the impulse');assert.ok(car.heading>0,'spin turns the car');
 assert.equal(applyCrashImpulse(car,{nx:0,nz:0,speed:0,spin:0}),null);
});
test('a rear-end shove sends the other car forward and leaves the player some speed',()=>{
 const from={x:0,z:5,heading:0,speed:12},car={...from,z:4.3},npc={id:1,x:0,z:0,heading:0,speed:0,edge:{}};
 const impulse=crashImpulse(from,car,npc);assert.ok(impulse);assert.ok(impulse.nz<-.9,'pushed along -z');assert.ok(impulse.dv>6&&impulse.dv<9);
 assert.ok(Math.abs(impulse.spin)<.3,'square hit barely spins');
 const after=playerSpeedAfter(from,impulse);assert.ok(after>2&&after<6,`player keeps part of the speed, got ${after}`);
 knockCar(npc,impulse,0);assert.ok(npc.knocked);assert.ok(npc.speed>6);
 let moved=0;for(let i=0;i<300;i++){stepKnocked(npc,1/60,world,i/60);}moved=Math.hypot(npc.x,npc.z);
 assert.ok(moved>2&&moved<8,`slides a few metres then stops, got ${moved}`);assert.equal(npc.speed,0);assert.ok(npc.knocked.rest!==null);
});
test('an offset hit spins the other car; cars moving apart are not knocked',()=>{
 const from={x:1.4,z:4,heading:0,speed:12},car={...from,z:3.4},npc={id:1,x:0,z:0,heading:0,speed:0,edge:{}};
 const impulse=crashImpulse(from,car,npc);assert.ok(Math.abs(impulse.spin)>.5);
 assert.equal(crashImpulse({x:0,z:5,heading:0,speed:1},{x:0,z:4.9,heading:0,speed:1},{x:0,z:0,heading:0,speed:10}),null);
});
test('a knocked car stops at a building instead of entering it',()=>{
 const npc={x:0,z:0,heading:0,speed:0,knocked:{vx:0,vz:-8,spin:0,at:0,rest:null}},walls={...world,buildings:{at:(x,z)=>z<-4}};
 for(let i=0;i<120;i++)stepKnocked(npc,1/60,walls,i/60);
 assert.ok(npc.z>-2.5,`held at the wall, got ${npc.z}`);
});
test('impact system hands the hit to the knock callback and keeps the player rolling',()=>{
 const sim=new ImpactSystem(),from={x:0,z:7,speed:12,heading:0},car={...from,z:1},other={id:2,x:0,z:0,heading:0,speed:0,edge:{}};
 let knocked=null;sim.onVehicleHit=(f,c,a)=>{knocked=a;const i=crashImpulse(f,c,a);knockCar(a,i,0);return i;};
 sim.collide(from,car,[],[],[other]);
 assert.equal(knocked,other);assert.equal(car.z,7,'player put back at the contact');assert.ok(car.speed>0&&car.speed<12);assert.ok(other.knocked);assert.ok(car.damage>0);
});
test('a slow nudge rolls the other car along at walking pace instead of pinning the player',()=>{
 const from={x:0,z:5,heading:0,speed:.6},car={...from,z:4.99},npc={id:1,x:0,z:0,heading:0,speed:0,edge:{}};
 const impulse=crashImpulse(from,car,npc);assert.ok(impulse.push);
 knockCar(npc,impulse,10);assert.ok(npc.speed>.5);assert.equal(npc.damage,undefined,'a shove is not a crash');
 assert.ok(stepKnocked(npc,1/60,world,10+1/60),'keeps rolling while being pushed');assert.ok(npc.speed>.5);
 assert.equal(playerSpeedAfter({...from,speed:9},{...impulse,push:true}),3,'pushing is capped at walking pace');
});
test('a shunted car passes its momentum to the next car in line instead of sliding through it',()=>{
 const first={id:1,x:0,z:0,heading:0,speed:0,edge:{}},second={id:2,x:0,z:-5.2,heading:0,speed:0,edge:{}};
 knockCar(first,{nx:0,nz:-1,dv:9,spin:0,closing:9,push:false},0);
 const knocked=[];const opts={cars:[first,second],obstacles:[],knock:(b,pose,impulse)=>{knocked.push(b.id);knockCar(b,impulse,0);}};
 for(let i=0;i<120;i++){stepKnocked(first,1/60,world,i/60,opts);stepKnocked(second,1/60,world,i/60,opts);}
 assert.deepEqual([...new Set(knocked)],[2]);assert.ok(second.z<-6,`second car shoved on, got ${second.z}`);
 assert.ok(first.z>second.z+3.5,'the first car never overlaps the second');
});
test('a shunted car bounces off a tram instead of passing through it',()=>{
 const car={id:1,x:0,z:0,heading:0,speed:0,edge:{}};knockCar(car,{nx:0,nz:-1,dv:9,spin:0,closing:9,push:false},0);
 const tram={x:0,z:-6,heading:0,speed:0,edge:true,tram:true};
 for(let i=0;i<120;i++)stepKnocked(car,1/60,world,i/60,{cars:[car],obstacles:[tram]});
 assert.ok(car.z>-3,`held clear of the tram, got ${car.z}`);
});
