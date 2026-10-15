import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {parseBuildings,parseCentrelines,toLocal,triangulate,ringNormal,buildingBase,footprints,shelfPack,planAtlas,atlasUv,jpegSize,splitAtJunctions,joinSeam,affineFit} from '../scripts/espoo-citygml.mjs';
import {coastlineWater,joinWays} from '../scripts/osm-water.mjs';
import {mergeGraph} from '../src/extensions.js';
import {ORIGIN_GK25,local} from '../scripts/extension-geometry.mjs';

const pos=pts=>pts.map(p=>`<gml:pos srsDimension="3">${p.join(' ')}</gml:pos>`).join('');
const E=25490000,N=6673000;
// A 10 × 6 m box building, ground at 8 m (N2000), eaves at 14 m; one textured wall, one coloured roof.
const GML=`<wfs:FeatureCollection><gml:featureMember><bldg:Building gml:id="Building_1">
<gen:stringAttribute name="rakennustunnus"><gen:value>X1</gen:value></gen:stringAttribute>
<gen:stringAttribute name="osoite"><gen:value>Otakaari 1, 02150 ESPOO</gen:value></gen:stringAttribute>
<app:appearance><app:Appearance>
<app:surfaceDataMember><app:X3DMaterial><app:diffuseColor>0.5 0.4 0.3</app:diffuseColor><app:target>#Roof_1</app:target></app:X3DMaterial></app:surfaceDataMember>
<app:surfaceDataMember><app:ParameterizedTexture><app:imageURI>https://example.invalid/textures/2024l3/w1.jpg</app:imageURI><app:target uri="#Wall_1"><app:TexCoordList><app:textureCoordinates ring="Wall_1_0">0 0 1 0 1 1 0 1 0 0</app:textureCoordinates></app:TexCoordList></app:target></app:ParameterizedTexture></app:surfaceDataMember>
</app:Appearance></app:appearance>
<bldg:boundedBy><bldg:GroundSurface><bldg:lod2MultiSurface><gml:MultiSurface><gml:surfaceMember><gml:Polygon gml:id="FtPrnt_1"><gml:exterior><gml:LinearRing gml:id="FtPrnt_1_0">${pos([[E,N,8],[E,N+6,8],[E+10,N+6,8],[E+10,N,8],[E,N,8]])}</gml:LinearRing></gml:exterior></gml:Polygon></gml:surfaceMember></gml:MultiSurface></bldg:lod2MultiSurface></bldg:GroundSurface></bldg:boundedBy>
<bldg:boundedBy><bldg:WallSurface><bldg:lod2MultiSurface><gml:MultiSurface><gml:surfaceMember><gml:Polygon gml:id="Wall_1"><gml:exterior><gml:LinearRing gml:id="Wall_1_0">${pos([[E,N,8],[E+10,N,8],[E+10,N,14],[E,N,14],[E,N,8]])}</gml:LinearRing></gml:exterior></gml:Polygon></gml:surfaceMember></gml:MultiSurface></bldg:lod2MultiSurface></bldg:WallSurface></bldg:boundedBy>
<bldg:boundedBy><bldg:RoofSurface><bldg:lod2MultiSurface><gml:MultiSurface><gml:surfaceMember><gml:Polygon gml:id="Roof_1"><gml:exterior><gml:LinearRing gml:id="Roof_1_0">${pos([[E,N,14],[E+10,N,14],[E+10,N+6,14],[E,N+6,14],[E,N,14]])}</gml:LinearRing></gml:exterior><gml:interior><gml:LinearRing gml:id="Roof_1_1">${pos([[E+4,N+2,14],[E+4,N+4,14],[E+6,N+4,14],[E+6,N+2,14],[E+4,N+2,14]])}</gml:LinearRing></gml:interior></gml:Polygon></gml:surfaceMember></gml:MultiSurface></bldg:lod2MultiSurface></bldg:RoofSurface></bldg:boundedBy>
</bldg:Building></gml:featureMember></wfs:FeatureCollection>`;

