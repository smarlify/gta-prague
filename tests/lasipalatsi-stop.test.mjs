import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import zlib from 'node:zlib';
import {createLasipalatsiStop,createLasipalatsiStops,platformFrame,LASIPALATSI_STOP_REFERENCE,LASIPALATSI_STOP_REFERENCES,STOP_KIT} from '../src/lasipalatsi-stop.js';
import {stopAdPlacements} from '../src/bind-ads.js';
import {SpatialIndex,pointInPolygon} from '../src/geo.js';
if (true) {
 test('Finland city pack', {skip: 'Finland city is not part of this build'}, () => {});
} else {
const city=JSON.parse(zlib.gunzipSync(fs.readFileSync('public/data/city.pack')));
const trams=JSON.parse(fs.readFileSync('public/data/trams.json'));
const gantry={name:'Direction gantry pole',rings:[[[-807.367,-46.695],[-807.167,-46.695],[-807.167,-46.495],[-807.367,-46.495]]]};
test('Lasipalatsi photo platform receives safe tram furniture, not an invented Sokos bus stop',()=>{
 const p=createLasipalatsiStop(city);assert.ok(p.shelter);assert.ok(p.safe(p.shelter.x,p.shelter.z,1.4,5.4));assert.equal(p.group.userData.type,'tram');assert.equal(LASIPALATSI_STOP_REFERENCE.code,'H0101');
 assert.ok(p.shelter.score<=49);for(const r of p.railings)assert.ok(p.safe(r.x,r.z,.18,1.85));
 assert.ok(p.railings.length>=2);assert.ok(p.group.children.length<=16);
});
test('both Lasipalatsi platforms follow the HSL stop records and the mapped YLRE platform polygons',()=>{
 const result=createLasipalatsiStops(city,[gantry]);assert.equal(result.group.userData.placed,2);
 assert.deepEqual(result.stops.map(s=>s.group.userData.code),['H0101','H0102']);
 for(const [i,stop] of result.stops.entries()){
  const ref=LASIPALATSI_STOP_REFERENCES[i],hsl=trams.stops.find(s=>s.id===ref.id),u=stop.group.userData;
  assert.ok(hsl,'stop id exists in the bundled HSL snapshot');assert.equal(hsl.x,ref.x);assert.equal(hsl.z,ref.z);
  assert.deepEqual(u.lines,['1','2','4','10B'],'weekday GTFS stop_times lines (10 runs as 10B on the snapshot date), no line 3');assert.equal(u.departures.length,4);
  assert.deepEqual(u.pole,{x:ref.x,z:ref.z},'flag pole stands on the GTFS stop point');assert.ok(u.display&&u.bin);
  // Platform polygon exists in city.pack and the kerb line is one of its edges.
  const poly=city.pavement.find(q=>q.id===ref.platform.id);assert.ok(poly);
  for(const v of ref.platform.trackEdge)assert.ok(poly.rings[0].some(([x,z])=>Math.hypot(x-v[0],z-v[1])<.01),'track edge vertex is a polygon vertex');
  assert.ok(u.platform.length>=55&&u.platform.length<=70,'two Artic sections fit');assert.ok(u.platform.adBay);
  const f=platformFrame(ref.platform,ref.heading);
  // Shelter and railings sit on the platform, between kerb and back edge; the shelter opens towards the track.
  const sa=f.across(stop.shelter.x,stop.shelter.z);assert.ok(sa>STOP_KIT.shelter.width/2+.8&&sa<ref.platform.width-STOP_KIT.shelter.width/2);
  assert.ok(stop.railings.length>=8);for(const r of stop.railings){const a=f.across(r.x,r.z);assert.ok(a>ref.platform.width-.7&&a<ref.platform.width);assert.ok(stop.safe(r.x,r.z,.18,1.85));}
  const c=Math.cos(ref.heading),s=Math.sin(ref.heading);assert.ok(f.nx*c-f.nz*s>.99,'reference heading points away from the track');
  // Whole platform blocks the car, except the Bind panel bay.
  const platformObstacle=stop.obstacles.find(o=>/tram platform$/.test(o.name));assert.ok(platformObstacle);assert.equal(platformObstacle.rings.length,2);
  const index=new SpatialIndex(stop.obstacles);
  for(const along of [5,20,35,50,60])assert.ok(index.at(...f.point(along,ref.platform.width/2)),'platform interior blocked');
  assert.ok(!index.at(...f.point(-8,ref.platform.width/2)),'street beyond the platform end stays open');
 }
 const ads=stopAdPlacements(city,trams.stops,result.obstacles).filter(a=>a.stopName==='Lasipalatsi');
 const before=stopAdPlacements(city,trams.stops,[]).filter(a=>a.stopName==='Lasipalatsi');
 assert.deepEqual(ads.map(a=>[a.x,a.z]),before.map(a=>[a.x,a.z]),'Bind stop panels keep their places');
 for(const ad of ads)assert.ok(result.obstacles.every(o=>!pointInPolygon(ad.x,ad.z,o.rings)),'panel bay is clear of stop furniture');
 result.group.traverse(m=>{if(m.isMesh)assert.ok(m.geometry.attributes.position.array.every(Number.isFinite));});
 const a=result.stops[0].shelter,b=result.stops[1].shelter;assert.ok(Math.hypot(a.x-b.x,a.z-b.z)>8);
});

}
