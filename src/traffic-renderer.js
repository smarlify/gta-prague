import * as THREE from 'three';
import {createVehicle,animateVehicle,VEHICLE_TYPES} from './vehicles.js';
import {registerEnvMaterial} from './environment.js';
import {groundPose} from './terrain.js';

const HEAD_ON=new THREE.Color('#fff1d0'),HEAD_OFF=new THREE.Color('#1b1f22'),TAIL_IDLE=new THREE.Color(1,1,1),TAIL_BRAKE=new THREE.Color(2.6,1.55,1.35);
// Three r183 writes instanceColor into vColor and then never reads it in the fragment.
// Lamps need that tint, and a braking tail needs it on the emissive as well.
function showInstanceColor(material,{emissive=false}={}){
 const previous=material.onBeforeCompile,previousKey=material.customProgramCacheKey;
 material.onBeforeCompile=function(shader){
  previous?.call(this,shader);
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_pars_fragment>',`#include <color_pars_fragment>
#if defined(USE_INSTANCING_COLOR) && !defined(USE_COLOR) && !defined(USE_COLOR_ALPHA)
varying vec4 vColor;
#endif`).replace('#include <color_fragment>',`#include <color_fragment>
#if defined(USE_INSTANCING_COLOR) && !defined(USE_COLOR) && !defined(USE_COLOR_ALPHA)
diffuseColor.rgb*=vColor.rgb;
#endif`);
  if(emissive)shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
#ifdef USE_INSTANCING_COLOR
totalEmissiveRadiance*=vColor.rgb;
#endif`);
 };
 material.customProgramCacheKey=function(){return `${previousKey?.call(this)??''}|instance-color${emissive?'-e':''}`;};
}