test('Espoo CityGML: surfaces, textures, colours and attributes are read',()=>{
 const [b]=parseBuildings(GML);
 assert.equal(b.id,'Building_1');assert.equal(b.address,'Otakaari 1');assert.equal(b.buildingId,'X1');
 assert.deepEqual(b.polys.map(p=>p.kind),['ground','wall','roof']);
 const wall=b.polys[1],roof=b.polys[2];
 assert.equal(wall.texture.uri,'https://example.invalid/textures/2024l3/w1.jpg');assert.deepEqual(wall.texture.uv.Wall_1_0[2],[1,1]);
 assert.deepEqual(roof.color,[.5,.4,.3]);assert.equal(roof.rings.length,2);
});

test('GK25 to the game frame is a pure translation: x = E − E0, z = N0 − N, y = height',()=>{
 assert.deepEqual(toLocal([100,200],[130,150,7]),[30,7,50]);
 // The frame's origin is the Cathedral origin projected to ETRS-GK25.
 const p=local([24.9522,60.1701]);assert.ok(Math.abs(p[0])<.01&&Math.abs(p[1])<.01);
 assert.ok(Math.abs(ORIGIN_GK25[0]-25497346.46)<.1&&Math.abs(ORIGIN_GK25[1]-6673025.26)<.1);
});

test('triangles keep the outward winding, roofs keep their holes, and holes get texture coordinates',()=>{
 const [b]=parseBuildings(GML),o=[E,N];
 const rings=p=>p.rings.map(r=>r.points.map(q=>toLocal(o,q)));
 for(const p of b.polys.slice(1)){
  const n=ringNormal(rings(p)[0]),tris=triangulate(rings(p),p.texture?p.rings.map(r=>p.texture.uv[r.id]):[]);
  for(const t of tris){const [a,c,d]=t.map(v=>v[0]),cx=(c[1]-a[1])*(d[2]-a[2])-(c[2]-a[2])*(d[1]-a[1]),cy=(c[2]-a[2])*(d[0]-a[0])-(c[0]-a[0])*(d[2]-a[2]),cz=(c[0]-a[0])*(d[1]-a[1])-(c[1]-a[1])*(d[0]-a[0]);assert.ok(cx*n[0]+cy*n[1]+cz*n[2]>0);}
  if(p.kind==='roof'){const area=tris.reduce((s,t)=>{const [a,c,d]=t.map(v=>v[0]);return s+Math.abs((c[0]-a[0])*(d[2]-a[2])-(d[0]-a[0])*(c[2]-a[2]))/2;},0);assert.ok(Math.abs(area-56)<1e-6,'60 m² minus a 4 m² hole');}
  if(p.kind==='wall')assert.ok(tris.flat().every(([,uv])=>uv&&uv[0]>=0&&uv[0]<=1));
 }
 const fit=affineFit([[0,0],[10,0],[10,6],[0,6]],[[0,0],[1,0],[1,1],[0,1]]);assert.deepEqual(fit(5,3).map(v=>+v.toFixed(6)),[.5,.5]);
});

test('levelling: every building stands on the street level from its lowest ground point',()=>{
 const [b]=parseBuildings(GML);assert.equal(buildingBase(b),8);
 const [ring]=footprints(b,[E,N])[0];assert.deepEqual(ring[0],[0,0]);assert.deepEqual(ring.at(-1),ring[0]);assert.equal(ring.length,5);
});

