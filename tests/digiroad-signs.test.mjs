import test from 'node:test';
import assert from 'node:assert/strict';
import proj4 from 'proj4';
import {localFrame,surfaceIndex} from '../scripts/mapillary-features.mjs';
import {CRS,projector} from '../scripts/official-wfs.mjs';
import {facingTraffic,rightOf,travelFromBearing,digiroadSigns,digiroadPosts,crossingFurniture,stopFurniture,mergeOfficial,mergeWithDetections,mergeIntoFurniture,
 groupPosts,linkGraph,regulationStarts,osmSigns,osmPosts,current,laneTravel,digiroadLightPosts,isFinnish} from '../scripts/digiroad-signs.mjs';
import {finnishCode,finnishSign,signFace,signFamily} from '../src/sign-faces.js';
import {plateLayout} from '../src/mapped-furniture.js';

const ORIGIN=[23.76163,61.4978],frame=localFrame(ORIGIN);
const square=(x0,z0,x1,z1)=>[[[x0,z0],[x1,z0],[x1,z1],[x0,z1],[x0,z0]]];
// A 20 m wide east-west carriageway (z −10…10), pavements either side, a building to the north.
const city={roads:[{kind:'Ajorata',rings:square(-200,-10,200,10)}],buildings:[{rings:square(-20,-60,20,-30)}],pavement:[{kind:'Jalkakäytävä',rings:square(-200,-20,200,-10)},{kind:'Jalkakäytävä',rings:square(-200,10,200,20)}]};
const surfaces=surfaceIndex(city),close=(a,b,e=1e-6)=>Math.abs(Math.atan2(Math.sin(a-b),Math.cos(a-b)))<e;
const EAST=[1,0],WEST=[-1,0];
const local=(x,z)=>[x,z],identity=([x,y])=>[x,y]; // test geometry already in the local frame

test('Finnish sign codes: current and old numbers, values, families, unknown codes', {skip:'Finland city is not part of this build'},()=>{
 assert.deepEqual(finnishCode('FI:C32[40]'),{code:'C32',value:'40'});
 assert.deepEqual(finnishCode('361','50'),{code:'C32',value:'50'},'old number with a Digiroad value');
 assert.equal(finnishCode('FI:511').code,'E1');assert.equal(finnishCode('231').code,'B5');assert.equal(finnishCode('FI:551[right]').code,'E14.1');
 // Same face as the Mapillary detection of the same sign: the layers dedupe by face.
 assert.equal(finnishSign('FI:C32[40]').face,signFace('regulatory--maximum-speed-limit-40').face);
 assert.equal(finnishSign('FI:E1').face,signFace('information--pedestrians-crossing').face);
 assert.equal(finnishSign('FI:B5').face,'yield');assert.equal(finnishSign('FI:C17').face,'no-entry');assert.equal(finnishSign('FI:C38').face,'no-parking');
 assert.equal(finnishSign('C22','430').text,'4.3','height in centimetres becomes metres');assert.equal(finnishSign('C24','12000').text,'12t');assert.equal(finnishSign('FI:345[60 t]').text,'60t');
 assert.deepEqual([finnishSign('FI:E6').shape,finnishSign('FI:E6').icon],['stop','bus']);assert.equal(finnishSign('FI:533').icon,'tram');
 assert.equal(finnishSign('FI:B1').shape,'diamond');assert.equal(finnishSign('FI:A25').mark,'tram');
 assert.ok(finnishSign('FI:I10.1').device,'I-series devices are not plates');
 assert.equal(finnishSign('FI:645[Hervanta]').shape,'board','unknown old guide sign: a board');assert.equal(finnishSign('FI:H24').shape,'small');
 assert.equal(signFamily('speed-30'),signFamily('speed-50'));assert.notEqual(signFamily('no-parking'),signFamily('no-stopping'));
 // Faces shared by two families get distinct atlas keys.
 assert.notEqual(signFace('warning--pedestrians-crossing').face,signFace('information--pedestrians-crossing').face);
 assert.notEqual(signFace('complementary--turn-left').face,signFace('regulatory--turn-left').face);
});

