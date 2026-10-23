import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {bicycleGeometry,cityBikeGeometry,scooterGeometry} from './parked-micromobility.js';
import {groundAt,hasTerrain,waterAt} from './terrain.js';
import {WATER_LEVEL} from './quay.js';
import {ZEMAN_BOAT} from './character-looks.js';

// These anchors are shared by the visible bicycle and the player's foot IK.
export const PLAYER_BIKE={hipY:1.01,hipZ:.23,crankY:.33,crankZ:.05,crankR:.17,crankPerMetre:1.15,pedalX:.14,pedalTop:.0175,barX:.24,barY:1.05,barZ:-.48};
export const PLAYER_CITY_BIKE={...PLAYER_BIKE,hipY:1.02,hipZ:.2,crankY:.36,crankZ:.08,barY:1,barZ:-.47,wheelHalfBase:.56};
export const PLAYER_SCOOTER={hipY:.90,footX:.025,frontZ:-.09,backZ:.155,groundY:.324,barX:.22,barY:.946,barZ:-.455};
export const PLAYER_MOTORBIKE={hipY:1.02,hipZ:.02,crankY:.38,crankZ:.22,crankR:.02,crankPerMetre:0,pedalX:.18,pedalTop:0,barX:.32,barY:1.08,barZ:-.62,wheelHalfBase:.78};
// Prague's river mesh starts on the harbour line, then createSea drops it by
// -WATER_LEVEL - 0.1 - riverDrop. Where the water grid has no sample, that
// drape uses the ground. The Vltava is one of those reaches, so the boat
// follows the ground there instead of hovering on the harbour line.
export const PRAGUE_RIVER_DROP=.85;
const HULL_Y=.16,HULL_SY=.32;
export const CHALLENGER_HULL_BOTTOM=HULL_Y-HULL_SY;
export const CHALLENGER_TUBE_BOTTOM=.2;
export function riverSurfaceY(x,z){
 if(!hasTerrain())return WATER_LEVEL;
 const surveyed=waterAt(x,z);
 const level=surveyed==null?groundAt(x,z):surveyed;
 return level-.1-PRAGUE_RIVER_DROP;
}
export function challengerWaterY(x,z){
 return riverSurfaceY(x,z)-CHALLENGER_HULL_BOTTOM;
}

export function addBicycleMotion(root,anchors=PLAYER_BIKE){
 const metal=new THREE.MeshStandardMaterial({color:'#939c98',roughness:.4,metalness:.5}),dark=new THREE.MeshStandardMaterial({color:'#202a27',roughness:.8});
 const wheels=[],wheelMaterial=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.65,metalness:.25});
 const tint=(geometry,hex)=>{
  const g=geometry.index?geometry.toNonIndexed():geometry;if(g!==geometry)geometry.dispose();g.deleteAttribute('uv');
  const color=new THREE.Color(hex),colors=new Float32Array(g.attributes.position.count*3);
  for(let i=0;i<colors.length;i+=3){colors[i]=color.r;colors[i+1]=color.g;colors[i+2]=color.b;}
  g.setAttribute('color',new THREE.BufferAttribute(colors,3));return g;
 };
 const parts=[tint(new THREE.TorusGeometry(.32,.032,6,32).rotateY(Math.PI/2),'#202724'),tint(new THREE.TorusGeometry(.295,.008,4,32).rotateY(Math.PI/2),'#9ca7a1'),tint(new THREE.CylinderGeometry(.04,.04,.09,8).rotateZ(Math.PI/2),'#aab3ad')];
 for(let i=0;i<8;i++)parts.push(tint(new THREE.CylinderGeometry(.004,.004,.59,3).rotateX(i*Math.PI/8),'#9ca7a1'));
 const wheelGeometry=mergeGeometries(parts);parts.forEach(g=>g.dispose());
 const halfBase=anchors.wheelHalfBase??.58;
 for(const z of [-halfBase,halfBase]){const mesh=new THREE.Mesh(wheelGeometry,wheelMaterial);mesh.position.set(0,.33,z);mesh.castShadow=true;root.add(mesh);wheels.push(mesh);}
 const cranks=[],pedals=[],crankGeometry=new THREE.CylinderGeometry(.013,.013,anchors.crankR,7),pedalGeometry=new THREE.BoxGeometry(.13,.035,.10);
 for(let side=0;side<2;side++){
  const sign=side?1:-1,crank=new THREE.Group();crank.position.set(sign*anchors.pedalX,anchors.crankY,anchors.crankZ);root.add(crank);
  const arm=new THREE.Mesh(crankGeometry,metal);arm.position.y=anchors.crankR/2;arm.castShadow=true;crank.add(arm);
  const pedal=new THREE.Mesh(pedalGeometry,dark);pedal.position.y=anchors.crankR;pedal.castShadow=true;crank.add(pedal);cranks.push(crank);pedals.push(pedal);
 }
 const axle=new THREE.Mesh(new THREE.CylinderGeometry(.027,.027,anchors.pedalX*2,8).rotateZ(Math.PI/2),metal);axle.position.set(0,anchors.crankY,anchors.crankZ);root.add(axle);
 return {wheels,cranks,pedals,update(distance=0){
  const phase=distance*anchors.crankPerMetre;
  for(const wheel of wheels)wheel.rotation.x=-distance/.352;
  for(let side=0;side<2;side++){const angle=phase+(side?Math.PI:0);cranks[side].rotation.x=angle;pedals[side].rotation.x=-angle;}
 }};
}

