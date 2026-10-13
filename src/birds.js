import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {groundAt} from './terrain.js';
import {pointInPolygon,pointInRing,bounds} from './geo.js';

// City birds from each city's own map data, no per-city code:
//  • gulls circle, glide and flap over the sea, lakes and rivers (water
//    polygons), land on the quay edge and walk the waterside pavements;
//  • pigeons peck and walk on squares and pedestrian areas;
//  • hooded crows and jackdaws hop on park lawns;
//  • sparrows flit between street trees, close to the camera only.
// `people` is a list of walker arrays. Ground birds take off when the car or a pedestrian comes close, circle and
// settle again. Extra colonies (a market square full of gulls) come in as data.
// One instanced draw call; wings, legs and pecking are bent in the vertex shader.
export const BIRD_KINDS={
 gull:{scale:1.12,speed:7,flap:2.6,amp:.62,walk:.55,view:520,ground:.6,shy:7},
 pigeon:{scale:.52,speed:8,flap:5.5,amp:.85,walk:.42,view:220,ground:.13,shy:5},
 crow:{scale:.74,speed:7,flap:3.6,amp:.7,walk:.5,view:240,ground:.1,shy:9},
 jackdaw:{scale:.58,speed:8,flap:4.2,amp:.75,walk:.5,view:220,ground:.1,shy:8},
 sparrow:{scale:.22,speed:6,flap:11,amp:.9,walk:.3,view:70,ground:.06,shy:3},
};
export const SPECIES=Object.keys(BIRD_KINDS);
export const GULL_ENCOUNTER={range:55,limit:12,leash:90,speed:8,spacing:1.1,stagger:.17};
// Body, head, wing, wing tip, beak, legs, tail.
const PALETTES={
 gull:['#f1f1ec','#f4f4ef','#a7b0b8','#1c1c1f','#e3bd35','#d6a196','#f1f1ec'],
 pigeon:['#8b929b','#5c6470','#9aa2ab','#3c4046','#3a3a3a','#c0574e','#5b6169'],
 crow:['#8d8d88','#1b1b1d','#1d1d20','#141416','#191919','#191919','#1b1b1d'],
 jackdaw:['#3a3c41','#707276','#2a2b30','#202125','#18181a','#18181a','#2a2b30'],
 sparrow:['#8a6a4a','#6a5a4b','#7a5a3a','#4a3a2a','#3a3020','#8a6a5a','#6a5038'],
};
// Where the bird's feet are, below its origin, at scale 1.
const FEET=.2;

const TAU=Math.PI*2;
function rng(seed=1){seed=(seed>>>0)||1;return()=>{seed^=seed<<13;seed>>>=0;seed^=seed>>>17;seed^=seed<<5;seed>>>=0;return seed/4294967296;};}
const ringArea=r=>{let a=0;for(let i=0;i<r.length;i++){const [x1,z1]=r[i],[x2,z2]=r[(i+1)%r.length];a+=x1*z2-x2*z1;}return Math.abs(a/2);};
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));

// Shore samples every `spacing` metres along water outlines, with the normal
// pointing into the water. Edges on the data's clipping box and tiny ponds,
// basins and fountains are skipped.
export function shoreSamples(water=[],{spacing=14,minArea=900,radius=Infinity,extent=Infinity}={}){
 const out=[],edge=extent-1;
 for(const [body,w] of water.entries()){
  if(/wastewater|basin|fountain/i.test(w.kind||'')||ringArea(w.rings[0])<minArea)continue;
  for(const ring of w.rings)for(let i=0;i<ring.length;i++){
   const [ax,az]=ring[i],[bx,bz]=ring[(i+1)%ring.length],L=Math.hypot(bx-ax,bz-az);if(L<.5)continue;
   if(Math.abs(ax)>=edge&&Math.abs(bx)>=edge&&Math.abs(ax-bx)<.5||Math.abs(az)>=edge&&Math.abs(bz)>=edge&&Math.abs(az-bz)<.5)continue;
   for(let s=(i*7.3)%spacing;s<L;s+=spacing){
    const x=ax+(bx-ax)*s/L,z=az+(bz-az)*s/L;if(Math.hypot(x,z)>radius)continue;
    // Water side: inside the outline, or outside an island (hole) ring.
    let nx=-(bz-az)/L,nz=(bx-ax)/L;if(pointInRing(x+nx*1.5,z+nz*1.5,ring)===(ring!==w.rings[0])){nx=-nx;nz=-nz;}
    out.push({x,z,nx,nz,body});
   }
  }
 }
 return out;
}
export const inWater=(water,x,z)=>water.some(w=>(!w.bbox||x>=w.bbox[0]&&x<=w.bbox[2]&&z>=w.bbox[1]&&z<=w.bbox[3])&&pointInPolygon(x,z,w.rings));
// Random points inside a polygon (rejection sampling in its bounding box).
function spotsIn(rings,n,random,ok=()=>true){
 const r=rings[0];let x0=Infinity,z0=Infinity,x1=-Infinity,z1=-Infinity;for(const [x,z] of r){x0=Math.min(x0,x);x1=Math.max(x1,x);z0=Math.min(z0,z);z1=Math.max(z1,z);}
 const out=[];for(let i=0;i<n*30&&out.length<n;i++){const x=x0+random()*(x1-x0),z=z0+random()*(z1-z0);if(pointInPolygon(x,z,rings)&&ok(x,z))out.push({x,z});}
 return out;
}
// Points inside a polygon within `r` of a centre: a flock feeds together.
const clusterIn=(rings,c,r,n,random)=>{const out=[];for(let i=0;i<n*25&&out.length<n;i++){const a=random()*TAU,d=Math.sqrt(random())*r,x=c.x+Math.cos(a)*d,z=c.z+Math.sin(a)*d;if(pointInPolygon(x,z,rings))out.push({x,z});}return out;};
// Greedy: keep candidates (best first) at least `gap` apart.
function spread(items,gap,max){const out=[];for(const c of items){if(out.length>=max)break;if(out.every(o=>Math.hypot(o.x-c.x,o.z-c.z)>=gap))out.push(c);}return out;}

