export {createDetailedVehicle as createVehicle,VEHICLE_TYPES,PLAYER_CAR_TYPE} from './vehicle-models.js';
const clamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,v));
// Body pitch (nose up positive, car faces -z) and roll from the change in
// speed and the steering input, eased with a frame-rate independent lag.
export function bodyPoseTargets(speed,previousSpeed,steer,dt,braking=false){
 const accel=dt>0?(speed-previousSpeed)/dt:0;
 const pitch=clamp(accel*.009,-.055,.035)+(braking&&Math.abs(speed)>1?-.012:0);
 const roll=clamp(-steer*speed*.0032,-.045,.045);
 return {pitch,roll};
}
// Night, and also rain, thunder or snow. A clear day stays dark, and so does a white night.
export function vehicleLampsOn(day,weather){
 if(day==='whitenight')return false;
 if(day==='night')return true;
 return weather==='rain'||weather==='thunder'||weather==='snow';
}
// Street posts glow only after dark. Bad weather does not switch them on in daylight.
export function streetLampsOn(day){return day==='night';}
// Player beams and lenses. Auto keeps the rules above. On and off ignore time and weather.
const HEADLIGHT_MODES=['auto','on','off'];
export function cycleHeadlights(mode){
 const i=HEADLIGHT_MODES.indexOf(mode);
 return HEADLIGHT_MODES[(i+1+HEADLIGHT_MODES.length)%HEADLIGHT_MODES.length];
}
export function headlightModeLabel(mode){
 if(mode==='on')return 'On';
 if(mode==='off')return 'Off';
 return 'Auto';
}
export function playerHeadlightsOn(mode,day,weather){
 if(mode==='on')return true;
 if(mode==='off')return false;
 return vehicleLampsOn(day,weather);
}
// Head colour, beam visibility and the tail material the brake hook writes. Call this on the
// occupied car every frame, including after a look swap replaces that material.
export function applyPlayerLamps(model,on){
 const u=model?.userData;if(!u)return;
 const lit=!!on;u.lampsOn=lit;
 const head=u.head?.isMesh?u.head.material:u.head;
 if(head?.color)head.color.set(lit?'#fff4dc':'#24282b');
 if(u.beams)u.beams.visible=lit;
 if(u.tail){u.tail.toneMapped=!lit;u.tail.fog=!lit;u.tail.emissiveIntensity=lit?Math.max(u.tail.emissiveIntensity||0,.7):0;}
}
export function animateVehicle(model,speed,steer,dt,braking=false){
 for(const w of model.userData.wheels){if(w.front)w.pivot.rotation.y=steer*.48;w.spin.rotation.x-=speed*dt/w.radius;}
 if(model.userData.tail){
  // lampsOn is set for the player car. Police and any other caller keep the plain brake hook.
  const lit=model.userData.lampsOn;
  model.userData.tail.emissiveIntensity=lit===undefined?(braking?1.6:.35):lit?(braking?1.6:.7):0;
 }
 const u=model.userData,body=u.body;
 if(!body)return;
 if(dt>0){
  const target=bodyPoseTargets(speed,u.lastSpeed??speed,steer,dt,braking);
  // Dive/squat settle in ~0.25 s; roll follows the steering a little faster.
  const a=1-Math.exp(-dt*7),b=1-Math.exp(-dt*9);
  u.pitch=(u.pitch||0)+(target.pitch-(u.pitch||0))*a;u.roll=(u.roll||0)+(target.roll-(u.roll||0))*b;
 }
 u.lastSpeed=speed;
 body.rotation.x=u.pitch||0;body.rotation.z=u.roll||0;
 // Keep the sills near the wheel arches: pitch about the axle line, not the ground.
 body.position.y=-Math.abs(u.pitch||0)*.1;
 if(u.nozzleMat)u.nozzleMat.color.set((u.nozzle||0)>.08?'#d7f6ff':'#3e5158');
 if(u.wing)u.wing.rotation.x=u.flying?Math.max(-.35,Math.min(.2,-(u.flightPitch||0)*.25)):0;
 if(u.fanPivots&&dt>0){const spin=dt*(6+(u.lift?28:0)+Math.min(16,Math.abs(speed)*.35));for(const p of u.fanPivots)p.rotation.y+=spin;}
}
