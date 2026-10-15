import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {createPlace,rectRing} from '../src/place-scene.js';
import {footprintFrame} from '../src/place-landmarks.js';

const place=null;
test('Keskustori scene builds with landmarks inside budget and on their footprints', {skip:'Finland city is not part of this build'}, () => {
 const {group,obstacles}=createPlace(place);
 const info=group.userData.landmarks;
 for(const type of ['old-church','bell-tower','city-hall','theatre']){assert.ok(info[type],type);assert.ok(info[type].triangles<60000,`${type}: ${info[type].triangles}`);assert.ok(info[type].drawCalls<=2);}
 const landmarks=group.children.find(c=>c.name==='Place landmarks');
 for(const m of landmarks.children){const l=place.landmarks.find(l=>l.building===m.userData.building),xs=l.ring.map(p=>p[0]),zs=l.ring.map(p=>p[1]);
  const b=new THREE.Box3().setFromObject(m);
  assert.ok(b.min.x>Math.min(...xs)-6&&b.max.x<Math.max(...xs)+6&&b.min.z>Math.min(...zs)-6&&b.max.z<Math.max(...zs)+6,`${m.name} stays on its footprint`);
  const top=place.landmarks.find(x=>x.building===m.userData.building);if(top.type==='bell-tower')assert.ok(Math.abs(b.max.y-top.height)<1.5,'bell tower to its measured height');}
 for(const o of obstacles)for(const [x,z] of o.rings[0])assert.ok(Number.isFinite(x)&&Number.isFinite(z));
 let draws=0;group.traverse(o=>{if(o.isMesh)draws++;});assert.ok(draws<=12+place.photoPanels.length+new Set(place.paving.map(p=>p.kind)).size+place.platforms.length,`${draws} draw calls`);
});
test('footprint frame faces the requested side and stays right-handed', () => {
 const ring=[[0,0],[20,0],[20,10],[0,10],[0,0]],f=footprintFrame(ring,[1,0]);
 assert.deepEqual(f.normal.map(v=>Math.round(v)+0),[1,0]);assert.equal(Math.round(f.width),10);assert.equal(Math.round(f.depth),20);
 assert.ok(f.matrix.determinant()>0);
 assert.equal(rectRing(0,0,0,4,2).length,5);
});
