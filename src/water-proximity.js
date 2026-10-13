import {pointInPolygon} from './geo.js';

function segmentDistance(x,z,a,b){
 const dx=b[0]-a[0],dz=b[1]-a[1],len=dx*dx+dz*dz||1;
 let t=((x-a[0])*dx+(z-a[1])*dz)/len;
 t=t<0?0:t>1?1:t;
 return Math.hypot(x-(a[0]+dx*t),z-(a[1]+dz*t));
}

// Metres to the nearest mapped water. Inside a polygon the distance is 0.
// Rings are measured only when the bounding box is already close.
export function nearestWaterDistance(x,z,water){
 let best=Infinity;
 for(const body of water||[]){
  const box=body.bbox;
  if(!box)continue;
  const dx=x<box[0]?box[0]-x:x>box[2]?x-box[2]:0;
  const dz=z<box[1]?box[1]-z:z>box[3]?z-box[3]:0;
  const boxDistance=Math.hypot(dx,dz);
  if(boxDistance>=best)continue;
  if(boxDistance===0&&pointInPolygon(x,z,body.rings))return 0;
  if(boxDistance>100){best=boxDistance;continue;}
  for(const ring of body.rings||[])for(let i=1;i<ring.length;i++){
   const distance=segmentDistance(x,z,ring[i-1],ring[i]);
   if(distance<best)best=distance;
  }
 }
 return best;
}
