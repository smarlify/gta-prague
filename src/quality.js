// One quality tier for the whole session, picked once at load.
// `high` is the look the game was tuned for. `low` is for phones and weak laptops: it drops the
// post chain, halves the shadow map, shortens every distance band and thins out the street life.
// ?quality=low|high pins a tier (remembered); ?quality=auto forgets the pin.
export const QUALITY_KEY='gta-praha-quality';

export const TIERS=Object.freeze({
 high:Object.freeze({
  name:'high',post:true,maxPixelRatio:1.5,minPixelRatio:.85,shadowMap:2048,
  drawDistance:450,fogNear:240,cameraFar:560,
  buildingNear:240,buildingFar:290,buildingDetail:180,buildingShadow:130,buildingWindows:Infinity,
  cars:52,people:100,headBeams:true,
 }),
 low:Object.freeze({
  name:'low',post:false,maxPixelRatio:1,minPixelRatio:.6,shadowMap:1024,
  drawDistance:320,fogNear:170,cameraFar:400,
  buildingNear:150,buildingFar:190,buildingDetail:60,buildingShadow:60,buildingWindows:70,
  cars:28,people:50,headBeams:false,
 }),
});

const valid=v=>v==='low'||v==='high';

// Pure: which tier a device gets. `query` is the ?quality= value, `stored` the remembered pin.
export function pickTier({query=null,stored=null,coarse=false,memory=undefined,cores=undefined}={}){
 if(valid(query))return query;
 if(query!=='auto'&&valid(stored))return stored;
 if(coarse)return 'low';
 if(memory!==undefined&&memory<=4)return 'low';
 if(cores!==undefined&&cores<=4)return 'low';
 return 'high';
}

function storage(){try{return globalThis.localStorage||null;}catch{return null;}}

function detect(){
 const g=globalThis;
 let query=null;try{query=g.location?new URLSearchParams(g.location.search).get('quality'):null;}catch{}
 const store=storage();
 let stored=null;try{stored=store?.getItem(QUALITY_KEY)??null;}catch{}
 try{if(valid(query))store?.setItem(QUALITY_KEY,query);else if(query==='auto')store?.removeItem(QUALITY_KEY);}catch{}
 let coarse=false;try{coarse=!!g.matchMedia?.('(pointer:coarse)').matches;}catch{}
 // Outside a browser (tests, build scripts) there is nothing to detect: stay on the tuned tier.
 const browser=typeof g.document!=='undefined';
 return pickTier({query,stored,coarse,memory:browser?g.navigator?.deviceMemory:undefined,cores:browser?g.navigator?.hardwareConcurrency:undefined});
}

export const QUALITY=TIERS[detect()];

// A device that started on `high` and cannot hold it: remember `low` for the next load.
export function rememberLowTier(){try{storage()?.setItem(QUALITY_KEY,'low');}catch{}}

// Watches the adaptive resolution. When it has sat on its floor and frames are still slow for
// `after` seconds, fires once so the caller can shed the expensive passes.
export function createTierWatch({after=5,slowMs=24}={}){
 let slowFor=0,fired=false;
 return {
  get fired(){return fired;},
  update(frameMs,dt,atFloor){
   if(fired)return false;
   if(!(frameMs>0)||frameMs>250)return false; // a suspended tab is not load
   slowFor=atFloor&&frameMs>slowMs?slowFor+dt:Math.max(0,slowFor-dt*2);
   if(slowFor<after)return false;
   fired=true;return true;
  },
 };
}
