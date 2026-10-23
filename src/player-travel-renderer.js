import * as THREE from 'three';
import {createPersonBatch,advanceGait,JOINT} from './person-model.js';
import {applyCharacterLook,genericPlayerLook} from './character-looks.js';
import {createRideVehicle,PLAYER_BIKE,PLAYER_SCOOTER,challengerWaterY} from './player-ride-models.js';
import {OFFICER_LOOK} from './roadblock.js';
import {groundAt} from './terrain.js';

const UNIFORM_KEYS=Object.keys(OFFICER_LOOK);
// Pose solved in person-model.js. Both hands on the wheel, neither arm raised.
export const SEATED_DRIVE_POSE='drive';
const CAR_LIFT=.12,SEAT_Y=.5,SEAT_X=-.38,SEAT_Z=-.15;
// Head height in body space for the 1.75 m player look at SEAT_Y. The seat
// drops or rises so that head sits in the glass, not through the roof.
const HEAD_LOCAL=1.2;
// Model belt and roof (metres in the car frame). Same figures as the meshes.
const CABIN={
 gwagen:{belt:1.3,roof:1.9},
 roadster:{belt:.62,roof:1.04},
 scala:{belt:.96,roof:1.4},
 x5:{belt:1.12,roof:1.68},
 police:{belt:.96,roof:1.4},
 estate:{belt:.96,roof:1.42},
 sedan:{belt:.92,roof:1.38},
 hatchback:{belt:.9,roof:1.4},
 suv:{belt:1.09,roof:1.7},
 crossover:{belt:1.02,roof:1.52},
 van:{belt:1.07,roof:1.85},
 taxi:{belt:.96,roof:1.42},
 offroad:{belt:1.15,roof:1.8},
};

/** Ambulances have no one in the cab. */
export function ambulanceVehicle(vehicle){
 if(!vehicle)return false;
 return !!(vehicle.ambulance||vehicle.type==='ambulance'||vehicle.kind==='ambulance');
}

/** Seated arms-down driver, or null when the cab stays empty. */
export function seatedCabDriver(vehicle){
 if(ambulanceVehicle(vehicle))return null;
 const type=vehicle?.police||vehicle?.type==='police'?'police':(vehicle?.type||'roadster');
 const cabin=CABIN[type]||CABIN.sedan;
 const glass=Math.max(.12,cabin.roof-cabin.belt);
 const headInCar=Math.min(cabin.roof-.08,cabin.belt+glass*.45);
 return {pose:SEATED_DRIVE_POSE,groundY:CAR_LIFT+headInCar-HEAD_LOCAL,seatY:SEAT_Y,x:SEAT_X,z:SEAT_Z};
}

/** What the travel renderer draws. Null keeps the cab, boat, or hidden ped empty. */
export function travelActorAppearance(travel,actor,{lift=.12}={}){
 const visual=travel?.car?.visual??travel?.vehicle??null;
 const seat=travel?.mode==='car'?seatedCabDriver(visual):null;
 const driving=!!seat,swimming=travel?.mode==='swim';
 if(travel?.mode==='challenger'||(travel?.mode==='car'&&!seat))return null;
 const pose=driving?seat.pose:swimming||travel?.mode==='walk'?'walk':travel?.mode==='scooter'?'scooter':'cycle';
 const h=actor?.heading||0,c=Math.cos(h),s=Math.sin(h);
 return {
  pose,seated:driving,seatY:driving?seat.seatY:.5,
  groundY:driving?seat.groundY:swimming?-.55:pose==='scooter'?PLAYER_SCOOTER.groundY+lift-.12:pose==='cycle'?lift:.12,
  x:driving?actor.x+seat.x*c+seat.z*s:actor.x,
  z:driving?actor.z-seat.x*s+seat.z*c:actor.z,
  speed:driving?0:Math.abs(actor?.speed||0),
  running:!driving&&!swimming&&Math.abs(actor?.speed||0)>2.5,
  grip:!driving&&!swimming,
 };
}

/** Prague patrol jacket on, or back to the saved civilian clothes. */
export function dressPlayerLook(look, saved, on){
 if(on)Object.assign(look,OFFICER_LOOK);
 else for(const key of UNIFORM_KEYS){
  if(saved[key]===undefined)delete look[key];
  else look[key]=saved[key];
 }
 look.paintRev=(look.paintRev||0)+1;
 return look;
}

