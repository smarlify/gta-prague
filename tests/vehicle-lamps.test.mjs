import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createVehicle,animateVehicle,applyPlayerLamps,cycleHeadlights,headlightModeLabel,playerHeadlightsOn,vehicleLampsOn,streetLampsOn} from '../src/vehicles.js';
import {createTrafficRenderer} from '../src/traffic-renderer.js';
import {createMappedFurniture} from '../src/mapped-furniture.js';

test('L cycles headlights auto, on, off, and auto follows night versus a clear midday',()=>{
 let mode='auto';
 const seen=[mode];
 mode=cycleHeadlights(mode);seen.push(mode);
 mode=cycleHeadlights(mode);seen.push(mode);
 mode=cycleHeadlights(mode);seen.push(mode);
 assert.deepEqual(seen,['auto','on','off','auto']);
 assert.equal(headlightModeLabel('auto'),'Auto');
 assert.equal(headlightModeLabel('on'),'On');
 assert.equal(headlightModeLabel('off'),'Off');
 assert.equal(playerHeadlightsOn('auto','night','clear'),true);
 assert.equal(playerHeadlightsOn('auto','midday','clear'),false);
 assert.equal(playerHeadlightsOn('auto','midday','rain'),true);
 assert.equal(playerHeadlightsOn('auto','whitenight','clear'),false);
 assert.equal(playerHeadlightsOn('on','midday','clear'),true,'on ignores a clear day');
 assert.equal(playerHeadlightsOn('off','night','clear'),false,'off ignores night');
 assert.equal(vehicleLampsOn('night','clear'),true,'traffic lamps stay on the time and weather rules');
 assert.equal(streetLampsOn('midday'),false);

 const model=createVehicle(0,true);
 const spots=[];
 model.traverse(o=>{if(o.isSpotLight)spots.push(o);});
 assert.equal(spots.length,2);
 applyPlayerLamps(model,playerHeadlightsOn('off','night','clear'));
 assert.equal(model.userData.beams.visible,false);
 assert.equal(model.userData.head.color.getHexString(),'24282b');
 applyPlayerLamps(model,playerHeadlightsOn('on','midday','clear'));
 assert.equal(model.userData.beams.visible,true);
 assert.equal(model.userData.head.color.getHexString(),'fff4dc');
});

test('player lamps are on at night and in snow, off on a clear day and during white night',()=>{
 assert.equal(vehicleLampsOn('night','clear'),true);
 assert.equal(vehicleLampsOn('night','overcast'),true);
 assert.equal(vehicleLampsOn('midday','snow'),true);
 assert.equal(vehicleLampsOn('morning','rain'),true);
 assert.equal(vehicleLampsOn('golden','thunder'),true);
 assert.equal(vehicleLampsOn('midday','clear'),false);
 assert.equal(vehicleLampsOn('midday','overcast'),false);
 assert.equal(vehicleLampsOn('whitenight','clear'),false);
 assert.equal(vehicleLampsOn('whitenight','snow'),false);
 assert.equal(streetLampsOn('night'),true);
 assert.equal(streetLampsOn('midday'),false);
 assert.equal(streetLampsOn('whitenight'),false);

 const model=createVehicle(0,true);
 const spots=[];
 model.traverse(o=>{
  assert.equal(!!o.isPointLight,false);
  assert.equal(!!(o.isMesh&&o.name==='head-beam'),false);
  if(o.isSpotLight)spots.push(o);
 });
 assert.equal(spots.length,2);
 assert.equal(model.userData.beams.parent,model.userData.body);
 const plain=createVehicle(0,false);
 plain.traverse(o=>{assert.equal(!!o.isSpotLight,false);assert.equal(!!o.isPointLight,false);});
 model.updateMatrixWorld(true);
 for(const spot of spots){
  assert.equal(spot.castShadow,false);
  assert.equal(spot.shadow.map,null);
  assert.ok(spot.distance>=30&&spot.distance<=45,`range ${spot.distance}`);
  assert.ok(spot.angle>0&&spot.angle<Math.PI/5,'narrow cone');
  assert.ok(spot.decay>=1,'the pool fades with distance');
  assert.equal(spot.target.parent,model.userData.beams);
  const lightPos=new THREE.Vector3().setFromMatrixPosition(spot.matrixWorld);
  const targetPos=new THREE.Vector3().setFromMatrixPosition(spot.target.matrixWorld);
  assert.ok(targetPos.z<lightPos.z-8,'the beam aims down the road, along -Z');
  assert.ok(targetPos.y<lightPos.y,'the beam angles slightly down');
 }
 assert.equal(model.getObjectByName('head').material.isMeshBasicMaterial,true);

 applyPlayerLamps(model,false);
 animateVehicle(model,8,0,1/60,true);
 assert.equal(model.userData.beams.visible,false);
 assert.equal(model.userData.head.color.getHexString(),'24282b');
 assert.equal(model.userData.tail.emissiveIntensity,0);

 applyPlayerLamps(model,true);
 const head=model.userData.head.color.getHexString();
 assert.equal(head,'fff4dc');
 assert.equal(model.userData.beams.visible,true);
 animateVehicle(model,8,0,1/60,false);
 const cruise=model.userData.tail.emissiveIntensity;
 animateVehicle(model,8,0,1/60,true);
 assert.ok(model.userData.tail.emissiveIntensity>cruise,'braking raises the tail');
 assert.equal(model.userData.head.color.getHexString(),head,'braking leaves the head lenses alone');
});