test('projection: ETRS-TM35FIN (Digiroad) and ETRS-GK24 (Tampere) land in the same local frame', {skip:'Finland city is not part of this build'},()=>{
 const at=[23.7600,61.4990],tm=proj4('EPSG:4326',CRS['EPSG:3067']).forward(at),gk=proj4('EPSG:4326',CRS['EPSG:3878']).forward(at);
 assert.ok(gk[0]>24e6,'GK24 eastings carry the zone number');
 const a=projector('urn:ogc:def:crs:EPSG::3067',frame.local)(tm),b=projector('EPSG:3878',frame.local)(gk),c=frame.local(...at);
 for(const p of [a,b])assert.ok(Math.hypot(p[0]-c[0],p[1]-c[1])<.02,`${p} vs ${c}`);
 assert.ok(a[1]<0&&a[0]<0,'north-west of the origin: −x, −z');
 // Tampere's register: stop "Keskustori H" sits on the bus bays just south of Hämeenkatu.
 const [x,z]=projector('EPSG:3067',frame.local)([327640.501,6822489.826]);assert.ok(Math.abs(x+5.7)<.1&&Math.abs(z-29.2)<.1,`${x},${z}`);
 assert.ok(isFinnish({country:'Suomi / Finland'})&&!isFinnish({country:'Eesti'}));
});

test('facing: plates face the traffic they govern, posts stand on its right-hand kerb', {skip:'Finland city is not part of this build'},()=>{
 assert.ok(close(facingTraffic(EAST),-Math.PI/2,1e-3),'eastbound traffic reads a plate looking west');
 assert.deepEqual(rightOf(EAST).map(v=>v+0),[0,1],'eastbound: kerb to the south (+z)');
 const t=travelFromBearing(90);assert.ok(Math.abs(t[0]-1)<1e-9&&Math.abs(t[1])<1e-9,'compass 90° is east');
 // Digiroad: a link digitised west→east; validity 4 = along it, 3 = against it.
 const links={features:[{properties:{link_id:'L',ajosuunta:2},geometry:{type:'LineString',coordinates:[[-100,0],[100,0]]}}]};
 const sign=(id,tyyppi,liiksuunta,extra={})=>({properties:{id,tyyppi,liiksuunta,arvo:'',tila:'3',link_id:'L',sijaintitr:1,...extra},geometry:{type:'Point',coordinates:[0,0]}});
 const signs=digiroadSigns({features:[sign('a','C32',4,{arvo:'30',kilpityyp1:'H24'}),sign('b','B5',3),sign('c','C32',4,{tila:'6'}),sign('d','F10',4,{sijaintitr:3}),sign('e','C32',4,{viim_vo_pv:'2020-01-01'})]},links,{project:identity});
 assert.deepEqual(signs.map(s=>s.id),['a','b'],'removed, overhead and expired signs are skipped');
 assert.deepEqual(signs[0].travel,EAST);assert.deepEqual(signs[1].travel.map(v=>v+0),WEST);
 const {posts}=digiroadPosts(signs,surfaces,()=>null);
 const a=posts.find(p=>p.refs.digiroad.includes('a')),b=posts.find(p=>p.refs.digiroad.includes('b'));
 assert.ok(a.z>10&&a.z<11.5,`eastbound sign on the south kerb (${a.z})`);assert.ok(b.z<-10&&b.z>-11.5,`westbound sign on the north kerb (${b.z})`);
 assert.deepEqual(a.plates.map(p=>p.face),['speed-30','fi-h-plate'],'extra plate under the main sign');assert.ok(a.plates.every(p=>close(p.yaw,-Math.PI/2,1e-3)));
 assert.ok(close(b.plates[0].yaw,Math.PI/2,1e-3));
 // A sign on the left side (sijaintitr 2) goes to the left kerb.
 const left=digiroadPosts(digiroadSigns({features:[sign('l','C38',4,{sijaintitr:2})]},links,{project:identity}),surfaces,()=>null).posts[0];assert.ok(left.z<-10);
 // Without a link the nearest lane that has the point on its right decides.
 const lanes=laneTravel([{points:[[-100,3],[100,3]],lane:0},{points:[[100,-3],[-100,-3]],lane:0}]);
 assert.deepEqual(lanes(0,9),EAST);assert.deepEqual(lanes(0,-9).map(v=>v+0),WEST);
});

