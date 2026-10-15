import test from 'node:test';
import assert from 'node:assert/strict';
import {FALLBACK_CELL,createFallbackBuildingMeshes} from '../src/fallback-buildings.js';

function footprint(x,z,size=8,height=12){
 return {rings:[[[x,z],[x+size,z],[x+size,z+size],[x,z+size],[x,z]]],bbox:[x,z,x+size,z+size],height};
}

test('spread-out footprints become one shadow-casting mesh per cell',()=>{
 const buildings=[];
 for(let ix=-1;ix<=2;ix++)for(let iz=-1;iz<=2;iz++)for(let i=0;i<5;i++)for(let j=0;j<5;j++){
  buildings.push(footprint(ix*FALLBACK_CELL+20+i*28,iz*FALLBACK_CELL+20+j*28));
 }
 assert.ok(buildings.length>=300);
 const meshes=createFallbackBuildingMeshes(buildings);
 assert.equal(meshes.length,16);
 assert.equal(meshes.reduce((n,mesh)=>n+mesh.userData.footprints,0),buildings.length);
 for(const mesh of meshes){
  assert.equal(mesh.castShadow,true);
  assert.equal(mesh.frustumCulled,true);
  const {x,z,size}=mesh.userData.cell,box=mesh.geometry.boundingBox;
  assert.ok(box.min.x>=x*size-.5&&box.max.x<=(x+1)*size+.5,`x ${box.min.x}..${box.max.x} in cell ${x}`);
  assert.ok(box.min.z>=z*size-.5&&box.max.z<=(z+1)*size+.5,`z ${box.min.z}..${box.max.z} in cell ${z}`);
  assert.ok(mesh.geometry.boundingSphere.radius<size);
 }
});
