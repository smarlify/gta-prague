import test from 'node:test';
import assert from 'node:assert/strict';
import {carSample,crowdLevel} from '../src/audio-math.js';

const kmh=k=>k/3.6;

test('car loop matches the 50 km/h recording and rises with speed',()=>{
 const idle=carSample(0,{material:'Asfaltti',surface:'asphalt'});
 const cruise=carSample(kmh(50),{material:'Asfaltti',surface:'asphalt'});
 const fast=carSample(kmh(100),{material:'Asfaltti',surface:'asphalt'});
 assert.ok(idle.playbackRate<.8,'a crawl plays the interior slower than recorded');
 assert.ok(Math.abs(cruise.playbackRate-1)<.02,'50 km/h is the recorded rate');
 assert.ok(fast.playbackRate>cruise.playbackRate);
 assert.ok(fast.gain>cruise.gain&&cruise.gain>idle.gain);
});

test('setts rumble more than asphalt at the same speed, without changing the motor rate',()=>{
 const speed=kmh(30);
 const asphalt=carSample(speed,{material:'Asfaltti',surface:'asphalt'});
 const setts=carSample(speed,{material:'Nupukivi',surface:'setts'});
 assert.equal(asphalt.kind,'asphalt');assert.equal(setts.kind,'setts');
 assert.ok(setts.gain>asphalt.gain);
 assert.equal(setts.playbackRate,asphalt.playbackRate);
});

test('throttle adds load on top of the rolling sound',()=>{
 const speed=kmh(40),surface={material:'Asfaltti',surface:'asphalt'};
 assert.ok(carSample(speed,surface,{throttle:true}).gain>carSample(speed,surface).gain);
});

test('crowd murmur follows the nearest pedestrians',()=>{
 const here={x:0,z:0};
 assert.equal(crowdLevel([],here),0);
 assert.equal(crowdLevel([{x:80,z:0}],here),0);
 const one=crowdLevel([{x:2,z:0}],here),group=crowdLevel([{x:2,z:1},{x:-2,z:1},{x:1,z:-2}],here);
 assert.ok(one>0&&one<1);assert.ok(group>one);
});
