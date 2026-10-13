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

// Drop bored-tunnel road polygons and any mobility edges that run through them
// so Prague driving stays on surface streets. Building passages and covered
// ways are left alone. Bridges are untouched.
export function stripBoredTunnels(city,mobility){
 const roads=city?.roads;if(!Array.isArray(roads))return {city,mobility,removed:0};
 const bored=roads.filter(isBoredTunnelRoad);if(!bored.length)return {city,mobility,removed:0};
 const kept=roads.filter(r=>!isBoredTunnelRoad(r));
 const index=new SpatialIndex(bored);
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
  removed:bored.length,
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
