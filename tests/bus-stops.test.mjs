import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {BusSimulation,assignBusStops,busStopPull,stopPullFor,BUS_PULL_IN,BUS_PULL_OUT} from '../src/bus-simulation.js';
import {prepareGraph} from '../src/mobility.js';
import {createBusModel} from '../src/bus-renderer.js';
// A 300 m street heading north (-z): carriageway x∈[-5,5], or a narrow one x∈[-2,2].
const street=half=>({roads:{at:x=>Math.abs(x)<half},buildings:{at:()=>false}});
const prepared=(extra={})=>({...prepareGraph({nodes:[0,1],edges:[{id:'n',kind:'city',points:[[0,0],[0,-300]],from:0,to:1,lane:0,...extra}]}).edges[0],start:8,end:292});
test('a path takes the stop poles beside its right-hand kerb, once each, never the opposite side',()=>{
 const stops=[{id:'right',x:4,z:-150},{id:'twin',x:4.5,z:-160},{id:'left',x:-4,z:-100},{id:'far',x:30,z:-200},{id:'end',x:4,z:-295}];
 const got=assignBusStops(prepared(),stops);
 assert.deepEqual(got.map(s=>s.id),['right']);
 // Front door at the pole: the 12 m bus centre halts 4.5 m before it.
 assert.ok(Math.abs(got[0].s-(150-6+1.5))<.01,String(got[0].s));
 // Listed stops of the line itself are taken whatever the side; others are ignored.
 assert.deepEqual(assignBusStops(prepared({stopIds:['left']}),stops).map(s=>s.id),['left']);
});
test('pull-in eases to the kerb and back out, and stays in lane where the street is narrow',()=>{
 const path=prepared(),[stop]=assignBusStops(path,[{id:'a',x:4,z:-150}]),pull=busStopPull(stop,1.2);
 assert.equal(pull(stop.s-BUS_PULL_IN-1),0);assert.equal(pull(stop.s),1.2);assert.equal(pull(stop.s+BUS_PULL_OUT+1),0);
 assert.ok(pull(stop.s-12)>0&&pull(stop.s-12)<1.2);
 assert.ok(stopPullFor(path,stop,'city',street(5))>=1.2);
 assert.equal(stopPullFor(path,stop,'city',street(1.5)),0);
});
test('a bus pulls in, opens its doors for a few seconds at the stop, then pulls out and drives on',()=>{
 const sim=new BusSimulation({paths:[{id:'n',line:'550',kind:'city',points:[[0,0],[0,-300]]}],stops:[{id:'a',name:'Stop',x:4,z:-150}]},street(5),{cityCount:1});
 const player={x:40,z:0,heading:0,speed:0};sim.reset(player);const b=sim.buses[0];b.s=40;Object.assign(b,{x:0,z:-40});
 let dwellAt=null,dwelt=0,maxX=0,opened=false;
 const stop=b.path.busStops[0];
 for(let i=0;i<30*60&&!(dwelt&&b.s>stop.s+BUS_PULL_OUT+5);i++){sim.step(1/30,player);maxX=Math.max(maxX,b.x);if(b.dwell>0){dwellAt??={s:b.s,x:b.x};dwelt+=1/30;opened||=b.doorsOpen;}}
 assert.ok(dwellAt,'the bus stopped');assert.ok(Math.abs(dwellAt.s-stop.s)<.6,`halted at ${dwellAt.s}, stop ${stop.s}`);
 assert.ok(dwelt>=4&&dwelt<=9,`dwell ${dwelt}`);assert.ok(opened);assert.ok(dwellAt.x>1,'pulled in towards the kerb');
 assert.ok(b.s>stop.s+BUS_PULL_OUT,'drove on');assert.ok(Math.abs(b.x)<.05,'back in its lane');
 assert.equal(sim.snapshot()[0].dwelling,false);
});
test('bus door leaves open at a stop and close again',()=>{
 const m=createBusModel('city'),[fore,aft]=m.children.filter(c=>/Door leaves/.test(c.name));
 m.userData.setDoors(1);assert.ok(fore.position.z<-.4&&aft.position.z>.4&&fore.position.x>.1);
 m.userData.setDoors(0);assert.equal(fore.position.length()+aft.position.length(),0);
});
test('Helsinki and Tampere corridors carry dated stop poles from their sources', {skip:!existsSync('public/data')||!existsSync('public/cities/tampere')},()=>{
 for(const file of ['public/data/bus-corridors.json','public/cities/tampere/bus-corridors.json']){const d=JSON.parse(readFileSync(file));
  assert.ok(d.stops.length>100,file);assert.ok(d.stopsSource);assert.ok(d.stops.every(s=>Number.isFinite(s.x)&&Number.isFinite(s.z)&&s.id));}
});