// Flocks for a city from its map data. `colonies` adds data-driven extra flocks
// (see market-life.js marketGullColony): {kind,x,z,radius,count,alt,spots,perches,walkers}.
export function planBirds(data,{seed=7,radius=data.radius||Infinity,extent=data.extent||Infinity,colonies=[],density=1,shore:shoreIn=null,gulls=true}={}){
 const random=rng(seed),flocks=[],water=data.water||[],ground=data.ground??.12;
 const shore=shoreIn??shoreSamples(water,{radius,extent});
 const nearShore=(x,z,d)=>shore.some(s=>Math.abs(s.x-x)<d&&Math.abs(s.z-z)<d&&Math.hypot(s.x-x,s.z-z)<d);
 const paved=(data.pavement||[]).filter(p=>!/pyör|cycle|Portaat|Silta/i.test(p.kind||''));
 if(gulls!==false){
 // Gulls: soaring flocks over the water, a few birds on the quay and waterside paving.
 const shuffled=[...shore].sort(()=>random()-.5);
 const gullSites=spread(shuffled,230,Math.round(Math.min(14,4+shore.length/60)*density));
 for(const s of gullSites){
  let cx=s.x+s.nx*30,cz=s.z+s.nz*30;if(!inWater(water,cx,cz)){cx=s.x+s.nx*8;cz=s.z+s.nz*8;}
  const quay=shore.filter(q=>q.body===s.body&&Math.hypot(q.x-s.x,q.z-s.z)<70).map(q=>({x:q.x-q.nx*.8,y:ground,z:q.z-q.nz*.8,heading:Math.atan2(-q.nx,-q.nz)}));
  const pave=paved.filter(p=>{const b=p.bbox??=bounds(p.rings);return Math.hypot((b[0]+b[2])/2-s.x,(b[1]+b[3])/2-s.z)<60;}).slice(0,6);
  const spots=pave.flatMap(p=>spotsIn(p.rings,3,random,(x,z)=>nearShore(x,z,40)&&!inWater(water,x,z))).slice(0,10);
  flocks.push({kind:'gull',x:cx,z:cz,radius:16+random()*22,alt:[9,26],count:4+Math.floor(random()*4),walkers:spots.length?1+Math.floor(random()*3):0,spots,perches:quay.filter((_,i)=>i%2===0).slice(0,8),ground});
 }
 }
 // Pigeons on squares and pedestrian areas, biggest first.
 const squares=paved.filter(p=>/Aukio|Jalankulkualue|pedestrian|square|Tori/i.test(`${p.kind} ${p.name||''}`)).map(p=>({p,area:ringArea(p.rings[0])})).filter(s=>s.area>350&&s.area<60000)
  .sort((a,b)=>b.area-a.area).slice(0,120).map(({p,area})=>{const c=spotsIn(p.rings,1,random)[0];return c&&{...c,p,area};}).filter(Boolean).filter(c=>Math.hypot(c.x,c.z)<radius);
 for(const s of spread(squares,140,Math.round(12*density))){
  const spots=clusterIn(s.p.rings,s,7,10,random);if(spots.length<4)continue;
  flocks.push({kind:'pigeon',x:s.x,z:s.z,radius:9+random()*6,alt:[5,11],count:7+Math.floor(random()*8),walkers:99,spots,perches:[],ground});
 }
 // Hooded crows and jackdaws on park lawns.
 const lawns=(data.parks||[]).filter(p=>/Nurmi|Kenttä|Niitty|grass|Metsä|meadow|park/i.test(p.kind||'')).map(p=>({p,area:ringArea(p.rings[0])})).filter(s=>s.area>1200)
  .sort(()=>random()-.5).slice(0,240).map(({p})=>{const c=spotsIn(p.rings,1,random)[0];return c&&{...c,p};}).filter(Boolean).filter(c=>Math.hypot(c.x,c.z)<radius);
 for(const s of spread(lawns,190,Math.round(9*density))){
  const spots=clusterIn(s.p.rings,s,12,8,random);if(spots.length<3)continue;
  flocks.push({kind:random()<.6?'crow':'jackdaw',x:s.x,z:s.z,radius:14,alt:[7,16],count:2+Math.floor(random()*4),walkers:99,spots,perches:[],ground:ground*.5});
 }
 // Sparrows in street trees: perches in the crowns of a few tree groups.
 const trees=(data.trees||[]).filter(t=>Math.hypot(t.p[0],t.p[1])<radius).sort(()=>random()-.5);
 for(const t of spread(trees.map(t=>({x:t.p[0],z:t.p[1],t})),160,Math.round(12*density))){
  const crowns=trees.filter(o=>Math.hypot(o.p[0]-t.x,o.p[1]-t.z)<22).slice(0,6).map(o=>({x:o.p[0]+(random()-.5)*1.5,y:Math.min(14,(o.height||9)*.75),z:o.p[1]+(random()-.5)*1.5}));
  if(crowns.length<2)continue;
  flocks.push({kind:'sparrow',x:t.x,z:t.z,radius:6,alt:[3,6],count:3+Math.floor(random()*3),walkers:0,spots:[],perches:crowns,ground});
 }
 for(const c of colonies)flocks.push({radius:20,alt:[6,18],walkers:0,spots:[],perches:[],ground,...c});
 flocks.forEach((f,i)=>{f.id=i;});
 return {flocks,shore:shore.length};
}

