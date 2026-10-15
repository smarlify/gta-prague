import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import proj4 from 'proj4';
import {SpatialIndex,segmentDistance} from '../src/geo.js';
import {correctHarbourLanes} from '../src/road-safety.js';
import {crossingChains} from '../src/crossing-markings.js';
import {makeCar} from '../src/physics.js';
import {planParkedMicromobility,createParkedMicromobility,CITY_BIKE_STATIONS,SCOOTER_SPOTS,OPERATORS,scooterGeometry,cityBikeGeometry,micromobilityMaterial,MICROMOBILITY_VIEW_RANGE,DOCK_SPACING} from '../src/parked-micromobility.js';
import {nearRoute} from '../src/street-furniture.js';
if (!existsSync('public/data')) {
 test('local city pack', {skip: 'local Helsinki or Tampere fixture is not in this checkout'}, () => {});
} else {
const city=JSON.parse(gunzipSync(readFileSync('public/data/city.pack')));
const mobility=correctHarbourLanes(JSON.parse(readFileSync('public/data/mobility.json')));
const trams=JSON.parse(readFileSync('public/data/trams.json'));
// Budget the planner by this process's CPU time, not wall time: npm test runs files in parallel, and on a busy
// machine wall time measured several seconds for a plan that costs under one second of CPU.
const cpu0=process.cpuUsage(),plan=planParkedMicromobility(city,mobility,trams,{obstacles:[]}),cpu=process.cpuUsage(cpu0),planMs=(cpu.user+cpu.system)/1000;
const roads=new SpatialIndex(city.roads.filter(p=>!/Koroke/.test(p.kind))),pavement=new SpatialIndex(city.pavement),buildings=new SpatialIndex(city.buildings);
const walkable=(x,z)=>{const p=pavement.at(x,z);return !!p&&!/pyör|Pyör|Portaat/.test(p.kind)&&!roads.at(x,z)&&!buildings.at(x,z);};
const simulate=(k,car,world,seconds,dt=1/60)=>{for(let t=0;t<seconds;t+=dt){if(car){car.x-=Math.sin(car.heading)*car.speed*dt;car.z-=Math.cos(car.heading)*car.speed*dt;}k.step(dt,car,world);}k.update();};

test('city-bike station game coordinates are the HSL WGS84 positions in the city GK25 frame',()=>{
 const gk25=proj4('EPSG:4326','+proj=tmerc +lat_0=0 +lon_0=25 +k=1 +x_0=25500000 +y_0=0 +ellps=GRS80 +units=m +no_defs'),origin=gk25.forward([24.9522,60.1701]);
 for(const s of CITY_BIKE_STATIONS){const c=gk25.forward([s.lon,s.lat]);assert.ok(Math.abs(c[0]-origin[0]-s.x)<.15&&Math.abs(origin[1]-c[1]-s.z)<.15,`${s.name} projected position`);assert.ok(s.capacity>=10&&s.capacity<=60);}
 assert.ok(CITY_BIKE_STATIONS.length>=10);
 // Every selected station and scooter spot is close to the demo route corridor (Esplanadi/Kamppi stations are the far edge).
 for(const s of [...CITY_BIKE_STATIONS,...SCOOTER_SPOTS])assert.ok(nearRoute(s.x,s.z,230),`${s.name} is near the route`);
});

test('every station and scooter cluster is placed, on walkable mapped pavement only, within its snap radius',()=>{
 assert.deepEqual(plan.omitted,[]);
 assert.equal(plan.stations.length,CITY_BIKE_STATIONS.length);assert.equal(plan.clusters.length,SCOOTER_SPOTS.length);
 assert.ok(plan.bikes.length>100&&plan.scooters.length>=40,`${plan.bikes.length} bikes, ${plan.scooters.length} scooters`);
 for(const s of plan.stations){
  assert.ok(s.snapped<=30,`${s.name} snapped ${s.snapped} m`);assert.ok(s.fitted>=6&&s.fitted<=s.capacity);assert.equal(s.docks.length,s.fitted);
  for(const d of s.docks)assert.ok(walkable(d.x,d.z),`${s.name} dock on pavement`);
  for(const b of s.bikes)for(const t of [0,.5,1]){const x=b.x-Math.sin(b.yaw)*(.56-t*1.12)*-1,z=b.z-Math.cos(b.yaw)*(.56-t*1.12)*-1;assert.ok(walkable(x,z),`${s.name} bike body on pavement`);}
  if(s.totem)assert.ok(walkable(s.totem.x,s.totem.z));
  assert.ok(s.bikes.length>=3&&s.bikes.length<=s.docks.length);
  for(let i=1;i<s.docks.length;i++)assert.ok(Math.abs(Math.hypot(s.docks[i].x-s.docks[i-1].x,s.docks[i].z-s.docks[i-1].z)-DOCK_SPACING)<1e-6,'docks evenly spaced');
 }
 for(const c of plan.clusters){
  assert.ok(c.snapped<=16);assert.ok(c.scooters.length>=2&&c.scooters.length<=6);
  for(const s of c.scooters){assert.ok(walkable(s.x,s.z),`${c.id} scooter on pavement`);assert.ok(OPERATORS.some(o=>o.name===s.operator&&o.accent===s.accent));}
 }
 assert.ok(planMs<1500,`planning took ${Math.round(planMs)} ms of CPU`);
});

test('rows keep clear of crossings, NPC lanes, tram rails and each other',()=>{
 const chains=crossingChains(mobility.walks.edges);
 const nearCrossing=(x,z,m)=>chains.some(c=>c.points.some((b,i)=>i&&segmentDistance(x,z,c.points[i-1],b)<m));
 const rails=trams.paths.flatMap(p=>p.points.map((b,i)=>i?[p.points[i-1],b]:null).filter(Boolean));
 const lanes=mobility.roads.edges.flatMap(e=>{const lane=e.lane||0;return e.points.map((b,i)=>{if(!i)return null;const a=e.points[i-1],l=Math.hypot(b[0]-a[0],b[1]-a[1]);if(!l)return null;const dx=(b[0]-a[0])/l,dz=(b[1]-a[1])/l;return [[a[0]-dz*lane,a[1]+dx*lane],[b[0]-dz*lane,b[1]+dx*lane]];}).filter(Boolean);});
 const points=[...plan.stations.flatMap(s=>s.docks),...plan.scooters];
 for(const p of points){
  assert.ok(!nearCrossing(p.x,p.z,3.4),'off crossings');
  assert.ok(!rails.some(([a,b])=>segmentDistance(p.x,p.z,a,b)<1.5),'off tram rails');
  assert.ok(!lanes.some(([a,b])=>segmentDistance(p.x,p.z,a,b)<1.9),'clear of the lane traffic drives');
 }
 const all=[...plan.bikes,...plan.scooters];
 for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++)assert.ok(Math.hypot(all[i].x-all[j].x,all[i].z-all[j].z)>=.55,'no two parked items share a spot');
});

