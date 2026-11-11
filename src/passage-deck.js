import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {isCharlesBridge,isHlavkuvBridge} from './passage.js';

// A drivable ribbon on the passage centreline, plus a dark ceiling for bored
// tunnels. Building passages keep the house as their ceiling.
export function createPassageDeck(roads){
 const group=new THREE.Group();group.name='Passage decks';
 const road=[],ceiling=[],drawn=new Set();
 const push=(target,a,b,y,half)=>{
  const dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz)||1,nx=-dz/len*half,nz=dx/len*half;
  const y0=a[2]+y,y1=b[2]+y;
  target.push(
   a[0]+nx,y0,a[1]+nz, a[0]-nx,y0,a[1]-nz, b[0]-nx,y1,b[1]-nz,
   a[0]+nx,y0,a[1]+nz, b[0]-nx,y1,b[1]-nz, b[0]+nx,y1,b[1]+nz,
  );
 };
 for(const roadItem of roads||[]){
  const deck=roadItem.passage&&roadItem.deck;
  if(!deck||deck.length<2)continue;
  const way=String(roadItem.id||'').replace(/:\d+$/,'');
  if(drawn.has(way))continue;
  drawn.add(way);
  const bore=roadItem.passage==='yes';
  for(let i=1;i<deck.length;i++){
   push(road,deck[i-1],deck[i],.06,roadItem.half||4.5);
   if(bore)push(ceiling,deck[i-1],deck[i],4.4,roadItem.half||4.5);
  }
 }
 const add=(verts,color,name)=>{
  if(!verts.length)return;
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));g.computeVertexNormals();
  const mesh=new THREE.Mesh(g,new THREE.MeshStandardMaterial({color,roughness:.92,side:THREE.DoubleSide}));
  mesh.name=name;mesh.receiveShadow=true;group.add(mesh);
 };
 add(road,'#6e7370','Passage road');
 add(ceiling,'#2a2c2b','Tunnel ceiling');
 return group;
}

// A thin deck for Karlův most and Hlávkův most only, sitting on the drive height
// so the river surface stays in the channel underneath.
export function createPragueBridgeDecks(surfaces,heightAt){
 const group=new THREE.Group();group.name='Prague bridge decks';
 const stone=[],asphalt=[];
 for(const item of surfaces||[]){
  const ring=item.rings?.[0];if(!ring||ring.length<4)continue;
  const charles=isCharlesBridge(item),hlavkuv=isHlavkuvBridge(item);
  if(!charles&&!hlavkuv)continue;
  const shape=new THREE.Shape(ring.map(([x,z])=>new THREE.Vector2(x,-z)));
  for(const hole of (item.rings||[]).slice(1))shape.holes.push(new THREE.Path(hole.map(([x,z])=>new THREE.Vector2(x,-z))));
  const g=new THREE.ShapeGeometry(shape);g.rotateX(-Math.PI/2);
  const p=g.attributes.position;
  for(let i=0;i<p.count;i++)p.setY(i,heightAt(p.getX(i),p.getZ(i))+.12);
  p.needsUpdate=true;g.computeVertexNormals();
  (charles?stone:asphalt).push(g);
 }
 const add=(parts,color,name)=>{
  if(!parts.length)return;
  const mesh=new THREE.Mesh(mergeGeometries(parts),new THREE.MeshStandardMaterial({color,roughness:.9,metalness:0,side:THREE.DoubleSide}));
  mesh.name=name;mesh.receiveShadow=true;group.add(mesh);parts.forEach(g=>g.dispose());
 };
 add(stone,'#c4b8a4','Charles Bridge deck');
 add(asphalt,'#5c6164','Hlávkův most deck');
 return group;
}

// One concrete slab under every bridge. Road and footway polygons on a bridge are mapped as
// separate strips with gaps between them; the river showed through the gaps and a bridge had no
// body. The slab is a 3 m grid at deck height that also covers a cell beyond each strip, so the
// strips of one bridge join into a single deck. `decks` is createBridgeDecks (src/prague-ground.js).
export function createBridgeSlabs(decks,{cell=3,drop=.3,thickness=.9}={}){
 const group=new THREE.Group();group.name='Bridge slabs';
 const heights=new Map(),key=(i,j)=>i*65536+j,RING=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]];
 const node=(i,j)=>{
  const k=key(i,j);if(heights.has(k))return heights.get(k);
  const x=i*cell,z=j*cell;let h=decks.heightAt(x,z);
  if(h===null)for(const [di,dj] of RING){const near=decks.heightAt(x+di*cell,z+dj*cell);if(near!==null&&(h===null||near>h))h=near;}
  heights.set(k,h);return h;
 };
 const top=[],seen=new Set();
 for(const item of decks.surfaces||[]){
  const b=item.bbox,i0=Math.floor(b[0]/cell)-1,i1=Math.ceil(b[2]/cell)+1,j0=Math.floor(b[1]/cell)-1,j1=Math.ceil(b[3]/cell)+1;
  for(let i=i0;i<i1;i++)for(let j=j0;j<j1;j++){
   const k=key(i,j);if(seen.has(k))continue;seen.add(k);
   const a=node(i,j),bb=node(i+1,j),c=node(i,j+1),d=node(i+1,j+1);
   if(a===null||bb===null||c===null||d===null)continue;
   const x0=i*cell,x1=x0+cell,z0=j*cell,z1=z0+cell;
   top.push(x0,a-drop,z0, x0,c-drop,z1, x1,bb-drop,z0,  x1,bb-drop,z0, x0,c-drop,z1, x1,d-drop,z1);
  }
 }
 if(!top.length)return group;
 const build=(lift,color,name)=>{
  const positions=new Float32Array(top);for(let i=1;i<positions.length;i+=3)positions[i]+=lift;
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(positions,3));g.computeVertexNormals();
  const mesh=new THREE.Mesh(g,new THREE.MeshStandardMaterial({color,roughness:.95,metalness:0,side:THREE.DoubleSide}));
  mesh.name=name;mesh.receiveShadow=true;group.add(mesh);
 };
 build(0,'#8c8f8a','Bridge slab');
 build(-thickness,'#5e615d','Bridge soffit'); // the underside, seen from the river and the banks
 group.userData={cells:top.length/18};
 return group;
}