// The same city-bike frame, rental accent and attached parts remain visible
// after a parked or NPC ride is taken over. Only owned rides need these meshes.
function wordTexture(text){
 const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;
 const ctx=canvas.getContext('2d');
 ctx.clearRect(0,0,512,128);ctx.fillStyle='#1a1408';ctx.font='700 78px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,256,68);
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;return texture;
}
function trackDispose(root){
 const geometries=new Set(),materials=new Set();
 root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material);});
 return ()=>{for(const g of geometries)g.dispose();for(const m of materials)m.dispose();root.removeFromParent();};
}

// Tank, seat and two wheels. Not the city bicycle and not the e-scooter.
export function createMotorbike(){
 const root=new THREE.Group();root.name='Player motorbike';root.rotation.order='YXZ';root.userData={kind:'motorbike'};
 const metal=new THREE.MeshStandardMaterial({color:'#2a2e32',roughness:.45,metalness:.55});
 const dark=new THREE.MeshStandardMaterial({color:'#14171a',roughness:.7,metalness:.2});
 const tankMat=new THREE.MeshStandardMaterial({color:'#c5ccd1',roughness:.35,metalness:.6,name:'paint'});
 const wheels=[];
 for(const z of [-.78,.78]){
  const wheel=new THREE.Mesh(new THREE.TorusGeometry(.34,.06,8,18),dark);wheel.rotation.y=Math.PI/2;wheel.position.set(0,.36,z);wheel.name='wheel';wheel.castShadow=true;root.add(wheel);wheels.push(wheel);
  const hub=new THREE.Mesh(new THREE.CylinderGeometry(.08,.08,.12,10).rotateZ(Math.PI/2),metal);hub.position.set(0,.36,z);root.add(hub);
 }
 const frame=new THREE.Mesh(new THREE.CylinderGeometry(.035,.035,1.35,6).rotateX(Math.PI/2),metal);frame.position.set(0,.48,.05);root.add(frame);
 const fork=new THREE.Mesh(new THREE.CylinderGeometry(.025,.025,.7,6),metal);fork.position.set(0,.72,-.62);fork.rotation.x=.35;root.add(fork);
 const bars=new THREE.Mesh(new THREE.CylinderGeometry(.02,.02,.64,6).rotateZ(Math.PI/2),metal);bars.position.set(0,1.02,-.7);bars.name='handlebar';root.add(bars);
 const tank=new THREE.Mesh(new THREE.SphereGeometry(.28,12,10),tankMat);tank.scale.set(1,.72,1.35);tank.position.set(0,.78,-.18);tank.name='tank';tank.castShadow=true;root.add(tank);
 const seat=new THREE.Mesh(new THREE.BoxGeometry(.28,.1,.55),dark);seat.position.set(0,.82,.28);seat.name='seat';seat.castShadow=true;root.add(seat);
 const motion={wheels,update(distance=0){for(const wheel of wheels)wheel.rotation.x=-distance/.34;}};
 return {root,frame,anchors:PLAYER_MOTORBIKE,motion,lift:.12,dispose:trackDispose(root)};
}