export function createPlayerTravelRenderer(scene){
 const group=new THREE.Group();group.name='Player and rideable vehicles';scene.add(group);
 const person=createPersonBatch(1,{name:'Player',police:{word:'POLICIE'}});group.add(person.group);
 const look=genericPlayerLook(),gait={};
 const civilian=Object.fromEntries(UNIFORM_KEYS.map(key=>[key,look[key]]));
 let dressed=false,characterId='';
 const models=new Map(),ringGeometry=new THREE.RingGeometry(.7,.75,32),ringMaterial=new THREE.MeshBasicMaterial({color:'#eeaa55',transparent:true,opacity:.7,depthWrite:false,side:THREE.DoubleSide});
 let hand=null; // world position of the right hand, for a carried item (market-shop-renderer.js)
 return {group,look,hand:()=>hand,setCharacter(id){
  const next=id||'';if(next===characterId)return look;
  characterId=next;applyCharacterLook(look,next);
  for(const key of UNIFORM_KEYS){if(look[key]===undefined)delete civilian[key];else civilian[key]=look[key];}
  dressed=false;return look;
 },update(travel,dt,{visible=true,actorVisible=true,hold=null,uniform=false}={}){
  group.visible=visible;if(!travel)return;
  if(!!uniform!==dressed){dressPlayerLook(look,civilian,!!uniform);dressed=!!uniform;}
  const p=travel.viewActor();
  const current=new Set(travel.rides);
  for(const [id,m] of models)if(!current.has(m.ride)){m.dispose();models.delete(id);}
  for(const ride of travel.rides)if(!models.has(ride.id)){
   const model=createRideVehicle(ride.visual,ride.mode),ring=new THREE.Mesh(ringGeometry,ringMaterial);ring.rotation.x=-Math.PI/2;ring.position.y=.02;model.root.add(ring);group.add(model.root);models.set(ride.id,{...model,ring,ride});
  }
  for(const {root,ring,motion,ride,lift} of models.values()){
   root.visible=Math.hypot(ride.x-p.x,ride.z-p.z)<220;if(!root.visible)continue;
   const q=travel.riding===ride?p:ride;
   const boat=ride.visual?.kind==='challenger'||ride.mode==='challenger';
   root.position.set(q.x,boat?challengerWaterY(q.x,q.z):lift+groundAt(q.x,q.z),q.z);root.rotation.y=q.heading;
   const f=ride.fallen;if(f)f.elapsed=Math.min(1,(f.elapsed||0)+dt*3);root.rotation.z=f?f.side*(Math.PI/2-.12)*f.elapsed*f.elapsed:0; // tipped onto its side after a crash
   motion?.update(ride.distance||0);
   ring.visible=actorVisible&&travel.mode==='walk'&&travel.riding!==ride&&Math.hypot(ride.x-p.x,ride.z-p.z)<3.2;
  }
  person.begin();hand=null;
  const model=models.get(travel.riding?.id),bike=model?.anchors||PLAYER_BIKE,lift=model?.lift??.12;
  const appearance=travelActorAppearance(travel,p,{lift});
  if(actorVisible&&appearance){
   const {pose}=appearance;
   const actor={...p,...appearance,gaitDirection:pose==='walk'&&p.speed<0?-1:1,
    bike:{...bike,crank:p.distance*bike.crankPerMetre},scooter:PLAYER_SCOOTER};
   if(pose==='walk'&&hold!==null&&!p.knockdown)actor.hold=hold;
   advanceGait(actor,gait,dt,look);person.draw(actor,look,gait);
   if(pose==='walk'&&!p.knockdown){const J=person.joints,j=JOINT.handR,c=Math.cos(p.heading),s=Math.sin(p.heading),y=actor.groundY+groundAt(p.x,p.z);
    hand={x:p.x+J[j]*c+J[j+2]*s,y:y+J[j+1],z:p.z-J[j]*s+J[j+2]*c,heading:p.heading};}
  }
  person.end();
 }};
}

export function travelCameraPose(actor,heading,zoom=150,look=0,buildings=null){
 let distance=2.7+Math.max(36,Math.min(240,zoom))/90;
 for(let d=.4;buildings&&d<=distance;d+=.2){if(buildings.at(actor.x+Math.sin(heading)*d,actor.z+Math.cos(heading)*d)){distance=Math.max(.35,d-.3);break;}}
 const y=groundAt(actor.x,actor.z),px=actor.x+Math.sin(heading)*distance,pz=actor.z+Math.cos(heading)*distance;
 return {position:[px,Math.max(y,groundAt(px,pz))+2.5,pz],target:[actor.x-Math.sin(heading+look)*2,y+1.2,actor.z-Math.cos(heading+look)*2]};
}
