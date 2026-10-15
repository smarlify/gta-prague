import * as THREE from 'three';
import {createVehicle,animateVehicle} from './vehicles.js';
import {groundAt} from './terrain.js';

// A small white van with a red stripe. It is not a named service or a person.
export function createPavlovaAmbulance(scene){
 const model=createVehicle(0,false,'van');
 model.traverse(mesh=>{
  if(mesh.isMesh&&mesh.material?.name==='paint'){
   mesh.material=mesh.material.clone();
   mesh.material.color.set('#f7f7f4');
  }
 });
 const red=new THREE.MeshStandardMaterial({color:'#d0121c',roughness:.42});
 const mark=(w,h,d,x,y,z)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),red);m.position.set(x,y,z);model.add(m);return m;};
 for(const side of [-1,1]){
  mark(.05,.14,3.05,side*.95,1.16,.12);
  mark(.045,.46,.1,side*.97,1.52,-.2);
  mark(.045,.1,.46,side*.97,1.52,-.2);
 }
 model.visible=false;
 scene.add(model);
 return {model,update(state,dt){
  const show=state?.phase==='cut';
  model.visible=!!show;
  if(!show)return;
  model.position.set(state.x,.12+groundAt(state.x,state.z),state.z);
  model.rotation.set(0,state.heading||Math.PI,0);
  animateVehicle(model,14,0,dt,false);
 }};
}
