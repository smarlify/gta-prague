// npm run place:compare -- <city> <place> [--label=after] [--out=dir] [--only=<photo>,...]
// Side-by-side check of a photo-matched place: for each view in cities/<city>/<place>-reference.json
// the game camera stands where the reference photo was taken (position, heading, pitch) and the
// render is saved next to the photo as one image. Needs the dev server (npm run dev) and the photos
// fetched by `npm run photos:fetch`. Look at the pairs, fix the reference or the code, run again.
import fs from 'node:fs';
import path from 'node:path';
import {chromium} from '@playwright/test';

const args=process.argv.slice(2),opt=(k,d)=>args.find(a=>a.startsWith(`--${k}=`))?.split('=').slice(1).join('=')??d;
const [city,place]=args.filter(a=>!a.startsWith('--'));if(!city||!place)throw Error('Usage: npm run place:compare -- <city> <place>');
const ref=JSON.parse(fs.readFileSync(path.join('cities',city,`${place}-reference.json`))),photos=path.join('data/raw/photos',city,place);
const out=opt('out',path.join('data/raw/place-compare',city,place)),label=opt('label','game'),only=opt('only','').split(',').filter(Boolean);
const base=process.env.GAME_URL||'http://127.0.0.1:5173',EYE=1.65;
fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:process.env.PW_CHANNEL||'chrome',headless:true,args:['--ignore-gpu-blocklist','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1024,height:768}});
page.on('pageerror',e=>console.log('page error:',e.message));
await page.goto(`${base}/?city=${city}&presence=off`);
await page.waitForFunction(()=>window.openCityDrive?.getState().ready||window.helsinkiBootError,null,{timeout:240000});
const boot=await page.evaluate(()=>window.helsinkiBootError);if(boot)throw Error(`Game failed to start: ${boot.message}`);
await page.addStyleTag({content:'body *{visibility:hidden!important}canvas:not(#minimap):not(#city-map){visibility:visible!important}'});
for(const v of ref.views||[]){
 if(only.length&&!only.some(o=>v.photo.includes(o)))continue;
 const photo=path.join(photos,v.photo);if(!fs.existsSync(photo)){console.log(`skip   ${v.photo}: not downloaded (npm run photos:fetch -- ${city} ${place})`);continue;}
 const h=v.heading*Math.PI/180,eye=[v.x,v.eye??EYE,v.z],target=[v.x+Math.sin(h)*60,(v.eye??EYE)+(v.pitch||0)/57.3*60,v.z-Math.cos(h)*60];
 const placed=await page.evaluate(({x,z})=>{for(let r=0;r<40;r+=1.5)for(let a=0;a<6.3;a+=.5)try{window.openCityDrive.inspectView({x:x+Math.cos(a)*r,z:z+Math.sin(a)*r});return true;}catch{}return false;},{x:v.x,z:v.z});
 if(!placed){console.log(`skip   ${v.photo}: no clear ground near (${v.x}, ${v.z})`);continue;}
 await page.evaluate(({eye,target})=>window.openCityDrive.inspectCamera({eye,target}),{eye,target});
 await page.waitForTimeout(Number(process.env.SETTLE_MS||7000));
 const shot=(await page.screenshot({type:'jpeg',quality:82})).toString('base64'),img=fs.readFileSync(photo).toString('base64');
 const pair=await browser.newPage({viewport:{width:2060,height:800}});
 await pair.setContent(`<body style="margin:0;background:#111;color:#eee;font:13px sans-serif"><div style="display:flex;gap:12px;padding:6px">
  <figure style="margin:0"><img src="data:image/jpeg;base64,${shot}" width="1018" height="764"><figcaption>${label}: (${v.x}, ${v.z}) heading ${v.heading}°</figcaption></figure>
  <figure style="margin:0"><img src="data:image/jpeg;base64,${img}" width="1018" height="764" style="object-fit:cover"><figcaption>${v.photo}: ${v.note||''}</figcaption></figure></div></body>`);
 const file=path.join(out,`${label}-${path.basename(v.photo,'.jpg')}.jpg`);await pair.screenshot({path:file,type:'jpeg',quality:80});await pair.close();console.log(file);
}
await browser.close();
