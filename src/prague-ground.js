// Prague's ground rules in one place: which mapped roads are tunnels, how high a bridge deck or a
// passage is, and what the car may drive through. src/main.js and scripts/prague-drive-audit.mjs
// both build their world here, so the audit measures exactly what the game does.
import {SpatialIndex,pointInPolygon} from './geo.js';
import {groundAt,waterAt,setDriveHeight} from './terrain.js';
import {setRiverChannel,setDryPassages,setBridgeSpans,pointInRiverChannel,setGroundCeiling} from './terrain-mesh.js';
import {stripBoredTunnels,isBridgeSurface,isFeaturedBridge,isCharlesBridge,approachBridge,bridgeDriveHeight,passageDeck} from './passage.js';

// Dry land and river channel as the bridge rules see them.
export const pragueDry=Object.freeze({
 dry:(x,z)=>waterAt(x,z)===null&&!pointInRiverChannel(x,z),
 inChannel:(x,z)=>waterAt(x,z)!==null||pointInRiverChannel(x,z),
});

/** City and mobility data as the game uses them. */
export function preparePragueData(data,mobility){
 const stripped=stripBoredTunnels(data,mobility);
 return {data:stripped.city,mobility:stripped.mobility};
}

/** Tell the terrain mesh where the river, the dry passages and the bridge spans are. */
export function registerPragueChannel(data){
 setRiverChannel(data.water);setDryPassages(data.roads);
 setBridgeSpans([...data.roads,...data.pavement].filter(isBridgeSurface));
 return pragueDry;
}

// A real bridge: the build marks it with "(Silta)". A street that is only called "… most"
// (Prašný most) is an ordinary street and keeps the ground under it.
export const isDeckSurface=item=>/Silta/.test(item?.kind||'');

// Karlův most and its approach streets, with room for the 40 m blend.
const CHARLES_BOX=[-1000,-80,-380,300];
const DECK_DIRS=Array.from({length:8},(_,i)=>[Math.cos(i*Math.PI/8),Math.sin(i*Math.PI/8)]);
const DECK_REACH=16,DECK_STEP=1,DECK_CELL=2,UNSET=-99999;

