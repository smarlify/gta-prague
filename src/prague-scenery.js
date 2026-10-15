import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {pointInPolygon,SpatialIndex} from './geo.js';
import {groundAt} from './terrain.js';
import {isCharlesBridge,parapetSamples} from './passage.js';

// Hand-placed Prague scenery: trees that OSM did not register in useful spots.
// Coordinates are metres from cities/prague/city.json origin (14.42125, 50.08747),
// +X east, +Z south — same frame as area-caption.js and the baked city pack.

function rng(seed){let s=seed>>>0||1;return ()=>((s=Math.imul(s^s>>>15,1|s)+0x6d2b79f5|0,((s^s>>>14)>>>0)/4294967296));}

// Scatter `count` trees in a disk; optional ring clears the very centre.
function cluster(cx,cz,{count=20,radius=40,inner=0,family='lime',height=10,species='',seed=1}={}){
 const random=rng(seed),out=[];
 for(let i=0;i<count*8&&out.length<count;i++){
  const a=random()*Math.PI*2,d=inner+Math.sqrt(random())*(radius-inner);
  const p=[+(cx+Math.cos(a)*d).toFixed(2),+(cz+Math.sin(a)*d).toFixed(2)];
  if(out.some(t=>Math.hypot(t.p[0]-p[0],t.p[1]-p[1])<2.4))continue;
  out.push({p,family,species:species||family,height:height*(.85+random()*.3),inferred:true,scenery:true});
 }
 return out;
}

// Vítězné náměstí (Dejvická Kruháč) centre island — limes in the green.
export const KRUHAC={x:-1892.4,z:-1416.3,radius:28};
export function kruhacTrees(){
 return [
  ...cluster(KRUHAC.x,KRUHAC.z,{count:14,radius:22,inner:4,family:'lime',height:11,species:'TILIA',seed:42}),
  ...cluster(KRUHAC.x,KRUHAC.z,{count:6,radius:18,inner:2,family:'maple',height:9,species:'ACER',seed:43}),
 ];
}

// Petřín park slopes west of Malá Strana — sakura / cherry blossom.
export const PETRIN={x:-1699.8,z:441.3,radius:90};
// Letná park above the river — another blossom grove.
export const LETNA={x:-447.2,z:-1004.4,radius:75};

export function cherryBlossomTrees(){
 return [
  ...cluster(PETRIN.x,PETRIN.z,{count:28,radius:70,inner:8,family:'cherry',height:6.5,species:'PRUNUS SERRULATA',seed:71}),
  ...cluster(PETRIN.x-55,PETRIN.z+35,{count:12,radius:35,inner:4,family:'cherry',height:5.5,species:'PRUNUS SERRULATA',seed:72}),
  ...cluster(LETNA.x,LETNA.z,{count:24,radius:55,inner:6,family:'cherry',height:6.2,species:'PRUNUS SERRULATA',seed:81}),
  ...cluster(LETNA.x+40,LETNA.z-25,{count:10,radius:30,inner:3,family:'cherry',height:5.8,species:'PRUNUS SERRULATA',seed:82}),
 ];
}

// Trees to append to the city register before createTrees runs.
export function pragueSceneryTrees(){
 return [...kruhacTrees(),...cherryBlossomTrees()];
}

export const PARK_TREE_CAP=280;
export const PARK_FLOWER_CAP=1000;
export const PARK_MIN_AREA=350;
const PARK_FAMILIES=['lime','maple','birch','cherry','bush'];

function ringArea(ring){
 let a=0;for(let i=0,j=ring.length-1;i<ring.length;j=i++)a+=ring[j][0]*ring[i][1]-ring[i][0]*ring[j][1];
 return Math.abs(a)/2;
}

