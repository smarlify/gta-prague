// Cities this build can load, and URL selection of city and starting point.
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

// Keep the address bar shareable: it always names the current city and start.
export function startUrl(location,city,start){
 const url=new URL(location.href);url.searchParams.set('city',city.id);url.searchParams.set('start',slug(start.id||start.name));
 return url.pathname+url.search+url.hash;
}