test('obstacles passed in (and furniture to avoid) move a row elsewhere or omit it',()=>{
 const s=plan.stations[1],ring=[[s.x-40,s.z-40],[s.x+40,s.z-40],[s.x+40,s.z+40],[s.x-40,s.z+40]];
 const blocked=planParkedMicromobility(city,mobility,trams,{obstacles:[{id:'blocker',rings:[ring]}],stations:[CITY_BIKE_STATIONS[1]],spots:[]});
 assert.equal(blocked.stations.length,0);assert.equal(blocked.omitted[0]?.id,CITY_BIKE_STATIONS[1].id);
 const c=plan.clusters[0],avoid=c.scooters.map(p=>({x:p.x,z:p.z,r:1}));
 const moved=planParkedMicromobility(city,mobility,trams,{avoid,stations:[],spots:[SCOOTER_SPOTS[0]]});
 assert.ok(!moved.clusters.length||moved.clusters[0].scooters.every(p=>avoid.every(a=>Math.hypot(a.x-p.x,a.z-p.z)>.9)));
});

test('nearby long dock rows retain their clearance across spatial cells',()=>{
 const plaza={roads:[],buildings:[],pavement:[{kind:'Jalkakäytävä',rings:[[[-80,-80],[80,-80],[80,80],[-80,80]]]}]};
 const routes={roads:{edges:[{points:[[-80,-40],[80,-40]]}]},walks:{edges:[]}};
 const stations=['first','second'].map(id=>({id,name:id,x:15.8,z:15.8,capacity:48}));
 const result=planParkedMicromobility(plaza,routes,null,{stations,spots:[]});
 assert.deepEqual(result.omitted,[]);assert.equal(result.stations.length,2);
 const [first,second]=result.stations,a=first.docks[0],b=first.docks.at(-1);
 assert.equal(first.docks.length,48);assert.equal(second.docks.length,48);
 assert.ok(Math.hypot(b.x-a.x,b.z-a.z)>32,'the first row spans several index cells');
 for(const dock of second.docks)assert.ok(segmentDistance(dock.x,dock.z,[a.x,a.z],[b.x,b.z])>=2.9,'the next station stays outside the full row clearance');
});