// Instanced trees and low flowers in park polygons that do not already hold a
// registered tree. Caps keep this to the species batches plus one flower mesh.
export function pragueParkPlanting(parks=[],trees=[],buildings=[],water=[]){
 const cell=64,buckets=new Map();
 for(const t of trees||[]){
  if(!t?.p)continue;
  const key=`${Math.floor(t.p[0]/cell)},${Math.floor(t.p[1]/cell)}`;
  const list=buckets.get(key)||[];list.push(t);buckets.set(key,list);
 }
 const blocks=buildings?.length?new SpatialIndex(buildings):null;
 const wet=water?.length?new SpatialIndex(water):null;
 const occupied=park=>{
  const b=park.bbox;if(!b||!park.rings?.[0])return false;
  for(let x=Math.floor(b[0]/cell);x<=Math.floor(b[2]/cell);x++)for(let z=Math.floor(b[1]/cell);z<=Math.floor(b[3]/cell);z++)
   for(const t of buckets.get(`${x},${z}`)||[]){
    if(t.p[0]<b[0]||t.p[0]>b[2]||t.p[1]<b[1]||t.p[1]>b[3])continue;
    if(pointInPolygon(t.p[0],t.p[1],park.rings))return true;
   }
  return false;
 };
 const candidates=(parks||[]).map(p=>({p,area:p.rings?.[0]?ringArea(p.rings[0]):0})).filter(s=>s.area>=PARK_MIN_AREA&&!occupied(s.p)).sort((a,b)=>b.area-a.area);
 const planted=[],flowers=[],taken=new Set();
 const spot=(x,z)=>!blocks?.at(x,z)&&!wet?.at(x,z);
 for(const {p,area} of candidates){
  if(planted.length>=PARK_TREE_CAP&&flowers.length>=PARK_FLOWER_CAP)break;
  let seed=Math.round(area);for(const ch of String(p.id||''))seed=Math.imul(seed^ch.charCodeAt(0),16777619);
  const random=rng(seed>>>0);
  const treeBudget=Math.min(24,Math.max(3,Math.round(area/700)),PARK_TREE_CAP-planted.length);
  const flowerBudget=Math.min(40,Math.max(4,Math.round(area/220)),PARK_FLOWER_CAP-flowers.length);
  const b=p.bbox;
  const scatter=(spacing,limit,sink)=>{
   if(limit<=0||!b)return;
   const cols=Math.max(1,Math.ceil((b[2]-b[0])/spacing)),rows=Math.max(1,Math.ceil((b[3]-b[1])/spacing));
   for(let j=0;j<rows&&sink.length<limit;j++)for(let i=0;i<cols&&sink.length<limit;i++){
    const x=+(b[0]+(i+.3+random()*.4)*spacing).toFixed(2),z=+(b[1]+(j+.3+random()*.4)*spacing).toFixed(2);
    if(x<b[0]||x>b[2]||z<b[1]||z>b[3]||!pointInPolygon(x,z,p.rings)||!spot(x,z))continue;
    const key=`${Math.round(x/6)},${Math.round(z/6)}`;if(taken.has(key))continue;taken.add(key);sink.push([x,z]);
   }
  };
  const before=planted.length;
  scatter(14,before+treeBudget,planted);
  for(let i=before;i<planted.length;i++){
   const family=PARK_FAMILIES[Math.floor(random()*PARK_FAMILIES.length)];
   const height=family==='bush'?1.6+random()*.7:7+random()*5;
   planted[i]={p:planted[i],family,species:family,height:+height.toFixed(2),inferred:true,scenery:true};
  }
  const flowerStart=flowers.length;
  scatter(5,flowerStart+flowerBudget,flowers);
 }
 return {trees:planted,flowers};
}

export function createParkFlowers(points=[]){
 if(!points.length)return null;
 const stem=new THREE.CylinderGeometry(.015,.02,.26,5);stem.translate(0,.13,0);
 const head=new THREE.SphereGeometry(.07,6,5);head.translate(0,.3,0);
 const geometry=mergeGeometries([stem,head]);stem.dispose();head.dispose();
 const mesh=new THREE.InstancedMesh(geometry,new THREE.MeshStandardMaterial({color:'#ffffff',roughness:.9}),points.length);
 mesh.name='Park flowers';mesh.castShadow=false;mesh.receiveShadow=true;
 const m=new THREE.Object3D(),tint=new THREE.Color(),palette=['#f4f0e4','#e7c64a','#e7a0b4','#f2f6ef'];
 points.forEach((p,i)=>{
  const h=.75+((i*17)%10)/20;
  m.position.set(p[0],groundAt(p[0],p[1]),p[1]);m.rotation.set(0,i*.7,0);m.scale.set(h,h*.85,h);m.updateMatrix();
  mesh.setMatrixAt(i,m.matrix);mesh.setColorAt(i,tint.set(palette[i%palette.length]));
 });
 mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
 return mesh;
}

// A row of simple original stone figures on both parapets of Karlův most.
export function charlesStatuePoints(pavement=[]){
 const out=[];
 for(const item of pavement||[]){
  if(!isCharlesBridge(item)||!/Silta|\bmost\b/i.test(`${item.kind||''} ${item.name||''}`))continue;
  out.push(...parapetSamples(item.rings,{spacing:15,inset:1.05,margin:10}));
 }
 return out;
}

export function createCharlesStatues(pavement,heightAt=groundAt){
 const points=charlesStatuePoints(pavement);
 const group=new THREE.Group();group.name='Charles Bridge statues';
 if(!points.length)return group;
 const plinth=new THREE.BoxGeometry(.7,.38,.7);plinth.translate(0,.19,0);
 const body=new THREE.CylinderGeometry(.16,.24,1.25,6);body.translate(0,1.0,0);
 const cloak=new THREE.ConeGeometry(.3,.85,5);cloak.translate(0,1.15,-.02);
 const head=new THREE.SphereGeometry(.18,6,5);head.translate(0,1.78,0);
 const geometry=mergeGeometries([plinth,body,cloak,head]);[plinth,body,cloak,head].forEach(g=>g.dispose());
 const mesh=new THREE.InstancedMesh(geometry,new THREE.MeshStandardMaterial({color:'#c2b9aa',roughness:.92}),points.length);
 mesh.name='Charles Bridge figures';mesh.castShadow=true;mesh.receiveShadow=true;
 const m=new THREE.Object3D();
 points.forEach((p,i)=>{
  m.position.set(p.x,heightAt(p.x,p.z),p.z);
  m.rotation.set(0,i*.9+p.side,0);m.scale.set(1,1,1);m.updateMatrix();
  mesh.setMatrixAt(i,m.matrix);
 });
 mesh.instanceMatrix.needsUpdate=true;group.add(mesh);
 group.userData={count:points.length};
 return group;
}
