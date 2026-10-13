import {pointInPolygon} from './geo.js';

// Ways the Prague bake must keep drivable: bored tunnels, the tram passage
// under a house, and covered streets. Other tunnel values (culverts) stay out.
export function keptPassage(tags={}){
 if(tags.covered&&tags.covered!=='no')return tags.tunnel==='building_passage'?'building_passage':'covered';
 const tunnel=tags.tunnel;
 if(!tunnel||tunnel==='no')return null;
 if(tunnel==='yes'||tunnel==='building_passage'||tunnel==='covered')return tunnel;
 return null;
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
