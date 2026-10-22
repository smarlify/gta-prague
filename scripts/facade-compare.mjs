// npm run facades:compare -- <city> [--out=<dir>] [--label=after] [--only=<photo id>,...]
// Side-by-side check of façades: for each view in cities/<city>/facades.json, places the game
// camera where the reference photo was taken (position, heading), renders the street and saves
// game | photo next to each other as one image. Needs the dev server (npm run dev) and the photos
// fetched by `npm run facades:photos`. Look at the pairs, fix facades.json, run again.
import fs from 'node:fs';
import path from 'node:path';
import {chromium} from '@playwright/test';
import {slugify} from '../src/facade-photos.js';

const args=process.argv.slice(2),opt=(k,d)=>args.find(a=>a.startsWith(`--${k}=`))?.split('=').slice(1).join('=')??d;
const city=args.find(a=>!a.startsWith('--'));if(!city)throw Error('Usage: npm run facades:compare -- <city> [--out=dir] [--label=name]');
const data=JSON.parse(fs.readFileSync(path.join('cities',city,'facades.json'))),photos=path.join('data/raw/mapillary',city,slugify(data.street||''));
const out=opt('out',path.join('data/raw/facade-compare',city)),label=opt('label','game'),only=opt('only','').split(',').filter(Boolean);
const base=process.env.GAME_URL||'http://127.0.0.1:5173',EYE=1.7;
fs.mkdirSync(out,{recursive:true});

const browser=await chromium.launch({channel:process.env.PW_CHANNEL||'chrome',headless:true,args:['--ignore-gpu-blocklist','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1024,height:768}});
await page.goto(`${base}/?city=${city}&presence=off`);
// Only the 3D view; re-applied if the dev server reloads the page between views.
const ready=async()=>{
 await page.waitForFunction(()=>window.openCityDrive?.getState().ready||window.helsinkiBootError,null,{timeout:240000});
 if(!await page.evaluate(()=>!!document.getElementById('facade-compare')))await page.addStyleTag({content:'body *{visibility:hidden!important}canvas:not(#minimap):not(#city-map){visibility:visible!important}'}).then(h=>h.evaluate(e=>e.id='facade-compare'));
};
await ready();
const settle=async()=>{await page.waitForTimeout(1500);await page.waitForFunction(()=>window.openCityDrive?.getState().loadedRoofTiles>0,null,{timeout:60000});await page.waitForTimeout(6000);};
const queue=[...(data.views||[])],tries=new Map();
while(queue.length){const v=queue.shift();
 if(only.length&&!only.includes(v.photo))continue;
 const photo=path.join(photos,`${v.photo}.jpg`);if(!fs.existsSync(photo)){console.log(`skip   ${v.photo}: photo not downloaded (npm run facades:photos)`);continue;}
 const h=v.heading*Math.PI/180,eye=[v.x,EYE,v.z],target=[v.x+Math.sin(h)*60,EYE+(v.pitch||4),v.z-Math.cos(h)*60];
 // Move the streaming focus first (nearest road or pavement point), then aim the camera.
 await ready();
 const placed=await page.evaluate(({x,z})=>{for(let r=0;r<30;r+=1.5)for(let a=0;a<6.3;a+=.5)try{window.openCityDrive.inspectView({x:x+Math.cos(a)*r,z:z+Math.sin(a)*r});return true;}catch{}return false;},{x:v.x,z:v.z});
 if(!placed){console.log(`skip   ${v.photo}: no clear ground near (${v.x}, ${v.z})`);continue;}
 await page.evaluate(({eye,target})=>window.openCityDrive.inspectCamera({eye,target}),{eye,target});
 await settle();
 if(!await page.evaluate(()=>!!document.getElementById('facade-compare'))){tries.set(v,(tries.get(v)||0)+1);if(tries.get(v)<3){console.log(`retry  ${v.photo}: page reloaded`);queue.push(v);}continue;}
 const shot=(await page.screenshot({type:'jpeg',quality:80})).toString('base64'),ref=fs.readFileSync(photo).toString('base64');
 const pair=await browser.newPage({viewport:{width:2060,height:812}});
 await pair.setContent(`<body style="margin:0;background:#111;color:#eee;font:14px sans-serif"><div style="display:flex;gap:12px;padding:6px">
  <figure style="margin:0"><img src="data:image/jpeg;base64,${shot}" width="1018" height="764"><figcaption>${label}: ${data.city} (${v.x}, ${v.z}) heading ${v.heading}°</figcaption></figure>
  <figure style="margin:0"><img src="data:image/jpeg;base64,${ref}" width="1018" height="764" style="object-fit:cover"><figcaption>Mapillary ${v.photo}, ${v.captured}, CC BY-SA 4.0</figcaption></figure></div></body>`);
 const file=path.join(out,`${label}-${v.photo}.jpg`);await pair.screenshot({path:file,type:'jpeg',quality:82});await pair.close();
 console.log(file);
}
await browser.close();
