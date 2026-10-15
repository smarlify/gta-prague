import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {matchPaving,speciesFamily,registerHeight,platformsFor,polesAlong,shelterFrom,validatePlace,PAVINGS,LANDMARKS,pointInRing} from '../src/place-data.js';
import {commonsDate,isCurrent,pickStreetImages,commonsCategories} from '../src/reference-photos.js';

const square=[[0,0],[10,0],[10,10],[0,10],[0,0]];
test('paving rules: first match wins, regexes and centroid box', () => {
 const rules=[{layer:'paths',street:'KESKUSTORI$',type:'TORI',bbox:[-100,-100,100,4],paving:'cobbles'},{layer:'paths',street:'KESKUSTORI$',type:'TORI',paving:'fan-setts'},{layer:'streets',type:'RAITIOTIE',paving:'tram-blocks'}];
 assert.equal(matchPaving(rules,{layer:'paths',street:'KESKUSTORI',type:'TORI / AUKIO'},square),'fan-setts');
 assert.equal(matchPaving(rules,{layer:'paths',street:'KESKUSTORI',type:'TORI / AUKIO'},square.map(([x,z])=>[x,z-20])),'cobbles');
 assert.equal(matchPaving(rules,{layer:'streets',street:'HÄMEENKATU',type:'AJORATA/RAITIOTIE'},square),'tram-blocks');
 assert.equal(matchPaving(rules,{layer:'paths',street:'KESKUSTORIN TALVIVÄYLÄT',type:'TORI'},square),null);
});
test('register species map to tree families; heights from class, girth or family', () => {
 assert.equal(speciesFamily('TILIA X VULGARIS (PUISTOLEHMUS)'),'lime');
 assert.equal(speciesFamily('ACER PLATANOIDES (METSÄVAAHTERA)'),'maple');
 assert.equal(speciesFamily('PICEA PUNGENS (OKAKUUSI)'),'spruce');
 assert.equal(speciesFamily('LARIX SIBIRICA (SIPERIANLEHTIKUUSI)'),'larch');
 assert.equal(speciesFamily('POPULUS TREMULA ERECTA (PYLVÄSHAAPA)'),'columnar');
 assert.equal(speciesFamily('* EI TIETOA *',true),'spruce');
 assert.equal(speciesFamily(''),'broadleaf');
 assert.equal(registerHeight('11 - 15m',0,'lime'),13);
 assert.equal(registerHeight('1 - 5m',30,'lime'),5);
 assert.equal(registerHeight('Ei tietoa',0,'maple'),15);
 assert.ok(registerHeight('Ei tietoa',100,'oak')<=14);
});
test('platforms run along the stop\'s own track, on the side away from the other track', () => {
 const west={points:[[100,0],[-100,0]]},east={points:[[-100,4],[100,4]]};
 const [a]=platformsFor([{name:'A',x:0,z:-1.8}],[west,east],{length:40,width:3,edge:1.5,anchor:'middle'});
 assert.equal(a.length,40);assert.deepEqual(a.side.map(Math.round),[0,-1]);
 for(const [x,z] of a.ring){assert.ok(z<=-1.49&&z>=-4.51,`z ${z}`);assert.ok(x>=-20.01&&x<=20.01,`x ${x}`);}
 const [b]=platformsFor([{name:'B',x:30,z:5.8}],[west,east],{length:20,width:3});
 assert.ok(b.ring.every(([,z])=>z>=5.49),'east platform south of the east track');assert.ok(b.ring.every(([x])=>x<=30.01&&x>=9.99),'front anchor: runs back from the stop');
});
test('masts stand on clear ground at a steady spacing, facing the track', () => {
 const masts=polesAlong([[0,0],[100,0]],(x,z)=>Math.abs(z)>6.4,{spacing:25});
 assert.equal(masts.length,8);
 for(const m of masts){assert.ok(Math.abs(m.z)>=6.5);const toward=[Math.sin(m.yaw),Math.cos(m.yaw)];assert.ok(toward[1]*Math.sign(-m.z)>.99,'arm points at the track');}
});
test('shelter from a small mapped roof', () => {
 const s=shelterFrom([[0,0],[12,0],[12,1.6],[0,1.6],[0,0]]);
 assert.equal(s.length,12);assert.equal(s.depth,1.6);assert.equal(s.x,6);assert.equal(s.yaw,0);
});
test('photo search helpers: Commons dates, currency and thinning', () => {
 assert.equal(commonsDate('2022-06-10 18:01:02'),'2022-06-10');
 assert.equal(commonsDate('Taken on 5 March 2021'),'2021-03-05');
 assert.equal(commonsDate('5.8.2007'),'2007-08-05');
 assert.equal(commonsDate('late 1940s'),'');
 assert.equal(commonsDate('valmistusaika 1957'),'1957');
 assert.ok(isCurrent('2021-07','2021-01-01'));assert.ok(!isCurrent('2020','2021-01-01'));assert.ok(!isCurrent('','2021-01-01'));
 const ims=[{x:0,z:0,heading:10,captured:'2022-01-01'},{x:1,z:1,heading:12,captured:'2023-01-01'},{x:1,z:1,heading:190,captured:'2022-02-01'},{x:500,z:0,heading:0,captured:'2024-01-01'},{x:2,z:2,heading:0,captured:'2019-01-01'}];
 const kept=pickStreetImages(ims,{radius:100});
 assert.deepEqual(kept.map(i=>i.captured),['2023-01-01','2022-02-01']);
 assert.deepEqual(commonsCategories(['Keskustori@2','Category:Tampere Theatre']),[{name:'Keskustori',depth:2},{name:'Tampere Theatre',depth:1}]);
});

