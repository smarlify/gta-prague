import test from 'node:test';
import assert from 'node:assert/strict';
import {pickTier,TIERS,QUALITY,otherTier,switchQuality,QUALITY_KEY} from '../src/quality.js';
import {edgesNear} from '../src/mobility.js';

test('laptops start on high and phones on low; a choice or ?quality= overrides',()=>{
 assert.equal(pickTier({}),'high');
 assert.equal(pickTier({mobile:true}),'low');
 assert.equal(pickTier({mobile:true,stored:'high'}),'high','a phone that chose high keeps it');
 assert.equal(pickTier({mobile:true,query:'high'}),'high');
 assert.equal(pickTier({mobile:true,query:'auto',stored:'high'}),'low','auto forgets the choice');
 assert.equal(pickTier({stored:'low'}),'low');
 assert.equal(pickTier({stored:'high'}),'high');
 assert.equal(pickTier({query:'low'}),'low');
 assert.equal(pickTier({query:'high',stored:'low'}),'high');
 assert.equal(pickTier({query:'auto',stored:'low'}),'high');
 assert.equal(pickTier({query:'ultra',stored:'bogus'}),'high');
});

test('the quality button remembers the other tier and reloads without the URL pin',()=>{
 assert.equal(otherTier('high'),'low');assert.equal(otherTier('low'),'high');
 const saved=new Map(),original=globalThis.localStorage;
 globalThis.localStorage={setItem:(k,v)=>saved.set(k,v),getItem:k=>saved.get(k)??null,removeItem:k=>saved.delete(k)};
 try{
  let replaced=null;
  assert.equal(switchQuality('low',{href:'https://example.test/?driver=dave&quality=high',replace:u=>{replaced=u;}}),true);
  assert.equal(saved.get(QUALITY_KEY),'low');
  assert.equal(replaced,'https://example.test/?driver=dave');
  assert.equal(switchQuality('ultra',{href:'https://example.test/',replace(){throw Error('no reload');}}),false);
 }finally{if(original===undefined)delete globalThis.localStorage;else globalThis.localStorage=original;}
});

test('outside a browser the tuned tier is used, and low is cheaper on every axis',()=>{
 assert.equal(QUALITY,TIERS.high);
 const {high,low}=TIERS;
 assert.equal(low.post,false);assert.equal(low.headBeams,false);
 for(const k of ['maxPixelRatio','minPixelRatio','shadowMap','drawDistance','fogNear','cameraFar','buildingNear','buildingFar','buildingDetail','buildingShadow','buildingWindows','cars','people'])assert.ok(low[k]<high[k],k);
 for(const t of [high,low]){assert.ok(t.fogNear<t.drawDistance&&t.drawDistance<t.cameraFar);assert.ok(t.buildingNear<t.buildingFar&&t.buildingFar<t.drawDistance);}
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
