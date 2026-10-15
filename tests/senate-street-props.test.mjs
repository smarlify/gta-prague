import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import {createSenateStreetProps} from '../src/senate-street-props.js';
import {makeCar} from '../src/physics.js';
if (!fs.existsSync('public/data')) {
 test('local city pack', {skip: 'local Helsinki or Tampere fixture is not in this checkout'}, () => {});
} else {
const city=JSON.parse(zlib.gunzipSync(fs.readFileSync('public/data/city.pack')));
test('Senate photo-era kiosks, bikes and scooters stay inside south square, clear of roads and stairs',()=>{
 const p=createSenateStreetProps(city);
 assert.equal(p.kiosks.length,12);assert.equal(p.bicycles.length,18);assert.equal(p.scooters.length,14);assert.equal(p.cabinets.length,3);
 for(const k of p.kiosks)assert.ok(p.safe(k.x,k.z,k.w,k.d));
 for(const k of p.bicycles)assert.ok(p.safe(k.x,k.z,.6,1.9));
 for(const k of p.scooters)assert.ok(p.safe(k.x,k.z,.9,1.5));
 for(const k of [...p.kiosks,...p.bicycles,...p.scooters,...p.cabinets])assert.ok(k.z>80,'south edge, not cathedral stairs');
 let draws=0;p.group.traverse(o=>{if(o.isMesh){draws++;assert.ok([...o.geometry.attributes.position.array].every(Number.isFinite));}});assert.ok(draws<=16);
 // Kiosks, cabinets and one small fixed dock post per bike are solid; the bikes and scooters themselves are knockable.
 assert.equal(p.obstacles.length,15+p.bicycles.length);
 assert.equal(p.knockables.snapshot().count,p.bicycles.length+p.scooters.length);
});

test('Senate parked bikes and scooters fly when the car hits them, then respawn',()=>{
 const p=createSenateStreetProps(city);
 for(const item of [p.bicycles[4],p.scooters[3]]){
  // Approach from the Aleksanterinkatu side (south, +z) at ~30 km/h, heading north.
  const car=makeCar(item.x,item.z+6,0);car.speed=8.5;let peak=0;
  const body=p.knockables.bodies.find(b=>b.id===item.id);
  for(let t=0;t<3;t+=1/60){car.z-=car.speed/60;p.knockables.step(1/60,car,null);peak=Math.max(peak,body.y);}
  assert.ok(body.knocked&&peak>.3,`${item.id} knocked into the air`);
  assert.ok(Math.hypot(body.x-item.x,body.z-item.z)>2,`${item.id} thrown clear`);
  car.x+=500;for(let t=0;t<70;t+=1/30)p.knockables.step(1/30,car,null);assert.equal(body.knocked,false,'respawned once the car is far away');
 }
});

}
