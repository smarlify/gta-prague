import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {SpatialIndex,pointInPolygon} from '../src/geo.js';
import {crossingChains,crossingPolygons,kerbSegments,REVIEWED_CROSSINGS} from '../src/crossing-markings.js';
const edge=(from,to,points)=>({from,to,points,crossing:true});
test('crossing phase continues over a source graph split and reverse copies are deduplicated',()=>{
 const edges=[edge(0,1,[[0,0],[0,4]]),edge(1,0,[[0,4],[0,0]]),edge(2,1,[[0,10],[0,4]])];
 const chains=crossingChains(edges);assert.equal(chains.length,1);assert.equal(chains[0].points.length,3);
 assert.equal(Math.abs(chains[0].points.at(-1)[1]-chains[0].points[0][1]),10);
});
test('perpendicular branches do not become a bent zebra',()=>{
 const chains=crossingChains([edge(0,1,[[0,0],[0,5]]),edge(1,2,[[0,5],[5,5]])]);assert.equal(chains.length,2);
});
test('kerbs drop only near crossing corridor and preserve the rest of the surveyed boundary',()=>{
 const chains=crossingChains([edge(0,1,[[0,-5],[0,5]])]);
 const pieces=kerbSegments([-8,0],[8,0],chains);
 assert.ok(pieces.some(p=>p.lowered));assert.ok(pieces.some(p=>!p.lowered));
 assert.deepEqual(pieces[0].a,[-8,0]);assert.deepEqual(pieces.at(-1).b,[8,0]);
 const low=pieces.filter(p=>p.lowered);assert.ok(low.every(p=>Math.abs(p.a[0])<2&&Math.abs(p.b[0])<2));
});
test('reviewed crossings retain the refuge gap, separate cycleway and finite road-clipped paint', {skip:!existsSync('public/data')},()=>{
 const city=JSON.parse(gunzipSync(readFileSync('public/data/city.pack'))),network=JSON.parse(readFileSync('public/data/mobility.json'));
 const world={roads:new SpatialIndex(city.roads.filter(r=>!/Koroke/.test(r.kind))),pavement:new SpatialIndex(city.pavement)};
 const {polygons,chains}=crossingPolygons(network.walks.edges,world);
 assert.ok(chains.length>1000);assert.ok(polygons.length>10000);
 assert.ok(!polygons.some(p=>pointInPolygon(82,245,p)),'refuge remains unpainted');
 assert.ok(polygons.some(p=>p[0].some(([x,z])=>x>79&&x<86&&z>255&&z<257)),'cycleway zebra exists');
 for(const p of polygons)for(const ring of p)for(const v of ring)assert.ok(v.every(Number.isFinite));
 assert.equal(REVIEWED_CROSSINGS.length,4);
});
