import {pointInPolygon,SpatialIndex} from './geo.js';

// Ways kept as short covered / under-building passages. Bored tunnels
// (`tunnel=yes`) are skipped: their decks fight terrain and building collision.
export function keptPassage(tags={}){
 if(tags.covered&&tags.covered!=='no')return tags.tunnel==='building_passage'?'building_passage':'covered';
 const tunnel=tags.tunnel;
 if(!tunnel||tunnel==='no')return null;
 if(tunnel==='building_passage'||tunnel==='covered')return tunnel;
 return null;
}

// Bored tunnel polygons already baked into a city pack (`passage: 'yes'`).
export function isBoredTunnelRoad(road){
 return road?.passage==='yes';
}

// Longest horizontal span of a road polygon, in metres.
export function roadSpan(road){
 const b=road?.bbox;if(!b)return 0;
 return Math.hypot(b[2]-b[0],b[3]-b[1]);
}

// A covered way this short can stay (a porch or a building overhang). Longer
// ways whose kind or name says Tunel are bored tunnels under another name.
export const SHORT_COVERED_M=40;

// Kind or name says Tunel, except a building passage or a short covered way.
// Letná and Mrázovka stay undriveable: this only removes their polygons.
export function isNamedTunnelRoad(road){
 if(!road||!/tunel/i.test(`${road.kind||''} ${road.name||''}`))return false;
 if(road.passage==='building_passage')return false;
 if(road.passage==='covered'&&roadSpan(road)<=SHORT_COVERED_M)return false;
 return true;
}

export function isDroppedTunnelRoad(road){
 return isBoredTunnelRoad(road)||isNamedTunnelRoad(road);
}

// Drop bored-tunnel polygons, named Tunel roads, and mobility edges that run
// through them. Building passages and short covered ways stay. Bridges are untouched.
export function stripBoredTunnels(city,mobility){
 const roads=city?.roads;if(!Array.isArray(roads))return {city,mobility,removed:0};
 const dropped=roads.filter(isDroppedTunnelRoad);if(!dropped.length)return {city,mobility,removed:0};
 const kept=roads.filter(r=>!isDroppedTunnelRoad(r));
 const index=new SpatialIndex(dropped);
 const onBored=pts=>{
  if(!pts?.length)return false;
  let hits=0;
  for(const p of pts)if(index.at(p[0],p[1]))hits++;
  if(pts.length>1)for(let i=1;i<pts.length;i++){
   const a=pts[i-1],b=pts[i];
   if(index.at((a[0]+b[0])/2,(a[1]+b[1])/2))hits++;
  }
  return hits>=Math.max(1,Math.ceil((pts.length+(pts.length>1?pts.length-1:0))*.45));
 };
 const filterGraph=g=>{
  if(!g?.edges)return g;
  return {...g,edges:g.edges.filter(e=>!onBored(e.points))};
 };
 return {
  city:{...city,roads:kept},
  mobility:mobility?{...mobility,roads:filterGraph(mobility.roads),walks:filterGraph(mobility.walks)}:mobility,
  removed:dropped.length,
 };
}

// Polygon loop also drops proposed and construction. The routable graph does not.
export function skipHighwayWay(tags={}, {graph=false}={}){
 if(tags.area==='yes')return true;
 if(!graph&&(tags.highway==='proposed'||tags.highway==='construction'))return true;
 if(tags.tunnel&&tags.tunnel!=='no'&&!keptPassage(tags))return true;
 return false;
}

// A sample on a passage road is inside the dry volume: no building collision,
// and water must not flood it. `roads` is a SpatialIndex of road polygons.
export function passageAt(roads,x,z){
 const hit=roads?.at?.(x,z);
 return !!(hit&&hit.passage);
}

export function pointInPassage(passages,x,z){
 for(const p of passages||[]){
  const b=p.bbox;if(b&&(x<b[0]||x>b[2]||z<b[1]||z>b[3]))continue;
  if(pointInPolygon(x,z,p.rings))return true;
 }
 return false;
}

