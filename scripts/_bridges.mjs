import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {decodeTerrain,setTerrain,groundAt,driveAt} from '../src/terrain.js';
import {setupPragueWorld,pragueDry} from '../src/prague-ground.js';
import {isBridgeSurface} from '../src/passage.js';
const dir='public/cities/prague';
let city=JSON.parse(gunzipSync(fs.readFileSync(`${dir}/city.pack`))),mobility=JSON.parse(fs.readFileSync(`${dir}/mobility.json`));
setTerrain(decodeTerrain(gunzipSync(fs.readFileSync(`${dir}/terrain.pack`))));
const setup=setupPragueWorld(city,mobility);city=setup.data;const world=setup.world();
// For every lane, find runs on bridge surfaces; print ground profile and deck profile.
const rows=new Map();
for(const [lane,e] of setup.mobility.roads.edges.entries()){
 let run=null;const flush=()=>{if(run&&run.pts.length>12){const g=run.pts.map(p=>p.g),d=run.pts.map(p=>p.d);const name=run.name||'?';const key=name+'@'+Math.round(run.pts[0].x/150)+','+Math.round(run.pts[0].z/150);
   const row={name,len:run.pts.length,at:[Math.round(run.pts[0].x),Math.round(run.pts[0].z)],gEnds:[g[0],g.at(-1)].map(v=>+v.toFixed(1)),gMin:+Math.min(...g).toFixed(1),gMax:+Math.max(...g).toFixed(1),dMin:+Math.min(...d).toFixed(1),dMax:+Math.max(...d).toFixed(1),wet:run.pts.filter(p=>p.w).length,gStep:+Math.max(...g.slice(1).map((v,i)=>Math.abs(v-g[i]))).toFixed(2)};
   if(!rows.has(key)||rows.get(key).len<row.len)rows.set(key,row);}run=null;};
 for(let i=0;i<e.points.length-1;i++){const [ax,az]=e.points[i],[bx,bz]=e.points[i+1],L=Math.hypot(bx-ax,bz-az),n=Math.max(1,Math.round(L));
  for(let s=0;s<n;s++){const x=ax+(bx-ax)*s/n,z=az+(bz-az)*s/n;if(Math.hypot(x,z)>2390){flush();continue;}const surf=world.roads.at(x,z)||world.pavement.at(x,z);
   if(surf&&isBridgeSurface(surf)){if(!run)run={name:surf.name,pts:[]};if(!run.name&&surf.name)run.name=surf.name;run.pts.push({x,z,g:groundAt(x,z),d:driveAt(x,z),w:pragueDry.inChannel(x,z)});}else flush();}}
 flush();
}
const list=[...rows.values()].sort((a,b)=>b.len-a.len);
console.log('bridge runs',list.length);
for(const r of list.slice(0,45))console.log(String(r.len).padStart(4),'m',r.name.padEnd(28),'at',String(r.at).padEnd(12),'ground ends',r.gEnds.join('/'),'min',r.gMin,'max',r.gMax,'maxstep',r.gStep,'| deck',r.dMin,'..',r.dMax,'| wet',r.wet);
