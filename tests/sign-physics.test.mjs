import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {Vector3} from 'three';
import {WorldObjects,OBJECT_MODES} from '../src/world-objects.js';
import {createLaivasillankatuSigns} from '../src/laivasillankatu-signs.js';
import {createHarbourSigns} from '../src/harbour-signs.js';
import {createHarbour} from '../src/harbour.js';
import {createEtelarantaGantry} from '../src/etelaranta-gantry.js';
import {createMannerheimintieGantry} from '../src/mannerheimintie-gantry.js';
import {createRouteDirectionSigns,KANAVAKATU_CENTRUM_SIGN} from '../src/route-direction-signs.js';
import {createKauppatoriFingerpost} from '../src/kauppatori-fingerpost.js';
import {createBreakableSigns} from '../src/breakable-signs.js';
import {makeCar} from '../src/physics.js';

test('every suspended-sign assembly blocks its support and leaves the road beneath its boards open',()=>{
 const options={canvasFactory:()=>null};
 for(const [group,supportCount,under] of [
  [createLaivasillankatuSigns(options),1,[-5.9,0,0]],
  [createHarbourSigns(),2,[12.4,0,270]],
  [createEtelarantaGantry(options),1,[-6.03,0,0]],
  [createMannerheimintieGantry(options),1,[8.7,0,0]],
 ]){
  assert.equal(group.obstacles.length,supportCount,group.name);
  assert.ok(group.worldObjects.every(o=>OBJECT_MODES.includes(o.collisionMode)));
  const world=new WorldObjects(group.worldObjects),heading=group.rotation.y;
  assert.ok(world.snapshot().overhead>0,'the raised boards have an explicit overhead role');
  for(const support of group.obstacles){
   assert.equal(support.collisionMode,'solid');const b=support.bbox,x=(b[0]+b[2])/2,z=(b[1]+b[3])/2;
   assert.ok(b[2]-b[0]<.7&&b[3]-b[1]<.7,'only the narrow ground support is solid');
   assert.equal(world.overlap({x,z,heading}),support);
   assert.ok(world.blocksStep({x:x+Math.sin(heading)*5,z:z+Math.cos(heading)*5,heading},{x:x-Math.sin(heading)*5,z:z-Math.cos(heading)*5,heading}),'a car cannot pass through the support');
  }
  group.updateMatrixWorld(true);const p=group.localToWorld(new Vector3(...under));
  assert.equal(world.blocksStep({x:p.x+Math.sin(heading)*6,z:p.z+Math.cos(heading)*6,heading},{x:p.x-Math.sin(heading)*6,z:p.z-Math.cos(heading)*6,heading}),null,'the board does not create an invisible road wall');
  group.traverse(m=>{if(m.isMesh){m.geometry.dispose();m.material.dispose();}});
 }
});

test('the wall board relies on its existing building, while the fingerpost reacts as a breakable post',()=>{
 const wall=createRouteDirectionSigns({canvasFactory:()=>null}),record=wall.worldObjects[0];
 assert.equal(record.id,KANAVAKATU_CENTRUM_SIGN.id);assert.equal(record.collisionMode,'decoration');assert.equal(record.buildingRatu,1760);assert.deepEqual(wall.obstacles,[]);
 assert.equal(new WorldObjects(wall.worldObjects).overlap({x:KANAVAKATU_CENTRUM_SIGN.x,z:KANAVAKATU_CENTRUM_SIGN.z}),null);
 const finger=createKauppatoriFingerpost({canvasFactory:()=>null}),post=finger.breakable.bodies[0];
 assert.equal(finger.worldObjects[0],post);assert.equal(post.collisionMode,'breakable');
 const car=makeCar(post.x,post.z+2,0);car.speed=12;
 finger.breakable.step(1/60,car);finger.breakable.update();
 assert.ok(post.knocked,'the actual rendered fingerpost registers an impact');assert.equal(post.state,'flying');
 finger.breakable.resetAll();
});

test('shared sign sets expose live breakable records for scene-wide classification',()=>{
 const signs=createBreakableSigns('sign registry test',{register:false});
 assert.equal(signs.group.worldObjects,signs.bodies);
 signs.post({id:'first',x:0,z:0});signs.post({id:'second',x:4,z:0});
 const world=new WorldObjects(signs.group.worldObjects);
 assert.equal(world.snapshot().breakable,2);assert.equal(world.snapshot().solid,0);
 assert.equal(world.overlap({x:0,z:0}),null,'the breakable simulation, not a second permanent wall, owns these posts');
});

test('terminal crossing signs break on impact and suspension masts have narrow solid footprints', {skip:'Finland city is not part of this build'},()=>{
 const city=JSON.parse(gunzipSync(readFileSync('public/data/city.pack'))),harbour=createHarbour(city),signs=harbour.group.breakable;
 const posts=signs.bodies.filter(p=>p.id.startsWith('harbour-crossing-'));
 assert.equal(posts.length,2);assert.ok(posts.every(p=>p.collisionMode==='breakable'));
 const post=posts[0],car=makeCar(post.x,post.z+2,0);car.speed=12;
 try{signs.step(1/60,car);assert.ok(post.knocked,'the visible crossing post reacts to the car');}finally{signs.resetAll();}
 const supports=harbour.obstacles.filter(o=>/harbour-(lattice|wire-post)-/.test(o.id));
 assert.equal(supports.length,22);const world=new WorldObjects(supports);
 for(const p of supports){const b=p.bbox;assert.equal(p.collisionMode,'solid');assert.equal(world.overlap({x:(b[0]+b[2])/2,z:(b[1]+b[3])/2}),p);}
 assert.ok(harbour.obstacles.some(o=>o.id==='harbour-suspended-sign-support-0'),'suspended sign supports join the main obstacle list');
});