test('crossings: an E1 at each kerb for the traffic keeping to that side; signals get pedestrian heads instead', {skip:'Finland city is not part of this build'},()=>{
 const {signs,lights}=crossingFurniture([{id:'z',ends:[[0,-10],[0,10]],signs:true,signalled:false,src:'city'},{id:'s',ends:[[60,-10],[60,10]],signs:true,signalled:true,src:'city'}],surfaces);
 assert.equal(signs.length,2);assert.equal(lights.length,2);
 const north=signs.find(s=>s.z<0),south=signs.find(s=>s.z>0);
 assert.ok(north.z<-10&&south.z>10,'on the pavements');
 assert.ok(close(north.plates[0].yaw,Math.PI/2,1e-3),'north kerb: westbound traffic, plate looks east');assert.ok(close(south.plates[0].yaw,-Math.PI/2,1e-3));
 assert.ok(north.x>0&&south.x<0,'set back a little upstream of the stripes');
 const ln=lights.find(l=>l.z<0);assert.ok(close(ln.yaw,0,1e-3),'the head on the north kerb looks across at the south kerb');assert.equal(ln.kind,'crossing-light');
});

test('stops: a double-sided E6 at the kerb and a shelter behind it, open to the road', {skip:'Finland city is not part of this build'},()=>{
 const {signs,shelters}=stopFurniture([{id:'1',name:'Keskusta A',x:20,z:10.2,travel:EAST,shelter:true,tram:false,src:'city'},{id:'2',name:'Raitio',x:60,z:-10.2,travel:WEST,shelter:false,tram:true,src:'city'}],surfaces,()=>null);
 assert.equal(signs.length,2);assert.equal(shelters.length,1);
 assert.deepEqual(signs[0].plates.map(p=>p.face),['fi-e6','fi-e6']);assert.ok(close(signs[0].plates[1].yaw,signs[0].plates[0].yaw+Math.PI,1e-3));
 assert.equal(signs[1].plates[0].face,'fi-e7');
 const s=shelters[0];assert.ok(s.z>signs[0].z+1,'behind the sign, away from the road');assert.ok(close(s.yaw,Math.PI,1e-3),'open side towards the road (north)');
 assert.equal(stopFurniture([{id:'3',x:20,z:10.2,travel:EAST,shelter:true,src:'city'}],surfaces,()=>null,{avoid:()=>true}).shelters.length,0,'none where a place builds its own');
});

test('sign posts: plates at one spot share a post; plate layout stacks them by facing', {skip:'Finland city is not part of this build'},()=>{
 const p=(x,codes,yaw,src='osm')=>({kind:'sign',x,z:12,plates:codes.map(c=>{const f=signFace(c);return {code:f.code,face:f.face,yaw,shape:f.shape};}),src,refs:{[src]:[String(x)]}});
 const posts=groupPosts([p(0,['FI:C38'],0),p(.5,['FI:C37'],0),p(.6,['FI:C38'],Math.PI),p(5,['FI:B5'],0)]);
 assert.equal(posts.length,2);assert.deepEqual(posts[0].plates.map(x=>x.face),['no-parking','no-stopping','no-parking']);
 const layout=plateLayout(posts[0].plates.map(x=>({face:x.face,code:x.code})),posts[0].plates.map(x=>x.yaw));
 assert.ok(layout[1].y<layout[0].y,'second plate facing the same way hangs below');assert.equal(layout[2].y,layout[0].y,'back-to-back plate at the top');
});

