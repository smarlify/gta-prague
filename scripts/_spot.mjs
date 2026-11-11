import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {decodeTerrain,setTerrain,groundAt,driveAt} from '../src/terrain.js';
import {setupPragueWorld} from '../src/prague-ground.js';
import {passageDeck} from '../src/passage.js';
import {pointInPolygon} from '../src/geo.js';
const dir='public/cities/prague';
let city=JSON.parse(gunzipSync(fs.readFileSync(`${dir}/city.pack`)));
setTerrain(decodeTerrain(gunzipSync(fs.readFileSync(`${dir}/terrain.pack`))));
const setup=setupPragueWorld(city,JSON.parse(fs.readFileSync(`${dir}/mobility.json`)));city=setup.data;const world=setup.world();
const all=[...city.roads.map(r=>({...r,layer:'road'})),...city.pavement.map(r=>({...r,layer:'pave'})),...city.buildings.map(r=>({...r,layer:'bldg'}))];
for(const a of process.argv.slice(2)){const [x,z]=a.split(',').map(Number);
 console.log(`@${x},${z} ground ${groundAt(x,z).toFixed(2)} drive ${driveAt(x,z).toFixed(2)} bridgeDeck ${world.bridgeDecks.heightAt(x,z)?.toFixed(2)} passage ${passageDeck(world.roads,x,z)?.toFixed?.(2)}`);
 for(const it of all){const b=it.bbox;if(x<b[0]||x>b[2]||z<b[1]||z>b[3])continue;if(pointInPolygon(x,z,it.rings))console.log('   ',it.layer,it.id,JSON.stringify(it.name),it.kind,it.passage||'',it.height||'',it.deck?'deck '+it.deck.map(d=>d[2]).join('/'):'','span',Math.round(Math.hypot(b[2]-b[0],b[3]-b[1])));}
}
