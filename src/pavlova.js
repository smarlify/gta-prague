// Ambulances wait at the crossroads of I. P. Pavlova and pull out only for Filip Turek.
// The driver is not a real person. Coordinates are local metres (x east, z south).
import {bootStart,pickStart,slug} from './cities.js';
import {applyCrashImpulse} from './crash-physics.js';
import {VLTAVA_START} from './driver-starts.js';

// Southbound corridor from Národní muzeum toward the square. Side streets are the
// approaches that do not run along this line.
export const PAVLOVA_RUN={ax:691,az:875,bx:649,bz:1462,half:36};
// Packed I. P. Pavlova start. The corridor's far end sits further south; the
// square is measured from this start.
export const PAVLOVA_SQUARE={x:640.08,z:1364.59};
export const PAVLOVA_RADIUS=150;
export const PAVLOVA_CLUSTER=25;
export const PAVLOVA_PULL=25;
// South, the way the museum faces the square.
export const MUSEUM_HEADING=Math.PI;
const MUSEUM_SLUG='narodni-muzeum';
const PARK_SHORT=3;
const HIT=2.2;
const HOME=1.2;
// Metres per second of the shove. Strong enough that applyCrashImpulse moves
// the car instead of treating the contact as a brush.
const RAM_SPEED=11;

function corridorOffset(x,z){
 const {ax,az,bx,bz}=PAVLOVA_RUN;
 const dx=bx-ax,dz=bz-az,len=dx*dx+dz*dz;
 if(!(len>1))return Infinity;
 const t=((x-ax)*dx+(z-az)*dz)/len;
 if(t<0||t>1)return Infinity;
 const px=ax+dx*t,pz=az+dz*t;
 return Math.hypot(x-px,z-pz);
}

export function isNarodniMuzeum(start){
 return slug(start?.id||start?.name||'')===MUSEUM_SLUG;
}

// Filip at the museum faces south. Every other place keeps its own heading.
export function startHeading(start,driver,fallback=0){
 if(driver?.pavlova&&isNarodniMuzeum(start))return MUSEUM_HEADING;
 return start?.heading??fallback;
}

// A start= URL still pins that place for every driver except Zeman.
// His boat is only in the Vltava, including when a street is named.
// With no start=: Filip opens at the museum, Hřib at Letenské náměstí, Pavel on
// Ke Hradu, Šlachta at Letná until a chase spot exists, Kraus at
// Divadlo Bez zábradlí, and Macinka at Poslanecká sněmovna. None of those take
// a cycle step. Zeman never does.
// `unpinned` is the place already chosen for this visit; switching back to
// Elon or Dave reuses it.
const PINNED_START={hrib:'Letenské náměstí',pavel:'Ke Hradu',slachta:'Letenské náměstí',kraus:'Divadlo Bez zábradlí',macinka:'Poslanecká sněmovna'};
export function resolveDriverStart(landmarks,request,storage,cityId='prague',driver=null,unpinned=null){
 const filip=!!driver?.pavlova&&cityId==='prague';
 const prague=!request&&cityId==='prague';
 // The Challenger stays in the river every time he is placed. A street request
 // stays on the URL for the next driver; it is not used here.
 if(cityId==='prague'&&driver?.water)return {start:{...VLTAVA_START},pinned:false,unpinned};
 if(!request&&filip){
  const museum=pickStart(landmarks,'Národní muzeum');
  if(museum)return {start:{...museum,heading:MUSEUM_HEADING},pinned:false,unpinned};
 }
 const pinnedName=prague?PINNED_START[driver?.id]:null;
 if(pinnedName){
  const place=pickStart(landmarks,pinnedName);
  if(place)return {start:place,pinned:false,unpinned};
 }
 if(!request&&unpinned)return {start:unpinned,pinned:false,unpinned};
 const boot=bootStart(landmarks,request,storage,cityId);
 if(filip&&isNarodniMuzeum(boot.start))return {...boot,start:{...boot.start,heading:MUSEUM_HEADING},unpinned:request?unpinned:boot.start};
 if(request)return {...boot,unpinned};
 return {start:boot.start,pinned:false,unpinned:boot.start};
}

export function pavlovaCenter(landmarks=[]){
 const start=pickStart(landmarks,'I. P. Pavlova');
 return start?{x:start.x,z:start.z}:PAVLOVA_SQUARE;
}

