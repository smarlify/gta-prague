// Minimap caption: the area the player is in. Nearest named place (start points carry a district),
// falling back to the city. A district named after the city reads "<CITY> CENTRE".
// Helsinki's own start points are squares, so the snapshot gets district names here (game frame, metres).
export const HELSINKI_AREAS=[
 {district:'Helsinki',x:-100,z:150},{district:'Katajanokka',x:560,z:120},{district:'Kamppi',x:-1155,z:199},
 {district:'Hakaniemi',x:0,z:-1013},{district:'Ruoholahti',x:-2184,z:627},
 {district:'Seurasaari',x:-3811,z:-1386},{district:'Hanasaari',x:-6340,z:168},
];
// Prague neighbourhood anchors relative to cities/prague/city.json origin (14.42125, 50.08747).
export const PRAGUE_AREAS=[
 {district:'Praha 1 - Staré Město',x:-54,z:52},
 {district:'Praha 1 - Josefov',x:-197,z:-337},
 {district:'Praha 1 - Malá Strana',x:-1163,z:-115},
 {district:'Praha 1 - Hradčany',x:-1485,z:-671},
 {district:'Praha 2 - Nové Město',x:483,z:998},
 {district:'Praha 2 - Vinohrady',x:1127,z:1331},
 {district:'Praha 5 - Smíchov',x:-1163,z:1554},
 {district:'Praha 6 - Dejvice',x:-1807,z:-1227},
 {district:'Praha 7 - Letná',x:-447,z:-1060},
 {district:'Praha 7 - Holešovice',x:1842,z:-1839},
 {district:'Praha 8 - Karlín',x:2057,z:-616},
 {district:'Praha 5 - Hlubočepy',x:-1065.34,z:5252.32},
 {district:'Praha 7 - Troja',x:-682.48,z:-3347.94},
 {district:'Praha 7 - Bubeneč',x:71.35,z:-2585.91},
 {district:'Praha 8 - Libeň',x:3730.54,z:-1727.92},
 {district:'Praha 8 - Bohnice',x:-783.9,z:-5371.15},
 {district:'Praha 14 - Černý Most',x:11047.4,z:-2424.48},
];
// Praha number of the nearest anchor ("Praha 8 - Karlín" → "8"). No reach cap and no
// uppercasing: the tab uses whichever anchor is nearer, not the minimap caption.
export function pragueDistrictNumber(places,x,z){
 let best=null,d=Infinity;for(const p of places||[]){if(!p?.district)continue;const q=Math.hypot(p.x-x,p.z-z);if(q<d){d=q;best=p;}}
 const m=String(best?.district||'').match(/praha\s+(\d+)/i);return m?m[1]:'';
}
export function areaName(places,x,z,city,{reach=1500}={}){
 let best=null,d=reach;for(const p of places){const q=Math.hypot(p.x-x,p.z-z);if(q<d&&p.district){d=q;best=p;}}
 const name=best?.district||city;
 return (name.toLowerCase()===city.toLowerCase()?`${city} centre`:name).toUpperCase();
}
// Cheap to call every frame: recomputes at most every `interval` ms.
export function areaCaption(places,city,interval=500){
 let last=-Infinity,text=`${city} centre`.toUpperCase();
 return (x,z,now)=>{if(now-last>=interval){last=now;text=areaName(places,x,z,city);}return text;};
}
