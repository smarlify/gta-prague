import * as THREE from 'three';
import {createVehicle,animateVehicle} from './vehicles.js';
import {groundAt} from './terrain.js';
import {strobe} from './police-renderer.js';

// White van, red belt, red cross, blue roof bar. No one in the cab.
function makeAmbulance(){
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
 const barY=2.02,barZ=.15;
 const housing=new THREE.Mesh(
  new THREE.BoxGeometry(1.15,.07,.28),
  new THREE.MeshStandardMaterial({color:'#2448a6',emissive:'#0c2a7a',emissiveIntensity:.25,roughness:.3,transparent:true,opacity:.82}),
 );
 housing.position.set(0,barY,barZ);
 model.add(housing);
 const lenses=[];
 for(const side of [-1,1]){
  const lens=new THREE.Mesh(
   new THREE.BoxGeometry(.38,.06,.26),
   new THREE.MeshStandardMaterial({color:'#2a52b8',emissive:'#1f5cff',emissiveIntensity:.15,roughness:.2}),
  );
  lens.position.set(side*.36,barY,barZ);
  model.add(lens);
  lenses.push(lens);
 }
 model.userData.blueLenses=lenses;
 model.visible=false;
 return model;
}

export function createAmbulanceMesh(){
 const model=makeAmbulance();
 model.visible=true;
 return model;
}

export function createPavlovaAmbulance(scene,count=0){
 const models=Array.from({length:count},()=>makeAmbulance());
 for(const model of models)scene.add(model);
 let time=0;
 return {models,update(state,dt){
  time+=Math.max(0,dt)||0;
  const units=state?.units||[];
  models.forEach((model,index)=>{
   const unit=units[index];
   model.visible=!!unit;
   if(!unit)return;
   model.position.set(unit.x,.12+groundAt(unit.x,unit.z),unit.z);
   model.rotation.set(0,unit.heading||Math.PI,0);
   const moving=unit.phase==='pull'||unit.phase==='return';
   animateVehicle(model,moving?14:0,0,dt,false);
   const lenses=model.userData.blueLenses||[];
   lenses.forEach((lens,side)=>{lens.material.emissiveIntensity=strobe(time,side,index*.17)?3.2:.15;});
  });
 }};
}