function withLength(edge){
 if(edge.cumulative&&Number.isFinite(edge.length))return edge;
 const pts=edge.points||[],cumulative=[0];
 for(let i=1;i<pts.length;i++)cumulative.push(cumulative.at(-1)+Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]));
 edge.cumulative=cumulative;
 edge.length=cumulative.at(-1)||0;
 return edge;
}

function pointOnEdge(edge,s){
 const pts=edge.points,cum=edge.cumulative;
 let i=1;
 while(i<pts.length-1&&cum[i]<s)i++;
 const a=pts[i-1],b=pts[i],len=(cum[i]-cum[i-1])||1,t=Math.max(0,Math.min(1,(s-cum[i-1])/len));
 const dx=(b[0]-a[0])/len,dz=(b[1]-a[1])/len,lane=edge.lane||0;
 return {x:a[0]+(b[0]-a[0])*t-dz*lane,z:a[1]+(b[1]-a[1])*t+dx*lane,heading:Math.atan2(-dx,-dz)};
}

function junctionNodes(graph){
 const nodes=graph?.nodes||[];
 if(graph?.junctionNode)return nodes.flatMap((p,i)=>graph.junctionNode[i]?[{i,x:p[0],z:p[1]}]:[]);
 const neighbours=Array.from({length:nodes.length},()=>new Set());
 for(const e of graph?.edges||[]){neighbours[e.from]?.add(e.to);neighbours[e.to]?.add(e.from);}
 return nodes.flatMap((p,i)=>neighbours[i].size>=3?[{i,x:p[0],z:p[1]}]:[]);
}

function clusterNodes(nodes){
 const parent=nodes.map((_,i)=>i);
 const find=i=>{let x=i;while(parent[x]!==x)x=parent[x];let y=i;while(parent[y]!==y){const n=parent[y];parent[y]=x;y=n;}return x;};
 for(let a=0;a<nodes.length;a++)for(let b=a+1;b<nodes.length;b++){
  if(Math.hypot(nodes[a].x-nodes[b].x,nodes[a].z-nodes[b].z)<=PAVLOVA_CLUSTER)parent[find(b)]=find(a);
 }
 const groups=new Map();
 nodes.forEach((node,i)=>{const id=find(i);if(!groups.has(id))groups.set(id,[]);groups.get(id).push(node);});
 return [...groups.values()];
}

function parkOnApproach(edge){
 const s=Math.max(0,Math.min(edge.length,edge.length-(Number.isFinite(edge.stopGap)?edge.stopGap:6)-PARK_SHORT));
 return pointOnEdge(edge,s);
}

// One ambulance per clustered junction inside the disk, parked on a side
// approach short of the stop line and facing the crossing.
export function placeWaitingAmbulances(graph,center=PAVLOVA_SQUARE){
 if(!graph?.nodes?.length)return [];
 const origin=center||PAVLOVA_SQUARE;
 const inside=junctionNodes(graph).filter(node=>Math.hypot(node.x-origin.x,node.z-origin.z)<=PAVLOVA_RADIUS);
 const spots=[];
 for(const group of clusterNodes(inside)){
  const members=new Set(group.map(node=>node.i));
  const junction={x:group.reduce((sum,node)=>sum+node.x,0)/group.length,z:group.reduce((sum,node)=>sum+node.z,0)/group.length};
  const approaches=[];
  for(const [id,edge] of (graph.edges||[]).entries()){
   if(!members.has(edge.to)||members.has(edge.from))continue;
   withLength(edge);
   if(!(edge.length>1)||!edge.points||edge.points.length<2)continue;
   const mid=pointOnEdge(edge,edge.length*.5);
   const along=Math.abs(Math.cos(mid.heading));
   const onRun=corridorOffset(mid.x,mid.z)<=PAVLOVA_RUN.half&&along>.75;
   approaches.push({id,edge,onRun,along,length:edge.length});
  }
  approaches.sort((a,b)=>(a.onRun-b.onRun)||(a.along-b.along)||(b.length-a.length)||(a.id-b.id));
  const chosen=approaches[0];
  if(!chosen)continue;
  const pose=parkOnApproach(chosen.edge);
  spots.push({x:pose.x,z:pose.z,heading:pose.heading,junction,nodes:group.map(node=>node.i)});
 }
 spots.sort((a,b)=>a.junction.z-b.junction.z||a.junction.x-b.junction.x);
 return spots;
}