function rod(from,to,radius,material,name){
 const a=new THREE.Vector3(...from),b=new THREE.Vector3(...to),dir=b.clone().sub(a),length=dir.length();
 const mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius*.86,length,6),material);
 mesh.position.copy(a).add(b).multiplyScalar(.5);
 mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir.multiplyScalar(1/length));
 mesh.castShadow=true;if(name)mesh.name=name;return mesh;
}
function oval(at,radius,scale,material,name){
 const mesh=new THREE.Mesh(new THREE.SphereGeometry(radius,10,8),material);
 mesh.scale.set(scale[0],scale[1],scale[2]);mesh.position.set(at[0],at[1],at[2]);mesh.castShadow=true;if(name)mesh.name=name;return mesh;
}
// Broad face toward the chase camera, long axis along the shaft, so the blade
// reads as a paddle and not as a vertical post.
function paddleBlade(at,along,material){
 const mesh=new THREE.Mesh(new THREE.SphereGeometry(.16,8,6),material);
 mesh.scale.set(.72,.2,1.85);mesh.position.set(at[0],at[1],at[2]);mesh.name='paddle';mesh.castShadow=true;
 const face=new THREE.Vector3(0,.42,.91).normalize(),shaft=new THREE.Vector3(along[0],along[1],along[2]).normalize();
 const x=new THREE.Vector3().crossVectors(face,shaft);if(x.lengthSq()<1e-8)x.set(1,0,0);else x.normalize();
 const z=new THREE.Vector3().crossVectors(x,face).normalize();
 mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,face,z));
 return mesh;
}

// The chase camera sits behind the stern (+Z) and only a little above the boat.
// Head and glasses face that lens. Belly is forward in the ring. Legs drop into
// the hull, which meets the water. Both arms stay up on the paddles.
function addChallengerPaddler(root,yellow){
 const figure=new THREE.Group();figure.name='figure';root.add(figure);
 const skin=new THREE.MeshStandardMaterial({color:ZEMAN_BOAT.skin,roughness:.7});
 const cloth=new THREE.MeshStandardMaterial({color:ZEMAN_BOAT.jacket,roughness:.8,name:'jacket'});
 const hairMat=new THREE.MeshStandardMaterial({color:ZEMAN_BOAT.hair,roughness:.85});
 const glass=new THREE.MeshStandardMaterial({color:ZEMAN_BOAT.glasses,roughness:.35,metalness:.2});
 const lensMat=new THREE.MeshStandardMaterial({color:'#141820',roughness:.15,metalness:.35,transparent:true,opacity:.7});
 const wood=new THREE.MeshStandardMaterial({color:'#8d5a32',roughness:.75});
 const trousers=new THREE.MeshStandardMaterial({color:'#243044',roughness:.8});
 figure.add(oval([0,.9,.34],.26,[1.55,.5,.85],cloth,'torso'));
 figure.add(oval([0,.58,-.08],.4,[1.4,.8,1],cloth,'belly'));
 const head=new THREE.Group();head.name='head';head.position.set(0,1.24,.5);figure.add(head);
 const skull=new THREE.Mesh(new THREE.SphereGeometry(.22,10,8),skin);skull.castShadow=true;head.add(skull);
 const hair=new THREE.Mesh(new THREE.SphereGeometry(.13,8,6),hairMat);
 hair.name='hair';hair.position.set(0,.14,-.02);hair.scale.set(1.35,.7,1.05);head.add(hair);
 for(const x of [-.17,.17]){const temple=new THREE.Mesh(new THREE.SphereGeometry(.06,6,5),hairMat);temple.position.set(x,.08,0);head.add(temple);}
 const nose=new THREE.Mesh(new THREE.SphereGeometry(.035,6,5),skin);nose.position.set(0,.02,.27);head.add(nose);
 for(const x of [-.2,.2]){const ear=new THREE.Mesh(new THREE.SphereGeometry(.05,6,4),skin);ear.position.set(x,-.02,.02);head.add(ear);}
 const glasses=new THREE.Group();glasses.name='glasses';glasses.position.set(0,.11,.26);glasses.rotation.x=-.45;head.add(glasses);
 for(const x of [-.08,.08]){
  const rim=new THREE.Mesh(new THREE.TorusGeometry(.062,.014,5,10),glass);rim.position.set(x,0,0);glasses.add(rim);
  const lens=new THREE.Mesh(new THREE.CircleGeometry(.05,8),lensMat);lens.position.set(x,0,.005);lens.rotation.y=Math.PI;glasses.add(lens);
 }
 const bridge=new THREE.Mesh(new THREE.BoxGeometry(.055,.014,.014),glass);bridge.position.set(0,.012,0);glasses.add(bridge);
 figure.add(rod([0,1.02,.4],[0,1.14,.48],.09,skin,'neck'));
 for(const side of [-1,1]){
  const shoulder=[side*.38,.96,.32],elbow=[side*.5,1.14,-.04],hand=[side*.34,1.28,-.18],bladeAt=[side*.58,1.5,-.32];
  figure.add(rod(shoulder,elbow,.08,cloth,'sleeve'));
  figure.add(rod(elbow,hand,.065,cloth,'sleeve'));
  figure.add(oval(hand,.06,[1,1,1],skin,'hand'));
  figure.add(rod(hand,bladeAt,.03,wood,'paddle-shaft'));
  figure.add(paddleBlade(bladeAt,[bladeAt[0]-hand[0],bladeAt[1]-hand[1],bladeAt[2]-hand[2]],yellow));
  const hip=[side*.2,.4,-.06],knee=[side*.22,.14,-.4],foot=[side*.14,-.16,-.55];
  figure.add(rod(hip,knee,.12,trousers,'leg'));
  figure.add(rod(knee,foot,.1,trousers,'leg'));
 }
}