// Height along a passage centreline. `deck` is [x,z,h] from portal to portal,
// so the road stays at street level instead of climbing the hill above it.
export function passageDeck(roads,x,z){
 const hit=roads?.at?.(x,z);
 const deck=hit?.passage&&hit.deck;
 if(!deck||deck.length<2)return null;
 let best=Infinity,height=deck[0][2];
 for(let i=1;i<deck.length;i++){
  const a=deck[i-1],b=deck[i],dx=b[0]-a[0],dz=b[1]-a[1],l2=dx*dx+dz*dz||1;
  const t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/l2));
  const dist=Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t);
  if(dist<best){best=dist;height=a[2]+(b[2]-a[2])*t;}
 }
 return height;
}

// A bridge deck is a narrow ridge. Sampling the river beside it drops the car
// off the roadway. Use the nearby higher ground when the dip is a few metres,
// and leave a real hillside alone.
export function liftedBridgeHeight(groundAt,x,z){
 const here=groundAt(x,z);let top=here;
 for(const [dx,dz] of [[10,0],[-10,0],[0,10],[0,-10],[7,7],[-7,7],[7,-7],[-7,-7]])top=Math.max(top,groundAt(x+dx,z+dz));
 const lift=top-here;
 return lift>1.2&&lift<14?top:here;
}

const BANK_STEPS=[16,32,48,72];
const BANK_DIRS=[[1,0],[.707,.707],[0,1],[-.707,.707],[-1,0],[-.707,-.707],[0,-1],[.707,-.707]];

// Deck height for a bridge sample. Prefer a dry bank within 16–72 m that sits
// above the local ground and less than 8 m higher. Otherwise the nearby
// liftedBridgeHeight ridge, and only then a 0.35 m lift when the sample itself
// is still in the channel. A deck already at bank height stays put.
export function bridgeDeckHeight(groundAt,x,z,{dry=()=>true,inChannel=()=>false}={}){
 const here=groundAt(x,z);let best=null;
 for(const dist of BANK_STEPS)for(const [dx,dz] of BANK_DIRS){
  const sx=x+dx*dist,sz=z+dz*dist;
  if(!dry(sx,sz))continue;
  const h=groundAt(sx,sz);
  if(h>here&&h<here+8&&(best===null||h>best))best=h;
 }
 if(best!==null)return best;
 const lifted=liftedBridgeHeight(groundAt,x,z);
 if(lifted>here+1.2)return lifted;
 if(inChannel(x,z))return here+.35;
 return here;
}

export const APPROACH_REACH=40;

// 1 at the bridge edge, 0 at `reach` metres out. Beyond that the street keeps its own height.
export function approachBlend(ground,deck,distance,reach=APPROACH_REACH){
 if(!(distance>=0)||distance>=reach)return ground;
 const t=1-distance/reach;
 return ground+(deck-ground)*t;
}

export function isBridgeSurface(item){
 return /Silta|\bmost\b/i.test(`${item?.kind||''} ${item?.name||''}`);
}
export function isCharlesBridge(item){return /Karlův most/i.test(item?.name||'');}
export function isHlavkuvBridge(item){return /Hlávkův most/i.test(item?.name||'');}
export function isFeaturedBridge(item){return isCharlesBridge(item)||isHlavkuvBridge(item);}

// Streets that should ramp up to a featured bridge, and only near that bridge.
export function approachBridge(item){
 const name=item?.name||'';
 if(/^(Mostecká|Křižovnická|Karlova)$/i.test(name))return 'charles';
 if(/^(Na Florenci|Vltavská|nábřeží Ludvíka Svobody)$/i.test(name))return 'hlavkuv';
 return null;
}
export function isApproachStreet(item){return approachBridge(item)!==null;}

export function closestPointOnRings(x,z,rings){
 if(rings&&pointInPolygon(x,z,rings))return {x,z,distance:0};
 let best=Infinity,px=x,pz=z;
 for(const ring of rings||[])for(let i=1;i<ring.length;i++){
  const a=ring[i-1],b=ring[i],dx=b[0]-a[0],dz=b[1]-a[1],d=dx*dx+dz*dz;
  const t=d?Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/d)):0;
  const qx=a[0]+t*dx,qz=a[1]+t*dz,dist=Math.hypot(x-qx,z-qz);
  if(dist<best){best=dist;px=qx;pz=qz;}
 }
 return {x:px,z:pz,distance:best};
}

