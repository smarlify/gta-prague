// node scripts/prague-drive-audit.mjs [--json out.json] [--top n]
// Drives every traffic lane of Prague with the game's own height and collision rules and reports
//  - steps: places where the drive height jumps (a wall or a drop in the road),
//  - stops: places where the player car's footprint is stopped by a building or by water,
//  - bare:  lane with no road or pavement polygon under it.
// It builds the same world as src/main.js does through src/prague-ground.js, so a change to the
// bridge, tunnel or passage rules shows up here before it is tried in the browser.
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {SpatialIndex,setPlayableRadius} from '../src/geo.js';
import {decodeTerrain,setTerrain,driveAt,groundAt} from '../src/terrain.js';
import {blocksDriveSample,sampleStopsForWater,carSamples} from '../src/physics.js';
import {setupPragueWorld} from '../src/prague-ground.js';

const dir='public/cities/prague',arg=name=>{const i=process.argv.indexOf(name);return i>0?process.argv[i+1]:null;};
const top=+(arg('--top')||14);
let city=JSON.parse(gunzipSync(fs.readFileSync(`${dir}/city.pack`))),mobility=JSON.parse(fs.readFileSync(`${dir}/mobility.json`));
setTerrain(decodeTerrain(gunzipSync(fs.readFileSync(`${dir}/terrain.pack`))));
setPlayableRadius(city.radius||2400);
const setup=setupPragueWorld(city,mobility);city=setup.data;mobility=setup.mobility;
const world=setup.world({buildings:new SpatialIndex(city.buildings)});
const radius=city.radius||2400;
const steps=[],stops=new Map(),bare=[];
let metres=0;
for(const [lane,edge] of mobility.roads.edges.entries()){
 let previous=null,run=null;
 const close=()=>{if(run&&run.metres>=4)bare.push(run);run=null;};
 for(let i=0;i<edge.points.length-1;i++){
  const [ax,az]=edge.points[i],[bx,bz]=edge.points[i+1],length=Math.hypot(bx-ax,bz-az),n=Math.max(1,Math.round(length)),heading=Math.atan2(-(bx-ax),-(bz-az));
  for(let s=0;s<n;s++){
   const t=s/n,x=ax+(bx-ax)*t,z=az+(bz-az)*t;
   if(Math.hypot(x,z)>radius-8){previous=null;close();continue;}
   metres+=length/n;
   const h=driveAt(x,z);
   if(previous!==null){const rise=h-previous.h,run1=Math.hypot(x-previous.x,z-previous.z)||1;if(Math.abs(rise)/run1>.3&&Math.abs(rise)>.3)steps.push({lane,at:[+x.toFixed(1),+z.toFixed(1)],rise:+rise.toFixed(2),name:(world.roads.at(x,z)||world.pavement.at(x,z))?.name||''});}
   previous={x,z,h};
   const car={x,z,heading},samples=carSamples(car);
   const hit=samples.some(([px,pz])=>blocksDriveSample(px,pz,world))?'building':samples.some(([px,pz])=>sampleStopsForWater(px,pz,world))?'water':null;
   if(hit){const b=hit==='building'?samples.map(([px,pz])=>world.collisionBuildings.at(px,pz)).find(Boolean):null,key=b?b.id:`water@${Math.round(x/20)*20},${Math.round(z/20)*20}`;
    const item=stops.get(key)||{kind:hit,id:b?.id||'',name:b?.name||'',height:b?.height,metres:0,lanes:new Set(),at:[+x.toFixed(1),+z.toFixed(1)]};item.metres+=length/n;item.lanes.add(lane);stops.set(key,item);}
   if(!world.roads.at(x,z)&&!world.pavement.at(x,z)){if(!run)run={lane,at:[+x.toFixed(1),+z.toFixed(1)],metres:0};run.metres+=length/n;}else close();
  }
 }
 close();
}
const stopList=[...stops.values()].map(s=>({...s,metres:+s.metres.toFixed(1),lanes:s.lanes.size})).sort((a,b)=>b.metres-a.metres);
const sum=list=>Math.round(list.reduce((n,r)=>n+r.metres,0));
steps.sort((a,b)=>Math.abs(b.rise)-Math.abs(a.rise));bare.sort((a,b)=>b.metres-a.metres);
const report={lanes:mobility.roads.edges.length,metres:Math.round(metres),steps:{count:steps.length,over1m:steps.filter(s=>Math.abs(s.rise)>1).length,worst:steps[0]?.rise||0},stops:{buildings:stopList.filter(s=>s.kind==='building').length,buildingMetres:sum(stopList.filter(s=>s.kind==='building')),water:stopList.filter(s=>s.kind==='water').length,waterMetres:sum(stopList.filter(s=>s.kind==='water'))},bare:{runs:bare.length,metres:sum(bare)}};
console.log(JSON.stringify(report));
const out=arg('--json');
if(out)fs.writeFileSync(out,JSON.stringify({report,steps,stops:stopList,bare},null,1));
else{
 for(const s of steps.slice(0,top))console.log(' step',String(s.rise).padStart(6),'m at',s.at.join(','),s.name);
 for(const s of stopList.slice(0,top))console.log(' stop',s.kind,s.metres,'m',s.lanes,'lanes',s.id,JSON.stringify(s.name),'at',s.at.join(','));
 for(const s of bare.slice(0,top))console.log(' bare',s.metres.toFixed(0),'m lane',s.lane,'at',s.at.join(','));
}
