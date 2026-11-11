import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {decodeTerrain,setTerrain,groundAt,driveAt} from '../src/terrain.js';
import {setupPragueWorld,pragueDry} from '../src/prague-ground.js';
const dir='public/cities/prague';
setTerrain(decodeTerrain(gunzipSync(fs.readFileSync(`${dir}/terrain.pack`))));
const setup=setupPragueWorld(JSON.parse(gunzipSync(fs.readFileSync(`${dir}/city.pack`))),JSON.parse(fs.readFileSync(`${dir}/mobility.json`)));const world=setup.world();
const [a,b,n=24]=process.argv.slice(2);const [ax,az]=a.split(',').map(Number),[bx,bz]=b.split(',').map(Number);
for(let i=0;i<=n;i++){const x=ax+(bx-ax)*i/n,z=az+(bz-az)*i/n;const s=world.roads.at(x,z)||world.pavement.at(x,z);console.log(x.toFixed(0).padStart(6),z.toFixed(0).padStart(6),'ground',groundAt(x,z).toFixed(2).padStart(7),'drive',driveAt(x,z).toFixed(2).padStart(7),pragueDry.inChannel(x,z)?'wet':'dry',(s?.name||'')+' '+(s?.kind||''));}
