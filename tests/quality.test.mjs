import test from 'node:test';
import assert from 'node:assert/strict';
import {pickTier,TIERS,QUALITY,createTierWatch} from '../src/quality.js';
import {edgesNear} from '../src/mobility.js';

test('phones and weak devices start on the low tier, everything else on the tuned one',()=>{
 assert.equal(pickTier({}),'high');
 assert.equal(pickTier({coarse:true}),'low');
 assert.equal(pickTier({memory:4,cores:8}),'low');
 assert.equal(pickTier({memory:8,cores:4}),'low');
 assert.equal(pickTier({memory:8,cores:8}),'high');
});

test('?quality= pins a tier over detection, a remembered pin holds, and auto forgets it',()=>{
 assert.equal(pickTier({query:'high',coarse:true}),'high');
 assert.equal(pickTier({query:'low',memory:32,cores:16}),'low');
 assert.equal(pickTier({stored:'low'}),'low');
 assert.equal(pickTier({stored:'high',coarse:true}),'high');
 assert.equal(pickTier({query:'auto',stored:'low'}),'high');
 assert.equal(pickTier({query:'ultra',stored:'bogus',coarse:true}),'low');
});

test('outside a browser the tuned tier is used, and low is cheaper on every axis',()=>{
 assert.equal(QUALITY,TIERS.high);
 const {high,low}=TIERS;
 assert.equal(low.post,false);assert.equal(low.headBeams,false);
 for(const k of ['maxPixelRatio','minPixelRatio','shadowMap','drawDistance','fogNear','cameraFar','buildingNear','buildingFar','buildingDetail','buildingShadow','buildingWindows','cars','people'])assert.ok(low[k]<high[k],k);
 for(const t of [high,low]){assert.ok(t.fogNear<t.drawDistance&&t.drawDistance<t.cameraFar);assert.ok(t.buildingNear<t.buildingFar&&t.buildingFar<t.drawDistance);}
});

test('the tier watch fires once after sustained slow frames at the resolution floor only',()=>{
 const run=(w,ms,seconds,floor)=>{let fired=0;for(let t=0;t<seconds;t+=ms/1000)if(w.update(ms,ms/1000,floor))fired++;return fired;};
 const a=createTierWatch();assert.equal(run(a,40,20,false),0,'not at the floor');
 const b=createTierWatch();assert.equal(run(b,16,20,true),0,'fast frames');
 const c=createTierWatch();assert.equal(run(c,40,4,true),0);assert.equal(run(c,40,3,true),1);assert.equal(run(c,40,10,true),0,'fires once');assert.equal(c.fired,true);
 const d=createTierWatch();d.update(900,.9,true);assert.equal(run(d,40,4,true),0,'a suspended tab does not count');
});

test('the spawn edge lookup returns exactly the edges a full scan finds, in order',()=>{
 let seed=7;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
 const edges=Array.from({length:4000},(_,id)=>{const x=(rnd()-.5)*3000,z=(rnd()-.5)*3000;return {id,points:[[x-5,z],[x,z],[x+5,z]]};});
 for(const [x,z,r] of [[0,0,200],[-1400,900,320],[733,-61,520],[5000,5000,200]]){
  const near=edgesNear(edges,x,z,r),inside=e=>Math.hypot(e.points[1][0]-x,e.points[1][1]-z)<r;
  assert.deepEqual(near.filter(inside).map(e=>e.id),edges.filter(inside).map(e=>e.id));
 }
 edges.push({id:4000,points:[[1,1],[2,2],[3,3]]}); // a region appended while driving
 assert.ok(edgesNear(edges,0,0,50).some(e=>e.id===4000));
});
