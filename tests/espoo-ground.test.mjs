import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {parseParks,arcPoints} from '../scripts/espoo-citygml.mjs';
import {osmLandcover} from '../scripts/osm-water.mjs';
import {layer,matchLines,laneOffsets,parkColor,forestTrees,digiroadLines} from '../scripts/espoo-ground.mjs';
import {edgeCruise,approachCruise,edgeTopSpeed,carLane} from '../src/traffic-driving.js';
import {Mobility,TRAFFIC_MAX_SPEED} from '../src/mobility.js';
import {bounds} from '../src/geo.js';

const pos=pts=>pts.map(p=>`<gml:pos>${p.join(' ')}</gml:pos>`).join('');
test('park register: kinds, line and arc segments, holes',()=>{
 const xml=`<GIS:InfPark><GIS:ID>7</GIS:ID><GIS:NAME>Stora Fröken</GIS:NAME><GIS:PARTCLASSTEXT>Puisto</GIS:PARTCLASSTEXT><GIS:PAVINGMATERIALTEXT>Nurmi</GIS:PAVINGMATERIALTEXT><GIS:Geometry><gml:PolyhedralSurface><gml:polygonPatches><gml:PolygonPatch>
<gml:exterior><gml:Ring><gml:curveMember><gml:Curve><gml:segments><gml:LineStringSegment>${pos([[0,0],[20,0]])}</gml:LineStringSegment><gml:Arc>${pos([[20,0],[30,10],[20,20]])}</gml:Arc><gml:LineStringSegment>${pos([[20,20],[0,20],[0,0]])}</gml:LineStringSegment></gml:segments></gml:Curve></gml:curveMember></gml:Ring></gml:exterior>
<gml:interior><gml:Ring><gml:curveMember><gml:Curve><gml:segments><gml:LineStringSegment>${pos([[5,5],[8,5],[8,8],[5,5]])}</gml:LineStringSegment></gml:segments></gml:Curve></gml:curveMember></gml:Ring></gml:interior>
</gml:PolygonPatch></gml:polygonPatches></gml:PolyhedralSurface></GIS:Geometry></GIS:InfPark><GIS:InfPark><GIS:ID>8</GIS:ID><GIS:PAVINGMATERIALTEXT>0</GIS:PAVINGMATERIALTEXT></GIS:InfPark>`;
 const parks=parseParks(xml);assert.equal(parks.length,1,'parts without a surface kind are skipped');
 const [p]=parks;assert.deepEqual([p.id,p.kind,p.use,p.name],['7','Nurmi','Puisto','Stora Fröken']);
 const [outer,hole]=p.polygons[0];assert.equal(p.polygons[0].length,2);assert.equal(hole.length,4);
 assert.ok(outer.length>8,'the arc is densified');assert.ok(Math.max(...outer.map(([x])=>x))>29.9,'bulging out through the arc midpoint');
 for(const [x,y] of outer.filter(([x])=>x>20))assert.ok(Math.abs(Math.hypot(x-20,y-10)-10)<1e-6,'on the circle');
 const arc=arcPoints([1,0],[0,-1],[-1,0],.2);assert.ok(arc.every(([,y])=>y<=1e-9),'the short way through b, not around');assert.deepEqual(arcPoints([0,0],[1,1],[2,2]),[[0,0],[2,2]]);
});