// ---------------- simulation ----------------
export function createBirdLife(plan,{seed=11}={}){
 const random=rng(seed),birds=[];
 for(const f of plan.flocks){
  f.birds=[];f.active=false;f.scan=random()*.3;
  const walkers=Math.min(f.walkers||0,f.spots.length?Infinity:0);
  for(let i=0;i<f.count;i++){
   const k=BIRD_KINDS[f.kind],b={kind:f.kind,species:SPECIES.indexOf(f.kind),flock:f,id:birds.length,x:f.x,y:0,z:f.z,vx:0,vy:0,vz:0,heading:random()*TAU,pitch:0,bank:0,
    phase:random()*TAU,flap:0,outer:0,fold:1,peck:0,timer:random()*8,state:'soar',theta:random()*TAU,dir:random()<.5?-1:1,R:f.radius*(.6+random()*.7),alt:f.alt[0]+random()*(f.alt[1]-f.alt[0]),
    scale:k.scale*(.9+random()*.2),tx:0,ty:0,tz:0,after:null,spot:null,glide:0,delay:0};
   if(f.kind==='sparrow'&&f.perches.length)perchOn(b,f.perches[i%f.perches.length]);
   else if(i<walkers&&f.spots.length)land(b,f.spots[Math.floor(random()*f.spots.length)],true);
   else if(f.kind!=='gull'&&!f.soar&&f.spots.length)land(b,f.spots[Math.floor(random()*f.spots.length)],true);
   else if(f.perches.length&&random()<(f.perchShare??.25))perchOn(b,f.perches[Math.floor(random()*f.perches.length)]);
   else{b.state='soar';const p=circlePoint(b);b.x=p.x;b.y=p.y;b.z=p.z;b.fold=0;}
   f.birds.push(b);birds.push(b);
  }
 }
 function circlePoint(b){const f=b.flock;return {x:f.x+Math.cos(b.theta)*b.R,y:b.alt+Math.sin(b.theta*2+b.phase)*1.2,z:f.z+Math.sin(b.theta)*b.R};}
 function land(b,spot,now=false){
  const f=b.flock,j=f.spread??(f.kind==='pigeon'?1.6:f.kind==='gull'?2.5:2),x=spot.x+(random()-.5)*j,z=spot.z+(random()-.5)*j,y=(spot.y??f.ground)+FEET*b.scale;
  b.spot={x,z,y};b.after='ground';
  if(now){b.x=x;b.y=y;b.z=z;b.state='ground';b.fold=1;b.timer=6+random()*20;}
  else{b.state='fly';b.tx=x;b.ty=y;b.tz=z;}
 }
 function perchOn(b,p,now=true){
  const y=(p.y??b.flock.ground)+FEET*b.scale,x=p.x+(random()-.5)*.4,z=p.z+(random()-.5)*.4;b.spot={x,z,y,heading:p.heading};
  if(now){b.x=x;b.y=y;b.z=z;b.state='perch';b.fold=1;b.timer=8+random()*25;if(p.heading!==undefined)b.heading=p.heading;}
  else{b.state='fly';b.tx=x;b.ty=y;b.tz=z;b.after='perch';}
 }
 function takeOff(b,from=null,delay=0){
  if(b.state==='flee'||b.state==='soar')return;
  const f=b.flock;b.state='flee';b.delay=delay;b.timer=1.2+random()*1.2;
  let ax=random()-.5,az=random()-.5;if(from){ax=b.x-from.x;az=b.z-from.z;}const l=Math.hypot(ax,az)||1,k=BIRD_KINDS[b.kind];
  b.vx=ax/l*k.speed*.6;b.vz=az/l*k.speed*.6;b.vy=2.5+random()*1.5;b.heading=Math.atan2(-b.vx,-b.vz);
  b.R=f.radius*(.6+random()*.7);b.theta=Math.atan2(b.z-f.z,b.x-f.x);b.alt=f.alt[0]+random()*(f.alt[1]-f.alt[0]);
 }
 // Steer towards a point at a speed; returns the remaining distance.
 function fly(b,tx,ty,tz,speed,dt,turn=2.5){
  const dx=tx-b.x,dy=ty-b.y,dz=tz-b.z,d=Math.hypot(dx,dy,dz)||1e-6,s=Math.min(speed,d*1.6+.4);
  const a=1-Math.exp(-dt*turn),before=b.heading;
  b.vx+=(dx/d*s-b.vx)*a;b.vy+=(dy/d*s-b.vy)*a;b.vz+=(dz/d*s-b.vz)*a;
  b.x+=b.vx*dt;b.y+=b.vy*dt;b.z+=b.vz*dt;
  const h=Math.hypot(b.vx,b.vz);if(h>.2)b.heading=Math.atan2(-b.vx,-b.vz);
  b.pitch+=(Math.atan2(b.vy,Math.max(.5,h))*.6-b.pitch)*a;b.bank+=(Math.max(-.7,Math.min(.7,wrap(b.heading-before)/Math.max(dt,1e-3)*.35))-b.bank)*a;
  return d;
 }
 function wings(b,dt,mode){
  const k=BIRD_KINDS[b.kind],t=b.fold;
  b.fold+=((mode==='ground'?1:0)-t)*(1-Math.exp(-dt*(mode==='ground'?6:12)));
  if(mode==='ground'){b.flap*=.8;b.outer*=.8;return;}
  // Gulls glide between bursts of flapping; small birds flap almost all the time.
  const climbing=b.vy>.6||mode==='flee'||mode==='land',burst=b.kind==='gull'?(Math.sin(b.phase*.09+b.id)>.55):Math.sin(b.phase*.13+b.id)>-.75;
  const flapping=climbing||burst;b.glide+=((flapping?0:1)-b.glide)*(1-Math.exp(-dt*3));
  b.phase+=dt*TAU*k.flap*(mode==='land'?1.4:1);
  const s=Math.sin(b.phase),amp=k.amp*(1-b.glide);
  b.flap=amp*s+b.glide*(b.kind==='gull'?.14:.05)+(1-b.glide)*.1;
  b.outer=amp*.55*Math.sin(b.phase-.7)+b.glide*(b.kind==='gull'?-.32:-.05);
  if(b.kind==='sparrow'&&b.glide>.5)b.fold=.75; // bounding flight: wings tucked between bursts
 }
 let time=0,encounter=null;
 const returning=new Map();
 const validTarget=t=>t&&t.id!==undefined&&Number.isFinite(t.x)&&Number.isFinite(t.y)&&Number.isFinite(t.z)&&['gather','chase','dropped'].includes(t.phase);
 const homeOf=b=>({state:b.state,spot:b.spot&&{...b.spot},after:b.after,tx:b.tx,ty:b.ty,tz:b.tz,R:b.R,alt:b.alt,dir:b.dir,timer:b.timer,lured:b.lured});
 function releaseBird(record){
  const b=record.bird;delete b.encounterId;delete b.encounterPhase;b.state='fly';b.walkTo=null;b.peck=0;
  returning.set(b,record);record.returnAge=0;
 }
 function clearEncounter(){
  if(!encounter)return;
  for(const record of encounter.birds)releaseBird(record);
  encounter=null;
 }
 function setEncounter(target){
  if(!validTarget(target)){clearEncounter();return;}
  if(encounter?.id===target.id){encounter.target=target;return;}
  clearEncounter();
  const count=Math.min(GULL_ENCOUNTER.limit,Math.max(0,Math.floor(target.maxBirds??GULL_ENCOUNTER.limit)));
  const candidates=birds.filter(b=>b.kind==='gull'&&Number.isFinite(b.x)&&Number.isFinite(b.y)&&Number.isFinite(b.z)&&Math.hypot(b.x-target.x,b.y-target.y,b.z-target.z)<=GULL_ENCOUNTER.range)
   .sort((a,b)=>Math.hypot(a.x-target.x,a.y-target.y,a.z-target.z)-Math.hypot(b.x-target.x,b.y-target.y,b.z-target.z)||a.id-b.id).slice(0,count);
  encounter={id:target.id,target,age:0,phase:target.phase,phaseAge:0,slots:candidates.length,birds:candidates.map((bird,rank)=>{
   const old=returning.get(bird),record={bird,home:old?.home||homeOf(bird),rank,blocked:0};returning.delete(bird);
   bird.encounterId=target.id;bird.encounterPhase='waiting';bird.lured=false;return record;
  })};
 }
 // Reject a blocked movement before committing it. A gull first climbs out
 // over a canopy, then tries a tangential detour around taller obstructions.
 // The callback sees ground-relative heights, just like the rendered birds.
 function flightClear(record,from,to,safeFlight){
  // Wing tips may cross during a swoop; bodies must not occupy the same spot.
  const vx=to.x-from.x,vy=to.y-from.y,vz=to.z-from.z,L=vx*vx+vy*vy+vz*vz;
  for(const other of encounter?.birds||[]){if(other===record||other.bird.encounterPhase==='waiting')continue;
   const b=other.bird,dx=b.x-from.x,dy=b.y-from.y,dz=b.z-from.z,start=Math.hypot(dx,dy,dz),u=L?Math.min(1,Math.max(0,(dx*vx+dy*vy+dz*vz)/L)):0;
   if(start<.38){if(Math.hypot(b.x-to.x,b.y-to.y,b.z-to.z)<start-1e-5)return false;}
   else if(Math.hypot(dx-vx*u,dy-vy*u,dz-vz*u)<.38)return false;
  }
  return !safeFlight||safeFlight(from,to)!==false;
 }
 function safeFly(record,target,speed,dt,safeFlight,turn=4,minY=0){
  const b=record.bird,from={x:b.x,y:b.y,z:b.z};
  const distance=fly(b,target.x,target.y,target.z,speed,dt,turn);
  if(b.y<minY){b.y=minY;b.vy=Math.max(0,b.vy);}
  if(flightClear(record,from,b,safeFlight)){record.blocked=0;return distance;}
  b.x=from.x;b.y=from.y;b.z=from.z;record.blocked+=dt;
  const dx=target.x-b.x,dz=target.z-b.z,d=Math.hypot(dx,dz)||1,side=record.rank%2?1:-1;
  const climb={x:b.x,y:b.y+Math.min(3.2*dt,Math.max(0,Math.max(6,target.y+3)-b.y)),z:b.z};
  const left={x:b.x-dz/d*side*speed*.65*dt,y:b.y,z:b.z+dx/d*side*speed*.65*dt};
  const right={x:b.x+dz/d*side*speed*.65*dt,y:b.y,z:b.z-dx/d*side*speed*.65*dt};
  const alternatives=record.blocked<1.5?[climb,left,right]:[left,right,climb];
  b.vx=b.vy=b.vz=0;
  for(const next of alternatives){
   if(Math.hypot(next.x-b.x,next.y-b.y,next.z-b.z)<1e-8||!flightClear(record,from,next,safeFlight))continue;
   b.x=next.x;b.y=next.y;b.z=next.z;b.vx=(b.x-from.x)/Math.max(dt,1e-6);b.vy=(b.y-from.y)/Math.max(dt,1e-6);b.vz=(b.z-from.z)/Math.max(dt,1e-6);break;
  }
  return distance;
 }
 function separated(record,target,spacing=GULL_ENCOUNTER.spacing){
  const b=record.bird;let x=target.x,y=target.y,z=target.z;
  for(const other of encounter.birds){if(other===record||other.bird.encounterPhase==='waiting')continue;
   const q=other.bird,dx=b.x-q.x,dy=b.y-q.y,dz=b.z-q.z,d=Math.hypot(dx,dy,dz);
   if(d>=spacing)continue;
   const a=record.rank*2.4,push=(spacing-d)*2.4;
   x+=(d>1e-4?dx/d:Math.cos(a))*push;y+=(d>1e-4?dy/d:0)*push;z+=(d>1e-4?dz/d:Math.sin(a))*push;
  }
  return {x,y,z};
 }
 function encounterStep(record,dt,safeFlight){
  const b=record.bird,t=encounter.target,rank=record.rank,count=encounter.slots;
  if(encounter.age<rank*GULL_ENCOUNTER.stagger){update(b,dt);return;}
  const dx=b.x-t.x,dz=b.z-t.z;
  if(Math.hypot(dx,dz)>GULL_ENCOUNTER.leash){releaseBird(record);return;}
  if(t.phase==='dropped'){
   // Two spaced rings leave room for folded wings and readable pecking.
   const inner=Math.min(5,count),ring=rank<inner?0:1,index=ring?rank-inner:rank,n=ring?count-inner:inner;
   const angle=index/Math.max(1,n)*TAU+ring*.37,radius=ring?1.35:.63;
   const spot={x:t.x+Math.cos(angle)*radius,y:t.y+FEET*b.scale,z:t.z+Math.sin(angle)*radius};
   const d=Math.hypot(b.x-spot.x,b.z-spot.z),h=Math.abs(b.y-spot.y);
   if(b.encounterPhase==='feeding'&&d<.22&&h<.1){
    b.state='ground';b.vx=b.vy=b.vz=0;b.pitch=b.bank=0;wings(b,dt,'ground');
    const settle=1-Math.exp(-dt*10),next={x:b.x+(spot.x-b.x)*settle,y:b.y+(spot.y-b.y)*settle,z:b.z+(spot.z-b.z)*settle};
    if(flightClear(record,b,next,safeFlight)){b.x=next.x;b.y=next.y;b.z=next.z;}
    b.heading+=wrap(Math.atan2(b.x-t.x,b.z-t.z)-b.heading)*Math.min(1,dt*7);
    b.peck+=((Math.sin(time*5+rank*1.7)>.05?.95:0)-b.peck)*(1-Math.exp(-dt*13));return;
   }
   b.encounterPhase='drop';b.state='fly';b.peck*=Math.exp(-dt*8);
   const destination={...spot,y:d<1.8?spot.y:Math.max(spot.y+2,Math.min(8,d*.32))};
   safeFly(record,separated(record,destination,.72),Math.min(GULL_ENCOUNTER.speed,Math.max(1.2,d*2)),dt,safeFlight,6,spot.y);wings(b,dt,d<3?'land':'fly');
   if(Math.hypot(b.x-spot.x,b.y-spot.y,b.z-spot.z)<.12)b.encounterPhase='feeding';
   return;
  }
  b.state='fly';b.peck*=Math.exp(-dt*8);
  const angle=encounter.age*.62+rank*TAU/Math.max(1,count),radius=3.4+rank%4*.55;
  let target={x:t.x+Math.cos(angle)*radius,y:Math.max(3.5,t.y+2.5)+rank%3*.7,z:t.z+Math.sin(angle)*radius};
  b.encounterPhase=t.phase;
  if(t.phase==='chase'){
   const period=Math.max(4.2,count*1.15),pass=((encounter.phaseAge-rank*1.15)%period+period)%period;
   if(pass<2.7){
    // Each bird approaches, crosses the hand and climbs away. Other birds
    // keep their orbit lanes, rather than all steering to the same point.
    const approach=rank*2.399963,along=pass<1.35?Math.max(0,3.5*(1-pass/1.35)):-Math.min(3.5,(pass-1.35)*2.7);
    const rise=pass<1.35?2.4*(1-pass/1.35)**2:Math.min(3,(pass-1.35)*2.6);
    target={x:t.x+Math.cos(approach)*along,y:t.y+.12+rise,z:t.z+Math.sin(approach)*along};
    b.encounterPhase='swoop';
   }
  }
  safeFly(record,separated(record,target),GULL_ENCOUNTER.speed,dt,safeFlight,4.8);wings(b,dt,b.encounterPhase==='swoop'?'land':'fly');
 }
 function returnStep(record,dt,safeFlight){
  const b=record.bird,h=record.home;record.returnAge+=dt;
  const resting=(h.state==='ground'||h.state==='perch')&&h.spot;
  const target=resting?h.spot:{x:b.flock.x+Math.cos(b.theta)*h.R,y:h.alt,z:b.flock.z+Math.sin(b.theta)*h.R};
  const d=Math.hypot(target.x-b.x,target.z-b.z),destination={...target,y:resting&&d>3?Math.max(target.y+2,Math.min(10,d*.15)):target.y};
  safeFly(record,destination,BIRD_KINDS[b.kind].speed,dt,safeFlight,resting&&d<3?6:2.5);wings(b,dt,resting&&d<3?'land':'fly');
  if(Math.hypot(target.x-b.x,target.y-b.y,target.z-b.z)<.16){
   Object.assign(b,{R:h.R,alt:h.alt,dir:h.dir,timer:Math.max(3,h.timer),lured:h.lured,spot:h.spot,after:h.after,tx:h.tx,ty:h.ty,tz:h.tz});
   b.state=resting?h.state:'soar';b.theta=Math.atan2(b.z-b.flock.z,b.x-b.flock.x);b.walkTo=null;b.peck=0;
   if(resting){b.spot={...h.spot,x:b.x,z:b.z,y:b.y};b.vx=b.vy=b.vz=0;b.pitch=b.bank=0;}
   returning.delete(b);
  }
 }
 // `lure` ({x,z}): someone holding food. Nearby gulls get bold, walk up and drop in for a closer look.
 function step(dt,{viewer=null,threats=[],people=[],range=600,lure=null,encounter:target=null,safeFlight=null}={}){
  dt=Math.min(.1,Math.max(0,Number.isFinite(dt)?dt:0));time+=dt;
  setEncounter(target);
  if(encounter){encounter.age+=dt;if(encounter.phase!==encounter.target.phase){encounter.phase=encounter.target.phase;encounter.phaseAge=0;}else encounter.phaseAge+=dt;}
  for(const f of plan.flocks){
   f.active=!viewer||Math.hypot(f.x-viewer.x,f.z-viewer.z)<range+f.radius||f.birds.some(b=>b.encounterId!==undefined||returning.has(b)&&Math.hypot(b.x-viewer.x,b.z-viewer.z)<BIRD_KINDS[b.kind].view);if(!f.active)continue;
   // Threats: the car (quick or close) and walkers near the ground birds, checked a few times a second.
   f.scan-=dt;
   if(f.scan<=0){f.scan=.2;
    const shy=BIRD_KINDS[f.kind].shy,bold=!!lure&&f.kind==='gull'&&Math.hypot(lure.x-f.x,lure.z-f.z)<f.radius+40;
    if(bold)tempt(f,lure);else if(f.lured){f.lured=false;for(const b of f.birds)b.lured=false;}
    for(const t of threats){const fast=Math.abs(t.speed||0)>1.2,reach=fast?shy*2:bold?1.2:shy*.8;
     if(Math.hypot(t.x-f.x,t.z-f.z)>reach+f.radius+40)continue;
     for(const b of f.birds)if(b.encounterId===undefined&&!returning.has(b)&&(b.state==='ground'||b.state==='perch'&&b.spot.y<2.5)&&Math.hypot(b.x-t.x,b.z-t.z)<reach)scatter(f,b,t);}
    if(f.kind!=='sparrow')for(const list of people)for(const p of list){if(p.knocked||Math.abs(p.x-f.x)>f.radius+30||Math.abs(p.z-f.z)>f.radius+30)continue;
     for(const b of f.birds)if(b.encounterId===undefined&&!returning.has(b)&&b.state==='ground'&&Math.hypot(b.x-p.x,b.z-p.z)<(f.kind==='gull'?1.5:1.9)){
      // A walker mostly makes them hop aside; sometimes the whole flock goes up.
      if(random()<(f.kind==='pigeon'?.25:.4))scatter(f,b,p);else{b.walkTo={x:b.x+(b.x-p.x)*1.2,z:b.z+(b.z-p.z)*1.2};b.hop=.25;}}}
   }
   for(const b of f.birds){const record=encounter?.birds.find(r=>r.bird===b);if(record)encounterStep(record,dt,safeFlight);else if(returning.has(b))returnStep(returning.get(b),dt,safeFlight);else update(b,dt);}
  }
  if(encounter)encounter.birds=encounter.birds.filter(r=>r.bird.encounterId===encounter.id);
 }
 function tempt(f,lure){
  f.lured=true;let near=0;for(const b of f.birds)if(b.encounterId===undefined&&!returning.has(b)&&b.lured&&(b.state==='ground'||b.state==='fly'))near++;
  for(const b of f.birds){
   if(b.encounterId!==undefined||returning.has(b))continue;
   if(b.state!=='ground')continue;const d=Math.hypot(b.x-lure.x,b.z-lure.z);
   if(d>16||d<2.4&&b.lured)continue;if(!b.lured&&near>=5)continue;
   // Stop just out of reach, on the side the bird came from.
   const a=Math.atan2(b.z-lure.z,b.x-lure.x)+(b.id%5-2)*.12,r=2+(b.id%3)*.35,x=lure.x+Math.cos(a)*r,z=lure.z+Math.sin(a)*r;
   if(!b.lured)near++;b.lured=true;b.walkTo={x,z};b.spot={...b.spot,x,z};b.hop=d>6?.6:0;b.timer=Math.max(b.timer,10);
  }
  // Now and then one of the circling gulls drops in.
  if(near<5&&random()<.12){const b=f.birds.find(o=>o.encounterId===undefined&&!returning.has(o)&&o.state==='soar'&&!o.lured);if(b){const a=random()*TAU;b.lured=true;land(b,{x:lure.x+Math.cos(a)*2.6,z:lure.z+Math.sin(a)*2.6});}}
 }
 function scatter(f,b,from){
  // Panic spreads: neighbours within a few metres follow within a quarter second.
  for(const o of f.birds)if(o.encounterId===undefined&&!returning.has(o)&&(o.state==='ground'||o.state==='perch')&&Math.hypot(o.x-b.x,o.z-b.z)<(f.kind==='pigeon'?9:5))takeOff(o,from,o===b?0:random()*.25);
  f.calm=time+6+random()*6;
 }
 function update(b,dt){
  const f=b.flock,k=BIRD_KINDS[b.kind];b.timer-=dt;
  if(b.state==='ground'){
   wings(b,dt,'ground');
   if(b.hop>0)b.hop-=dt;
   const target=b.walkTo;
   if(target){const dx=target.x-b.x,dz=target.z-b.z,d=Math.hypot(dx,dz),s=k.walk*(b.hop>0?2.5:1);
    if(d<.05){b.walkTo=null;b.pause=.5+random()*2.5;}else{const st=Math.min(d,s*dt);b.x+=dx/d*st;b.z+=dz/d*st;b.heading+=wrap(Math.atan2(-dx,-dz)-b.heading)*Math.min(1,dt*8);}
    b.peck*=.85;b.y=b.spot.y+((b.kind==='crow'||b.kind==='jackdaw'||b.kind==='sparrow')?Math.abs(Math.sin(time*9+b.id))*.05*b.scale:0);
   }else{
    b.pause=(b.pause||0)-dt;const pecking=b.kind!=='gull'||b.id%3===0;
    b.peck+=((pecking&&Math.sin(time*(b.kind==='pigeon'?7:4)+b.id*1.7)>.2?.9:0)-b.peck)*Math.min(1,dt*14);
    if(b.pause<=0){const r=b.kind==='pigeon'?1.2:b.kind==='gull'?2:1.5,a=random()*TAU,nx=b.spot.x+Math.cos(a)*r*random(),nz=b.spot.z+Math.sin(a)*r*random();b.walkTo={x:nx,z:nz};}
   }
   if(b.timer<=0){b.timer=8+random()*25;
    // Gulls take off now and then to join the circling flock; others move to a new patch.
    if(b.kind==='gull'&&random()<.35)takeOff(b);
    else if(f.spots.length>1&&random()<.25){b.state='fly';const s=f.spots[Math.floor(random()*f.spots.length)];land(b,s);b.vy=2;}
   }
   return;
  }
  if(b.state==='perch'){wings(b,dt,'ground');b.peck*=.9;if(random()<dt*.3)b.heading+=(random()-.5)*.8;
   if(b.timer<=0){if(b.kind==='sparrow'){const p=f.perches[Math.floor(random()*f.perches.length)];perchOn(b,p,false);}else takeOff(b);}return;}
  if(b.state==='flee'){
   if(b.delay>0){b.delay-=dt;wings(b,dt,'ground');return;}
   wings(b,dt,'flee');b.vy=Math.max(b.vy-dt*1.5,1);
   b.x+=b.vx*dt;b.y+=b.vy*dt;b.z+=b.vz*dt;b.heading=Math.atan2(-b.vx,-b.vz);b.pitch+=(.5-b.pitch)*Math.min(1,dt*5);
   if(b.timer<=0){b.state='soar';b.timer=f.kind==='gull'?10+random()*30:5+random()*8;}
   return;
  }
  if(b.state==='soar'){
   wings(b,dt,'soar');
   b.theta+=b.dir*k.speed*.75/Math.max(4,b.R)*dt;
   const p=circlePoint(b);fly(b,p.x,p.y,p.z,k.speed,dt,1.6);
   if(b.timer<=0&&(!f.calm||time>f.calm)){
    b.timer=f.kind==='gull'?12+random()*30:4+random()*6;
    if(f.kind==='gull'){const r=random();if(r<.3&&f.perches.length)perchOn(b,f.perches[Math.floor(random()*f.perches.length)],false);else if(r<.45&&f.spots.length)land(b,f.spots[Math.floor(random()*f.spots.length)]);}
    else if(f.spots.length)land(b,f.spots[Math.floor(random()*f.spots.length)]);
    else if(f.perches.length)perchOn(b,f.perches[Math.floor(random()*f.perches.length)],false);
   }
   return;
  }
  if(b.state==='fly'){
   const d=Math.hypot(b.tx-b.x,b.tz-b.z),low=d<6;
   wings(b,dt,low?'land':'fly');
   // Approach from above, then flare and drop onto the spot.
   const ty=low?b.ty:Math.max(b.ty+Math.min(8,d*.35),b.ty+1);
   const r=fly(b,b.tx,ty,b.tz,low?Math.max(1.2,d*1.2):k.speed,dt,low?6:2.5);
   if(low&&r<.25){b.x=b.tx;b.y=b.ty;b.z=b.tz;b.vx=b.vy=b.vz=0;b.pitch=0;b.bank=0;
    if(b.after==='perch'){b.state='perch';b.timer=8+random()*25;if(b.spot?.heading!==undefined)b.heading=b.spot.heading;}else{b.state='ground';b.timer=6+random()*20;b.walkTo=null;b.pause=1;}}
  }
 }
 function snapshot(){
  const kinds={},states={};for(const b of birds){kinds[b.kind]=(kinds[b.kind]||0)+1;states[b.state]=(states[b.state]||0)+1;}
  return {birds:birds.length,flocks:plan.flocks.length,kinds,states,active:plan.flocks.filter(f=>f.active).length,encounter:encounter?{id:encounter.id,phase:encounter.phase,selected:encounter.birds.length,engaged:encounter.birds.filter(r=>r.bird.encounterPhase!=='waiting').length}:null,returning:returning.size,
   flockList:plan.flocks.map(f=>({id:f.id,kind:f.kind,x:+f.x.toFixed(1),z:+f.z.toFixed(1),count:f.count,name:f.name}))};
 }
 return {birds,plan,step,snapshot,takeOff,clearEncounter,get encounterActive(){return !!encounter?.birds.length;},get time(){return time;}};
}

