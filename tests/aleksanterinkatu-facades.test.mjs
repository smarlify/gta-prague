import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {analyseBuilding,createModelledBuilding} from '../src/building-detail.js';
import {ALEKSANTERINKATU_BUILDINGS,corridorBuilding,corridorFront,buildFacadePiece,createCorridorFacade} from '../src/aleksanterinkatu-facades.js';

function corridorParts(){
 const index=JSON.parse(readFileSync(new URL('../public/data/buildings3d-index.json',import.meta.url))),out=[];
 for(const t of index.tiles){
  const parts=t.parts.filter(p=>ALEKSANTERINKATU_BUILDINGS[p.ratu]);if(!parts.length)continue;
  const bytes=gunzipSync(readFileSync(new URL('../public/data/'+t.file,import.meta.url)));
  const array=new Float32Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/4);
  out.push({array,parts});
 }
 return out;
}
test('every authored corridor front plane matches a measured municipal wall face',{skip:'Finland city is not part of this build'},()=>{
 const matched=new Map();
 for(const {array,parts} of corridorParts())for(const part of parts)for(const f of analyseBuilding(array,part,null).faces){
  const front=corridorFront(ALEKSANTERINKATU_BUILDINGS[part.ratu],f);if(front)matched.set(front,(matched.get(front)||0)+1);
 }
 for(const [ratu,b] of Object.entries(ALEKSANTERINKATU_BUILDINGS))for(const front of b.fronts){
  if(front.d>1e5)continue; // courtyard-only parts deliberately have no street front
  assert.ok(matched.get(front),`RATU ${ratu} ${b.name}: front n=${front.n} d=${front.d} matches no measured face`);
 }
 // Authored planes are specific: the Government Palace and Sokos are untouched.
 for(const ratu of [5,405,216,23,211])assert.equal(corridorBuilding(ratu),null);
});
test('corridor buildings keep measured shells, lose atlas textures and stay within budget',{skip:'Finland city is not part of this build'},()=>{
 let triangles=0,windows=0;const seen=new Set();
 for(const {array,parts} of corridorParts())for(const part of parts){
  const result=createModelledBuilding(array,part,null,{isTexture:true},!seen.has(part.ratu));seen.add(part.ratu);
  const roles=result.meshes.map(m=>m.userData.role);
  for(const m of result.meshes){
   assert.equal(m.material.map,null,`RATU ${part.ratu} still carries a photo atlas`);
   assert.equal(!!m.userData.provisional,false,`RATU ${part.ratu} fell back to provisional bays`);
   const p=m.geometry.attributes.position.array;assert.ok(p.every(Number.isFinite));
   if(!m.userData.corridor)continue;
   m.geometry.computeBoundingBox();const b=m.geometry.boundingBox;
   assert.ok(b.min.x>part.bbox[0]-4&&b.max.x<part.bbox[2]+4&&b.min.z>part.bbox[1]-4&&b.max.z<part.bbox[3]+4,`RATU ${part.ratu} façade spills outside its footprint`);
   assert.ok(b.min.y>-.2&&b.max.y<part.height+1.5,`RATU ${part.ratu} façade leaves the height envelope`);
   assert.equal(m.material.vertexColors,true);triangles+=p.length/9;
  }
  const hasFront=analyseBuilding(array,part,null).faces.some(f=>corridorFront(ALEKSANTERINKATU_BUILDINGS[part.ratu],f));
  if(hasFront)assert.ok(result.meshes.some(m=>m.userData.corridor),`RATU ${part.ratu} part ${part.texture} has a street front but no authored façade batch`);
  windows+=result.windows;
  result.meshes.forEach(m=>{m.geometry.dispose();m.material.dispose();});
 }
 assert.ok(triangles>60000&&triangles<300000,`corridor triangles ${triangles}`);
 assert.ok(windows>2500,`corridor windows ${windows}`);
});
test('façade elements are clipped to real wall triangles and never bridge courtyard gaps',()=>{
 const rectangle=(x0,x1,y0,y1)=>[{local:[[x0,y0],[x1,y0],[x1,y1]]},{local:[[x0,y0],[x1,y1],[x0,y1]]}];
 const face={normal:{x:0,z:-1},d:-10,s0:0,s1:40,y0:0,y1:18,triangles:[...rectangle(0,14,0,18),...rectangle(26,40,0,18)]};
 const building={wall:'#d0c0a0',fronts:[{n:[0,-1],d:-10,span:[0,40],top:18,pitch:3,phase:1.5,ground:{type:'shop',h:4.5},storeys:[{y:5.5,h:2,w:1.4},{y:9.5,h:2,w:1.4},{y:13.5,h:2,w:1.4}],cornice:{depth:.5}}]};
 const {meshes,windows}=createCorridorFacade({ratu:0},[face],building);
 assert.ok(windows>=20&&meshes.length===2);
 for(const m of meshes){const p=m.geometry.attributes.position.array;
  for(let i=0;i<p.length;i+=3){const s=-p[i];assert.ok(s<14.6||s>25.4,`vertex at s=${s.toFixed(2)} sits over the gap`);const e=-p[i+2]-(-10);assert.ok(e>=-.6&&e<=1.6,`element depth ${e.toFixed(2)} m off the wall plane`);}
  m.geometry.dispose();m.material.dispose();
 }
 // A fragment too narrow for the shared grid still receives locally centred bays.
 const narrow={...face,s0:30,s1:34.4,triangles:rectangle(30,34.4,0,18)};
 const stats=buildFacadePiece(narrow,building.fronts[0],building,{add(){},geometries:[],triangles:0},{add(){},geometries:[],triangles:0},true);
 assert.ok(stats.windows>=3);
});