export function nearFeaturedDistance(x,z,items,reach=APPROACH_REACH){
 if(!items?.length)return Infinity;
 let best=Infinity;
 for(const item of items){
  const b=item.bbox;
  if(b&&(x<b[0]-reach||x>b[2]+reach||z<b[1]-reach||z>b[3]+reach))continue;
  const d=closestPointOnRings(x,z,item.rings).distance;
  if(d<best)best=d;
  if(best===0)return 0;
 }
 return best;
}

// Drive height on a bridge polygon, or blended onto a named approach within 40 m.
// Anywhere else this is just groundAt.
export function bridgeDriveHeight(x,z,{groundAt,surface=null,featured=[],dry,inChannel}={}){
 const ctx={dry,inChannel};
 if(surface&&isBridgeSurface(surface))return bridgeDeckHeight(groundAt,x,z,ctx);
 const which=surface&&approachBridge(surface);
 if(which){
  let best=null;
  for(const item of featured||[]){
   if(which==='charles'&&!isCharlesBridge(item))continue;
   if(which==='hlavkuv'&&!isHlavkuvBridge(item))continue;
   const b=item.bbox;
   if(b&&(x<b[0]-APPROACH_REACH||x>b[2]+APPROACH_REACH||z<b[1]-APPROACH_REACH||z>b[3]+APPROACH_REACH))continue;
   const q=closestPointOnRings(x,z,item.rings);
   if(!best||q.distance<best.distance)best=q;
  }
  if(best&&best.distance<=APPROACH_REACH){
   const deck=bridgeDeckHeight(groundAt,best.x,best.z,ctx);
   return approachBlend(groundAt(x,z),deck,best.distance);
  }
 }
 return groundAt(x,z);
}

// A water sample on a bridge uses the nearby open channel, not the deck ridge.
export function openRiverSample(x,z,{onBridge,inChannel,levelAt,steps=[8,16,24,32,48]}={}){
 if(!onBridge?.(x,z))return null;
 for(const dist of steps){
  let best=null;
  for(const [dx,dz] of BANK_DIRS){
   const sx=x+dx*dist,sz=z+dz*dist;
   if(onBridge(sx,sz)||!inChannel?.(sx,sz))continue;
   const level=levelAt(sx,sz);
   if(Number.isFinite(level)&&(best===null||level<best))best=level;
  }
  if(best!==null)return best;
 }
 return null;
}

// Points along both parapets. Long outline edges are the parapets; each figure
// steps inward so it stands on the deck rather than on the coping.
export function parapetSamples(rings,{spacing=16,inset=1.1,margin=8}={}){
 const ring=rings?.[0];if(!ring||ring.length<4)return [];
 let cx=0,cz=0,n=0;
 for(const p of ring){cx+=p[0];cz+=p[1];n++;}
 cx/=n;cz/=n;
 const out=[],seen=new Set();
 for(let i=1;i<ring.length;i++){
  const a=ring[i-1],b=ring[i],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);
  if(len<20)continue;
  const mx=(a[0]+b[0])/2,mz=(a[1]+b[1])/2;
  let nx=cx-mx,nz=cz-mz,nl=Math.hypot(nx,nz)||1;nx/=nl;nz/=nl;
  const side=Math.atan2(mz-cz,mx-cx)>=0?1:-1;
  for(let s=margin;s<=len-margin+1e-6;s+=spacing){
   const t=s/len,x=a[0]+dx*t+nx*inset,z=a[1]+dz*t+nz*inset;
   if(!pointInPolygon(x,z,rings))continue;
   const key=`${Math.round(x)}:${Math.round(z)}`;if(seen.has(key))continue;seen.add(key);
   out.push({x,z,side});
  }
 }
 return out;
}