test('atlas packing: rectangles never overlap, stay inside, and UVs land inside their rectangle',()=>{
 const rects=Array.from({length:60},(_,i)=>({w:20+i*7%90,h:15+i*13%70})),placed=shelfPack(rects,512,2);
 assert.ok(placed);
 for(let i=0;i<rects.length;i++){const a={...rects[i],...placed[i]};assert.ok(a.x>=2&&a.y>=2&&a.x+a.w<=510&&a.y+a.h<=510);
  for(let j=0;j<i;j++){const c={...rects[j],...placed[j]};assert.ok(a.x+a.w+2<=c.x||c.x+c.w+2<=a.x||a.y+a.h+2<=c.y||c.y+c.h+2<=a.y,`${i} overlaps ${j}`);}}
 assert.equal(shelfPack([{w:600,h:10}],512),null);
 // Big photos are resampled to the texel budget; the plan coarsens until everything fits one atlas.
 const plan=planAtlas([{w:4000,h:3000,area:1200},{w:80,h:100,area:40},{w:3000,h:3000,area:900}],{size:1024,metresPerPixel:.05});
 assert.ok(plan.metresPerPixel>=.05&&plan.rects.every(r=>r.x+r.w<=1024&&r.y+r.h<=1024));
 assert.ok(plan.rects[1].w<=80&&plan.rects[1].h<=100,'never upsampled');
 const r={x:100,y:200,w:50,h:40},[u0,v0]=atlasUv([0,0],r,1024),[u1,v1]=atlasUv([1,1],r,1024);
 assert.ok(u0>100/1024&&u0<101/1024&&v0<240/1024&&v0>239/1024,'t = 0 is the image bottom');
 assert.ok(u1<150/1024&&v1>200/1024&&v1<201/1024);
 const jpeg=Buffer.from([0xff,0xd8,0xff,0xe0,0,4,0,0,0xff,0xc0,0,17,8,0,40,0,50,3]);assert.deepEqual(jpegSize(jpeg),{w:50,h:40});
});

test('centrelines split at T-junctions and the Espoo graph joins the Helsinki graph at the border',()=>{
 const xml=`<GIS:Keskilinjat><GIS:LineId>1</GIS:LineId><GIS:Kadunnimi>Länsiväylä</GIS:Kadunnimi><GIS:Katuosalaji>Ajorata</GIS:Katuosalaji><GIS:Kulkusuunta>1, Piirtosuuntaan</GIS:Kulkusuunta><gml:LineString>${pos([[0,0,1],[100,0,1]])}</gml:LineString></GIS:Keskilinjat>`;
 const [line]=parseCentrelines(xml);assert.equal(line.direction,1);assert.equal(line.name,'Länsiväylä');
 const split=splitAtJunctions([{points:[[0,0],[100,0]]},{points:[[50,.3],[50,40]]}]);
 assert.equal(split.length,3);assert.ok(split.some(l=>l.points.at(-1)[0]===50&&l.points.length===2));
 // Espoo dead end 6 m from a Helsinki dead end: moved onto it, then the runtime merge snaps them.
 const helsinki={nodes:[[-6000,100],[-6100,100]],edges:[{from:0,to:1,points:[[-6000,100],[-6100,100]],signal:-1},{from:1,to:0,points:[[-6100,100],[-6000,100]],signal:-1}]};
 const espoo={nodes:[[-6105,103],[-6300,100]],edges:[{from:0,to:1,points:[[-6105,103],[-6300,100]],signal:-1},{from:1,to:0,points:[[-6300,100],[-6105,103]],signal:-1}]};
 assert.equal(joinSeam(espoo,helsinki,25),1);assert.deepEqual(espoo.nodes[0],[-6100,100]);assert.deepEqual(espoo.edges[1].points.at(-1),[-6100,100]);
 const base={nodes:helsinki.nodes.map(p=>[...p]),edges:[...helsinki.edges]},remap=mergeGraph(base,espoo,0);
 assert.equal(remap[0],1,'shared border node');assert.equal(base.nodes.length,3);
});

test('OSM coastline: land on the left, sea is the rest of the box, islands become holes',()=>{
 assert.equal(joinWays([[[0,0],[1,0]],[[1,0],[2,0]]]).length,1);
 const sea=coastlineWater([[[12,5],[-2,5]],[[2,7],[4,7],[4,9],[2,9],[2,7]]],[0,0,10,10]);
 assert.equal(sea.length,1);assert.equal(sea[0].length,2,'sea with one island hole');
 assert.ok(sea[0][0].every(([,n])=>n>=5),'land (south of the westward coastline) is not sea');
 const bay=coastlineWater([[[12,5],[5,5]],[[5,5],[5,12]]],[0,0,10,10]);
 assert.deepEqual(bay[0][0].map(p=>p.join()).sort(),['10,10','10,5','5,10','5,5','5,5'].sort());
});