function face(from,to){
 return Math.atan2(-(to.x-from.x),-(to.z-from.z));
}

// Unit vector from the ambulance toward the car. A chase that lands on the
// player has no leftover offset, so the heading it arrived on still counts.
function approachNormal(from,player){
 const dx=(player.x||0)-(from.x||0),dz=(player.z||0)-(from.z||0),len=Math.hypot(dx,dz);
 if(len>.2)return {nx:dx/len,nz:dz/len};
 return {nx:-Math.sin(from.heading||0),nz:-Math.cos(from.heading||0)};
}

function ramImpulse(from,player){
 const {nx,nz}=approachNormal(from,player);
 const hx=-Math.sin(player.heading||0),hz=-Math.cos(player.heading||0);
 const side=nx*hz-nz*hx;
 return {nx,nz,speed:RAM_SPEED,spin:Math.max(-1.4,Math.min(1.4,side*1.6))};
}

// The published crash impulse shoves and spins the car. A hit square on the
// doors barely changes speed along the nose, so that case also takes the
// ram's velocity.
export function applyAmbulanceRam(car,impulse){
 const applied=applyCrashImpulse(car,impulse);
 if(!applied)return null;
 const h=car.heading||0,fx=-Math.sin(h),fz=-Math.cos(h);
 const along=applied.nx*fx+applied.nz*fz;
 if(Math.abs(along)<.45){
  car.heading=Math.atan2(-applied.nx,-applied.nz);
  car.speed=Math.max(Math.abs(car.speed||0),applied.dv*.55);
 }
 return {...applied,carSpeed:car.speed};
}

function chase(from,to,dt){
 const step=Math.min(1,Math.max(0,dt)*1.8);
 const x=from.x+(to.x-from.x)*step,z=from.z+(to.z-from.z)*step;
 return {x,z,heading:face({x,z},to)};
}

function homeOf(spot){
 return {x:spot.x,z:spot.z,heading:spot.heading,phase:'wait',spent:false,junction:spot.junction};
}

// Waiting units while Filip is in a car. The ambulance at a crossing he enters
// drives into the car, then goes back to its spot and stays there until he leaves.
// Elon, Dave, and Filip on foot get no units.
export function stepPavlova(state,player,dt=0){
 const spots=state?.spots||[];
 const armed=!!player?.ram&&player?.mode==='car';
 const base={phase:'idle',x:0,z:0,heading:MUSEUM_HEADING,units:[],spots,driver:false,impulses:[]};
 if(!armed||!spots.length)return base;
 const previous=state?.units||[];
 const impulses=[];
 const units=spots.map((spot,index)=>{
  const prior=previous[index];
  const home=homeOf(spot);
  const near=Math.hypot((player.x||0)-spot.junction.x,(player.z||0)-spot.junction.z)<=PAVLOVA_PULL;
  let phase=prior?.phase||'wait';
  let spent=!!prior?.spent;
  if(!near)spent=false;
  if(phase==='wait'&&near&&!spent)phase='pull';
  if(phase==='pull'){
   const from=prior?.x==null?home:prior;
   const moved=chase(from,player,dt);
   const dist=Math.hypot(moved.x-(player.x||0),moved.z-(player.z||0));
   if(dist<HIT){
    const impulse=ramImpulse(from,player);
    impulses.push(impulse);
    const x=(player.x||0)-impulse.nx*HIT,z=(player.z||0)-impulse.nz*HIT;
    return {...home,x,z,heading:face({x,z},player),phase:'return',spent:true,junction:spot.junction};
   }
   return {...home,...moved,phase:'pull',spent:true,junction:spot.junction};
  }
  if(phase==='return'){
   const moved=chase(prior?.x==null?home:prior,home,dt);
   if(Math.hypot(moved.x-home.x,moved.z-home.z)<HOME)return {...home,spent:true};
   return {...home,...moved,heading:face(moved,home),phase:'return',spent:true,junction:spot.junction};
  }
  return {...home,spent};
 });
 const lead=units[0];
 const phase=units.some(unit=>unit.phase!=='wait')?'out':'wait';
 return {phase,x:lead.x,z:lead.z,heading:lead.heading,units,spots,driver:false,impulses};
}