test('OSM land cover: tags become register-like kinds, multipolygon holes, specific cover first',()=>{
 const g=pts=>pts.map(([lon,lat])=>({lon,lat})),sq=(x,y,s)=>g([[x,y],[x+s,y],[x+s,y+s],[x,y+s],[x,y]]);
 const reply={elements:[{type:'way',id:1,tags:{leisure:'park'},geometry:sq(0,0,10)},{type:'way',id:2,tags:{natural:'wood'},geometry:sq(2,2,3)},{type:'way',id:3,tags:{building:'yes'},geometry:sq(0,0,1)},{type:'way',id:4,tags:{landuse:'grass'},geometry:g([[0,0],[1,0],[1,1]])},
  {type:'relation',id:5,tags:{landuse:'grass'},members:[{role:'outer',geometry:g([[20,0],[30,0],[30,10]])},{role:'outer',geometry:g([[30,10],[20,10],[20,0]])},{role:'inner',geometry:sq(24,4,2)}]}]};
 const out=osmLandcover(reply,([lon,lat])=>[lon,lat]);
 assert.deepEqual(out.map(a=>[a.id,a.kind]),[['osm-way-2','Metsä'],['osm-relation-5','Nurmi'],['osm-way-1','Nurmi']]);
 assert.equal(out[1].rings.length,2,'outer ring joined from two ways, inner ring a hole');
 const layered=layer(out);
 const area=r=>{let s=0;for(let i=1;i<r.length;i++)s+=r[i-1][0]*r[i][1]-r[i][0]*r[i-1][1];return Math.abs(s)/2;};
 const park=layered.find(a=>a.id==='osm-way-1');assert.equal(park.rings.length,2,'the wood is cut out of the park');assert.equal(area(park.rings[0])-area(park.rings[1]),91);
 assert.deepEqual(park.bbox,bounds(park.rings));
});

test('ground colours and inferred forest trees',()=>{
 assert.equal(parkColor('Nurmi'),'b1c397');assert.equal(parkColor('Pensas'),'91ad7a');assert.equal(parkColor('Avokallio'),'b6b9aa');assert.notEqual(parkColor('Metsä'),parkColor('Kivituhka'));
 const wood={id:'w',rings:[[[0,0],[50,0],[50,50],[0,50],[0,0]]],bbox:[0,0,50,50]};
 const a=forestTrees([wood],()=>false),b=forestTrees([wood],([x])=>x<25);
 assert.deepEqual(a,forestTrees([wood],()=>false),'deterministic');assert.ok(a.length>=20&&a.every(t=>t.inferred&&t.p[0]>=0&&t.p[0]<=50));
 assert.ok(b.length<a.length&&b.every(t=>t.p[0]>=25),'never on paving or next to registered trees');
});

test('speed limits and lane counts follow the matching carriageway and direction',()=>{
 const east={points:[[0,0],[100,0]],lane:.35,length:100},west={points:[[100,4],[0,4]],lane:.35,length:100},side={points:[[50,40],[50,100]],lane:1.45,length:60};
 const lines=[{points:[[0,1],[100,1]],value:80,dir:1},{points:[[0,3],[100,3]],value:60,dir:-1},{points:[[60,40],[60,100]],value:30,dir:0}];
 assert.deepEqual(matchLines([east,west,side],lines),[80,60,null],'direction-aware; a line 10 m away is not this road');
 assert.deepEqual(matchLines([side],lines,{reach:12}),[30]);
 assert.deepEqual(matchLines([{points:[[0,0],[100,0]],length:100}],[{points:[[0,0],[100,0]],value:50,dir:-1}]),[null],'a limit for the other direction only');
 const project=([x,y])=>[x,-y],dr=digiroadLines({features:[{properties:{arvo:40,vaik_suunt:3},geometry:{type:'LineString',coordinates:[[0,0,1],[5,0,1]]}},{properties:{arvo:0,vaik_suunt:1},geometry:{type:'LineString',coordinates:[[0,0],[1,0]]}}]},project);
 assert.deepEqual(dr,[{points:[[0,-0],[5,-0]],value:40,dir:-1}]);
 assert.deepEqual(laneOffsets({lane:.35},3),[-3.2,0,3.2]);assert.deepEqual(laneOffsets({lane:1.45},2),[1.45,4.65]);
});