// Keep independent animation transforms, but draw all NPCs together: fourteen
// material/part batches instead of fourteen draw submissions for every vehicle.
// Beyond `detail` a vehicle is two instance-coloured boxes (body + cabin) in two extra
// batches per family, and past `hide` it is skipped: cars near the player keep full detail.
// Moving cars keep their full model until they are small on screen; a shape swap at 150 m was a visible pop.
export const TRAFFIC_LOD={detail:260,hide:650};
export function createTrafficRenderer(actors,{types=VEHICLE_TYPES,paintColors=null,lod=TRAFFIC_LOD}={}){
 const families=types.map(type=>({type,entries:[],batches:[],low:[]}));
 actors.forEach((actor,i)=>{const family=families[i%families.length],model=createVehicle(1+(i*5)%8,false,family.type),parts=[];model.traverse(m=>{if(m.isMesh){if(m.material.name==='paint'){if(paintColors?.length)m.material.color.set(paintColors[i%paintColors.length]);
  // Subtle per-car variety within each palette colour: hue drift, saturation and lightness.
  m.material.color.offsetHSL(((i*37)%7-3)*.006,((i*53)%5-2)*.035,((i*71)%9-4)*.018);}parts.push(m);}});model.rotation.order='YXZ';family.entries.push({actor,model,parts});});
 // Model size and paint per actor, for overlays that must match the car (angry-drivers.js door).
 const byActor=new Map();for(const family of families)for(const {actor,model,parts}of family.entries){const m=parts.find(p=>p.material.name==='paint')?.material;byActor.set(actor,{type:family.type,spec:model.userData.spec,paint:m?.color||new THREE.Color('#9aa0a0'),material:m||null});}
 const group=new THREE.Group();group.name='Instanced traffic fleet';
 const bodyMaterial=new THREE.MeshStandardMaterial({color:'#ffffff',roughness:.45,metalness:.25}),cabinMaterial=new THREE.MeshStandardMaterial({color:'#182328',roughness:.25,metalness:.5});
 const tmp=new THREE.Matrix4(),slope={y:0,pitch:0,roll:0};
 for(const family of families)if(family.entries.length){
  family.batches=family.entries[0].parts.map((source,part)=>{
   const name=source.material.name,material=registerEnvMaterial(source.material.clone());const colored=name==='paint',lamp=name==='head'||name==='tail';
   if(colored||name==='head')material.color.set('#ffffff');
   if(lamp){material.toneMapped=false;material.fog=false;showInstanceColor(material,{emissive:name==='tail'});}
   const mesh=new THREE.InstancedMesh(source.geometry,material,family.entries.length);mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.frustumCulled=false;mesh.castShadow=true;mesh.receiveShadow=true;mesh.count=0;
   if(colored)family.entries.forEach((p,i)=>mesh.setColorAt(i,p.parts[part].material.color));
   else if(lamp)for(let i=0;i<family.entries.length;i++)mesh.setColorAt(i,name==='head'?HEAD_OFF:TAIL_IDLE);
   mesh.userData={colored,lamp,part:name,type:family.type};group.add(mesh);return mesh;
  });
  // Far level from the family's measured spec: a body box up to the belt line and a cabin box above it.
  const s=family.entries[0].model.userData.spec,paint=family.entries[0].parts.findIndex(p=>p.material.name==='paint');
  const low=(w,h,d,y,z,material,colored)=>{const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(w,h,d),material,family.entries.length);mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.frustumCulled=false;mesh.castShadow=false;mesh.receiveShadow=true;mesh.count=0;mesh.userData={lod:'far',type:family.type,offset:new THREE.Matrix4().makeTranslation(0,y,z),paint:colored?paint:-1};
   if(colored)family.entries.forEach((p,i)=>mesh.setColorAt(i,p.parts[paint].material.color));group.add(mesh);return mesh;};
  family.low=[low(s.w,s.belt-.3,s.l,(s.belt+.3)/2,0,bodyMaterial,paint>=0),low(s.w*.84,s.h-s.belt,s.rr-s.rf,(s.h+s.belt)/2,(s.rr+s.rf)/2,cabinMaterial,false)];
 }
 return {group,vehicleOf:actor=>byActor.get(actor)||null,batchCount:group.children.length,types:families.filter(f=>f.entries.length).map(f=>f.type),lod,update(dt,player,lampsOn=false){
  const lit=!!lampsOn;
  for(const {entries,batches,low}of families){let visible=0,far=0;
  for(const {actor:a,model,parts}of entries){if(!a.edge)continue;
   const d=player?Math.hypot(a.x-player.x,a.z-player.z):0;if(d>lod.hide)continue;
   groundPose(a.x,a.z,a.heading,2.1,.85,slope);model.position.set(a.x,.12+slope.y,a.z);const delta=Math.atan2(Math.sin(a.heading-model.rotation.y),Math.cos(a.heading-model.rotation.y));model.rotation.set(slope.pitch,a.heading,slope.roll);
   if(d>lod.detail){model.updateMatrixWorld(true);for(const m of low){m.setMatrixAt(far,tmp.multiplyMatrices(model.matrixWorld,m.userData.offset));if(m.userData.paint>=0)m.setColorAt(far,parts[m.userData.paint].material.color);}far++;continue;}
   animateVehicle(model,a.speed,Math.max(-1,Math.min(1,delta*3)),dt,a.braking);model.updateMatrixWorld(true);
   batches.forEach((m,j)=>{m.setMatrixAt(visible,parts[j].matrixWorld);
    if(m.userData.part==='head')m.setColorAt(visible,lit?HEAD_ON:HEAD_OFF);
    else if(m.userData.part==='tail')m.setColorAt(visible,lit&&a.braking?TAIL_BRAKE:TAIL_IDLE);
    else if(m.userData.colored)m.setColorAt(visible,parts[j].material.color);
   });visible++;
  }
  for(const m of batches){if(m.userData.part==='tail'){m.material.emissiveIntensity=lit?1.35:0;m.material.toneMapped=!lit;m.material.fog=!lit;}m.count=visible;m.instanceMatrix.needsUpdate=true;if(m.instanceColor)m.instanceColor.needsUpdate=true;}
  low.forEach(m=>{m.count=far;m.instanceMatrix.needsUpdate=true;if(m.instanceColor)m.instanceColor.needsUpdate=true;});}
 }};
}