test('merge: official code and facing, photographed position, both provenances; doubles across sources', {skip:'Finland city is not part of this build'},()=>{
 const plate=(c,yaw)=>{const f=signFace(c);return {code:f.code,face:f.face,yaw,shape:f.shape};};
 const official=[
  {kind:'sign',x:0,z:12,plates:[plate('FI:C32[30]',0)],src:'digiroad',refs:{digiroad:['d1']}},
  {kind:'sign',x:40,z:12,plates:[plate('FI:E1',0)],src:'city',refs:{city:['c1']}},
  {kind:'sign',x:80,z:12,plates:[plate('FI:B5',0)],src:'city',refs:{city:['c2']}},
  {kind:'sign',x:120,z:12,plates:[plate('FI:C38',0)],src:'osm',refs:{osm:['o1']}}];
 const items=[
  {k:'sign',x:3,z:13,yaw:.2,faces:['speed-40','complementary-text'],yaws:[.2,.2],mly:['m1'],src:'mapillary'}, // same sign (number misread), extra plate
  {k:'sign',x:41,z:12.5,yaw:Math.PI,faces:['pedestrians-crossing'],yaws:[Math.PI],mly:['m2'],src:'mapillary'}, // other side of the road: not this plate
  {k:'sign',x:81,z:13,yaw:0,faces:['generic-plate'],yaws:[0],mly:['m3'],src:'mapillary'}, // "a sign" here: the official one
  {k:'sign',x:120.5,z:12.2,yaw:Math.PI/2,faces:['no-stopping'],yaws:[Math.PI/2],mly:['m4'],src:'mapillary'}, // another sign on the same post
  {k:'lamp',x:200,z:12,yaw:0,mly:['m5'],src:'mapillary'}];
 const {posts,items:rest,stats}=mergeWithDetections(official,items);
 const speed=posts[0];assert.equal(speed.src,'digiroad+mapillary');assert.deepEqual([speed.x,speed.z],[3,13],'detected post position');
 assert.deepEqual(speed.plates.map(p=>p.face),['speed-30','complementary-text'],'official code wins; the other detected plate stays');assert.deepEqual(speed.refs,{digiroad:['d1'],mapillary:['m1']});
 assert.equal(posts[1].src,'city','an opposite-facing detection is a different plate');
 assert.equal(posts[2].src,'city');assert.deepEqual(posts[2].refs.mapillary,['m3'],'untyped detection absorbed');
 assert.equal(posts[3].src,'osm+mapillary');assert.deepEqual(posts[3].plates.map(p=>p.face),['no-stopping','no-parking'],'one post, two signs');
 assert.deepEqual(rest.map(i=>i.mly[0]),['m2','m5']);assert.deepEqual([stats.matchedPosts,stats.absorbedGeneric,stats.sharedPost],[1,1,1]);
 // Official sources against each other: the higher-priority one keeps the sign, the other adds its id.
 const m=mergeOfficial([[official[1]],[{kind:'sign',x:43,z:12.5,plates:[plate('FI:511',.3)],src:'osm',refs:{osm:['o9']}}]]);
 assert.equal(m.posts.length,1);assert.equal(m.duplicates,1);assert.deepEqual(m.posts[0].refs,{city:['c1'],osm:['o9']});
 // Into furniture.json: provenance kept, faces listed once with a drawable code.
 const out=mergeIntoFurniture({items,faces:[{face:'speed-40',code:'regulatory--maximum-speed-limit-40'},{face:'complementary-text',code:'complementary--texts'}]},{signs:official.slice(0,1),lights:[],shelters:[]});
 const s=out.items.find(i=>i.src==='digiroad+mapillary');assert.deepEqual(s.ref,{digiroad:['d1']});assert.deepEqual(s.mly,['m1']);
 assert.ok(out.faces.some(f=>f.face==='speed-30'&&f.code==='FI:C32[30]'));assert.ok(!out.faces.some(f=>f.face==='speed-40'),'unused faces dropped');
});

