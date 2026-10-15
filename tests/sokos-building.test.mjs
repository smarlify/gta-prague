import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {analyseBuilding} from '../src/building-detail.js';
import {createSokosFace,isSokosFront,sokosFaceContains} from '../src/sokos-building.js';

test('Sokos reconstruction uses actual street triangles and bounded physical details', {skip:'Finland city is not part of this build'},()=>{
 const index=JSON.parse(readFileSync(new URL('../public/data/buildings3d-index.json',import.meta.url)));
 let faces=0,meshCount=0;
 for(const t of index.tiles){
  const parts=t.parts.filter(p=>p.ratu===405);if(!parts.length)continue;
  const bytes=gunzipSync(readFileSync(new URL('../public/data/'+t.file,import.meta.url)));
  const array=new Float32Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/4);
  for(const part of parts)for(const f of analyseBuilding(array,part,null).faces){
   if(!isSokosFront(405,f))continue;faces++;
   assert.equal(isSokosFront(588,f),false);
   const result=createSokosFace(f);meshCount+=result.meshes.length;
   for(const r of result.rectangles)for(const u of [-.5,0,.5])for(const v of [-.5,0,.5])assert.ok(sokosFaceContains(f,r.s+u*r.w,r.y+v*r.h));
   for(const m of result.meshes){
    assert.equal(m.material.map,null);assert.ok(m.geometry.attributes.position.array.every(Number.isFinite));
    const b=m.geometry.boundingBox;assert.ok(b.min.x>-805&&b.max.x<-715&&b.min.z>-92&&b.max.z<6);assert.ok(b.min.y>=-.01&&b.max.y<37);
    m.geometry.dispose();m.material.dispose();
   }
  }
 }
 // Nine principal planes plus three small, separately triangulated continuations.
 assert.equal(faces,12);assert.ok(meshCount<=65);
});
