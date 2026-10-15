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
