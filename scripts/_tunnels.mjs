import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {decodeTerrain,setTerrain,groundAt} from '../src/terrain.js';
import {isDroppedTunnelRoad,isBoredTunnelRoad} from '../src/passage.js';
const dir='public/cities/prague';
const city=JSON.parse(gunzipSync(fs.readFileSync(`${dir}/city.pack`)));
setTerrain(decodeTerrain(gunzipSync(fs.readFileSync(`${dir}/terrain.pack`))));
const dropped=city.roads.filter(isDroppedTunnelRoad);
const ways=new Map();
for(const r of dropped){const id=r.id.split(':')[0];const w=ways.get(id)||{id,name:r.name,passage:r.passage,kind:r.kind,deck:r.deck,half:r.half,polys:0};w.polys++;ways.set(id,w);}
const list=[...ways.values()];
console.log('dropped polygons',dropped.length,'ways',list.length,'without deck (named approaches)',list.filter(w=>!w.deck).length);
// graph nodes by endpoint
const key=p=>Math.round(p[0]/3)+','+Math.round(p[1]/3);
const nodes=new Map();
for(const w of list.filter(w=>w.deck)){for(const end of [w.deck[0],w.deck.at(-1)]){const k=key(end);const n=nodes.get(k)||{p:end,ways:[]};n.ways.push(w);nodes.set(k,n);}}
// components
const comp=new Map();let c=0;
const adj=new Map();for(const w of list.filter(w=>w.deck)){const a=key(w.deck[0]),b=key(w.deck.at(-1));(adj.get(a)||adj.set(a,[]).get(a)).push(b);(adj.get(b)||adj.set(b,[]).get(b)).push(a);}
for(const k of nodes.keys()){if(comp.has(k))continue;c++;const stack=[k];while(stack.length){const q=stack.pop();if(comp.has(q))continue;comp.set(q,c);for(const o of adj.get(q)||[])stack.push(o);}}
const groups=new Map();
for(const w of list.filter(w=>w.deck)){const g=comp.get(key(w.deck[0]));const e=groups.get(g)||{ways:[],names:new Set(),length:0};e.ways.push(w);if(w.name)e.names.add(w.name);let L=0;for(let i=1;i<w.deck.length;i++)L+=Math.hypot(w.deck[i][0]-w.deck[i-1][0],w.deck[i][1]-w.deck[i-1][1]);e.length+=L;groups.set(g,e);}
for(const [g,e] of [...groups.entries()].sort((a,b)=>b[1].length-a[1].length)){
 const ends=[];for(const [k,n] of nodes){if(comp.get(k)!==g)continue;if(n.ways.length===1){const p=n.p;ends.push(`(${Math.round(p[0])},${Math.round(p[1])} r${Math.round(Math.hypot(p[0],p[1]))} deck ${p[2].toFixed(1)} gnd ${groundAt(p[0],p[1]).toFixed(1)})`);}}
 let maxDepth=0;for(const w of e.ways)for(const p of w.deck)maxDepth=Math.max(maxDepth,groundAt(p[0],p[1])-p[2]);
 console.log(`#${g} ${[...e.names].join('/')||'(unnamed)'} ways ${e.ways.length} length ${Math.round(e.length)} m kinds ${[...new Set(e.ways.map(w=>w.passage))]} maxDepthBelowGround ${maxDepth.toFixed(1)} portals ${ends.length}: ${ends.slice(0,8).join(' ')}`);
}
console.log('named approaches without deck:',list.filter(w=>!w.deck).map(w=>w.name+' '+w.kind).join(' | '));
