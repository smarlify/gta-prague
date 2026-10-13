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

export function stepPavlova(state,player,dt=0){
 const next={phase:'idle',x:0,z:0,heading:Math.PI,driver:false,...state};
 const driving=player?.mode==='car';
 next.driver=!!(driving&&onPavlovaRun(player.x,player.z,player.heading));
 if(next.phase==='idle'&&next.driver&&player.z>1000&&player.z<1480&&Math.abs(player.speed)>4){
  next.phase='cut';
  next.x=player.x+7;
  next.z=player.z-16;
  next.heading=Math.PI;
 }
 if(next.phase==='cut'&&state?.phase==='cut'){
  const step=Math.min(1,Math.max(0,dt)*1.6);
  next.x+=(player.x-next.x)*step;
  next.z+=(player.z-12-next.z)*Math.min(1,Math.max(0,dt)*2.2);
  next.heading=Math.PI;
  if(Math.abs(next.x-player.x)<1.4&&next.z<player.z-3)next.phase='done';
 }
 return next;
}