test('regulations: a sign where a speed limit, restriction or bus lane begins for arriving traffic', {skip:'Finland city is not part of this build'},()=>{
 const line=(id,a,b,dir=2)=>({properties:{link_id:id,ajosuunta:dir},geometry:{type:'LineString',coordinates:[a,b]}});
 const graph=linkGraph({features:[line('A',[-100,0],[0,0]),line('B',[0,0],[100,0]),line('C',[0,-100],[0,0])]},identity);
 const speed=(id,link,value,extra={})=>({id,link,from:0,to:100,dir:1,value,codes:[`C32[${value}]`],...extra});
 const starts=regulationStarts([speed('a','A','40'),speed('b','B','30'),speed('c','C','30')],graph,{missingIsDifferent:false});
 // 40 → 30 eastbound into B; 30 → 40 westbound into A; C (30) gets a sign for traffic arriving from A (40).
 const into=id=>starts.filter(s=>s.id===id);
 assert.equal(into('b').length,1);assert.deepEqual(into('b')[0].travel,EAST);assert.ok(Math.abs(into('b')[0].x-3)<.01,'three metres past the junction');
 assert.equal(into('a').length,1);assert.deepEqual(into('a')[0].travel.map(v=>v+0),WEST);
 assert.equal(into('c').length,1);assert.deepEqual(into('c')[0].travel.map(v=>v+0),[0,-1],'northbound on C');
 // A restriction starting mid-link, one-way: one sign at its start.
 const r=regulationStarts([{id:'r',link:'B',from:40,to:100,dir:2,value:'C2',codes:['C2']}],graph,{missingIsDifferent:true});
 assert.equal(r.length,1);assert.ok(Math.abs(r[0].x-43)<.01);
 // Unknown neighbours do not create speed signs.
 assert.equal(regulationStarts([speed('b','B','30')],graph,{missingIsDifferent:false}).length,0);
});

test('OpenStreetMap sign nodes: Finnish codes, give-way direction along the way, standalone bearings', {skip:'Finland city is not part of this build'},()=>{
 const n=(id,lon,lat,tags)=>({type:'node',id,lon,lat,tags}),geo=(x,z)=>({lon:x,lat:z});
 const elements=[n(1,-50,0,{}),n(2,-5,0,{highway:'give_way'}),n(3,0,0,{}),n(4,20,30,{traffic_sign:'FI:C32[30];FI:H24',direction:'90'}),n(5,-30,0,{traffic_sign:'FI:372',direction:'backward'}),n(6,40,40,{traffic_sign:'DE:274[30]'}),
  {type:'way',id:9,nodes:[1,5,2,3],tags:{highway:'residential'}}].map(e=>e.type==='node'?{...e,...geo(e.lon,e.lat)}:e);
 const signs=osmSigns(elements,{local});
 assert.deepEqual(signs.map(s=>s.id),['2','4','5'],'other countries’ codes are skipped');
 const gw=signs.find(s=>s.id==='2');assert.deepEqual(gw.codes,['FI:B5']);assert.deepEqual(gw.travel,EAST,'towards the junction at the end of the way');
 assert.deepEqual(signs.find(s=>s.id==='5').travel.map(v=>v+0),WEST);
 const free=signs.find(s=>s.id==='4');assert.ok(close(free.facing,Math.PI/2,1e-3),'direction=90: the face looks east');assert.deepEqual(free.codes,['FI:C32[30]','FI:H24']);
 const {posts}=osmPosts(signs,surfaces,()=>null);assert.equal(posts.length,3);assert.ok(posts.find(p=>p.refs.osm[0]==='2').z>10);
});

test('signals: Digiroad light points add approach posts only where a junction has none', {skip:'Finland city is not part of this build'},()=>{
 const graph=linkGraph({features:[{properties:{link_id:'A',ajosuunta:2},geometry:{type:'LineString',coordinates:[[-100,0],[0,0]]}}]},identity);
 const lights={features:[{properties:{id:7,link_id:'A'},geometry:{type:'Point',coordinates:[-4,0]}}]};
 const {posts}=digiroadLightPosts(lights,graph,identity,[],surfaces);
 assert.equal(posts.length,1);assert.ok(posts[0].z>10,'eastbound approach: right-hand kerb');assert.ok(close(posts[0].yaw,-Math.PI/2,1e-3));
 assert.equal(digiroadLightPosts(lights,graph,identity,[{x:-6,z:12},{x:6,z:-12}],surfaces).posts.length,0,'generated posts already there');
 assert.ok(current('2014-03-17','',  '2026-10-09')&&!current('2014-03-17','2025-06-16','2026-10-09')&&!current('2027-01-01','','2026-10-09')&&current('','19.05.2030','2026-10-09'));
});