test('geometry is cheap and the material mixes the operator colour through the paint mask',()=>{
 for(const [g,limit] of [[scooterGeometry(),400],[cityBikeGeometry(),1400]]){assert.ok(g.attributes.position.count/3<limit,`${g.attributes.position.count/3} triangles`);assert.ok(g.attributes.paint&&g.attributes.color&&g.attributes.normal);}
 const paint=[...scooterGeometry().attributes.paint.array];assert.ok(paint.includes(1)&&paint.includes(0));
 assert.ok(![...cityBikeGeometry().attributes.paint.array].includes(1),'city bikes are plain yellow, never operator-coloured');
 const shader={vertexShader:'#include <color_vertex>',fragmentShader:''};micromobilityMaterial().onBeforeCompile(shader);assert.match(shader.vertexShader,/mix\(color\.rgb,instanceColor\.rgb,paint\)/);
});

test('a bike flies out of its dock when hit, rests on its side, the dock row stays solid, and it respawns later',()=>{
 const scene=createParkedMicromobility(city,mobility,trams,{obstacles:[]});
 const station=scene.plan.stations.find(s=>s.name==='Senaatintori'),bike=station.bikes[0];
 assert.ok(scene.obstacles.some(o=>o.name===`${station.name} city bike docks`));assert.ok(scene.plan.stations.filter(s=>s.totem).length>=scene.plan.stations.length-2,'nearly every station has its terminal pillar');
 assert.equal(scene.knockables.bodies.length,scene.plan.bikes.length+scene.plan.scooters.length);
 // Drive along the bike's own heading from 6 m behind it at ~30 km/h.
 const car=makeCar(bike.x+Math.sin(bike.yaw)*6,bike.z+Math.cos(bike.yaw)*6,bike.yaw);car.speed=8.5;
 const body=scene.knockables.bodies.find(b=>b.id===bike.id);
 let peak=0;for(let t=0;t<1.2;t+=1/60){car.x-=Math.sin(car.heading)*car.speed/60;car.z-=Math.cos(car.heading)*car.speed/60;scene.knockables.step(1/60,car,null);peak=Math.max(peak,body.y);}
 assert.ok(body.knocked,'bike kicked out of the dock');assert.ok(peak>.3,'lifted');
 car.speed=0;simulate(scene.knockables,car,null,8);
 assert.ok(body.resting&&body.y===0);assert.ok(Math.hypot(body.x-bike.x,body.z-bike.z)>3,'displaced more than 3 m');
 assert.ok(Math.abs(Math.abs(body.tilt%Math.PI)-Math.PI/2)<.03,'lies on its side');
 assert.ok(scene.knockables.snapshot().knocked>=1);
 car.x+=500;simulate(scene.knockables,car,null,61);assert.equal(body.knocked,false);assert.ok(Math.hypot(body.x-bike.x,body.z-bike.z)<1e-9,'back in its dock');
});

test('driving through a scooter cluster scatters it; distant sites are hidden but still simulated',()=>{
 const scene=createParkedMicromobility(city,mobility,trams,{obstacles:[]});
 const cluster=scene.plan.clusters.find(c=>c.id==='kauppatori-edge'),mid=cluster.scooters[Math.floor(cluster.scooters.length/2)];
 const yaw=Math.atan2(cluster.scooters.at(-1).x-cluster.scooters[0].x,cluster.scooters.at(-1).z-cluster.scooters[0].z)+Math.PI;
 const car=makeCar(mid.x+Math.sin(yaw)*8,mid.z+Math.cos(yaw)*8,yaw);car.speed=9;
 simulate(scene.knockables,car,null,1.6);
 const bodies=cluster.scooters.map(s=>scene.knockables.bodies.find(b=>b.id===s.id));
 assert.ok(bodies.filter(b=>b.knocked).length>=cluster.scooters.length-1,'most of the cluster is knocked');
 car.speed=0;simulate(scene.knockables,car,null,8);
 assert.ok(bodies.filter(b=>Math.hypot(b.x-b.home.x,b.z-b.home.z)>1.5).length>=2,'scooters scattered');
 const site=scene.sites.find(s=>s.knockables.bodies.includes(bodies[0]));assert.ok(site.group.visible);
 const far=scene.sites.find(s=>Math.hypot(s.x-car.x,s.z-car.z)>MICROMOBILITY_VIEW_RANGE);assert.ok(far&&!far.group.visible,'sites beyond the view range are hidden');
 let meshes=0;scene.group.traverse(o=>{if(o.isMesh)meshes++;});assert.ok(meshes<=scene.plan.stations.length*2+scene.plan.clusters.length,'one instanced mesh per knockable site plus one static mesh per station');
 scene.knockables.resetAll();assert.ok(bodies.every(b=>!b.knocked));
});

}