// Deck heights for every bridge in the city.
//
// The terrain already carries each road bridge as a smooth ridge from bank to bank, but only along
// its centre line: towards the edges the ridge falls away to the river. The deck is therefore the
// ground at the middle of the bridge's cross-section, the same for every point across its width.
// The cross-section is the shortest chord through the point that stays on bridge polygons, so the
// carriageway and the footways beside it share one flat deck. A footbridge the terrain never
// raised gets a straight deck between the ground at its two ends instead.
//
// Heights are cached on a 2 m grid per polygon and read back bilinearly, so they are smooth and a
// lookup costs a few array reads.
//
// `under` is an index of ordinary streets. Where a bridge crosses one and stands more than a metre
// above it, the two cannot both be right, because the game has one height per point: the street
// keeps its ground and the bridge ramps down to it over the last twelve metres. That only happens
// to the few cycle and service bridges the terrain bake did not grade-separate.
export function createBridgeDecks(surfaces,{height=groundAt,under=null}={}){
 const index=new SpatialIndex(surfaces),grids=new Map(),lines=new Map();
 const RAMP=12,RAMP_DIRS=Array.from({length:8},(_,i)=>[Math.cos(i*Math.PI/4),Math.sin(i*Math.PI/4)]);
 function meetStreets(x,z,deck){
  if(!under)return deck;
  if(under.at(x,z)){const g=height(x,z);return deck-g>1?g:deck;}
  for(let r=3;r<=RAMP;r+=3)for(const [dx,dz] of RAMP_DIRS){
   const qx=x+dx*r,qz=z+dz*r;if(!under.at(qx,qz)||!index.at(qx,qz))continue;
   const g=height(qx,qz);if(deck-g>1)return deck+(g-deck)*(1-(r-3)/RAMP);
  }
  return deck;
 }
 const on=(x,z)=>!!index.at(x,z);
 function centre(x,z){
  let best=null;
  for(const [dx,dz] of DECK_DIRS){
   let a=0,b=0;
   while(a<DECK_REACH&&on(x+dx*(a+DECK_STEP),z+dz*(a+DECK_STEP)))a+=DECK_STEP;
   while(b<DECK_REACH&&on(x-dx*(b+DECK_STEP),z-dz*(b+DECK_STEP)))b+=DECK_STEP;
   if(a>=DECK_REACH&&b>=DECK_REACH)continue; // a plaza-sized deck in this direction: not a cross-section
   // Find each edge to an eighth of a metre, so the middle does not jump as the point moves.
   for(let half=DECK_STEP/2;half>.1;half/=2){if(a<DECK_REACH&&on(x+dx*(a+half),z+dz*(a+half)))a+=half;if(b<DECK_REACH&&on(x-dx*(b+half),z-dz*(b+half)))b+=half;}
   const length=a+b;
   if(!best||length<best.length)best={length,x:x+dx*(a-b)/2,z:z+dz*(a-b)/2};
  }
  return best||{x,z};
 }
 // Straight deck from end to end, only for a polygon whose middle lies well below both ends:
 // a footbridge the terrain never raised.
 function lineFor(item){
  if(lines.has(item))return lines.get(item);
  const ring=item.rings[0];let cx=0,cz=0;for(const p of ring){cx+=p[0];cz+=p[1];}cx/=ring.length;cz/=ring.length;
  let xx=0,xz=0,zz=0;for(const p of ring){const dx=p[0]-cx,dz=p[1]-cz;xx+=dx*dx;xz+=dx*dz;zz+=dz*dz;}
  const angle=.5*Math.atan2(2*xz,xx-zz),ax=Math.cos(angle),az=Math.sin(angle);
  let t0=Infinity,t1=-Infinity;for(const p of ring){const t=(p[0]-cx)*ax+(p[1]-cz)*az;if(t<t0)t0=t;if(t>t1)t1=t;}
  const cap=t=>{let sum=0,n=0;for(const p of ring){const q=(p[0]-cx)*ax+(p[1]-cz)*az;if(Math.abs(q-t)<3){sum+=height(p[0],p[1]);n++;}}return n?sum/n:height(cx+ax*t,cz+az*t);};
  const h0=cap(t0),h1=cap(t1),mid=centre(cx,cz),sag=Math.min(h0,h1)-height(mid.x,mid.z);
  const line=t1-t0>8&&sag>1.5?(x,z)=>{const t=Math.max(0,Math.min(1,(((x-cx)*ax+(z-cz)*az)-t0)/(t1-t0)));return h0+(h1-h0)*t;}:null;
  lines.set(item,line);return line;
 }
 function exact(x,z,item){
  const c=centre(x,z),line=lineFor(item);
  return line?Math.max(height(c.x,c.z),line(x,z)):height(c.x,c.z);
 }
 function gridFor(item){
  let grid=grids.get(item);
  if(!grid){const b=item.bbox,nx=Math.ceil((b[2]-b[0])/DECK_CELL)+1,nz=Math.ceil((b[3]-b[1])/DECK_CELL)+1;grid={x:b[0],z:b[1],nx,nz,values:new Float32Array((nx+1)*(nz+1)).fill(UNSET)};grids.set(item,grid);}
  return grid;
 }
 function node(grid,item,i,j){
  const k=j*(grid.nx+1)+i;let v=grid.values[k];
  if(v===UNSET){const x=grid.x+i*DECK_CELL,z=grid.z+j*DECK_CELL;v=grid.values[k]=on(x,z)?meetStreets(x,z,exact(x,z,item)):NaN;}
  return v;
 }
 return {
  surfaces,
  on,
  /** Deck height at x,z, or null off every bridge. */
  heightAt(x,z){
   const item=index.at(x,z);if(!item)return null;
   const grid=gridFor(item),u=(x-grid.x)/DECK_CELL,v=(z-grid.z)/DECK_CELL,i=Math.max(0,Math.min(grid.nx-1,Math.floor(u))),j=Math.max(0,Math.min(grid.nz-1,Math.floor(v))),a=u-i,b=v-j;
   let sum=0,weight=0;
   for(const [di,dj,w] of [[0,0,(1-a)*(1-b)],[1,0,a*(1-b)],[0,1,(1-a)*b],[1,1,a*b]]){const h=node(grid,item,i+di,j+dj);if(!Number.isNaN(h)&&w>0){sum+=h*w;weight+=w;}}
   return weight>.2?sum/weight:meetStreets(x,z,exact(x,z,item));
  },
 };
}