test('traffic keeps to the mapped limit and to its own lane',()=>{
 assert.equal(edgeCruise({},9),9);assert.equal(edgeCruise({speed:30},10),6);assert.equal(edgeCruise({speed:80},20),80/3.6);
 assert.equal(edgeTopSpeed({},TRAFFIC_MAX_SPEED),TRAFFIC_MAX_SPEED);assert.equal(edgeTopSpeed({speed:80},TRAFFIC_MAX_SPEED),80/3.6);
 assert.equal(approachCruise(20,{speed:30},10,100),20);assert.equal(approachCruise(20,{speed:30},10,2),6);assert.equal(approachCruise(20,{},10,2),20);
 assert.equal(carLane({lane:1.45},3),1.45);assert.equal(carLane({lane:.35,laneOffsets:[-1.6,1.6]},3),1.6);
 const run=(speed,laneOffsets)=>{const world={roads:{at:()=>true},buildings:{at:()=>undefined},pavement:{at:()=>true},water:[]};
  const graph={nodes:[[0,0],[0,-3000]],edges:[{from:0,to:1,points:[[0,0],[0,-3000]],lane:.35,signal:-1,...(speed&&{speed}),...(laneOffsets&&{laneOffsets})}]},sim=new Mobility({roads:graph,walks:{nodes:[],edges:[]},signals:[]},world,{cars:2,people:0});
  sim.cars.forEach((c,i)=>Object.assign(c,{edge:sim.roads.edges[0],s:30+i*40,x:0,z:-30-i*40,cruise:11,speed:8}));let top=0;
  for(let i=0;i<900;i++){sim.step(1/30,{x:300,z:0,speed:0});top=Math.max(top,sim.cars[0].speed);}return {top,x:sim.cars.map(c=>c.x)};};
 assert.ok(run(80).top*3.6>60,'faster than the city default on an 80 km/h road');
 assert.ok(run(30).top*3.6<=30.01,'never above 30 km/h in a 30 zone');
 assert.ok(run().top<=TRAFFIC_MAX_SPEED+1e-9);
 const {x}=run(0,[-1.6,1.6]);assert.ok(Math.abs(Math.abs(x[0]-x[1])-3.2)<.05,`two lanes side by side: ${x}`);
});

const espoo=false;
test('Espoo area: park register and OSM land cover, speed limits on most road edges',{skip:'Finland city is not part of this build'},()=>{
 const city=JSON.parse(gunzipSync(readFileSync(`public/data/${espoo.dir}/city.pack`))),osm=JSON.parse(readFileSync(`public/data/${espoo.dir}/${espoo.osmLandcover}`)),mobility=JSON.parse(readFileSync(`public/data/${espoo.dir}/mobility.json`));
 assert.ok(city.parks.length>500&&city.parks.some(p=>p.kind==='Metsä')&&city.parks.some(p=>p.kind==='Nurmi'));
 assert.match(osm.license,/ODbL/);assert.ok(osm.parks.length>500&&osm.parks.every(p=>p.id.startsWith('osm-')));
 assert.ok(city.parks.every(p=>!p.id.startsWith('osm-')),'OSM-derived areas stay out of the municipal pack');
 const surfaces=JSON.parse(readFileSync(`public/data/${espoo.dir}/surface-index.json`));for(const k of ['parks','osm'])assert.ok(surfaces.some(r=>r.file.includes(`/surfaces/${k}-`)));
 for(const r of surfaces)assert.ok(existsSync(`public/data/${r.file}.pack`),r.file);
 const edges=mobility.roads.edges,limited=edges.filter(e=>e.speed);assert.ok(limited.length>edges.length*.9);
 assert.ok(limited.every(e=>e.speed>=20&&e.speed<=100&&e.speed%10===0));assert.ok(edges.some(e=>e.speed>=80),'Länsiväylä');
 assert.ok(edges.some(e=>e.laneOffsets?.length>=2)&&edges.every(e=>!e.laneOffsets||e.laneOffsets.length<=3));
 assert.match(espoo.provenance.note,/park register/);assert.match(espoo.provenance.sources.speedLimits,/Digiroad/);
});