// ---------------- rendering ----------------
// Zones in the colour attribute: r = zone/10, g = wing part (0 body, .5 inner, 1 outer).
const ZONE={body:0,head:1,wing:2,tip:3,beak:4,legs:5,tail:6};
export const WING={shoulder:.05,elbow:.3,span:.66,y:.025};
export function birdGeometry(){
 const parts=[],tag=(g,zone,part=0)=>{g=g.index?g.toNonIndexed():g;const n=g.attributes.position.count,c=new Float32Array(n*3);for(let i=0;i<n;i++){c[i*3]=zone/10;c[i*3+1]=part;}g.setAttribute('color',new THREE.BufferAttribute(c,3));g.deleteAttribute('uv');parts.push(g);return g;};
 const body=new THREE.SphereGeometry(1,10,7);body.scale(.075,.08,.25);tag(body,ZONE.body);
 const head=new THREE.SphereGeometry(.058,9,6);head.translate(0,.06,-.24);tag(head,ZONE.head);
 const beak=new THREE.ConeGeometry(.016,.075,5);beak.rotateX(-Math.PI/2);beak.translate(0,.05,-.33);tag(beak,ZONE.beak);
 for(const s of [-1,1]){const eye=new THREE.SphereGeometry(.009,4,3);eye.translate(s*.045,.075,-.27);tag(eye,ZONE.tip);}
 const tail=new THREE.BufferGeometry();tail.setAttribute('position',new THREE.Float32BufferAttribute([0,.02,.18, -.07,.0,.4, .07,.0,.4, 0,.02,.18, .07,.0,.4, -.07,.0,.4],3));tail.computeVertexNormals();tag(tail,ZONE.tail);
 // Wings: inner panel (shoulder to elbow) and outer hand, swept back, both sides; double sided.
 const W=WING,wing=(x0,x1,c0,c1,sweep0,sweep1,zone,part)=>{
  const pos=[];for(const s of [-1,1]){const a=[s*x0,W.y,-.08+sweep0],b=[s*x1,W.y,-.08+sweep1],c=[s*x1,W.y,-.08+sweep1+c1],d=[s*x0,W.y,-.08+sweep0+c0];
   const q=s>0?[a,b,c,a,c,d]:[a,c,b,a,d,c];for(const v of q)pos.push(...v);for(const v of [...q].reverse())pos.push(v[0],v[1]-.002,v[2]);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.computeVertexNormals();tag(g,zone,part);};
 wing(W.shoulder,W.elbow,.22,.19,0,.03,ZONE.wing,.5);
 wing(W.elbow,W.span*.86,.19,.12,.03,.1,ZONE.wing,1);wing(W.span*.86,W.span,.12,.05,.1,.16,ZONE.tip,1);
 for(const s of [-1,1]){const leg=new THREE.CylinderGeometry(.007,.006,.15,4);leg.translate(s*.03,-.125,.03);tag(leg,ZONE.legs);
  const foot=new THREE.BoxGeometry(.03,.006,.05);foot.translate(s*.03,-FEET+.003,0);tag(foot,ZONE.legs);}
 const g=mergeGeometries(parts);parts.forEach(p=>p.dispose());return g;
}
const VERTEX_HEAD=`
attribute vec4 aAnim;attribute float aSpecies;
uniform vec3 birdPalette[${SPECIES.length*7}];
varying float vZone;
vec3 birdWing(vec3 p,float part,float isNormal){
 float sx=p.x<0.?-1.:1.;float x0=${WING.shoulder.toFixed(3)},x1=${WING.elbow.toFixed(3)},y0=${WING.y.toFixed(3)};
 vec2 q=vec2(abs(p.x)-x0*(1.-isNormal),p.y-y0*(1.-isNormal));
 if(part>.75){vec2 e=vec2((x1-x0)*(1.-isNormal),0.);q-=e;float b=aAnim.y;q=vec2(q.x*cos(b)-q.y*sin(b),q.x*sin(b)+q.y*cos(b));q+=e;}
 float a=aAnim.x;q=vec2(q.x*cos(a)-q.y*sin(a),q.x*sin(a)+q.y*cos(a));
 vec3 open=vec3(sx*(q.x+x0*(1.-isNormal)),q.y+y0*(1.-isNormal),p.z);
 // Folded: the wing lies down the flank, its tip crossing back over the tail.
 float span=abs(p.x)-x0;vec3 folded=isNormal>.5?vec3(sx*.8,.5,0.):vec3(sx*(x0+.032+span*.025),p.y+.03-span*.1,p.z+span*.5+.02);
 return mix(open,folded,aAnim.z*(1.-isNormal*.6));
}
vec3 birdHead(vec3 p,float isNormal){
 vec2 c=vec2(.04,-.17)*(1.-isNormal);vec2 q=vec2(p.y,p.z)-c;float t=aAnim.w*.9;
 q=vec2(q.x*cos(t)+q.y*sin(t),-q.x*sin(t)+q.y*cos(t))+c;return vec3(p.x,q.x,q.y);
}
vec3 birdBend(vec3 p,float isNormal){
 float zone=floor(color.r*10.+.5),part=color.g;
 if(part>.25)return birdWing(p,part,isNormal);
 if(zone==1.||zone==4.||(zone==3.&&p.z<-.2))return birdHead(p,isNormal);
 if(zone==5.&&isNormal<.5)return vec3(p.x,mix(-.04,p.y,smoothstep(.4,.9,aAnim.z)),p.z);
 return p;
}`;
export function createBirdRenderer(life,{capacity=life.birds.length}={}){
 const geometry=birdGeometry(),n=Math.max(1,capacity);
 const anim=new THREE.InstancedBufferAttribute(new Float32Array(n*4),4),species=new THREE.InstancedBufferAttribute(new Float32Array(n),1);
 anim.setUsage(THREE.DynamicDrawUsage);species.setUsage(THREE.DynamicDrawUsage);geometry.setAttribute('aAnim',anim);geometry.setAttribute('aSpecies',species);
 const palette=[];for(const s of SPECIES)for(const c of PALETTES[s])palette.push(new THREE.Color(c));
 const material=new THREE.MeshLambertMaterial({vertexColors:true,side:THREE.DoubleSide});
 material.onBeforeCompile=shader=>{
  shader.uniforms.birdPalette={value:palette};
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\n'+VERTEX_HEAD)
   .replace('#include <beginnormal_vertex>','vec3 objectNormal=normalize(birdBend(vec3(normal),1.));\n#ifdef USE_TANGENT\nvec3 objectTangent=vec3(tangent.xyz);\n#endif')
   .replace('#include <begin_vertex>','vec3 transformed=birdBend(vec3(position),0.);')
   .replace('#include <color_vertex>','vColor=vec4(birdPalette[int(aSpecies+.5)*7+int(floor(color.r*10.+.5))],1.);');
 };
 material.customProgramCacheKey=()=>'city-birds';
 const mesh=new THREE.InstancedMesh(geometry,material,n);mesh.name='City birds';mesh.frustumCulled=false;mesh.castShadow=false;mesh.receiveShadow=false;
 mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.count=0;
 const m=new THREE.Matrix4(),q=new THREE.Quaternion(),e=new THREE.Euler(0,0,0,'YXZ'),p=new THREE.Vector3(),s=new THREE.Vector3();
 let drawn=0;
 function update(viewer,camera=null){
  let i=0;
  for(const b of life.birds){
   if(i>=n)break;const k=BIRD_KINDS[b.kind],d=viewer?Math.hypot(b.x-viewer.x,b.z-viewer.z):0;
   if(d>k.view||!b.flock.active&&viewer)continue;
   e.set(b.pitch,b.heading,b.bank);q.setFromEuler(e);p.set(b.x,b.y+groundAt(b.x,b.z),b.z); // heights are above the local ground (src/terrain.js)
   // Far birds are drawn a little larger so a gull still reads at a few hundred metres.
   const sc=b.scale*(1+Math.max(0,d-60)/250);s.set(sc,sc,sc);m.compose(p,q,s);m.toArray(mesh.instanceMatrix.array,i*16);
   anim.array[i*4]=b.flap;anim.array[i*4+1]=b.outer;anim.array[i*4+2]=Math.min(1,Math.max(0,b.fold));anim.array[i*4+3]=b.peck;species.array[i]=b.species;i++;
  }
  drawn=mesh.count=i;mesh.visible=i>0;
  for(const a of [mesh.instanceMatrix,anim,species]){a.clearUpdateRanges?.();a.needsUpdate=true;}
  if(i){mesh.instanceMatrix.addUpdateRange?.(0,i*16);anim.addUpdateRange?.(0,i*4);species.addUpdateRange?.(0,i);}
 }
 return {mesh,update,get drawn(){return drawn;}};
}

// ---------------- sound ----------------
// Occasional gull calls when gulls are near and sound is on: a short falling
// "kyow" from a filtered sawtooth, two or three in a row, quieter with distance.
export function createGullCalls(){
 let next=3,clock=0,encounterWasActive=false;
 const live=new Set(),stop=()=>{for(const {o,f,g} of live){try{o.stop();}catch{/* Already ended. */}o.disconnect();f.disconnect();g.disconnect();}live.clear();};
 return {update(context,enabled,life,listener,dt){
  if(!context||!enabled||!listener){stop();return;}
  const active=life.encounterActive;
  if(active!==encounterWasActive){next=clock+(active?.2:3);encounterWasActive=active;}
  clock+=dt;if(clock<next)return;
  let near=Infinity;for(const b of life.birds)if(b.kind==='gull'&&b.flock.active)near=Math.min(near,Math.hypot(b.x-listener.x,b.y-1.5,b.z-listener.z));
  next=clock+(active?1.4+Math.random()*.5:3+Math.random()*7);if(near>90)return;
  const volume=(active?.06:.05)*Math.min(1,18/Math.max(18,near)),t0=context.currentTime,calls=2+Math.floor(Math.random()*2);
  for(let c=0;c<calls;c++){const t=t0+c*(.28+Math.random()*.08),o=context.createOscillator(),f=context.createBiquadFilter(),g=context.createGain();
   o.type='sawtooth';const base=1050+Math.random()*250;o.frequency.setValueAtTime(base*.8,t);o.frequency.linearRampToValueAtTime(base*1.25,t+.05);o.frequency.exponentialRampToValueAtTime(base*.55,t+.24);
   f.type='bandpass';f.frequency.value=1700;f.Q.value=2.2;g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(volume,t+.025);g.gain.exponentialRampToValueAtTime(.0005,t+.26);
   const nodes={o,f,g};live.add(nodes);o.onended=()=>{o.disconnect();f.disconnect();g.disconnect();live.delete(nodes);};
   o.connect(f);f.connect(g);g.connect(context.destination);o.start(t);o.stop(t+.3);}
 },reset(){stop();next=3;clock=0;encounterWasActive=false;}};
}

// The whole bird layer for a loaded city: plan from data, simulate, draw, call.
export function createBirds(data,options={}){
 const plan=planBirds(data,options),life=createBirdLife(plan,options),renderer=createBirdRenderer(life),calls=createGullCalls();
 const group=new THREE.Group();group.name='City birds';group.add(renderer.mesh);
 let last=0;
 return {group,life,plan,renderer,
  update(dt,{viewer,threats,people,lure,encounter,safeFlight}={}){const t0=performance.now();life.step(dt,{viewer,threats,people,lure,encounter,safeFlight});renderer.update(viewer);last=performance.now()-t0;},
  clearEncounter(){life.clearEncounter();calls.reset();},
  audio(context,enabled,listener,dt){calls.update(context,enabled,life,listener,dt);},
  // Run the flocks forward (inspection and screenshots while the game is paused).
  advance(seconds,viewer){for(let t=0;t<seconds;t+=1/30)life.step(1/30,{viewer});renderer.update(viewer);},
  snapshot(){return {...life.snapshot(),drawn:renderer.drawn,ms:+last.toFixed(3)};}};
}
