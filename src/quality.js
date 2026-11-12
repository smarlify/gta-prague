// One quality tier for the whole session, picked once at load.
// `high` is the look the game was tuned for and every visit starts there. `low` is a choice the
// player makes with the quality button beside the sound button (or ?quality=low): it drops the post
// chain, halves the shadow map, shortens every distance band and thins out the street life.
// The choice is remembered; ?quality=auto forgets it.
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

// Pure: which tier a visit gets. `query` is the ?quality= value, `stored` the remembered choice.
export function pickTier({query=null,stored=null}={}){
 if(valid(query))return query;
 if(query!=='auto'&&valid(stored))return stored;
 return 'high';
}

function storage(){try{return globalThis.localStorage||null;}catch{return null;}}

function detect(){
 const g=globalThis;
 let query=null;try{query=g.location?new URLSearchParams(g.location.search).get('quality'):null;}catch{}
 const store=storage();
 let stored=null;try{stored=store?.getItem(QUALITY_KEY)??null;}catch{}
 try{if(valid(query))store?.setItem(QUALITY_KEY,query);else if(query==='auto')store?.removeItem(QUALITY_KEY);}catch{}
 return pickTier({query,stored});
}

export const QUALITY=TIERS[detect()];

/** The other tier: what the quality button switches to. */
export const otherTier=name=>name==='low'?'high':'low';

// Remembers `name` and reloads without a ?quality= pin, so the new tier applies to the whole scene
// (draw distance, shadows and the post chain are fixed at load).
export function switchQuality(name,location=globalThis.location){
 if(!valid(name))return false;
 try{storage()?.setItem(QUALITY_KEY,name);}catch{}
 if(!location)return true;
 const url=new URL(location.href);url.searchParams.delete('quality');
 location.replace(url.toString());
 return true;
}
