#!/usr/bin/env node
// Crop Prague mobility to the playable disk and thin polylines so the JSON
// stays under Cloudflare Pages' 25 MiB free-plan file limit.
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {stripBoredTunnels} from '../src/passage.js';

const RADIUS=3300; // playable 3200 + margin
const RADIUS2=RADIUS*RADIUS;
const LIMIT=24*1024*1024;
const OUT='public/cities/prague/mobility.json';

const city=JSON.parse(gunzipSync(fs.readFileSync('public/cities/prague/city.pack')).toString());
const mobility=JSON.parse(fs.readFileSync(OUT,'utf8'));
const stripped=stripBoredTunnels(city,mobility,{all:true}).mobility;

function roundPt(p,n=1){return [+p[0].toFixed(n),+p[1].toFixed(n)];}
function simplifyPoints(pts){
 if(!pts||pts.length<=2)return (pts||[]).map(p=>roundPt(p,1));
 const out=[pts[0]];
 for(let i=1;i<pts.length-1;i++){
  const a=out[out.length-1],b=pts[i],c=pts[i+1];
  const d=Math.hypot(b[0]-a[0],b[1]-a[1]);
  const ang=Math.abs(Math.atan2(b[1]-a[1],b[0]-a[0])-Math.atan2(c[1]-b[1],c[0]-b[0]));
  if(d>28||Math.min(ang,Math.PI*2-ang)>0.3)out.push(b);
 }
 out.push(pts[pts.length-1]);
 return out.map(p=>roundPt(p,1));
}
function slimEdge(e){
 const out={from:e.from,to:e.to,points:simplifyPoints(e.points),length:Math.round((e.length||0)*10)/10};
 if(e.lane)out.lane=e.lane;
 if(e.crossing)out.crossing=e.crossing;
 if(e.signal)out.signal=e.signal;
 return out;
}
function edgeInDisk(e){
 for(const p of e.points||[])if(p[0]*p[0]+p[1]*p[1]<=RADIUS2)return true;
 return false;
}
function remapGraph(nodes,edges){
 const remap=new Map(),newNodes=[];
 const take=i=>{
  if(remap.has(i))return remap.get(i);
  const n=newNodes.length;
  remap.set(i,n);
  newNodes.push(roundPt(nodes[i]||[0,0],1));
  return n;
 };
 for(const e of edges){take(e.from);take(e.to);}
 return {nodes:newNodes,edges:edges.map(e=>({...e,from:remap.get(e.from),to:remap.get(e.to)}))};
}

const roads=remapGraph(stripped.roads.nodes,stripped.roads.edges.filter(edgeInDisk).map(slimEdge));
const walks=remapGraph(stripped.walks.nodes,stripped.walks.edges.filter(edgeInDisk).map(slimEdge));
const out={
 source:stripped.source,
 note:'Prague mobility for the 3.2 km disk. Underground tunnels removed; edges outside the playable radius dropped; polylines thinned for the 25 MiB static host limit.',
 signals:stripped.signals||[],
 roads:{nodes:roads.nodes,edges:roads.edges},
 walks:{nodes:walks.nodes,edges:walks.edges},
};
const json=JSON.stringify(out);
const bytes=Buffer.byteLength(json);
if(bytes>=LIMIT){
 console.error(`mobility still ${bytes} bytes; need under ${LIMIT}`);
 process.exit(1);
}
fs.writeFileSync(OUT,json);
console.log(JSON.stringify({
 file:OUT,bytes,MB:+(bytes/1e6).toFixed(3),
 roadEdges:roads.edges.length,walkEdges:walks.edges.length,
 roadNodes:roads.nodes.length,walkNodes:walks.nodes.length,
},null,2));
