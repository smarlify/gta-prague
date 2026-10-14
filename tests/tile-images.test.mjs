import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTileImages,createFrameQueue} from '../src/tile-streaming.js';

function imageMocks(t,fetchImage){
 const bitmaps=[];
 t.mock.method(globalThis,'fetch',fetchImage);
 const original=Object.getOwnPropertyDescriptor(globalThis,'createImageBitmap');
 Object.defineProperty(globalThis,'createImageBitmap',{configurable:true,writable:true,value:async blob=>{
  if(blob.wait)await blob.wait;
  const bitmap={closed:false,close(){this.closed=true;}};bitmaps.push(bitmap);return bitmap;
 }});
 t.after(()=>{if(original)Object.defineProperty(globalThis,'createImageBitmap',original);else delete globalThis.createImageBitmap;});
 return bitmaps;
}
const image=blob=>({ok:true,blob:async()=>({arrayBuffer:async()=>new ArrayBuffer(4),...blob})});

test('a failed atlas closes successful bitmaps, including decodes that finish later',async t=>{
 let finish;const waiting=new Promise(resolve=>finish=resolve);
 const bitmaps=imageMocks(t,async file=>file==='missing'?{ok:false,status:404}:image(file==='late'?{wait:waiting}:{}));
 const pending=loadTileImages(['good','missing','late']);
 // A rejected sibling does not return before outstanding decodes can be cleaned.
 await Promise.resolve();finish();await assert.rejects(pending,/404/);
 assert.equal(bitmaps.length,2);assert.ok(bitmaps.every(b=>b.closed));
});

test('a failed encoded-byte read also closes its successfully decoded bitmap',async t=>{
 const bitmaps=imageMocks(t,async()=>image({arrayBuffer:async()=>{throw new Error('Read failed');}}));
 await assert.rejects(loadTileImages(['bad']),/Read failed/);assert.equal(bitmaps.length,1);assert.equal(bitmaps[0].closed,true);
});

test('successful images stay open for the renderer and retain the worker bytes',async t=>{
 const bitmaps=imageMocks(t,async()=>image());const loaded=await loadTileImages(['a','b']);
 assert.deepEqual([...loaded.keys()],['a','b']);assert.equal(bitmaps.length,2);assert.ok(bitmaps.every(b=>!b.closed));
 assert.equal(loaded.get('a').bytes.byteLength,4);
});

test('a throwing GPU upload is reported and does not stop later jobs',()=>{
 const errors=[];
 const queue=createFrameQueue({maxJobs:4,budgetMs:100,onError:e=>errors.push(e)});
 let ran=false;
 queue.push(()=>{throw new Error('initTexture failed');});
 queue.push(()=>{ran=true;});
 assert.equal(queue.step(),2);
 assert.equal(ran,true);
 assert.equal(errors.length,1);
 assert.match(String(errors[0].message||errors[0]),/initTexture failed/);
});