const INDEX='public/data/extensions/index.json',espoo=false;
test('Espoo area: textured tiles, starts on mapped roads, joined to the Länsiväylä graph',{skip:'Finland city is not part of this build'},()=>{
 assert.ok(espoo.counts.texturedBuildings>500&&espoo.counts.atlases>=espoo.counts.texturedTiles);
 assert.deepEqual(espoo.starts.map(s=>s.name),['Keilaniemi','Otaniemi (Aalto University)','Tapiola centre']);
 assert.ok(espoo.seam.roads>=2,'Länsiväylä carriageways meet the Helsinki network');
 assert.match(espoo.provenance.credit,/Espoon kaupunki, CC BY 4\.0/);
 const index=JSON.parse(readFileSync(`public/data/${espoo.dir}/buildings3d-index.json`));
 for(const t of index.tiles.slice(0,5)){const u=gunzipSync(readFileSync(`public/data/${t.file}`)),a=new Float32Array(u.buffer.slice(u.byteOffset,u.byteOffset+u.length));assert.equal(a.length%15,0);for(const p of t.parts)if(p.texture)assert.ok(existsSync(`public/data/${p.texture}`));
  for(let i=1;i<a.length;i+=5)assert.ok(a[i]>=.11&&a[i]<250,'levelled heights');}
});

test('one continuous drive: Ruoholahti → Länsiväylä → Lauttasaari → Keilaniemi → Tapiola and back, inside the playable area',{skip:'Finland city is not part of this build'},async()=>{
 const {SpatialIndex,clearPlayableAreas,insidePlayable}=await import('../src/geo.js'),{makeCar,driveStep}=await import('../src/physics.js'),{applyExtensions}=await import('../src/extensions.js');
 const unpack=f=>JSON.parse(gunzipSync(readFileSync(f))),json=f=>JSON.parse(readFileSync(f)),index=json(INDEX),data=unpack('public/data/city.pack'),mobility=json('public/data/mobility.json');
 const exts=index.extensions.map(e=>{const city=unpack(`public/data/${e.dir}/city.pack`);if(e.osmWater)city.water.push(...json(`public/data/${e.dir}/${e.osmWater}`).water);return {...e,city,buildings:{tiles:[],buildings:0},surfaces:[],mobility:json(`public/data/${e.dir}/mobility.json`)};});
 clearPlayableAreas();applyExtensions(exts,{data,roofIndex:{tiles:[],buildings:0},surfaceIndex:[],mobility});
 const g=mobility.roads,adj=new Map();g.edges.forEach(e=>{if(!e.points.every(p=>insidePlayable(p[0],p[1],3)))return;if(!adj.has(e.from))adj.set(e.from,[]);adj.get(e.from).push(e);});
 const near=(x,z)=>{let b=-1,d=Infinity;g.nodes.forEach((p,i)=>{const q=Math.hypot(p[0]-x,p[1]-z);if(q<d&&adj.has(i)){d=q;b=i;}});return b;};
 const world={buildings:new SpatialIndex(data.buildings),roads:new SpatialIndex(data.roads.filter(r=>!/Koroke/.test(r.kind))),pavement:new SpatialIndex(data.pavement),water:data.water};
 for(const [a,b] of [[[-1750,470],[-7897,-631]],[[-7897,-631],[-1750,470]]]){
  const from=near(...a),to=near(...b),prev=new Map([[from,null]]),queue=[from];
  for(let i=0;i<queue.length&&!prev.has(to);i++)for(const e of adj.get(queue[i])||[])if(!prev.has(e.to)){prev.set(e.to,e);queue.push(e.to);}
  assert.ok(prev.has(to),`road network joins ${a} to ${b}`);
  const path=[];for(let n=to;n!==from;){const e=prev.get(n);path.unshift(...e.points.slice(1));n=e.from;}
  const car=makeCar(...g.nodes[from],0);let target=0,blocked=0;
  for(let i=0;i<60000&&target<path.length;i++){const [tx,tz]=path[target];if(Math.hypot(tx-car.x,tz-car.z)<2.5){target++;continue;}
   car.heading=Math.atan2(-(tx-car.x),-(tz-car.z));car.speed=9;car.steer=0;if(driveStep(car,new Set(),1/20,world).collision){blocked++;car.x=tx;car.z=tz;target++;}}
  assert.equal(target,path.length);assert.ok(blocked<=2,`${blocked} blocked steps along ${path.length} points`);
 }
 clearPlayableAreas();
});