// Where traffic lanes and footpaths run, as a set of thin strips. A building footprint never
// blocks inside one. Mapped footprints overlap the street they stand on, close a passage a metre
// before its mouth, or cover an arcade the footpath uses; the lane says the way is open.
export function createCorridors(graphs,cell=24){
 const cells=new Map(),key=(i,j)=>i*8192+j;
 for(const {edges,half} of graphs)for(const edge of edges||[])for(let i=1;i<edge.points.length;i++){
  const a=edge.points[i-1],b=edge.points[i],segment=[a[0],a[1],b[0],b[1],half];
  const i0=Math.floor((Math.min(a[0],b[0])-half)/cell),i1=Math.floor((Math.max(a[0],b[0])+half)/cell),j0=Math.floor((Math.min(a[1],b[1])-half)/cell),j1=Math.floor((Math.max(a[1],b[1])+half)/cell);
  for(let ci=i0;ci<=i1;ci++)for(let cj=j0;cj<=j1;cj++){const k=key(ci,cj);let list=cells.get(k);if(!list)cells.set(k,list=[]);list.push(segment);}
 }
 return {at(x,z){
  const list=cells.get(key(Math.floor(x/cell),Math.floor(z/cell)));if(!list)return false;
  for(const [ax,az,bx,bz,half] of list){
   const dx=bx-ax,dz=bz-az,l2=dx*dx+dz*dz||1,t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/l2)),px=ax+dx*t-x,pz=az+dz*t-z;
   if(px*px+pz*pz<=half*half)return true;
  }
  return false;
 }};
}

// An index that answers like `inner`, except that a mapped building is not there where `open` says
// the way is clear. Posts, boards and other street obstacles in the same index stay solid.
export function openWays(inner,open){
 const index=Object.create(inner);
 const building=item=>/^osm-/.test(item.id||'');
 index.at=(x,z)=>{
  const hit=inner.at(x,z);
  if(!hit||!building(hit)||!open(x,z))return hit;
  // The building is open here. Anything else standing on the same spot still counts.
  for(const p of inner.near(x,z)){if(p===hit||p.disabled||building(p))continue;const b=p.bbox;if(x>=b[0]&&x<=b[2]&&z>=b[1]&&z<=b[3]&&pointInPolygon(x,z,p.rings))return p;}
  return undefined;
 };
 return index;
}

/**
 * Prague's ground, built once the data is loaded. It sets the drive height at once, so the road
 * surfaces, decks and statues placed afterwards all stand on the same heights the cars use.
 */
