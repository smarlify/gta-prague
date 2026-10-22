import {consumeBattery} from './battery.js';
import {insidePlayable} from './geo.js';
import {GRAVITY,PLAYER_MAX_SPEED,blocksDriveSample,carSamples,driveStep,sampleStopsForWater,settleOnGround} from './physics.js';
import {groundPose} from './terrain.js';

// October 2026 Rocket trim, arcade-scaled to this city.
// Published flight hardware is ten cold-gas nozzles (four rear, two in the
// nose for yaw, one lifting nozzle at each corner) plus four underbody suction
// fans. It is not magnetic levitation: the wheels are the motors, and the
// nozzles are compressed-nitrogen rockets with electric actuators.
// In the air Shift still lifts. W pitches the nose down, S pitches the nose up,
// and A and D roll. Thrust still follows the nose.
export const ROADSTER_CLEARANCE=2.6;
export const ROADSTER_CEILING=64;
export const ROADSTER_AIR_MAX=72;
// W noses down and S noses up. Pitch and roll stop
// before the car can tumble onto its roof; past that, thrust just climbs.
const ROADSTER_PITCH_LIMIT=.95;
const ROADSTER_ROLL_LIMIT=1.05;
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function carIsAirborne(car,clearance=ROADSTER_CLEARANCE){
 return !!(car&&car.flying&&(car.alt||0)>clearance);
}
function flightBlocked(car,x,z,world){
 if(!insidePlayable(x,z,3))return 'boundary';
 if((car.alt||0)>ROADSTER_CLEARANCE)return null;
 const samples=carSamples(car,x,z),next={...car,x,z};
 if(world.objects?.blocksStep?.(car,next)||samples.some(([px,pz])=>blocksDriveSample(px,pz,world)))return 'building';
 if(samples.some(([px,pz])=>sampleStopsForWater(px,pz,world)))return 'water';
 return null;
}
export function roadsterStep(car,keys,dt,world){
 car.roadster=true;
 const throttle=keys.has('KeyW')||keys.has('ArrowUp');
 const reverse=keys.has('KeyS')||keys.has('ArrowDown');
 const left=keys.has('KeyA')||keys.has('ArrowLeft'),right=keys.has('KeyD')||keys.has('ArrowRight');
 const brake=keys.has('Space'),lift=(keys.has('ShiftLeft')||keys.has('ShiftRight'))&&(car.battery??1)>0;
 const powered=(car.battery??1)>0;
 const rollStick=left||right?(left?1:0)-(right?1:0):keys.tilt||0;
 if(!car.flying&&!lift){
  const result=driveStep(car,keys,dt,world);
  // Rear motors, with the nozzles adding a shove while the speed is still building.
  if(!result.collision&&throttle&&!brake&&powered&&car.speed>0)car.speed=Math.min(PLAYER_MAX_SPEED,car.speed+9*dt);
  car.alt=0;car.vy=0;car.vx=0;car.vz=0;car.flying=false;car.pitchRate=0;car.rollRate=0;
  car.nozzle=throttle&&powered?0.62:0;car.lift=0;
  return result;
 }
 if(!car.flying){
  const h=car.heading||0;
  car.vx=-Math.sin(h)*(car.speed||0);car.vz=-Math.cos(h)*(car.speed||0);car.vy=0;car.alt=0;
  car.pitch=0;car.roll=0;car.pitchRate=0;car.rollRate=0;car.flying=true;
 }
 if(!Number.isFinite(car.vx))car.vx=0;if(!Number.isFinite(car.vy))car.vy=0;if(!Number.isFinite(car.vz))car.vz=0;if(!Number.isFinite(car.alt))car.alt=0;
 const auth=clamp(((car.alt||0)-.25)/1.1,0,1);
 const pitchStick=(reverse?1:0)-(throttle?1:0);
 car.pitchRate=(car.pitchRate||0)+(pitchStick*6.2*auth-(car.pitchRate||0)*3.2)*dt;
 car.rollRate=(car.rollRate||0)+(rollStick*8*auth-(car.rollRate||0)*3.2)*dt;
 car.pitch=clamp((car.pitch||0)+car.pitchRate*dt,-ROADSTER_PITCH_LIMIT,ROADSTER_PITCH_LIMIT);
 car.roll=clamp((car.roll||0)+car.rollRate*dt,-ROADSTER_ROLL_LIMIT,ROADSTER_ROLL_LIMIT);
 if(car.pitch>=ROADSTER_PITCH_LIMIT&&car.pitchRate>0||car.pitch<=-ROADSTER_PITCH_LIMIT&&car.pitchRate<0)car.pitchRate=0;
 if(car.roll>=ROADSTER_ROLL_LIMIT&&car.rollRate>0||car.roll<=-ROADSTER_ROLL_LIMIT&&car.rollRate<0)car.rollRate=0;
 // Letting go of the stick eases the nose back to level, so a climb can settle
 // onto its wheels. Space still levels much faster.
 if(!pitchStick){car.pitch*=Math.exp(-dt*.45);car.pitchRate*=Math.exp(-dt*1.2);}
 if(!rollStick){car.roll*=Math.exp(-dt*.7);car.rollRate*=Math.exp(-dt*1.2);}
 if(brake){car.pitch*=Math.exp(-dt*3.4);car.roll*=Math.exp(-dt*4);car.pitchRate*=Math.exp(-dt*6);car.rollRate*=Math.exp(-dt*6);}
 const low=(car.alt||0)<1.15;
 const yaw=low?rollStick*(car.speed||0)/2.8*.55:Math.sin(car.roll)*1.35+rollStick*.45;
 car.heading=wrap((car.heading||0)+yaw*dt);car.steer=clamp(rollStick,-1,1);
 const cp=Math.cos(car.pitch||0),sp=Math.sin(car.pitch||0),noseX=-Math.sin(car.heading)*cp,noseZ=-Math.cos(car.heading)*cp;
 const thrust=throttle&&powered?24:0,back=(reverse||brake)?16:0;
 car.vx+=(noseX*thrust-noseX*back)*dt;car.vy+=(sp*thrust-sp*back)*dt;car.vz+=(noseZ*thrust-noseZ*back)*dt;
 if(lift)car.vy+=20*dt;
 car.vy-=GRAVITY*dt;
 const drag=Math.exp(-dt*.28);car.vx*=drag;car.vz*=drag;car.vy*=Math.exp(-dt*.55);
 const horiz=Math.hypot(car.vx,car.vz);
 if(horiz>ROADSTER_AIR_MAX){const scale=ROADSTER_AIR_MAX/horiz;car.vx*=scale;car.vz*=scale;}
 car.vy=clamp(car.vy,-32,18);
 const distanceBefore=car.distance||0;
 let collision=null;
 const travelX=car.vx*dt,travelZ=car.vz*dt,steps=Math.max(1,Math.ceil(Math.hypot(travelX,travelZ)/.4));
 for(let i=0;i<steps;i++){
  const nx=car.x+travelX/steps,nz=car.z+travelZ/steps,blocked=flightBlocked(car,nx,nz,world);
  if(blocked){collision=blocked;car.vx*=.15;car.vz*=.15;break;}
  car.distance+=Math.hypot(nx-car.x,nz-car.z);car.x=nx;car.z=nz;
 }
 car.alt=(car.alt||0)+car.vy*dt;
 if(car.alt>ROADSTER_CEILING){car.alt=ROADSTER_CEILING;if(car.vy>0)car.vy=0;}
 const ground=groundPose(car.x,car.z,car.heading,1.41,.85);
 const fwd=car.vx*-Math.sin(car.heading)+car.vz*-Math.cos(car.heading);
 car.speed=fwd;
 const touch=car.alt<=.06&&car.vy<=.4;
 const hovering=lift&&car.vy>-3&&Math.abs(car.pitch)<.85&&Math.abs(car.roll)<.85;
 if(touch&&!hovering){
  const impact=Math.max(0,-car.vy),awkward=Math.abs(Math.sin(car.pitch))>.7||Math.abs(Math.sin(car.roll))>.7,hard=impact>8||impact>4.5&&awkward;
  car.speed=clamp(fwd,-9,PLAYER_MAX_SPEED);car.vx=car.vy=car.vz=0;car.alt=0;car.flying=false;car.pitchRate=car.rollRate=0;car.nozzle=0;car.lift=0;
  settleOnGround(car);
  car.battery=consumeBattery(car.battery??1,car.distance-distanceBefore,car.speed);
  return {collision:hard?'landing':collision,onRoad:Boolean(world.roads.at(car.x,car.z)),impact:hard?impact:0,flying:false};
 }
 if(car.alt<.06&&lift){car.alt=.06;if(car.vy<0)car.vy=0;}
 car.y=ground.y+car.alt;
 car.nozzle=clamp((throttle&&powered?0.85:0)+(lift?0.55:0)+(brake?0.25:0),0,1);car.lift=lift?1:0;
 car.battery=consumeBattery(car.battery??1,(car.distance-distanceBefore)+(lift?90:throttle?25:0)*dt,Math.hypot(car.speed,car.vy));
 return {collision:(car.alt<ROADSTER_CLEARANCE?collision:null),onRoad:Boolean(world.roads.at(car.x,car.z)),flying:true};
}
