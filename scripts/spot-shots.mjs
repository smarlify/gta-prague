// node scripts/spot-shots.mjs <outDir> name:x,z,heading [...]   (needs `npm run dev`; GAME_URL overrides)
// Puts the player car at each world position in the dev build and saves a screenshot, with the car's
// height, the ground under it and any page error. For checking a fixed spot before and after a change.
// Options: --driver=<id> (default dave), --drive=<seconds> to hold W before the shot, --wait=<ms>.
import fs from 'node:fs';
import {chromium} from '@playwright/test';
const base=process.env.GAME_URL||'http://127.0.0.1:5173',args=process.argv.slice(2),flags=Object.fromEntries(args.filter(a=>a.startsWith('--')).map(a=>a.slice(2).split('='))),plain=args.filter(a=>!a.startsWith('--'));
const out=plain[0]||'docs/spots',spots=plain.slice(1).map(s=>{const [name,rest]=s.split(':'),[x,z,heading=0]=rest.split(',').map(Number);return {name,x,z,heading};});
fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--ignore-gpu-blocklist','--enable-unsafe-swiftshader','--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
await page.goto(`${base}/?driver=${flags.driver||'dave'}&presence=off&time=midday&weather=clear&quality=high&start=narodni-divadlo`);
await page.waitForFunction(()=>window.openCityDrive?.getState().ready||window.helsinkiBootError,null,{timeout:240000,polling:500});
await page.locator('#start-btn:not([disabled])').click();await page.waitForTimeout(1500);
for(const spot of spots){
 const placed=await page.evaluate(s=>{try{window.openCityDrive.inspectView(s);return 'ok';}catch(e){return String(e.message||e);}},spot);
 await page.waitForTimeout(+(flags.wait||7000));
 if(placed==='ok'){await page.keyboard.press('Escape').catch(()=>{});await page.evaluate(()=>document.getElementById('resume-btn')?.click());await page.waitForTimeout(400);
  if(flags.drive){await page.keyboard.down('w');await page.waitForTimeout(+flags.drive*1000);await page.keyboard.up('w');await page.waitForTimeout(900);}}
 const state=await page.evaluate(()=>{const s=window.openCityDrive.getState();return {x:+s.car.x.toFixed(1),z:+s.car.z.toFixed(1),y:+(s.car.y??0).toFixed(2),pitch:+(s.car.pitch||0).toFixed(3),mode:s.travel.mode,paused:s.paused};});
 await page.screenshot({path:`${out}/${spot.name}.jpg`,type:'jpeg',quality:80});
 console.log(spot.name,placed,JSON.stringify(state),errors.splice(0).join(' | '));
}
await browser.close();
