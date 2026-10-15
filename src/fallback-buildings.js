import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {footprintBase} from './terrain.js';

// Extruded footprints merge per cell so a distant block leaves the frustum and the shadow map.
// About 180 m: larger than a block, smaller than the shadow box. Every footprint is kept.
export const FALLBACK_CELL=180;

function extrudeFootprint(building){
 const shape=new THREE.Shape(building.rings[0].map(p=>new THREE.Vector2(p[0],-p[1])));
 for(const ring of building.rings.slice(1))shape.holes.push(new THREE.Path(ring.map(p=>new THREE.Vector2(p[0],-p[1]))));
 const bb=building.bbox,small=(bb[2]-bb[0])*(bb[3]-bb[1])<90,measured=Number(building.height),height=measured>1?measured:(small?3.5:15);
 const geometry=new THREE.ExtrudeGeometry(shape,{depth:height,bevelEnabled:false,steps:1});
 geometry.rotateX(-Math.PI/2);geometry.translate(0,.1+footprintBase(building.rings),0);geometry.deleteAttribute('uv');
 return geometry;
}
function paint(geometry,hex){
 const n=geometry.attributes.position.count,c=new THREE.Color(hex),col=new Float32Array(n*3);
 for(let i=0;i<n;i++){col[i*3]=c.r;col[i*3+1]=c.g;col[i*3+2]=c.b;}
 geometry.setAttribute('color',new THREE.BufferAttribute(col,3));return geometry;
}
export function fallbackCellIndex(x,z,cell=FALLBACK_CELL){
 return [Math.floor(x/cell),Math.floor(z/cell)];
}
export function createFallbackBuildingMeshes(buildings,{cell=FALLBACK_CELL,material=null,vertexColor=null}={}){
 const buckets=new Map();
 for(const building of buildings){
  const bb=building.bbox,cx=(bb[0]+bb[2])/2,cz=(bb[1]+bb[3])/2,[ix,iz]=fallbackCellIndex(cx,cz,cell),key=`${ix},${iz}`;
  let bucket=buckets.get(key);
  if(!bucket){bucket={ix,iz,geoms:[]};buckets.set(key,bucket);}
  const geometry=extrudeFootprint(building);if(vertexColor)paint(geometry,vertexColor);bucket.geoms.push(geometry);
 }
 const shared=material||new THREE.MeshStandardMaterial({color:'#c5c4b8',roughness:1}),meshes=[];
 for(const bucket of buckets.values()){
  const geometry=mergeGeometries(bucket.geoms);geometry.computeBoundingBox();geometry.computeBoundingSphere();
  const mesh=new THREE.Mesh(geometry,shared);mesh.castShadow=true;mesh.receiveShadow=true;mesh.frustumCulled=true;
  mesh.userData.cell={x:bucket.ix,z:bucket.iz,size:cell};mesh.userData.footprints=bucket.geoms.length;
  meshes.push(mesh);bucket.geoms.forEach(g=>g.dispose());
 }
 return meshes;
}
