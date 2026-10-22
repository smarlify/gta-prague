// npm run cities:shots [-- <id> ...]   (needs `npm run dev` or `npm run preview` running)
// Saves an in-game screenshot per city to docs/cities/<id>.jpg for the README gallery.
// Set GAME_URL to point elsewhere (default http://127.0.0.1:5173).
import fs from 'node:fs';
import {chromium} from '@playwright/test';

const base=process.env.GAME_URL||'http://127.0.0.1:5173';
const registry=fs.existsSync('public/cities/index.json')?JSON.parse(fs.readFileSync('public/cities/index.json')).cities:[];
const ids=process.argv.slice(2).length?process.argv.slice(2):['helsinki',...registry.map(c=>c.id)];
fs.mkdirSync('docs/cities',{recursive:true});
const browser=await chromium.launch({headless:true,args:['--ignore-gpu-blocklist','--enable-unsafe-swiftshader']});
for(const id of ids){
 const page=await browser.newPage({viewport:{width:1200,height:675}});
 await page.goto(`${base}/?city=${id}&presence=off`);
 await page.waitForFunction(()=>window.openCityDrive?.getState().ready||window.helsinkiBootError,null,{timeout:180000});
 await page.getByRole('button',{name:'Let’s go for a drive'}).click();
 await page.keyboard.down('w');await page.waitForTimeout(1800);await page.keyboard.up('w');await page.waitForTimeout(5000);
 // Hide the HUD (H) for a clean picture.
 await page.keyboard.press('h');await page.waitForTimeout(400);
 await page.screenshot({path:`docs/cities/${id}.jpg`,type:'jpeg',quality:72});
 console.log(`docs/cities/${id}.jpg`);await page.close();
}
await browser.close();
