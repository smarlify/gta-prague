import * as THREE from 'three';

// Light deck + pier + rail meshes for OSM ways tagged as bridges (Silta / most).
// Driving still uses stamped terrain height and liftedBridgeHeight; this only
// makes the span read as a bridge instead of a sand-bank across the river.

const BRIDGE_RE=/Silta|\bmost\b/i;
const DECK='#6a6e6b',PIER='#8a8680',RAIL='#4a4e4b';

function ringCentreline(ring){
 if(!ring||ring.length<2)return null;
 const pts=ring.slice(0,-1);
 if(pts.length<2)return null;
 // Approximate the long axis: farthest pair of vertices, then project others.
 let a=pts[0],b=pts[1],best=0;
 for(let i=0;i<pts.length;i++)for(let j=i+1;j<pts.length;j++){
  const d=Math.hypot(pts[j][0]-pts[i][0],pts[j][1]-pts[i][1]);
  if(d>best){best=d;a=pts[i];b=pts[j];}
 }
 if(best<8)return null;
 const dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz)||1;
 const ux=dx/len,uz=dz/len;
 const along=pts.map(p=>{
  const t=(p[0]-a[0])*ux+(p[1]-a[1])*uz;
  const lat=(p[0]-a[0])*-uz+(p[1]-a[1])*ux;
  return {t,lat,p};
 }).sort((u,v)=>u.t-v.t);
 const half=Math.max(3.5,along.reduce((m,s)=>Math.max(m,Math.abs(s.lat)),0)*.85);
 const samples=[];
 const step=Math.max(6,best/12);
 for(let t=along[0].t;t<=along.at(-1).t+1e-6;t+=step){
  samples.push([a[0]+ux*t,a[1]+uz*t]);
 }
 if(samples.length<2)samples.push([b[0],b[1]]);
 return {line:samples,half,length:best};
}

function pushQuad(target,ax,ay,az,bx,by,bz,cx,cy,cz,dx,dy,dz){
 target.push(ax,ay,az, bx,by,bz, cx,cy,cz, ax,ay,az, cx,cy,cz, dx,dy,dz);
}

function addMesh(group,verts,color,name){
 if(!verts.length)return;
 const g=new THREE.BufferGeometry();
 g.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));
 g.computeVertexNormals();
 const mesh=new THREE.Mesh(g,new THREE.MeshStandardMaterial({color,roughness:.9,metalness:.05,side:THREE.DoubleSide}));
 mesh.name=name;mesh.receiveShadow=true;mesh.castShadow=false;group.add(mesh);
}

export function isBridgeRoad(road){
 return !!(road&&BRIDGE_RE.test(`${road.kind||''} ${road.name||''}`));
}

export function isKarluvMost(poly){
 return !!(poly&&/^Karl[uů]v most$/i.test(poly.name||''));
}

// Pedestrian Karlův most lives on pavement polygons, not carriageways. Build the
// same light deck so it reads as a bridge; cars stay on the embankments.
export function createKarluvMostDeck(pavement,opts={}){
 const spans=(pavement||[]).filter(isKarluvMost).map(p=>({...p,kind:p.kind||'Jalkakäytävä (Silta)'}));
 return createBridgeDeck(spans,{...opts,limit:opts.limit??6});
}

// Build decorative decks for bridge-tagged road polygons. Caps draw cost by
// merging into three meshes (deck, pier, rail) and skipping short spans.
export function createBridgeDeck(roads,{groundAt=()=>0,inWater=()=>false,limit=48}={}){
 const group=new THREE.Group();group.name='Bridge decks';
 const deck=[],pier=[],rail=[],seen=new Set();
 let count=0;
 for(const road of roads||[]){
  if(count>=limit||!isBridgeRoad(road)||!road.rings?.[0])continue;
  const key=String(road.id||'').replace(/:\d+$/,'')||`${road.name}|${road.bbox}`;
  if(seen.has(key))continue;
  const centre=ringCentreline(road.rings[0]);
  if(!centre||centre.length<18)continue;
  seen.add(key);count++;
  const {line,half}=centre;
  const yOf=p=>groundAt(p[0],p[1])+0.08;
  for(let i=1;i<line.length;i++){
   const a=line[i-1],b=line[i],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz)||1;
   const nx=-dz/len*half,nz=dx/len*half,ya=yOf(a),yb=yOf(b);
   pushQuad(deck, a[0]+nx,ya,a[1]+nz, a[0]-nx,ya,a[1]-nz, b[0]-nx,yb,b[1]-nz, b[0]+nx,yb,b[1]+nz);
   const rh=.85,rw=.08;
   for(const side of [1,-1]){
    const sx=nx*side*(1-rw/half),sz=nz*side*(1-rw/half);
    pushQuad(rail,
     a[0]+sx,ya,a[1]+sz, a[0]+sx,ya+rh,a[1]+sz,
     b[0]+sx,yb+rh,b[1]+sz, b[0]+sx,yb,b[1]+sz);
   }
   const mid=[(a[0]+b[0])/2,(a[1]+b[1])/2];
   if(inWater(mid[0],mid[1])||inWater(a[0],a[1])||inWater(b[0],b[1])){
    const bed=Math.min(groundAt(mid[0],mid[1])-4,ya-5,yb-5);
    const top=Math.min(ya,yb)-0.05,pw=Math.min(1.1,half*.22);
    pushQuad(pier, mid[0]-pw,bed,mid[1]-pw, mid[0]+pw,bed,mid[1]-pw, mid[0]+pw,top,mid[1]-pw, mid[0]-pw,top,mid[1]-pw);
    pushQuad(pier, mid[0]-pw,bed,mid[1]+pw, mid[0]-pw,bed,mid[1]-pw, mid[0]-pw,top,mid[1]-pw, mid[0]-pw,top,mid[1]+pw);
    pushQuad(pier, mid[0]+pw,bed,mid[1]-pw, mid[0]+pw,bed,mid[1]+pw, mid[0]+pw,top,mid[1]+pw, mid[0]+pw,top,mid[1]-pw);
    pushQuad(pier, mid[0]+pw,bed,mid[1]+pw, mid[0]-pw,bed,mid[1]+pw, mid[0]-pw,top,mid[1]+pw, mid[0]+pw,top,mid[1]+pw);
   }
  }
 }
 addMesh(group,deck,DECK,'Bridge roadway');
 addMesh(group,pier,PIER,'Bridge piers');
 addMesh(group,rail,RAIL,'Bridge rails');
 group.userData={bridges:count};
 return group;
}
