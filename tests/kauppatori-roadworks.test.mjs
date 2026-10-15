import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {SpatialIndex,segmentDistance} from '../src/geo.js';
import {createKauppatoriRoadworks,planKauppatoriRoadworks,KAUPPATORI_REFUGE_POST} from '../src/kauppatori-roadworks.js';
if (!existsSync('public/data')) {
 test('local city pack', {skip: 'local Helsinki or Tampere fixture is not in this checkout'}, () => {});
} else {
const city=JSON.parse(gunzipSync(readFileSync(new URL('../public/data/city.pack',import.meta.url))));
const data=JSON.parse(readFileSync(new URL('../public/data/mobility.json',import.meta.url)));
test('two photo-guided rows leave a generous clear driving lane',()=>{
 const p=planKauppatoriRoadworks(city,data);assert.ok(p.pairs.length>=10);assert.ok(p.clearLaneWidth>=3);
 for(const pair of p.pairs){assert.equal(pair.length,2);assert.ok(Math.hypot(pair[0].x-pair[1].x,pair[0].z-pair[1].z)>4.7);}
});
test('bollard feet are all on mapped roadway with clearance from NPC lane segments',()=>{
 const {bollardFootprints,plan}=createKauppatoriRoadworks(city,data),road=new SpatialIndex(city.roads.filter(p=>p.kind!=='Koroke'));
 assert.equal(bollardFootprints.length,plan.pairs.flat().length);
 for(const o of bollardFootprints)for(const [x,z]of o.rings[0])assert.ok(road.at(x,z));
 for(const p of plan.pairs.flat())for(const e of data.roads.edges)for(let i=1;i<e.points.length;i++){
  const a=e.points[i-1],b=e.points[i],len=Math.hypot(b[0]-a[0],b[1]-a[1]);if(!len)continue;const dx=(b[0]-a[0])/len,dz=(b[1]-a[1])/len,l=e.lane||0;
  assert.ok(segmentDistance(p.x,p.z,[a[0]-dz*l,a[1]+dx*l],[b[0]-dz*l,b[1]+dx*l])>1.85);
 }
});
test('unknown exception text stays blank and roadworks are explicitly dated',()=>{
 const p=planKauppatoriRoadworks(city,data);assert.equal(p.signs.length,2);assert.equal(p.reference.capture,'2024-08');assert.equal(p.reference.currentLayoutClaim,false);assert.equal(p.reference.exceptionText,null);
});
test('crossing island kit is not duplicated when an existing post is supplied',()=>{
 assert.equal(planKauppatoriRoadworks(city,data).crossingPosts.length,1);
 const p=planKauppatoriRoadworks(city,data,{existingCrossingPosts:[KAUPPATORI_REFUGE_POST]});assert.equal(p.crossingPosts.length,0);assert.equal(p.existingCrossingReused,true);
});
test('no verified lane network means no speculative road obstacles',()=>{
 const p=planKauppatoriRoadworks(city,null);assert.equal(p.pairs.length,0);
});
test('geometry is small and finite, no runtime texture or browser dependency',()=>{
 const {group,obstacles,placementObstacles,knockables}=createKauppatoriRoadworks(city,data),meshes=[];group.traverse(o=>{if(o.isMesh)meshes.push(o);});
 assert.ok(meshes.length<=11); /* +1: stumps left by snapped sign posts */let triangles=0;
 for(const mesh of meshes){assert.equal(mesh.material.map,null);const p=mesh.geometry.attributes.position;assert.ok([...p.array].every(Number.isFinite));triangles+=p.count/3;}
 assert.ok(triangles<5000);
 // Bollards are knockable bodies, not solid walls; only signs and posts stay solid.
 assert.ok(obstacles.every(o=>!/^kauppatori-roadwork-/.test(o.id)));assert.ok(placementObstacles.length>20);assert.ok(knockables.bodies.length>20);
});

}
