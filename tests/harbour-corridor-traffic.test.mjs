import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {Mobility} from '../src/mobility.js';
import {SpatialIndex} from '../src/geo.js';
import {correctHarbourLanes,harbourCorridor,HARBOUR_CORRIDOR_CARS} from '../src/road-safety.js';
import {HARBOUR_START} from '../src/demo-route.js';
import {makeCar} from '../src/physics.js';
import {trafficFootprintsOverlap} from '../src/road-safety.js';
if (true) {
 test('Finland city pack', {skip: 'Finland city is not part of this build'}, () => {});
} else {
const network=JSON.parse(readFileSync('public/data/mobility.json'));
const city=JSON.parse(gunzipSync(readFileSync('public/data/city.pack')));
const world={buildings:new SpatialIndex(city.buildings),roads:new SpatialIndex(city.roads.filter(r=>!/Koroke/.test(r.kind))),pavement:new SpatialIndex(city.pavement),water:city.water};
function seeded(){let n=91;return ()=>{n=(1664525*n+1013904223)>>>0;return n/4294967296;};}

test('Olympia–Kauppatori corridor gets its own traffic, in both directions',()=>{
  const corridor=harbourCorridor(world.roads),player=makeCar(HARBOUR_START.x,HARBOUR_START.z,HARBOUR_START.heading);
  const m=new Mobility(correctHarbourLanes(network),world,{corridorCars:HARBOUR_CORRIDOR_CARS,corridor,random:seeded()});
  assert.ok(m.corridorEdges.length>40);
  m.reset(player);for(let i=0;i<600;i++)m.step(1/30,player);
  const pool=m.cars.filter(c=>c.corridorOnly&&c.edge);
  assert.ok(pool.length>=HARBOUR_CORRIDOR_CARS*.7,`only ${pool.length} corridor cars active`);
  const onCorridor=m.cars.filter(c=>c.edge&&corridor(c.x,c.z));
  // Both directions: headings split into roughly northbound and southbound groups.
  const north=onCorridor.filter(c=>Math.cos(c.heading)>.3).length,south=onCorridor.filter(c=>Math.cos(c.heading)<-.3).length;
  assert.ok(north>=5&&south>=5,`north ${north}, south ${south}`);
  for(const a of m.cars)for(const b of m.cars)if(a!==b&&a.edge&&b.edge)assert.equal(trafficFootprintsOverlap(a,b),false);
});

test('corridor cars stand down when the player is elsewhere in the city',()=>{
  const m=new Mobility(correctHarbourLanes(network),world,{corridorCars:10,corridor:harbourCorridor(world.roads),random:seeded()});
  const far=makeCar(-700,-600,0);m.reset(far);for(let i=0;i<60;i++)m.step(1/30,far);
  assert.equal(m.cars.filter(c=>c.corridorOnly&&c.edge).length,0);
});

test('dense corridor traffic does not gridlock: nearly every car near the player keeps moving',()=>{
  // Regression: dead ends, merging-lane standoffs and head-on/junction deadlocks used to freeze ~70% of nearby cars.
  const p=makeCar(96,246.8,-Math.PI/2),m=new Mobility(correctHarbourLanes(network),world,{corridorCars:HARBOUR_CORRIDOR_CARS,corridor:harbourCorridor(world.roads),random:seeded()});
  // Like the chase camera: a 60° cone ahead within 300 m counts as seen (cars may spawn behind the player).
  m.visibilityTest=a=>{const dx=a.x-p.x,dz=a.z-p.z,d=Math.hypot(dx,dz);return d<300&&(-dx*Math.sin(p.heading)-dz*Math.cos(p.heading))/d>.5;};
  m.reset(p);for(let i=0;i<60*30;i++)m.step(1/30,p);
  const before=new Map(m.cars.map(c=>[c.id,{x:c.x,z:c.z,edge:c.edge}]));
  for(let i=0;i<30*30;i++)m.step(1/30,p);
  const near=m.cars.filter(c=>c.edge&&Math.hypot(c.x-p.x,c.z-p.z)<250),frozen=near.filter(c=>{const b=before.get(c.id);return b.edge&&Math.hypot(c.x-b.x,c.z-b.z)<3;});
  assert.ok(near.length>30,`only ${near.length} cars within 250 m`);
  assert.ok(frozen.length/near.length<.1,`${frozen.length} of ${near.length} cars stood still for 30 s`);
});

test('cars in view never pop in, jump sideways or snap their heading',()=>{
  // Regression for "cars lagging all over the place": spawns in the camera cone, instant lane-offset flips at
  // polyline corners and junction nodes, and 1.8 m sideways snaps when swerving off tram rails.
  const p=makeCar(HARBOUR_START.x,HARBOUR_START.z,HARBOUR_START.heading);
  const m=new Mobility(correctHarbourLanes(network),world,{corridorCars:HARBOUR_CORRIDOR_CARS,corridor:harbourCorridor(world.roads),random:seeded()});
  const inView=a=>{const dx=a.x-p.x,dz=a.z-p.z,d=Math.hypot(dx,dz);return d<300&&(-dx*Math.sin(p.heading)-dz*Math.cos(p.heading))/d>.5;};
  m.visibilityTest=inView;m.reset(p);
  const prev=new Map();let appear=0,lateral=0,snap=0;
  for(let t=0;t<60*60;t++){
    p.speed=8;p.x-=Math.sin(p.heading)*p.speed/60;p.z-=Math.cos(p.heading)*p.speed/60;
    m.step(1/60,p);
    for(const c of m.cars){const q=prev.get(c.id),vis=!!c.edge&&inView(c);
      if(q&&q.edge&&c.edge&&vis&&q.vis){const d=Math.hypot(c.x-q.x,c.z-q.z);
        if(d>3)appear++;else{const fx=-Math.sin(q.heading),fz=-Math.cos(q.heading);if(Math.abs((c.x-q.x)*fz-(c.z-q.z)*fx)>.25)lateral++;}
        if(Math.abs(Math.atan2(Math.sin(c.heading-q.heading),Math.cos(c.heading-q.heading)))>.35)snap++;}
      else if(q&&!q.vis&&vis&&(!q.edge||Math.hypot(c.x-q.x,c.z-q.z)>5))appear++;
      prev.set(c.id,{x:c.x,z:c.z,heading:c.heading,edge:!!c.edge,vis});}
  }
  assert.equal(appear,0,'no car appears inside the camera cone');
  assert.ok(lateral<=1,`${lateral} sideways jumps`);assert.ok(snap<=1,`${snap} heading snaps`);
});

}
