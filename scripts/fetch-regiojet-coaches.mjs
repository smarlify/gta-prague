// Fetch OSM RegioJet route=bus and route=coach relations inside Praha's 2.4 km disk,
// keep the stretches a bus can drive, and write public/cities/prague/coach-corridors.json.
// The file is written only when at least one path is drivable. FlixBus routes are not touched.
import fs from 'node:fs';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import proj4 from 'proj4';
import {SpatialIndex} from '../src/geo.js';
import {usableBusPaths} from '../src/bus-simulation.js';
import {prepareGraph,routePoint} from '../src/mobility.js';
import {addBusLanes} from './bus-lanes.mjs';

const def=JSON.parse(fs.readFileSync('cities/prague/city.json','utf8'));
const [lon0,lat0]=def.origin,R=def.radiusMetres;
const projection=`+proj=tmerc +lat_0=${lat0} +lon_0=${lon0} +k=1 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs`;
const toLocal=proj4('EPSG:4326',projection),round=n=>Math.round(n*100)/100;
const local=(lon,lat)=>{const [x,y]=toLocal.forward([lon,lat]);return [round(x),round(-y)];};
const RAW=path.join('data/raw/cities/prague'),OUT=path.join('public/cities/prague/coach-corridors.json');
const ENDPOINTS=['https://overpass-api.de/api/interpreter','https://overpass.private.coffee/api/interpreter','https://overpass.kumi.systems/api/interpreter','https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
const refresh=process.argv.includes('--refresh');

function overpass(name,body,{attempts=4,maxTime=120}={}){
 const file=path.join(RAW,name+'.json');
 if(fs.existsSync(file)&&!refresh)return JSON.parse(fs.readFileSync(file,'utf8'));
 fs.mkdirSync(RAW,{recursive:true});
 const q=`[out:json][timeout:${maxTime}];${body}`;
 for(let attempt=0;attempt<attempts;attempt++){
  const endpoint=ENDPOINTS[attempt%ENDPOINTS.length];
  try{
   const text=execFileSync('curl',['-sS','-f','--max-time',String(maxTime+15),'-A','worldhood/0.1 (regiojet coaches)','--data-urlencode',`data=${q}`,endpoint],{encoding:'utf8',maxBuffer:1<<30});
   const json=JSON.parse(text);fs.writeFileSync(file,text);console.log(`  ${name}: ${json.elements.length} elements from ${endpoint}`);return json;
  }catch(error){console.log(`  ${name}: retry ${attempt+1} (${String(error.message).slice(0,120)})`);execFileSync('sleep',[String(8+attempt*8)]);}
 }
 throw Error(`Overpass failed for ${name}`);
}

function matchesRegioJet(tags={}){
 return /regiojet/i.test(tags.name||'')||/regiojet/i.test(tags.operator||'');
}

function clipToDisk(points,radius){
 const runs=[];let run=[];
 for(const p of points){
  if(Math.hypot(p[0],p[1])>radius){if(run.length>1)runs.push(run);run=[];continue;}
  if(run.length&&Math.hypot(p[0]-run.at(-1)[0],p[1]-run.at(-1)[1])>40){if(run.length>1)runs.push(run);run=[p];}
  else run.push(p);
 }
 if(run.length>1)runs.push(run);
 return runs;
}
function chainMembers(members){
 const runs=[];let run=[];
 for(const m of members){
  if(m.type!=='way'||!m.geometry?.length||/platform|stop/.test(m.role||''))continue;
  let line=m.geometry.filter(Boolean).map(g=>local(g.lon,g.lat));if(line.length<2)continue;
  if(run.length){const end=run.at(-1),gap=p=>Math.hypot(p[0]-end[0],p[1]-end[1]);
   if(gap(line.at(-1))<gap(line[0]))line=line.reverse();
   if(gap(line[0])>5){runs.push(run);run=[];}}
  run=run.length?run.concat(line.slice(1)):line;
 }
 if(run.length)runs.push(run);
 return runs.filter(r=>r.length>1);
}
const lengthOf=pts=>pts.reduce((n,p,i)=>i?n+Math.hypot(p[0]-pts[i-1][0],p[1]-pts[i-1][1]):0,0);

const around=`(around:${R},${lat0},${lon0})`;
const query=`(
 relation["type"="route"]["route"="bus"]["name"~"RegioJet",i]${around};
 relation["type"="route"]["route"="coach"]["name"~"RegioJet",i]${around};
 relation["type"="route"]["route"="bus"]["operator"~"RegioJet",i]${around};
 relation["type"="route"]["route"="coach"]["operator"~"RegioJet",i]${around};
);out geom;`;
console.log(`Fetching RegioJet bus and coach routes inside ${R} m of Praha…`);
const fetched=overpass('regiojet-routes',query);
const relations=fetched.elements.filter(e=>e.type==='relation'&&(e.tags?.route==='bus'||e.tags?.route==='coach')&&matchesRegioJet(e.tags));
console.log(`  ${relations.length} relations whose name or operator matches RegioJet`);
for(const r of relations)console.log(`  - ${r.tags.route} ${r.id}: ${r.tags.name||r.tags.operator||''}`);

const disk=Math.round(R*1.25),sources=[];
for(const r of relations){
 const t=r.tags||{};
 let n=0;
 for(const points of chainMembers(r.members||[])){
  for(const run of clipToDisk(points,disk)){
   const length=lengthOf(run);if(length<80)continue;
   sources.push({id:`osm-${r.id}-${n}`,line:t.ref||'',destination:t.to||'',routeName:t.name||'',kind:'coach',livery:'regiojet',points:run,length:+length.toFixed(1)});
   n++;
  }
 }
}
console.log(`  ${sources.length} runs inside the built city`);
if(!sources.length){
 console.log('No drivable RegioJet paths inside the disk. coach-corridors.json was not written. The yellow material still ships.');
 process.exit(0);
}

const city=JSON.parse(gunzipSync(fs.readFileSync('public/cities/prague/city.pack')));
const mobility=JSON.parse(fs.readFileSync('public/cities/prague/mobility.json','utf8'));
const world={buildings:new SpatialIndex(city.buildings),roads:new SpatialIndex(city.roads.filter(r=>!/Koroke/.test(r.kind||''))),trafficForbidden:new SpatialIndex(city.roads.filter(r=>/Koroke/.test(r.kind||'')))};
const usable=usableBusPaths({paths:sources},world).map(p=>{
 const from=Math.max(0,p.start-8),to=Math.min(p.length,p.end+8),a=routePoint(p,from,0),b=routePoint(p,to,0);
 const points=[[a.x,a.z],...p.points.filter((_,i)=>p.cumulative[i]>from&&p.cumulative[i]<to),[b.x,b.z]].map(q=>q.map(v=>+v.toFixed(3)));
 const edge=prepareGraph({nodes:[0,1],edges:[{points,from:0,to:1,lane:0}]}).edges[0];
 return {id:p.id,line:p.line||'',destination:p.destination||'',routeName:p.routeName||'',kind:'coach',livery:'regiojet',points,length:+edge.length.toFixed(1),from:0,to:1,lane:0,offset:p.offset||0,start:+(p.start-from).toFixed(1),end:+(p.end-from).toFixed(1),segmentId:p.segmentId};
});
if(!usable.length){
 console.log('No drivable RegioJet paths inside the disk. coach-corridors.json was not written. The yellow material still ships.');
 process.exit(0);
}
addBusLanes(usable,world,mobility.roads);
const payload={source:'OpenStreetMap route=bus and route=coach relations whose name or operator matches RegioJet, ODbL',limitations:['Route geometry as mapped in OSM, clipped to drivable stretches inside the Praha disk. Timetables are simulated.'],paths:usable,clearancePrecomputed:true,clearanceNote:'Road, building and island clearance checked at build time.'};
fs.writeFileSync(OUT,JSON.stringify(payload));
console.log(`Wrote ${usable.length} drivable RegioJet paths to ${OUT}`);
