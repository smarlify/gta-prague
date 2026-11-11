import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {decodeTerrain,setTerrain,groundAt,driveAt} from '../src/terrain.js';
import {setupPragueWorld,pragueDry} from '../src/prague-ground.js';
import {isBridgeSurface} from '../src/passage.js';
import {pointInPolygon} from '../src/geo.js';
const dir='public/cities/prague';
let city=JSON.parse(gunzipSync(fs.readFileSync(`${dir}/city.pack`)));
setTerrain(decodeTerrain(gunzipSync(fs.readFileSync(`${dir}/terrain.pack`))));
const setup=setupPragueWorld(city,JSON.parse(fs.readFileSync(`${dir}/mobility.json`)));city=setup.data;setup.world();
const items=[...city.roads,...city.pavement].filter(isBridgeSurface);
// per polygon: interior samples; ground range; lowest ground vs highest ground => dips
const byName=new Map();
for(const it of items){const b=it.bbox;if(Math.hypot((b[0]+b[2])/2,(b[1]+b[3])/2)>2380)continue;const g=[];let wet=0;
 for(let x=b[0];x<=b[2];x+=2)for(let z=b[1];z<=b[3];z+=2)if(pointInPolygon(x,z,it.rings)){g.push(groundAt(x,z));if(pragueDry.inChannel(x,z))wet++;}
 if(!g.length)continue;const key=(it.name||'(unnamed)')+' / '+it.kind;const r=byName.get(key)||{n:0,min:Infinity,max:-Infinity,wet:0,polys:0,at:[Math.round(b[0]),Math.round(b[1])]};
 r.n+=g.length;r.min=Math.min(r.min,...g);r.max=Math.max(r.max,...g);r.wet+=wet;r.polys++;byName.set(key,r);}
const rows=[...byName.entries()].sort((a,b)=>b[1].n-a[1].n);
for(const [k,r] of rows.slice(0,60))console.log(k.padEnd(52),'polys',String(r.polys).padStart(3),'samples',String(r.n).padStart(5),'ground',r.min.toFixed(1),'..',r.max.toFixed(1),'wet',r.wet,'at',r.at.join(','));
