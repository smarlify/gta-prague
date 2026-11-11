// node scripts/driver-shots.mjs [outDir] [driver ...]   (needs `npm run dev` running; GAME_URL overrides)
// Starts the game as each driver, drives forward for two seconds and saves a screenshot, printing
// where the driver spawned, what they are in, and any page error. A smoke test for new drivers.
import fs from 'node:fs';
import {chromium} from '@playwright/test';
const base=process.env.GAME_URL||'http://127.0.0.1:5173',out=process.argv[2]||'docs/drivers';
const drivers=process.argv.slice(3).length?process.argv.slice(3):['vondracek','bartos','rajchl','okamura','xaver'];
fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--ignore-gpu-blocklist','--enable-unsafe-swiftshader','--use-angle=metal']});
for(const driver of drivers){
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${base}/?driver=${driver}&presence=off&time=midday&weather=clear&quality=high`);
 await page.waitForFunction(()=>window.openCityDrive?.getState().ready||window.helsinkiBootError,null,{timeout:240000,polling:500});
 await page.locator('#start-btn:not([disabled])').click();
 await page.waitForTimeout(6000);
 const before=await page.evaluate(()=>{const s=window.openCityDrive.getState();return {x:s.travel.actor?.x??s.car.x,z:s.travel.actor?.z??s.car.z,mode:s.travel.mode,place:document.getElementById('boot-title')?.textContent};});
 await page.keyboard.down('w');await page.waitForTimeout(2000);await page.keyboard.up('w');await page.waitForTimeout(1200);
 const after=await page.evaluate(()=>{const s=window.openCityDrive.getState();return {x:s.travel.actor?.x??s.car.x,z:s.travel.actor?.z??s.car.z};});
 await page.screenshot({path:`${out}/${driver}.jpg`,type:'jpeg',quality:82});
 console.log(driver,JSON.stringify({mode:before.mode,place:before.place,spawn:[Math.round(before.x),Math.round(before.z)],moved:+Math.hypot(after.x-before.x,after.z-before.z).toFixed(1),errors}));
 await page.close();
}
await browser.close();
