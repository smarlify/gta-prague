import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {readFileSync,existsSync} from 'node:fs';
import {TramSimulation,JOKERI_DIMENSIONS,TRAM_DIMENSIONS,tramDims} from '../src/tram-simulation.js';
import {createJokeriModules,JOKERI_COLOURS} from '../src/tram-model.js';
import {createTramRenderer} from '../src/trams.js';
import {installTransit} from '../src/extension-transit.js';
import {BusSimulation} from '../src/bus-simulation.js';
const world=()=>({buildings:{at:()=>undefined},roads:{at:()=>true},pavement:{at:()=>true}});
test('Raide-Jokeri vehicle: five modules, 34 m, its own footprint',()=>{
 const D=JOKERI_DIMENSIONS,gaps=D.centres.slice(1).map((c,i)=>D.centres[i]-c-D.sections[i]/2-D.sections[i+1]/2);
 assert.equal(D.sections.length,5);assert.ok(gaps.every(g=>Math.abs(g-.3)<1e-9),String(gaps));
 assert.equal(D.front,D.sections[0]/2);assert.ok(Math.abs(D.front+D.rear-D.length)<1e-9);assert.ok(D.length>34&&D.length<34.6);
 assert.equal(tramDims({vehicle:'jokeri'}),D);assert.equal(tramDims({}),TRAM_DIMENSIONS);
 const modules=createJokeriModules();assert.equal(modules.length,5);
 modules.forEach((m,i)=>{m.paint.computeBoundingBox();const z=m.paint.boundingBox;assert.ok(Math.abs(z.max.z-z.min.z-D.sections[i])<.5,`module ${i}`);});
 // Grey and white livery, not the Artic green.
 const colours=new Set(),c=modules[2].paint.attributes.color;for(let i=0;i<c.count;i+=3)colours.add(new THREE.Color(c.getX(i),c.getY(i),c.getZ(i)).getHexString());
 assert.ok(colours.has(new THREE.Color(JOKERI_COLOURS.yellow).getHexString())&&colours.has(new THREE.Color(JOKERI_COLOURS.green).getHexString()));
 assert.ok(!colours.has('22603f'));
});
test('an extension light rail line joins the network, roams near the player and renders as Jokeri trams',()=>{
 const trams=new TramSimulation({paths:[{id:'city',line:'1',points:[[0,0],[0,-400]]}],stops:[]},world(),()=>.5),buses=new BusSimulation({paths:[]},world());
 const scene=new THREE.Scene(),renderer=createTramRenderer(scene,trams),player={x:-5000,z:0,heading:0,speed:0};trams.reset(player);
 const line={id:'15:0',line:'15',destination:'Keilaniemi (M)',vehicle:'jokeri',points:[[-5000,40],[-5000,-1200]]};
 installTransit({trams:{paths:[line],stops:[{id:'j1',name:'Otaniemi',x:-4998,z:-700}]},buses:{paths:[]}},{trams,tramRenderer:renderer,buses});
 const jokeri=trams.paths.find(p=>p.vehicle==='jokeri');assert.ok(jokeri.roam);assert.equal(jokeri.stops.length,1);assert.ok(jokeri.stops[0].s>700);
 for(let i=0;i<30*10;i++)trams.step(1/30,player);
 const running=trams.trams.filter(t=>t.path===jokeri);assert.ok(running.length>=1,'a Jokeri tram was brought in');
 assert.ok(running.every(t=>Math.hypot(t.x-player.x,t.z-player.z)>100),'entered out of sight');
 assert.equal(trams.snapshot().find(t=>t.line==='15').vehicle,'jokeri');
 // Its solid body is the long one: obstacles reach 28 m behind the front module.
 const own=trams.obstacles.filter(o=>o.ref===running[0]),reach=Math.max(...own.map(o=>Math.hypot(o.x-running[0].x,o.z-running[0].z)));assert.ok(reach>28,String(reach));
 const shown=trams.add(jokeri,700);renderer.update(player);const fleet=scene.getObjectByName('Raide-Jokeri light rail fleet');assert.ok(fleet?.visible);running.push(shown);
 const meshes=renderer.fleets.jokeri.kinds.flat();assert.equal(renderer.fleets.jokeri.kinds.length,5);const near=running.filter(t=>Math.hypot(t.x-player.x,t.z-player.z)<470).length;assert.ok(meshes.every(m=>m.count===near));
 assert.ok(renderer.kinds.flat().every(m=>m.count===0),'no Artic is drawn for it');
 // Left far behind, the line's trams are retired.
 const far={...player,x:0,z:0};for(let i=0;i<30*5;i++)trams.step(1/30,far);assert.equal(trams.trams.filter(t=>t.path===jokeri).length,0);
});
test('Länsiväylä and Espoo ship HSL buses with their stops, and Espoo the Raide-Jokeri', {skip:!existsSync('public/data')},()=>{
 const index=JSON.parse(readFileSync('public/data/extensions/index.json'));
 for(const id of ['lansivayla','espoo']){const e=index.extensions.find(e=>e.id===id);assert.equal(e.transit,'transit.json');
  const t=JSON.parse(readFileSync(`public/data/${e.dir}/transit.json`));assert.equal(t.license,'CC BY 4.0');
  assert.ok(t.buses.paths.length>=10,`${id} buses`);assert.ok(t.buses.paths.every(p=>p.lanes&&p.start<p.end&&['city','trunk'].includes(p.kind)));
  const stops=new Set(t.buses.stops.map(s=>s.id));assert.ok(stops.size>=5);assert.ok(t.buses.paths.every(p=>p.stopIds.every(id=>stops.has(id))));
  const sim=new BusSimulation({paths:[]},world());sim.addPaths(t.buses);assert.ok(sim.paths.some(p=>p.busStops.length),`${id}: buses halt at stops`);
  if(id==='espoo'){assert.ok(t.trams.paths.length>=2);assert.ok(t.trams.paths.every(p=>p.line==='15'&&p.vehicle==='jokeri'));assert.ok(t.trams.stops.some(s=>/Keilaniemi/.test(s.name)));assert.ok(t.trams.stops.some(s=>/Otaniemi|Aalto/.test(s.name)));}}
});
