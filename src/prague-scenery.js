// Hand-placed Prague scenery: trees that OSM did not register in useful spots.
// Coordinates are metres from cities/prague/city.json origin (14.42125, 50.08747),
// +X east, +Z south — same frame as area-caption.js and the baked city pack.

function rng(seed){let s=seed>>>0||1;return ()=>((s=Math.imul(s^s>>>15,1|s)+0x6d2b79f5|0,((s^s>>>14)>>>0)/4294967296));}

// Scatter `count` trees in a disk; optional ring clears the very centre.
function cluster(cx,cz,{count=20,radius=40,inner=0,family='lime',height=10,species='',seed=1}={}){
 const random=rng(seed),out=[];
 for(let i=0;i<count*8&&out.length<count;i++){
  const a=random()*Math.PI*2,d=inner+Math.sqrt(random())*(radius-inner);
  const p=[+(cx+Math.cos(a)*d).toFixed(2),+(cz+Math.sin(a)*d).toFixed(2)];
  if(out.some(t=>Math.hypot(t.p[0]-p[0],t.p[1]-p[1])<2.4))continue;
  out.push({p,family,species:species||family,height:height*(.85+random()*.3),inferred:true,scenery:true});
 }
 return out;
}

// Vítězné náměstí (Dejvická Kruháč) centre island — limes in the green.
export const KRUHAC={x:-1892.4,z:-1416.3,radius:28};
export function kruhacTrees(){
 return [
  ...cluster(KRUHAC.x,KRUHAC.z,{count:14,radius:22,inner:4,family:'lime',height:11,species:'TILIA',seed:42}),
  ...cluster(KRUHAC.x,KRUHAC.z,{count:6,radius:18,inner:2,family:'maple',height:9,species:'ACER',seed:43}),
 ];
}

// Petřín park slopes west of Malá Strana — sakura / cherry blossom.
export const PETRIN={x:-1699.8,z:441.3,radius:90};
// Letná park above the river — another blossom grove.
export const LETNA={x:-447.2,z:-1004.4,radius:75};

export function cherryBlossomTrees(){
 return [
  ...cluster(PETRIN.x,PETRIN.z,{count:28,radius:70,inner:8,family:'cherry',height:6.5,species:'PRUNUS SERRULATA',seed:71}),
  ...cluster(PETRIN.x-55,PETRIN.z+35,{count:12,radius:35,inner:4,family:'cherry',height:5.5,species:'PRUNUS SERRULATA',seed:72}),
  ...cluster(LETNA.x,LETNA.z,{count:24,radius:55,inner:6,family:'cherry',height:6.2,species:'PRUNUS SERRULATA',seed:81}),
  ...cluster(LETNA.x+40,LETNA.z-25,{count:10,radius:30,inner:3,family:'cherry',height:5.8,species:'PRUNUS SERRULATA',seed:82}),
 ];
}

// Trees to append to the city register before createTrees runs.
export function pragueSceneryTrees(){
 return [...kruhacTrees(),...cherryBlossomTrees()];
}