// The shipped Keskustori data: reference rules, built place and sources stay consistent.
const ref=null;
const place=null;
const sources=null;
test('Keskustori reference: known paving kinds and landmark types, views tied to listed photos', {skip:'Finland city is not part of this build'}, () => {
 for(const r of ref.paving.rules)assert.ok(PAVINGS.includes(r.paving),r.paving);
 for(const l of ref.landmarks)assert.ok(LANDMARKS.includes(l.type),l.type);
 const listed=new Set(sources.photos.map(p=>p.file));
 for(const v of ref.views){assert.ok(listed.has(v.photo),`${v.photo} must be in keskustori-sources.json`);assert.ok([v.x,v.z,v.heading].every(Number.isFinite));}
});
test('Keskustori place file is valid and complete', {skip:'Finland city is not part of this build'}, () => {
 assert.deepEqual(validatePlace(place),[]);
 assert.equal(place.landmarks.length,4);assert.equal(place.platforms.length,2);
 assert.ok(place.shelters.length>=2&&place.masts.length>=10&&place.trees.length>50&&place.paving.length>40);
 for(const l of place.landmarks)assert.ok(place.hideBuildings.includes(l.building));
 for(const s of place.shelters.filter(s=>s.base>0))assert.ok(place.platforms.some(p=>pointInRing([s.x,s.z],p.ring)),'platform shelters stand on a platform');
 assert.ok(place.heights['osm-way-93350115']>30,'bell tower height from the 3D layer');
});
test('Keskustori sources: every photo credited with author, licence, date and use', {skip:'Finland city is not part of this build'}, () => {
 assert.ok(sources.photos.length>=20);
 for(const p of sources.photos){for(const k of ['source','id','url','author','licence','captured','usedFor'])assert.ok(p[k],`${p.id}: ${k}`);assert.ok(/^\d{4}/.test(p.captured));assert.ok(!/google/i.test(p.url));}
});
import {homography,applyHomography,panelOutline,checkPanel} from '../src/photo-panels-data.js';
test('homography maps the four corners and keeps straight lines straight', () => {
 const to=[[262,130],[1092,48],[1085,1025],[258,960]],h=homography([[0,0],[400,0],[400,436],[0,436]],to);
 [[0,0],[400,0],[400,436],[0,436]].forEach((p,i)=>applyHomography(h,p).forEach((v,k)=>assert.ok(Math.abs(v-to[i][k])<1e-6)));
 const [a,b,c]=[[0,218],[200,218],[400,218]].map(p=>applyHomography(h,p));assert.ok(Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))<1e-3);
 assert.equal(panelOutline({u:[-5,5],y:[0,10],shape:'gable',eave:8}).length,5);
 assert.deepEqual(checkPanel({name:'x',landmark:'theatre',photo:'a.jpg',corners:[[0,0],[1,0],[1,1],[0,1]],u:[0,1],y:[0,1]}),[]);
 assert.ok(checkPanel({name:'Bad Name',corners:[]}).length>=3);
});
test('Keskustori photo panels and ground textures come from listed photos and exist', {skip:'Finland city is not part of this build'}, () => {
 const listed=new Map(sources.photos.map(p=>[p.file,p]));
 for(const p of [...ref.photoPanels,...(ref.groundTextures||[])]){assert.ok(listed.get(p.photo)?.textures,`${p.name}: ${p.photo} listed with its textures`);
  assert.ok(fs.existsSync(`public/cities/tampere/places/keskustori/${p.copyOf||p.name}.jpg`),`${p.name} texture`);}
 const sizes=fs.readdirSync('public/cities/tampere/places/keskustori').reduce((n,f)=>n+fs.statSync(`public/cities/tampere/places/keskustori/${f}`).size,0);
 assert.ok(sizes<2.5*1024*1024,`texture budget: ${sizes} bytes`);
});
test('Keskustori tree survey covers the trees near the square and flags unidentified ones', {skip:'Finland city is not part of this build'}, () => {
 const survey=JSON.parse(fs.readFileSync('cities/tampere/keskustori-trees.json'));
 assert.ok(survey.trees.length>=40);
 for(const t of survey.trees){assert.ok(t.register.species!==undefined&&t.model&&t.status);if(/^confirmed/.test(t.status))assert.ok(t.photos.length>0);if(/unidentified/.test(t.status))assert.equal(t.photos.length,0);}
});
