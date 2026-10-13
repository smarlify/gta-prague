import * as THREE from 'three';
import {createPersonBatch,personLook,advanceGait,JOINT} from './person-model.js';
import {createRideVehicle,PLAYER_BIKE,PLAYER_SCOOTER} from './player-ride-models.js';
import {groundAt} from './terrain.js';

export function createPlayerTravelRenderer(scene){
 const group=new THREE.Group();group.name='Player and rideable vehicles';scene.add(group);
 const person=createPersonBatch(1,{name:'Player'});group.add(person.group);
 const look=personLook(2026,{height:1.75,coat:0,skirt:false,shirt:'#d65f39',trousers:'#273b4a',age:'adult',accessory:null,phoneWalk:false,stoop:0,outer:'jacket',scarf:null,hairStyle:'short',bagType:'backpack'}),gait={};
 const models=new Map(),ringGeometry=new THREE.RingGeometry(.7,.75,32),ringMaterial=new THREE.MeshBasicMaterial({color:'#eeaa55',transparent:true,opacity:.7,depthWrite:false,side:THREE.DoubleSide});
 let hand=null; // world position of the right hand, for a carried item (market-shop-renderer.js)
 return {group,look,hand:()=>hand,update(travel,dt,{visible=true,actorVisible=true,hold=null}={}){
  group.visible=visible;if(!travel)return;
  const p=travel.viewActor();
  const current=new Set(travel.rides);
  for(const [id,m] of models)if(!current.has(m.ride)){m.dispose();models.delete(id);}
  for(const ride of travel.rides)if(!models.has(ride.id)){
   const model=createRideVehicle(ride.visual,ride.mode),ring=new THREE.Mesh(ringGeometry,ringMaterial);ring.rotation.x=-Math.PI/2;ring.position.y=.02;model.root.add(ring);group.add(model.root);models.set(ride.id,{...model,ring,ride});
  }
  for(const {root,ring,motion,ride,lift} of models.values()){
   root.visible=Math.hypot(ride.x-p.x,ride.z-p.z)<220;if(!root.visible)continue;
   const q=travel.riding===ride?p:ride;
   root.position.set(q.x,lift+groundAt(q.x,q.z),q.z);root.rotation.y=q.heading;
   const f=ride.fallen;if(f)f.elapsed=Math.min(1,(f.elapsed||0)+dt*3);root.rotation.z=f?f.side*(Math.PI/2-.12)*f.elapsed*f.elapsed:0; // tipped onto its side after a crash
   motion?.update(ride.distance||0);
   ring.visible=actorVisible&&travel.mode==='walk'&&travel.riding!==ride&&Math.hypot(ride.x-p.x,ride.z-p.z)<3.2;
  }
  person.begin();hand=null;
  if(actorVisible&&(travel.mode!=='car'||travel.gagDriver)){
   const driving=travel.mode==='car'&&travel.gagDriver;
   const pose=driving?'hail':travel.mode==='walk'?'walk':travel.mode==='bike'?'cycle':'scooter';
   const model=models.get(travel.riding?.id),bike=model?.anchors||PLAYER_BIKE,lift=model?.lift??.12;
   const h=p.heading,lx=-Math.cos(h),lz=Math.sin(h),fx=-Math.sin(h),fz=-Math.cos(h);
   const actor={...p,x:driving?p.x+lx*.38+fx*.15:p.x,z:driving?p.z+lz*.38+fz*.15:p.z,speed:driving?0:Math.abs(p.speed),pose,gaitDirection:pose==='walk'&&p.speed<0?-1:1,groundY:driving?.42:pose==='scooter'?PLAYER_SCOOTER.groundY+lift-.12:pose==='cycle'?lift:.12,running:!driving&&Math.abs(p.speed)>2.5,grip:!driving,seated:driving,seatY:.5,
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
