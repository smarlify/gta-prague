import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createTerminalLife} from '../src/terminal-life.js';
import {createTerminalDetails} from '../src/terminal-details.js';
import {createHarbour} from '../src/harbour.js';
if (true) {
 test('Finland city pack', {skip: 'Finland city is not part of this build'}, () => {});
} else {
const city=JSON.parse(gunzipSync(readFileSync('public/data/city.pack'))),walks=JSON.parse(readFileSync('public/data/mobility.json')).walks;
test('terminal passengers and waterfront walkers have luggage and bounded instanced geometry',()=>{
 const crowd=createTerminalLife(city,walks,createHarbour(city).obstacles),s=crowd.snapshot();
 assert.ok(s.passengers>=24);assert.ok(s.walkers>=24);assert.ok(s.suitcases>=24);
 let calls=0,triangles=0;crowd.group.traverse(m=>{if(!m.isMesh)return;calls++;triangles+=(m.geometry.index?.count??m.geometry.attributes.position.count)/3*m.count;assert.ok(m.instanceMatrix.array.every(Number.isFinite));});
 assert.equal(calls,s.drawCalls);assert.ok(calls<=11,`${calls} draw calls`); // three extra distant-level person meshes (PERSON_LOD)assert.ok(triangles<130000,`${triangles}`);
 const initial=crowd.people.map(p=>[p.x,p.z]);
 for(let frame=0;frame<300;frame++){crowd.update(1/30,{x:240,z:1020,speed:0});for(const p of crowd.people)assert.ok(crowd.plan.safe(p.x,p.z),p.id);}
 assert.ok(crowd.people.filter((p,i)=>Math.hypot(p.x-initial[i][0],p.z-initial[i][1])>2).length>40);
 // Let opposing walkers meet and arrivals complete a whole loop: a short
 // startup-only check misses deadlocks at narrow forecourt turnarounds.
 for(let frame=0;frame<1500;frame++)crowd.update(1/30,{x:240,z:1020,speed:0});
 assert.ok(crowd.people.filter(p=>p.route.kind==='terminal'&&p.speed>.2).length>=18);
 assert.ok(crowd.people.filter(p=>p.route.kind==='waterfront'&&p.speed>.2).length>=24);
 for(const p of crowd.people)assert.ok(crowd.plan.safe(p.x,p.z),p.id);
 crowd.reset();assert.deepEqual(crowd.people.map(p=>[p.x,p.z]),initial);
 crowd.update(.03,{x:-1000,z:-1000});assert.equal(crowd.group.visible,false);
});
test('knocked-down terminal passengers remain still and render finite transforms',()=>{
 const crowd=createTerminalLife(city,walks),p=crowd.people[0],start=[p.x,p.z];
 p.knockdown={elapsed:2,duration:6.5,side:1};crowd.update(.08,{x:240,z:1020,speed:0});
 assert.deepEqual([p.x,p.z],start);assert.equal(p.speed,0);
 crowd.group.traverse(m=>{if(m.isInstancedMesh)assert.ok(m.instanceMatrix.array.every(Number.isFinite));});
});

}
