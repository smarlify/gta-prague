import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {pointInPolygon} from '../src/geo.js';
import {createKamppiChapel,chapelWallScale,KAMPPI_CHAPEL,KAMPPI_CHAPEL_FOOTPRINT,KAMPPI_CHAPEL_RATU} from '../src/kamppi-chapel.js';
if (!existsSync('public/data')) {
 test('local city pack', {skip: 'local Helsinki or Tampere fixture is not in this checkout'}, () => {});
} else {
const city=JSON.parse(gunzipSync(readFileSync(new URL('../public/data/city.pack',import.meta.url))));
const record=city.buildings.find(b=>b.ratu===KAMPPI_CHAPEL_RATU);
const index=JSON.parse(readFileSync(new URL('../public/data/buildings3d-index.json',import.meta.url)));
const municipal=index.tiles.flatMap(t=>t.parts).filter(p=>p.ratu===KAMPPI_CHAPEL_RATU);

test('footprint is the municipal Simonkatu 7 ring',()=>{
 assert.equal(record.address,'Simonkatu 7');
 assert.deepEqual([...KAMPPI_CHAPEL_FOOTPRINT,KAMPPI_CHAPEL_FOOTPRINT[0]],record.rings[0]);
 assert.ok(municipal.length>0,'municipal 3D shell exists and is replaced');
});

test('chapel geometry is finite, registered and flares outward with height',()=>{
 const {group,obstacles}=createKamppiChapel(),ring=[record.rings[0]],u=group.userData;
 let min=Infinity,max=-Infinity,tris=0;
 for(const mesh of group.children){
  const p=mesh.geometry.attributes.position;tris+=(mesh.geometry.index?mesh.geometry.index.count:p.count)/3;
  assert.ok(p.array.every(Number.isFinite),`${mesh.name} finite`);let outside=0;
  for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i);min=Math.min(min,y);max=Math.max(max,y);
   const b=record.bbox;if(!(x>=b[0]-.05&&x<=b[2]+.05&&z>=b[1]-.05&&z<=b[3]+.05))outside++;}
  assert.equal(outside,0,`${mesh.name} vertices inside municipal bbox`);
 }
 assert.ok(group.children.length<=4,'draw-call budget');
 assert.ok(tris<20000,`triangle budget ${tris}`);
 assert.ok(min>=-.01&&min<=.2);
 const municipalHeight=Math.max(...municipal.map(p=>p.height));
 assert.ok(Math.abs(max-11.5)<.3,`height ${max} ≈ published 11.5 m`);
 assert.ok(max<=municipalHeight+.2,'no taller than the municipal envelope');
 for(const [x,z] of u.baseRing)assert.ok(pointInPolygon(x,z,ring),'base inside footprint');
 const area=r=>Math.abs(r.reduce((s,p,i)=>{const q=r[(i+1)%r.length];return s+p[0]*q[1]-q[0]*p[1];},0)/2);
 assert.ok(area(u.topRing)>area(u.baseRing)*1.5,'top larger than base');
 assert.ok(area(u.topRing)>.93*area(record.rings[0].slice(0,-1)),'top rim fills the municipal envelope');
 let last=0;for(let y=0;y<=11;y+=.5){const s=chapelWallScale(y);assert.ok(s>=last-1e-9);last=s;}
 assert.ok(chapelWallScale(0)<.8&&chapelWallScale(11)>.97);
 assert.equal(obstacles.length,1);assert.deepEqual(obstacles[0].rings[0],record.rings[0]);
 assert.ok(pointInPolygon(KAMPPI_CHAPEL.centre.x,KAMPPI_CHAPEL.centre.z,obstacles[0].rings));
});

}
