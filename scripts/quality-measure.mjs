// node scripts/quality-measure.mjs [outDir]   (needs `npm run dev` running; GAME_URL overrides the address)
// Loads the same start on both quality tiers and prints draw calls, triangles and frame time, so a
// change to either tier can be compared before and after. Headless Chromium renders in software:
// the frame times are only comparable with each other, not with a real device.
import fs from 'node:fs';
import {chromium} from '@playwright/test';
const base=process.env.GAME_URL||'http://127.0.0.1:5173',out=process.argv[2]||null;
if(out)fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--ignore-gpu-blocklist','--enable-unsafe-swiftshader','--use-angle=metal']});
for(const tier of ['high','low']){
 const page=await browser.newPage({viewport:{width:1280,height:720}});
 page.on('pageerror',e=>console.log('pageerror',tier,e.message));
 await page.goto(`${base}/?driver=dave&start=narodni-divadlo&presence=off&time=midday&weather=clear&quality=${tier}`);
 await page.waitForFunction(()=>window.openCityDrive?.getState().ready||window.helsinkiBootError,null,{timeout:180000});
 await page.locator('#start-btn:not([disabled])').click();
 await page.waitForTimeout(12000); // let tiles stream in and detail meshes land
 const frame=await page.evaluate(()=>new Promise(r=>{const t=[];let last=performance.now();const tick=n=>{t.push(n-last);last=n;t.length<90?requestAnimationFrame(tick):r(t.sort((a,b)=>a-b)[45]);};requestAnimationFrame(tick);}));
 const s=await page.evaluate(()=>{const s=window.openCityDrive.getState();return {drawCalls:s.drawCalls,triangles:s.triangles,pixelRatio:s.pixelRatio};});
 console.log(tier,JSON.stringify({...s,medianFrameMs:+frame.toFixed(1)}));
 if(out)await page.screenshot({path:`${out}/quality-${tier}.jpg`,type:'jpeg',quality:80});
 await page.close();
}
await browser.close();
