import * as THREE from 'three';
import {pointInPolygon} from './geo.js';
import {groundAt,waterAt} from './terrain.js';

function ringArea(ring){
 let area=0;
 for(let i=1;i<ring.length;i++)area+=(ring[i-1][0]*ring[i][1]-ring[i][0]*ring[i-1][1]);
 return Math.abs(area)/2;
}

function inside(water,x,z){
 return water.some(body=>pointInPolygon(x,z,body.rings));
}

// A few swimmers on the largest water polygons. Gulls stay a separate system.
export function planWaterfowl(water,{seed=5,limit=18}={}){
 const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
 const bodies=[...(water||[])].filter(body=>body.rings?.[0]?.length>4).sort((a,b)=>ringArea(b.rings[0])-ringArea(a.rings[0])).slice(0,4);
 const birds=[];
 for(const body of bodies){
  const ring=body.rings[0];
  let x0=Infinity,z0=Infinity,x1=-Infinity,z1=-Infinity;
  for(const [x,z] of ring){x0=Math.min(x0,x);x1=Math.max(x1,x);z0=Math.min(z0,z);z1=Math.max(z1,z);}
  const room=Math.min(8,limit-birds.length);
  for(let i=0;i<room*20&&birds.filter(b=>b.body===body).length<room;i++){
   const x=x0+random()*(x1-x0),z=z0+random()*(z1-z0);
   if(!inside([body],x,z))continue;
   birds.push({kind:birds.length%3===0?'goose':'duck',x,z,heading:random()*Math.PI*2,phase:random()*Math.PI*2,body});
  }
 }
 return birds.map(({body,...bird})=>bird);
}

export function createWaterfowl(parent,water){
 const birds=planWaterfowl(water);
 const group=new THREE.Group();group.name='Waterfowl';
 const duck=new THREE.Mesh(new THREE.SphereGeometry(.18,8,6),new THREE.MeshStandardMaterial({color:'#c4a574',roughness:.8}));
 const goose=new THREE.Mesh(new THREE.SphereGeometry(.28,8,6),new THREE.MeshStandardMaterial({color:'#d9d6cf',roughness:.75}));
 duck.scale.set(1,.7,1.5);goose.scale.set(1,.72,1.6);
 const ducks=new THREE.InstancedMesh(duck.geometry,duck.material,Math.max(1,birds.length));
 const geese=new THREE.InstancedMesh(goose.geometry,goose.material,Math.max(1,birds.length));
 ducks.name='Ducks';geese.name='Geese';
 group.add(ducks,geese);parent.add(group);
 const matrix=new THREE.Matrix4(),position=new THREE.Vector3(),quaternion=new THREE.Quaternion(),scale=new THREE.Vector3(1,1,1),euler=new THREE.Euler();
 return {group,birds,update(dt,viewer){
  let duckCount=0,gooseCount=0;
  for(const bird of birds){
   bird.phase+=dt*.6;bird.heading+=Math.sin(bird.phase)*.15*dt;
   const speed=bird.kind==='goose'?.7:.45;
   const x=bird.x+Math.sin(bird.heading)*speed*dt,z=bird.z+Math.cos(bird.heading)*speed*dt;
   if(inside(water,x,z)){bird.x=x;bird.z=z;}else bird.heading+=Math.PI*.5;
   if(viewer&&Math.hypot(bird.x-viewer.x,bird.z-viewer.z)>420)continue;
   const surface=waterAt(bird.x,bird.z);
   const y=(surface??groundAt(bird.x,bird.z))+.12+Math.sin(bird.phase*2)*.03;
   euler.set(0,bird.heading,0);quaternion.setFromEuler(euler);position.set(bird.x,y,bird.z);
   scale.set(bird.kind==='goose'?1.15:.85,bird.kind==='goose'?.8:.6,bird.kind==='goose'?1.35:.95);
   matrix.compose(position,quaternion,scale);
   if(bird.kind==='goose')geese.setMatrixAt(gooseCount++,matrix);else ducks.setMatrixAt(duckCount++,matrix);
  }
  ducks.count=duckCount;geese.count=gooseCount;ducks.instanceMatrix.needsUpdate=true;geese.instanceMatrix.needsUpdate=true;
  ducks.visible=duckCount>0;geese.visible=gooseCount>0;
 }};
}
