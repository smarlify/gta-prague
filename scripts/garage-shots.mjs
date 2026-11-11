// node scripts/garage-shots.mjs [outDir] [car ...]   (needs `npm run dev` running; GAME_URL overrides)
// Photographs every cast vehicle in the dev garage from four sides and tiles them into one sheet
// per vehicle, for checking a body against reference photos.
import fs from 'node:fs';
import {chromium} from '@playwright/test';
const base=process.env.GAME_URL||'http://127.0.0.1:5173',out=process.argv[2]||'docs/garage';
const all=['gwagen','roadster','scala','x5','ram','police','transporter','panamera','es','tuktuk','ferry'];
const cars=process.argv.slice(3).length?process.argv.slice(3):all,views=['quarter','side','front','back'];
fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--ignore-gpu-blocklist','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1280,height:720}});
page.on('pageerror',e=>console.log('pageerror',e.message));
for(const car of cars){
 const shots=[];
 for(const view of views){
  await page.setViewportSize({width:640,height:400});
  await page.goto(`${base}/garage.html?car=${car}&view=${view}&ui=off`);
  await page.waitForFunction(()=>window.garage?.ready,null,{timeout:60000});await page.waitForTimeout(350);
  shots.push((await page.screenshot({type:'jpeg',quality:88})).toString('base64'));
 }
 const info=await page.evaluate(()=>window.garage);
 await page.setViewportSize({width:1280,height:800});
 await page.setContent(`<body style="margin:0;display:grid;grid-template-columns:640px 640px">${shots.map(s=>`<img width=640 height=400 src="data:image/jpeg;base64,${s}">`).join('')}</body>`);
 await page.screenshot({path:`${out}/${car}.jpg`,type:'jpeg',quality:84});
 console.log(car,info.meshes,'meshes',info.triangles,'triangles');
}
await browser.close();
