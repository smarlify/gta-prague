import * as THREE from 'three';

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
