import * as THREE from 'three';
import {createVehicle,animateVehicle,applyPlayerLamps} from './vehicles.js';
import {createVehicleDamage} from './vehicle-damage.js';
import {createPoliceBody} from './police-model.js';
import {attachPursuitLights,flashPursuitLights} from './police-renderer.js';
import {groundPose} from './terrain.js';
const slope={y:0,pitch:0,roll:0};
import {unregisterEnvMaterial} from './environment.js';

// A stable scene root follows whichever car is in use. Abandoned cars stay put.
export function createPlayerCarRenderer(scene){
 const active=new THREE.Group(),parked=new THREE.Group();active.name='Current player car';parked.name='Player parked cars';scene.add(active,parked);
 // Terrain pitch/roll are measured in the car's frame, then turned by heading.
 active.rotation.order='YXZ';
 const starter=createVehicle(0,true),entries=new Map();let home=null,current=null,first,lookKey='crossover|';
 const build=(model,owned=false)=>{
  const shared=new Set();model.traverse(m=>{if(m.isMesh)shared.add(m.geometry);});
  const damage=createVehicleDamage(model),privateGeometry=new Set(),materials=new Set(),lights=[];
  model.traverse(m=>{if(m.isSpotLight)lights.push(m);else if(m.isMesh){if(!shared.has(m.geometry))privateGeometry.add(m.geometry);if(m.material?.name==='paint')materials.add(m.material);}});
  return {model,damage,dispose(){model.removeFromParent();for(const g of privateGeometry)g.dispose();for(const light of lights)light.dispose();if(owned)for(const m of materials){unregisterEnvMaterial(m);m.dispose();}}};
 };
 const firstBuilt=build(starter);first=firstBuilt;active.add(starter);active.userData=starter.userData;
 let lamps=false,travelMode='car';
 // Only the car the player is in. A parked start car keeps the lamps it had when they got out.
 const paintOccupied=()=>{if(travelMode==='car'&&current)applyPlayerLamps(current.model,lamps);};
 return {group:active,setLamps(on){lamps=!!on;},setLook(type='crossover',paint=''){
  const key=`${type}|${paint}`;if(key===lookKey)return;lookKey=key;
  const model=createVehicle(0,true,type);if(paint)model.traverse(m=>{if(m.isMesh&&m.material?.name==='paint')m.material.color.set(paint);});
  const next=build(model,true);
  if(current===first){active.add(next.model);current=next;}
  first.model.removeFromParent();first.dispose();first=next;
  if(home)entries.set(home,first);if(!current||current===first)active.userData=first.model.userData;
  paintOccupied();
 },sync(travel,dt=0){
  travelMode=travel.mode||'car';
  if(home!==travel.homeCar){for(const entry of entries.values())if(entry!==first)entry.dispose();entries.clear();home=travel.homeCar;entries.set(home,first);current=null;first.damage.update({damageVersion:-1});}
  for(const car of travel.cars)if(!entries.has(car)){const visual=car.visual||{};let model;if(visual.police||visual.type==='police'){model=createPoliceBody(visual.variant||'estate',visual.livery||'praha');attachPursuitLights(model,.2);}else{model=createVehicle(0,true,visual.type||'sedan');if(visual.paint)model.traverse(m=>{if(m.isMesh&&m.material.name==='paint')m.material.color.set(visual.paint);});}entries.set(car,build(model,true));}
  const selected=entries.get(travel.car);
  if(selected&&current!==selected){if(current)parked.add(current.model);active.add(selected.model);selected.model.position.set(0,0,0);selected.model.rotation.set(0,0,0);current=selected;}
  // The group drives whichever car is occupied, including a stolen patrol. A later
  // home-car repaint must not leave the wheel rig pointing at the parked car.
  if(selected)active.userData=selected.model.userData;
  paintOccupied();
  for(const [car,entry]of entries){entry.damage.update(car);if(entry===selected)continue;parked.add(entry.model);groundPose(car.x,car.z,car.heading,1.4,.8,slope);entry.model.position.set(car.x,.12+slope.y,car.z);entry.model.rotation.set(slope.pitch,car.heading,slope.roll,'YXZ');entry.model.visible=Math.hypot(car.x-travel.actor.x,car.z-travel.actor.z)<650;animateVehicle(entry.model,0,0,dt,false);}
  if(selected)selected.model.visible=true;
 },setSiren(on,time=0){for(const [car,entry]of entries)flashPursuitLights(entry.model,time,!!on&&entry===current&&!!car.visual?.police);},setVisible(visible){active.visible=parked.visible=visible;}};
}
