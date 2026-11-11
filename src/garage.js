// Dev-only showroom: /garage.html?car=<type>&view=front|side|rear|quarter|back|top
// One cast vehicle on a plain floor under neutral light, so a body can be judged (and
// photographed by scripts/garage-shots.mjs) without loading a city. Not part of the build.
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {createVehicle,applyPlayerLamps} from './vehicles.js';
import {createRideVehicle} from './player-ride-models.js';

export const GARAGE=[
 ['gwagen','Mercedes G'],['roadster','Tesla Roadster'],['scala','Škoda Scala'],['x5','BMW X5'],['ram','Dodge RAM'],['police','Police car'],
 ['transporter','VW Transporter'],['panamera','Porsche Panamera'],['es','Lexus ES 300h'],['tuktuk','Tuktuk'],['ferry','Přívoz'],
];
const query=new URLSearchParams(location.search),car=query.get('car')||'scala',view=query.get('view')||'quarter',lamps=query.get('lamps')==='on';
const bar=document.getElementById('bar');
for(const [type,label] of GARAGE){const a=document.createElement('a');a.href=`?car=${type}&view=${view}`;a.textContent=label;if(type===car)a.className='on';bar.append(a);}
if(query.get('ui')==='off')bar.remove();

const canvas=document.getElementById('garage'),renderer=new THREE.WebGLRenderer({canvas,antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.9;
const scene=new THREE.Scene();scene.background=new THREE.Color('#cfd6da');
scene.environment=new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(),.04).texture;
scene.add(new THREE.HemisphereLight('#eef4fa','#7c8078',.9));
const sun=new THREE.DirectionalLight('#fff3df',2.2);sun.position.set(-6,10,-7);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-6,right:6,top:6,bottom:-6,near:1,far:40});sun.shadow.bias=-.0003;scene.add(sun);
const floor=new THREE.Mesh(new THREE.CircleGeometry(30,48),new THREE.MeshStandardMaterial({color:'#aeb4b2',roughness:.9}));floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor);

async function build(type){
 if(type==='police'){const {createPoliceBody}=await import('./police-model.js');return createPoliceBody('estate','praha');}
 if(type==='ferry')return createRideVehicle({kind:'ferry'},'ferry').root;
 return createVehicle(0,true,type);
}
const model=await build(car);model.position.y=car==='ferry'?.3:.02;scene.add(model);
if(lamps)applyPlayerLamps(model,true);
const box=new THREE.Box3().setFromObject(model),size=box.getSize(new THREE.Vector3()),centre=box.getCenter(new THREE.Vector3());
const camera=new THREE.PerspectiveCamera(32,1,.1,200),reach=Math.max(size.z,size.x*1.6,size.y*1.9)*1.55;
// The nose points along -Z.
const eyes={front:[0,.22,-1],rear:[0,.22,1],side:[-1,.14,0],right:[1,.14,0],quarter:[-.62,.34,-.78],back:[.62,.38,.78],top:[0,1,.001]};
const dir=new THREE.Vector3(...(eyes[view]||eyes.quarter)).normalize();
camera.position.copy(centre).addScaledVector(dir,reach);camera.lookAt(centre);
const controls=new OrbitControls(camera,canvas);controls.target.copy(centre);controls.update();
function resize(){renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}
addEventListener('resize',resize);resize();
let tris=0,meshes=0;model.traverse(o=>{if(o.isMesh){meshes++;tris+=o.geometry.index?o.geometry.index.count/3:o.geometry.attributes.position.count/3;}});
window.garage={ready:true,car,view,meshes,triangles:Math.round(tris),size:size.toArray()};
renderer.setAnimationLoop(()=>renderer.render(scene,camera));
