// node scripts/prague-audit.mjs [--json out.json]
// Offline audit of the Prague pack: follows every traffic lane and reports where a car on it would
// be stopped. A lane point is "blocked" when a building footprint covers it and no passage carries
// the road through, "off-road" when no road or pavement polygon lies under it, and "wet" when it is
// over water with no deck. Run it before and after changing the pack or the passage rules.
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {SpatialIndex} from '../src/geo.js';

const dir='public/cities/prague';
const city=JSON.parse(gunzipSync(fs.readFileSync(`${dir}/city.pack`)));
const mobility=JSON.parse(fs.readFileSync(`${dir}/mobility.json`));
const playable=city.radius||2400;
const buildings=new SpatialIndex(city.buildings),roads=new SpatialIndex(city.roads),pavement=new SpatialIndex(city.pavement),water=new SpatialIndex(city.water);
const tunnels=new SpatialIndex(city.roads.filter(r=>r.passage!==undefined)),bridges=new SpatialIndex([...city.roads,...city.pavement].filter(r=>/Silta/.test(r.kind)));
const report={lanes:0,samples:0,blocked:[],offRoad:[],wet:[]};
const runs={blocked:new Map(),offRoad:[],wet:[]};
for(const [index,edge] of mobility.roads.edges.entries()){
 report.lanes++;
 let run=null;
 const flush=()=>{if(!run)return;const length=run.to-run.from;if(run.kind==='blocked'){const k=run.building.id;const item=runs.blocked.get(k)||{building:run.building.id,name:run.building.name||'',height:run.building.height,metres:0,lanes:new Set(),at:run.at,tunnel:0};item.metres+=length;item.lanes.add(index);item.tunnel+=run.tunnel;runs.blocked.set(k,item);}else runs[run.kind].push({lane:index,metres:+length.toFixed(1),at:run.at});run=null;};
 let travelled=0;
 for(let i=0;i<edge.points.length-1;i++){
  const [ax,az]=edge.points[i],[bx,bz]=edge.points[i+1],segment=Math.hypot(bx-ax,bz-az),steps=Math.max(1,Math.ceil(segment/2));
  for(let s=0;s<steps;s++){
   const t=s/steps,x=ax+(bx-ax)*t,z=az+(bz-az)*t,at=travelled+segment*t;
   if(Math.hypot(x,z)>playable-5)continue;
   report.samples++;
   const building=buildings.at(x,z),road=roads.at(x,z),walk=pavement.at(x,z),wet=water.at(x,z),tunnel=tunnels.at(x,z),bridge=bridges.at(x,z);
   const kind=building?'blocked':!road&&!walk?(wet?'wet':'offRoad'):wet&&!bridge&&!road?'wet':null;
   if(run&&(run.kind!==kind||(kind==='blocked'&&run.building!==building)))flush();
   if(kind){if(!run)run={kind,from:at,to:at,at:[+x.toFixed(1),+z.toFixed(1)],building,tunnel:0};run.to=at+2;if(tunnel)run.tunnel+=2;}
  }
  travelled+=segment;
 }
 flush();
}
report.blocked=[...runs.blocked.values()].map(b=>({...b,metres:+b.metres.toFixed(1),lanes:b.lanes.size,tunnel:+b.tunnel.toFixed(1)})).sort((a,b)=>b.metres-a.metres);
report.offRoad=runs.offRoad.filter(r=>r.metres>=6).sort((a,b)=>b.metres-a.metres);
report.wet=runs.wet.filter(r=>r.metres>=4).sort((a,b)=>b.metres-a.metres);
const sum=list=>+list.reduce((n,r)=>n+r.metres,0).toFixed(0);
console.log(`lanes ${report.lanes}, samples ${report.samples}`);
console.log(`blocked by buildings: ${report.blocked.length} buildings, ${sum(report.blocked)} m of lane (${sum(report.blocked.filter(b=>b.tunnel>0))} m of it on a mapped tunnel road)`);
console.log(`off any road or pavement: ${report.offRoad.length} runs, ${sum(report.offRoad)} m`);
console.log(`over water without a deck: ${report.wet.length} runs, ${sum(report.wet)} m`);
const out=process.argv.indexOf('--json');
if(out>0)fs.writeFileSync(process.argv[out+1],JSON.stringify(report,null,1));
else{for(const b of report.blocked.slice(0,25))console.log(' blocked',b.metres,'m',b.lanes,'lanes',b.building,JSON.stringify(b.name),'h',b.height,'tunnel',b.tunnel,'at',b.at.join(','));
 for(const r of report.offRoad.slice(0,12))console.log(' offRoad',r.metres,'m lane',r.lane,'at',r.at.join(','));
 for(const r of report.wet.slice(0,12))console.log(' wet',r.metres,'m lane',r.lane,'at',r.at.join(','));}
