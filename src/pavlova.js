// A short fictional beat on the southbound road from the museum to I. P. Pavlova.
// The driver is not a real person. Coordinates are local metres (x east, z south).
export const PAVLOVA_RUN={ax:691,az:875,bx:649,bz:1462,half:36};

export function onPavlovaRun(x,z,heading){
 const {ax,az,bx,bz,half}=PAVLOVA_RUN;
 const dx=bx-ax,dz=bz-az,len=dx*dx+dz*dz;
 if(!(len>1))return false;
 const t=((x-ax)*dx+(z-az)*dz)/len;
 if(t<0||t>1)return false;
 const px=ax+dx*t,pz=az+dz*t;
 if(Math.hypot(x-px,z-pz)>half)return false;
 return Math.cos(heading)< -0.2;
}

function face(from,to){
 return Math.atan2(-(to.x-from.x),-(to.z-from.z));
}

// Ambulances only close in when `player.ram` is set (Filip Turek on this run).
// They drive onto the car. No posed driver rides along.
export function stepPavlova(state,player,dt=0){
 const next={phase:'idle',x:0,z:0,heading:Math.PI,units:[],driver:false,...state};
 const armed=!!player?.ram;
 const driving=player?.mode==='car';
 const onRun=!!(armed&&driving&&onPavlovaRun(player.x,player.z,player.heading));
 next.driver=false;
 if(!armed){
  if(next.phase!=='done')next.phase='idle';
  next.units=[];
  return next;
 }
 if(next.phase==='idle'&&onRun&&player.z>1000&&player.z<1480&&Math.abs(player.speed)>4){
  next.phase='cut';
  next.units=[
   {x:player.x+8,z:player.z-18,heading:Math.PI},
   {x:player.x-7,z:player.z-24,heading:Math.PI},
  ];
 }
 if(next.phase==='cut'&&state?.phase==='cut'){
  const previous=state.units?.length?state.units:[{x:state.x,z:state.z,heading:state.heading||Math.PI}];
  const step=Math.min(1,Math.max(0,dt)*1.8);
  const zStep=Math.min(1,Math.max(0,dt)*2.4);
  next.units=previous.map(unit=>{
   const x=unit.x+(player.x-unit.x)*step;
   const z=unit.z+(player.z-unit.z)*zStep;
   return {x,z,heading:face({x,z},player)};
  });
  if(next.units.some(unit=>Math.hypot(unit.x-player.x,unit.z-player.z)<2.2))next.phase='done';
 }
 const lead=next.units[0];
 if(lead){next.x=lead.x;next.z=lead.z;next.heading=lead.heading;}
 return next;
}