// Yellow tube, blue hull, the word CHALLENGER, and a heavy reclined figure low in the ring.
export function createChallenger(){
 const root=new THREE.Group();root.name='Challenger';root.rotation.order='YXZ';root.userData={kind:'challenger',word:'CHALLENGER'};
 const blue=new THREE.MeshStandardMaterial({color:'#1a4f86',roughness:.45,metalness:.15,name:'hull'});
 const yellow=new THREE.MeshStandardMaterial({color:'#f5c400',roughness:.4,metalness:.2,name:'tube'});
 const hull=new THREE.Mesh(new THREE.SphereGeometry(1,16,10),blue);hull.scale.set(1.05,HULL_SY,1.55);hull.position.y=HULL_Y;hull.name='hull';hull.castShadow=true;root.add(hull);
 const tube=new THREE.Mesh(new THREE.TorusGeometry(1.02,.2,10,28),yellow);tube.rotation.x=Math.PI/2;tube.position.y=.4;tube.name='tube';tube.castShadow=true;root.add(tube);
 const wordMat=new THREE.MeshBasicMaterial({map:wordTexture('CHALLENGER'),transparent:true});
 for(const side of [-1,1]){
  const plate=new THREE.Mesh(new THREE.PlaneGeometry(1.15,.28),wordMat);plate.name='challenger-word';plate.position.set(side*1.08,.48,0);plate.rotation.y=side>0?Math.PI/2:-Math.PI/2;root.add(plate);
 }
 addChallengerPaddler(root,yellow);
 return {root,frame:hull,anchors:null,motion:null,lift:0,dispose:trackDispose(root)};
}

export function createRideVehicle(visual={},mode='bike'){
 const kind=visual.kind||(mode==='scooter'?'scooter':mode==='motorbike'?'motorbike':mode==='challenger'?'challenger':'bicycle');
 if(kind==='motorbike')return createMotorbike();
 if(kind==='challenger')return createChallenger();
 const color=visual.color??visual.accent??(mode==='scooter'?'#399d91':'#edb844');
 const geometry=kind==='scooter'?scooterGeometry():kind==='citybike'?cityBikeGeometry({animated:true}):bicycleGeometry({animated:true});
 const paint=geometry.getAttribute('paint'),colors=geometry.getAttribute('color'),tint=new THREE.Color(color);
 for(let i=0;i<paint.count;i++)if(paint.getX(i)>0)colors.setXYZ(i,tint.r,tint.g,tint.b);
 const root=new THREE.Group();root.name=`Player ${kind}`;root.rotation.order='YXZ';root.userData={kind,color};
 const frame=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.55,metalness:.25}));frame.castShadow=true;root.add(frame);
 for(const part of visual.parts||[]){const mesh=new THREE.Mesh(part.geometry.clone(),part.material.clone());mesh.castShadow=true;root.add(mesh);}
 const anchors=kind==='citybike'?PLAYER_CITY_BIKE:PLAYER_BIKE,motion=mode==='bike'?addBicycleMotion(root,anchors):null;
 const geometries=new Set(),materials=new Set();root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material);});
 return {root,frame,anchors,motion,lift:visual.lift??.12,dispose(){for(const g of geometries)g.dispose();for(const m of materials)m.dispose();root.removeFromParent();}};
}