export function createPragueGround(data,mobility){
 registerPragueChannel(data);
 // Passages get their own index: the first road polygon at a point is often the street beside or
 // above the passage, and then neither its deck nor its way through the building was found.
 const passages=new SpatialIndex(data.roads.filter(r=>r.passage));
 const roads=new SpatialIndex(data.roads.filter(r=>!/Koroke/.test(r.kind)));
 const streets=new SpatialIndex(data.roads.filter(r=>/^Ajorata/.test(r.kind||'')&&!isDeckSurface(r)));
 // Karlův most is the one bridge the terrain bake got wrong: it is baked as a ramp that ends 3.6 m
 // below Křižovnické náměstí. It keeps the older rule (lift to the bank, blend onto Mostecká,
 // Křižovnická and Karlova over 40 m), which was tuned for it. Every other bridge uses the decks.
 const surfaces=new SpatialIndex([...data.roads,...data.pavement]),charles=[...data.roads,...data.pavement].filter(isCharlesBridge);
 const charlesHeight=(x,z)=>{
  if(!charles.length)return null;
  const b=CHARLES_BOX;if(x<b[0]||x>b[2]||z<b[1]||z>b[3])return null;
  const surface=surfaces.at(x,z);
  if(!surface||!(isCharlesBridge(surface)||approachBridge(surface)==='charles'))return null;
  return bridgeDriveHeight(x,z,{groundAt,surface,featured:charles,...pragueDry});
 };
 const bridgeDecks=createBridgeDecks([...data.roads,...data.pavement].filter(r=>isDeckSurface(r)&&!isCharlesBridge(r)),{under:streets});
// Bare ground within a grid cell of a bridge stays at or below the lowest ground around it, so
 // the coarse ground mesh cannot rise through a deck or its ramp.
 const NEAR=[[0,0],[7,0],[-7,0],[0,7],[0,-7],[7,7],[-7,7],[7,-7],[-7,-7]];
 setGroundCeiling((x,z)=>{
  let near=false,low=Infinity;
  for(const [dx,dz] of NEAR){if(bridgeDecks.on(x+dx,z+dz))near=true;const h=groundAt(x+dx,z+dz);if(h<low)low=h;}
  return near?low-.15:null;
 });
 const corridors=createCorridors([{edges:mobility?.roads?.edges,half:2.3},{edges:mobility?.walks?.edges,half:1}]);
 // One height for every vehicle, road surface and pavement: a passage's own deck, then a bridge
 // deck, then the ground. A bridge wins over a street mapped under it, so the lookup no longer
 // flips between the two levels from one metre to the next.
 const driveHeight=(x,z)=>passageDeck(passages,x,z)??charlesHeight(x,z)??bridgeDecks.heightAt(x,z)??groundAt(x,z);
 setDriveHeight(driveHeight);
 const open=(x,z)=>!!(passages.at(x,z)||roads.at(x,z)||corridors.at(x,z));
 return {dry:pragueDry,passages,bridgeDecks,corridors,driveHeight,open,
  /** Deck height for meshes that stand on a bridge. */
  deckHeight:(x,z)=>charlesHeight(x,z)??bridgeDecks.heightAt(x,z)??groundAt(x,z),
  /** Collision rules on the finished world: call after its building indexes are set. */
  install(world){
   world.roadClearsBuildings=true; // OSM footprints spilled onto asphalt are not solid mid-road walls
   world.featuredBridges=[...data.roads,...data.pavement].filter(isFeaturedBridge);
   world.passages=passages;world.bridgeDecks=bridgeDecks;world.driveHeight=driveHeight;
   world.buildings=openWays(world.buildings,open);
   if(world.collisionBuildings)world.collisionBuildings=openWays(world.collisionBuildings,open);
   return world;
  }};
}

/** The whole set-up for tools and tests: prepared data plus a world with the same indexes as the game. */
export function setupPragueWorld(rawData,rawMobility){
 const {data,mobility}=preparePragueData(rawData,rawMobility);
 const ground=createPragueGround(data,mobility);
 return {data,mobility,ground,world({buildings=new SpatialIndex(data.buildings)}={}){
  const world={buildings,roads:new SpatialIndex(data.roads.filter(r=>!/Koroke/.test(r.kind))),pavement:new SpatialIndex(data.pavement),trafficForbidden:new SpatialIndex(data.roads.filter(r=>/Koroke/.test(r.kind))),water:data.water};
  world.cameraBuildings=world.sightBuildings=new SpatialIndex(data.buildings);world.collisionBuildings=world.cameraBuildings;
  return ground.install(world);
 }};
}