test('braking raises only the occupied tail after a car swap',()=>{
 const home=createVehicle(0,true,'crossover'),swapped=createVehicle(0,true,'offroad');
 const occupied={userData:home.userData};
 applyPlayerLamps(occupied,true);
 animateVehicle(occupied,6,0,1/60,false);
 const homeTail=home.userData.tail.emissiveIntensity;
 occupied.userData=swapped.userData;
 applyPlayerLamps(occupied,true);
 animateVehicle(occupied,6,0,1/60,true);
 assert.notEqual(home.userData.tail,swapped.userData.tail);
 assert.ok(swapped.userData.tail.emissiveIntensity>homeTail);
 assert.equal(home.userData.tail.emissiveIntensity,homeTail);
 assert.equal(swapped.userData.head.color.getHexString(),'fff4dc');
});

test('nearby traffic lamps tint per car and far cars stay out of those batches',()=>{
 const actors=[
  {x:0,z:0,heading:0,speed:6,braking:false,edge:1},
  {x:12,z:4,heading:0,speed:6,braking:true,edge:1},
  {x:400,z:0,heading:0,speed:6,braking:true,edge:1},
 ];
 const traffic=createTrafficRenderer(actors,{types:['sedan']});
 assert.equal(traffic.group.children.some(o=>o.isSpotLight||o.isPointLight),false);
 const head=traffic.group.children.find(m=>m.material?.name==='head');
 const tail=traffic.group.children.find(m=>m.material?.name==='tail');
 assert.equal(head.material.isMeshBasicMaterial,true);
 assert.equal(head.material.toneMapped,false);
 const shader={vertexShader:'',fragmentShader:'#include <color_pars_fragment>\nvoid main(){\nvec4 diffuseColor;vec3 totalEmissiveRadiance;\n#include <color_fragment>\n#include <emissivemap_fragment>\n}'};
 tail.material.onBeforeCompile(shader);
 assert.match(shader.fragmentShader,/diffuseColor\.rgb\*=vColor\.rgb/);
 assert.match(shader.fragmentShader,/totalEmissiveRadiance\*=vColor\.rgb/);
 traffic.update(1/60,{x:0,z:0},true);
 assert.equal(head.count,2,'the far car is not in the head batch');
 assert.equal(tail.count,2);
 const near=new THREE.Color(),brake=new THREE.Color(),headA=new THREE.Color(),headB=new THREE.Color();
 tail.getColorAt(0,near);tail.getColorAt(1,brake);
 head.getColorAt(0,headA);head.getColorAt(1,headB);
 assert.ok(brake.r>near.r,'only the braking tail instance is brighter');
 assert.equal(headA.getHexString(),headB.getHexString());
 assert.ok(tail.material.emissiveIntensity>1);
 const far=traffic.group.children.find(m=>m.userData?.lod==='far');
 assert.equal(far.count,1);
 traffic.update(1/60,{x:0,z:0},false);
 assert.equal(tail.material.emissiveIntensity,0);
 head.getColorAt(0,headA);
 assert.notEqual(headA.getHexString(),'fff1d0');
});

test('street lamps are unlit bulbs on the head and only at night',()=>{
 let night=false;
 const layer={items:[{k:'lamp',x:0,z:0,yaw:0,mly:['lamp-a']}]};
 const furniture=createMappedFurniture(layer,{canvas:null,player:()=>({x:0,z:0}),night:()=>night});
 try{
  const bulbs=furniture.group.getObjectByName('Street lamp bulbs');
  assert.equal(bulbs.material.isMeshBasicMaterial,true);
  assert.equal(bulbs.material.toneMapped,false);
  assert.equal(furniture.group.children.some(o=>o.isPointLight||o.isSpotLight),false);
  furniture.update();
  assert.equal(bulbs.count,0,'daytime bulbs stay hidden');
  night=true;furniture.update();
  assert.equal(bulbs.count,1);
  const matrix=new THREE.Matrix4();bulbs.getMatrixAt(0,matrix);
  const position=new THREE.Vector3().setFromMatrixPosition(matrix);
  assert.ok(Math.abs(position.y-8.21)<.05,'the bulb sits on the cream head');
  assert.ok(Math.abs(position.z-1.5)<.05);
  night=false;furniture.update();
  assert.equal(bulbs.count,0);
 }finally{for(const chunk of furniture.chunks.values())chunk.signs.dispose();}
});
