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
 const stripe=new THREE.Mesh(new THREE.BoxGeometry(1.72,.1,3.6),new THREE.MeshStandardMaterial({color:'#c1121f',roughness:.45}));
 stripe.position.set(0,1.2,.2);
 model.add(stripe);
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
