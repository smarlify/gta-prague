import {LOOKS,LOOK_ORDER,WEATHERS,WEATHER_ORDER} from './weather.js';

// Cities this build can load, and URL selection of city, starting point, time and weather.
// Praha is registered from public/cities/index.json. Helsinki and Tampere are
// not selectable here; ?city=helsinki and ?city=tampere say the city is missing.
// A city entry names its data root and its geographic origin.
// See docs/ADDING_A_CITY.md for what a new city needs.
export const CITIES={};
export const DEFAULT_CITY='prague';

// Cities built with `npm run city:build` are listed in public/cities/index.json.
export function registerCities(list=[]){for(const c of list)if(c?.id&&!CITIES[c.id])CITIES[c.id]={radius:1500,...c};return CITIES;}

// Every runtime data URL goes through dataUrl so a city's files live under its own root.
// Praha is registered from public/cities/index.json before the first request.
let dataRoot=CITIES[DEFAULT_CITY]?.dataRoot||'/cities/prague';
export const dataUrl=path=>`${dataRoot}/${path}`;
export function useCity(city){dataRoot=city.dataRoot;return city;}

// "Töölö (National Opera)" → "toolo-national-opera"
export function slug(text){
 return String(text).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
}

export function selectCity(search=''){
 const requested=new URLSearchParams(search).get('city');
 const id=slug(requested||DEFAULT_CITY);
 const city=CITIES[id];
 if(!city){
  const available=Object.values(CITIES).map(c=>c.name).join(', ')||'none';
  if(!requested)throw Error(`Default city “${DEFAULT_CITY}” is not in this build. Available: ${available}.`);
  throw Error(`City “${id}” is not in this build yet. Available: ${available}.`);
 }
 return city;
}

// Exact slug first, then a start whose slug begins with or contains the request
// (so ?start=seurasaari finds "Seurasaari bridge"). Null when nothing matches.
export function pickStart(starts,request){
 if(!request)return null;
 const want=slug(request);if(!want)return null;
 const named=starts.map(s=>({s,id:slug(s.id||s.name)}));
 return (named.find(n=>n.id===want)||named.find(n=>n.id.startsWith(want))||named.find(n=>n.id.includes(want)))?.s||null;
}

// Remembered position in the named-start list for this city. One step per visit
// when the page has no ?start=. A pinned start leaves the position where it is.
export const START_CYCLE_PREFIX='gta-praha-start-cycle:';
export function startCycleKey(cityId='prague'){return START_CYCLE_PREFIX+slug(cityId||'prague');}

function cycleBox(storage){
 if(storage)return storage;
 try{return globalThis.localStorage;}catch{return null;}
}
function wrapIndex(index,length){return ((index%length)+length)%length;}

// `request` is the raw ?start= value, or null when the param is absent.
// A present param returns that place (or null when nothing matches) and does not
// move the cycle. A missing param returns the next named start and saves that
// position for the following visit. The result is always one of `starts`.
export function bootStart(starts,request,storage,cityId='prague'){
 const list=starts||[];
 if(request)return {start:pickStart(list,request),pinned:true};
 if(!list.length)return {start:null,pinned:false};
 const key=startCycleKey(cityId);
 let index=0;
 try{
  const box=cycleBox(storage);
  const raw=box?.getItem(key);
  const prev=raw==null||raw===''?-1:Number(raw);
  index=Number.isInteger(prev)?wrapIndex(prev+1,list.length):0;
  box?.setItem(key,String(index));
 }catch{index=0;}
 return {start:list[index],pinned:false};
}

// Slugs of the look id and its on-screen label, so ?time=white-night and ?time=whitenight
// both mean the manual White night look, and ?weather=thunderstorm means thunder.
function queryIds(table,order){
 const map={};
 for(const id of order)for(const key of [slug(id),slug(table[id].label)])if(key)map[key]=id;
 return map;
}
const TIME_FROM_SLUG=queryIds(LOOKS,LOOK_ORDER);
const WEATHER_FROM_SLUG=queryIds(WEATHERS,WEATHER_ORDER);
function matchQuery(map,raw){
 if(raw==null)return null;
 const key=slug(raw);
 return key?map[key]||null:null;
}

// ?time= and ?weather= from the same query string as ?city= and ?start=.
// A missing or unknown value is null. The visit roll fills that half; it does not mean auto.
export function sceneQuery(search=''){
 const params=new URLSearchParams(search);
 return {time:matchQuery(TIME_FROM_SLUG,params.get('time')),weather:matchQuery(WEATHER_FROM_SLUG,params.get('weather'))};
}

// `roll` is Math.random, or a function that returns an index. A value in [0, 1) is a
// fraction of the list. 0 is the first item either way. 1 and above are indexes.
export function rollIndex(length, roll = Math.random){
 if(!(length>0))return 0;
 const raw=typeof roll==='function'?roll(length):roll;
 const n=Number(raw);
 if(!Number.isFinite(n))return 0;
 const index=n>=0&&n<1?Math.floor(n*length):Math.trunc(n);
 return Math.min(length-1,Math.max(0,index));
}

// Night stays on ?time= and on the T / look cycle (LOOK_ORDER). A bare visit does not roll it.
const VISIT_TIME=Object.freeze(LOOK_ORDER.filter(name=>name!=='night'));

// A known param pins that half. A missing or unknown half is one concrete look, chosen once.
// Auto is not in the roll, and neither is night. `roll` is called once per unpinned half, time first.
export function visitScene(search='',roll=Math.random){
 const query=sceneQuery(search);
 const time=query.time||VISIT_TIME[rollIndex(VISIT_TIME.length,roll)];
 const weather=query.weather||WEATHER_ORDER[rollIndex(WEATHER_ORDER.length,roll)];
 return {time,weather,timePinned:!!query.time,weatherPinned:!!query.weather};
}

// Turn off automatic daytime or weather only for the halves the URL named.
export function applySceneQuery(look,query){
 if(query?.time)look.set(query.time,{instant:true});
 if(query?.weather)look.setWeather(query.weather,{instant:true});
 return look;
}

// Keep the address bar shareable: it always names the current city and start.
export function startUrl(location,city,start){
 const url=new URL(location.href);url.searchParams.set('city',city.id);url.searchParams.set('start',slug(start.id||start.name));
 return url.pathname+url.search+url.hash;
}
