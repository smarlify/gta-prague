import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {registerEnvMaterial} from './environment.js';
import {PAINT_FLAKE_UNIFORM,PAINT_FLAKE_SCALE_UNIFORM} from './surface-textures.js';

// Original geometry, not manufacturer CAD. Crossover dimensions are based on
// Toyota Finland MY26 Yaris Cross: 4.172 x 1.765 x 1.595 m, wheelbase 2.560 m.
// The Mercedes G (gwagen) follows published G-Class (W463) proportions:
// 4.825 x 1.931 x 1.969 m, wheelbase 2.890 m, and its default finish is black.
// The starter is the Roadster. The Škoda Scala follows published Scala
// proportions: 4.362 x 1.793 x 1.471 m, wheelbase 2.649 m. The X5 follows
// published X5 (G05) proportions: 4.922 x 2.004 x 1.745 m, wheelbase 2.975 m.
// The RAM follows published crew-cab 1500 proportions: 5.92 x 2.08 x 1.96 m,
// wheelbase 3.67 m. Tall cab, short bed, chrome crosshair grille, no badge.
// These player bodies stay out of VEHICLE_TYPES so NPC traffic keeps its existing styles.
export const PLAYER_CAR_TYPE='roadster';
export const GWAGEN_PAINT='#111111';
// Škoda Phoenix Orange, paint code 2X / LA2Z — the energy orange. The black G
// and the Ano White Roadster keep their own finishes.
export const SCALA_PAINT='#ee5a1c';
// Dark metallic finish for the X5. Original mesh, not a manufacturer badge.
export const X5_PAINT='#16181c';
// Deep metallic blue for the RAM. Original mesh, not a Dodge badge.
export const RAM_PAINT='#1a4f96';
export const VEHICLE_TYPES=['crossover','hatchback','sedan','estate','suv','van','taxi'];
const specs={
 crossover:{l:4.172,w:1.765,h:1.595,wb:2.56,rf:-.46,rr:1.18,rg:1.76,belt:1.02,r:.335,clad:true,blackRoof:true},
 hatchback:{l:3.82,w:1.70,h:1.46,wb:2.43,rf:-.43,rr:.90,rg:1.55,belt:.90,r:.30},
 sedan:{l:4.60,w:1.81,h:1.44,wb:2.70,rf:-.48,rr:.68,rg:1.43,belt:.92,r:.32},
 estate:{l:4.60,w:1.81,h:1.49,wb:2.70,rf:-.46,rr:1.60,rg:2.05,belt:.96,r:.32,rails:true},
 suv:{l:4.43,w:1.85,h:1.76,wb:2.65,rf:-.55,rr:1.30,rg:1.94,belt:1.09,r:.36,clad:true,rails:true},
 van:{l:4.47,w:1.84,h:1.91,wb:2.78,rf:-.80,rr:1.91,rg:2.04,belt:1.07,r:.33,van:true},
 taxi:{l:4.60,w:1.81,h:1.49,wb:2.70,rf:-.46,rr:1.60,rg:2.05,belt:.96,r:.32,rails:true,taxi:true},
 offroad:{l:4.55,w:1.92,h:1.86,wb:2.72,rf:-.7,rr:1.45,rg:2.0,belt:1.15,r:.4,clad:true},
 gwagen:{l:4.825,w:1.931,h:1.969,wb:2.89,gf:-1.02,rf:-.84,rr:1.38,rg:1.55,belt:1.30,r:.40,clad:true,rails:true,boxy:true},
 // October 2026 Rocket trim: published wheelbase 2.825 m and width about 2.00 m.
 // Length is not published; 4.55 m is the overhang that fits that wheelbase.
 roadster:{l:4.55,w:1.98,h:1.14,wb:2.825,rf:.2,rr:1.25,rg:1.55,belt:.62,r:.34},
 scala:{l:4.362,w:1.793,h:1.471,wb:2.649,rf:-.42,rr:1.05,rg:1.72,belt:.96,r:.31},
 x5:{l:4.922,w:2.004,h:1.745,wb:2.975,rf:-.62,rr:1.22,rg:1.95,belt:1.12,r:.39,clad:true,rails:true,kidney:true},
 // Crew cab, short bed. The crosshair is drawn in buildRam; it is not a badge.
 ram:{l:5.92,w:2.08,h:1.96,wb:3.67,belt:1.30,r:.42},
};
// Ano White, the rocket-coating colour shown on the 2026 car. Original mesh,
// not manufacturer CAD — Tesla does not publish a reusable body model.
export const ROADSTER_PAINT='#f2efe6';
const palette=['#b8bcb8','#e5e7e1','#284c65','#be3529','#344a3e','#393b41','#a29b8b','#577383','#794537'];
const templates=new Map();
// Showroom finishes: clearcoated paint, dark reflective glazing, polished
// trim and satin rubber. Every reflective material shares the one sky PMREM
// (see environment.js), so instanced traffic batches reflect the same sky as
// the player car at no per-frame cost.
function attachPaintFlake(paint){
 // Vehicle meshes drop UVs on merge; sample flake from object-space XZ/Y instead.
 paint.onBeforeCompile=shader=>{
  shader.uniforms.uFlake=PAINT_FLAKE_UNIFORM;
  shader.uniforms.uFlakeScale=PAINT_FLAKE_SCALE_UNIFORM;
  shader.vertexShader='varying vec3 vPaintPos;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvPaintPos=position;');
  shader.fragmentShader='varying vec3 vPaintPos;uniform sampler2D uFlake;uniform float uFlakeScale;\n'+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
   float flake=texture2D(uFlake,vPaintPos.xz*uFlakeScale+vec2(vPaintPos.y*uFlakeScale*0.37)).r;
   diffuseColor.rgb*=1.0+(flake-0.5)*0.22;
  `).replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
   roughnessFactor*=mix(1.0,0.8+flake*0.3,0.55);
  `).replace('material.clearcoatRoughness = clearcoatRoughness;','material.clearcoatRoughness = clamp(clearcoatRoughness+(flake-0.5)*0.18,0.02,1.0);');
 };
 paint.customProgramCacheKey=()=>'paint-flake';
}
export function createVehicleMaterials(){
 const paint=new THREE.MeshPhysicalMaterial({color:'#ffffff',metalness:.32,roughness:.26,clearcoat:1,clearcoatRoughness:.055});
 attachPaintFlake(paint);
 const glass=new THREE.MeshPhysicalMaterial({color:'#101d24',metalness:.62,roughness:.06});
 const rubber=new THREE.MeshStandardMaterial({color:'#1b1e22',metalness:0,roughness:.74});
 const black=new THREE.MeshStandardMaterial({color:'#15191c',metalness:.35,roughness:.42});
 const chrome=new THREE.MeshStandardMaterial({color:'#dfe4e6',metalness:1,roughness:.16});
 // Unlit lens: night exposure and fog must not wash the lamp out. Traffic tints a clone per car.
 const head=new THREE.MeshBasicMaterial({color:'#24282b',toneMapped:false,fog:false});
 const tail=new THREE.MeshStandardMaterial({color:'#ae1522',metalness:.2,roughness:.3,emissive:'#ff2817',emissiveIntensity:.35});
 const plate=new THREE.MeshStandardMaterial({color:'#eff2e8',metalness:0,roughness:.6});
 const mats={paint,glass,rubber,black,chrome,head,tail,plate};
 for(const [name,m] of Object.entries(mats))m.name=name;
 registerEnvMaterial(paint,1);registerEnvMaterial(glass,1.5);registerEnvMaterial(chrome,1.1);registerEnvMaterial(black,.7);registerEnvMaterial(rubber,.35);registerEnvMaterial(tail,.6);
 return mats;
}
function loft(sections,chamfer=.10){
 const vertices=[],indices=[],n=8;
 for(const [z,w,lo,hi]of sections){const b=Math.min(chamfer,(hi-lo)*.2);for(const [x,y]of[[-w+b,lo],[w-b,lo],[w,lo+b],[w,hi-b],[w-b,hi],[-w+b,hi],[-w,hi-b],[-w,lo+b]])vertices.push(x,y,z);}
 for(let i=0;i<sections.length-1;i++)for(let j=0;j<n;j++){const a=i*n+j,b=i*n+(j+1)%n;indices.push(a,b,a+n,b,b+n,a+n);}
 for(let j=1;j<n-1;j++){indices.push(0,j+1,j);const k=(sections.length-1)*n;indices.push(k,k+j,k+j+1);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();return g.toNonIndexed();
}
// Dipped beams in the car's own frame. The nose points along -Z. Two spot lights, not cones:
// the road and the walls ahead are MeshStandardMaterial, so they pick up the pool.
// Intensity is candela. Decay is inverse-square, and the cone is narrow, so the near
// road reads clearly and the pool is gone by the end of the range. No shadow map.
export function headBeams(spec){
 const L=spec.l/2,W=spec.w/2,B=spec.belt;
 const group=new THREE.Group();group.name='head-beams';group.visible=false;
 const distance=40,angle=.28,penumbra=.55,decay=2,intensity=7000,dip=.1,aim=24;
 for(const side of [-1,1]){
  const x=side*W*(spec.boxy?0.55:0.66),y=spec.boxy?B-.22:B-.11,z=-L+(spec.boxy?-0.01:0.02);
  const spot=new THREE.SpotLight('#ffe6c2',intensity,distance,angle,penumbra,decay);
  spot.name='head-beam';spot.castShadow=false;spot.position.set(x,y,z);
  const target=new THREE.Object3D();target.name='head-beam-target';
  target.position.set(x,y-Math.sin(dip)*aim,z-Math.cos(dip)*aim);
  spot.target=target;group.add(spot,target);
 }
 return group;
}
function build(type,detailed){
 const s=specs[type],L=s.l/2,W=s.w/2,B=s.belt,H=s.h,group=new THREE.Group(),batches=new Map();
 const mats=createVehicleMaterials();
 function add(g,mat,x=0,y=0,z=0,rx=0,ry=0,rz=0){g.rotateX(rx);g.rotateY(ry);g.rotateZ(rz);g.translate(x,y,z);if(g.index)g=g.toNonIndexed();g.deleteAttribute('uv');if(!batches.has(mat))batches.set(mat,[]);batches.get(mat).push(g);}
 function box(w,h,d,mat,x,y,z,rx=0,ry=0,rz=0){add(new RoundedBoxGeometry(w,h,d,detailed?2:1,Math.min(.06,w/4,h/4,d/4)),mat,x,y,z,rx,ry,rz);}
 function disc(r,depth,mat,x,y,z){add(new THREE.CylinderGeometry(r,r,depth,detailed?16:8),mat,x,y,z,Math.PI/2);}
 function star(x,y,z){for(let i=0;i<3;i++){const g=new THREE.BoxGeometry(.016,.10,.012);g.translate(0,.045,0);add(g,'chrome',x,y,z,0,0,i*Math.PI*2/3);}}
 function strut(a,b,width,mat){const v=new THREE.Vector3(...b).sub(new THREE.Vector3(...a)),g=new THREE.BoxGeometry(width,v.length(),width);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),v.clone().normalize()));g.translate(...new THREE.Vector3(...a).addScaledVector(v,.5).toArray());add(g,mat);}
 const edge=s.boxy?0.04:0.10;
 add(loft(s.boxy
  ?[[-L,W*.98,.58,B],[-L+.08,W,.50,B],[-L+.55,W,.48,B],[0,W,.46,B],[L-.55,W,.48,B],[L-.06,W*.99,.52,B],[L,W*.97,.58,B*.98]]
  :[[-L,W*.78,.45,B*.82],[-L+.22,W*.95,.36,B*.93],[-L+.67,W,.37,B],[-.50,W,.37,B+.035],[L-.47,W,.40,B+.025],[L-.08,W*.94,.46,B],[L,W*.82,.50,B-.09]],edge),'paint');
 const fg=s.boxy?s.gf:-L+.93,rw=s.boxy?W*.92:W*.80;
 add(loft(s.boxy
  ?[[fg,W*.93,B-.04,B+.05],[s.rf,rw,B,H-.04],[s.rr,rw,B,H-.04],[s.rg,W*.93,B-.04,B+.05]]
  :[[fg,W*.88,B-.01,B+.055],[s.rf,rw,B,H-.065],[s.rr,rw,B,H-.065],[s.rg,W*.88,B,B+.035]],edge),'glass');
 if(s.boxy)box(W*1.78,.045,s.rr-s.rf+.06,'paint',0,H-.015,(s.rr+s.rf)/2);
 else box(rw*2+.045,.085,s.rr-s.rf+.14,s.blackRoof?'black':'paint',0,H-.043,(s.rr+s.rf)/2);
 for(const side of [-1,1]){
  strut([side*W*.88,B,fg],[side*rw,H-.07,s.rf],.075,s.blackRoof?'black':'paint');
  strut([side*rw,H-.07,s.rr],[side*W*.89,B,s.rg],s.van?.16:.12,s.blackRoof?'black':'paint');
  strut([side*W*.91,B,.20],[side*rw,H-.07,.20],.075,'black');
  box(.05,.065,s.rg-fg,'chrome',side*W*.90,B+.012,(s.rg+fg)/2);
  box(s.boxy?.06:.085,s.boxy?.10:.18,s.boxy?s.wb*.7:L*1.23,s.clad?'rubber':'paint',side*(W-(s.boxy?.01:.035)),s.boxy?.42:.46,s.boxy?.1:0);
  for(const z of [-.13,s.van?1.08:.95]){box(.035,.05,.19,'chrome',side*(W+.008),B-.11,z);box(.012,.45,.013,'black',side*(W+.009),B-.37,z+.20);}
  box(.18,.12,.25,s.blackRoof?'black':'paint',side*(W+.07),B+.08,fg+.11);
  box(.14,.075,.015,'glass',side*(W+.075),B+.085,fg+.245);
  if(s.clad)for(const z of [-s.wb/2,s.wb/2])add(new THREE.TorusGeometry(s.r+(s.boxy?.05:.035),s.boxy?.068:.052,6,detailed?28:14,Math.PI),'rubber',side*(W+(s.boxy?.02:-.02)),s.r,z,0,Math.PI/2);
  if(s.rails)box(.045,.065,s.rr-s.rf-.15,'chrome',side*rw*.87,H+.03,(s.rf+s.rr)/2);
  if(s.boxy){
   for(const z of [-s.wb/2,s.wb/2])box(.12,.22,.62,'paint',side*(W+.03),s.r+.12,z);
   box(.09,.05,s.wb*.55,'black',side*(W+.02),.40,.08);
   for(const dy of [-.12,-.32]){disc(.105,.028,'black',side*W*.55,B+dy,-L+.01);disc(.082,.04,'head',side*W*.55,B+dy,-L-.02);}
   box(.08,.32,.045,'tail',side*(W-.16),B-.30,L+.012);
   box(.055,.035,.09,'chrome',side*W*.72,B+.012,-s.wb/2-.2);
  }else{
   box(.43,.105,.09,'black',side*W*.64,B-.13,-L+.045);
   box(.35,.035,.10,'head',side*W*.66,B-.11,-L+.015,0,side*.11);
   box(.36,.11,.10,'tail',side*W*.67,B-.10,L-.045);
   if(s.clad)box(.075,.18,.085,'tail',side*W*.84,B-.19,L-.10);
  }
  if(s.van||type==='estate'||s.taxi)box(.095,.40,.075,'tail',side*W*.9,B+.03,L-.09);
  box(.14,.04,.035,'plate',side*W*.55,.66,L+.01);
 }
 if(s.boxy){
  box(W*1.96,.26,.10,'black',0,.64,-L+.02);
  box(W*.74,.46,.05,'black',0,B-.30,-L-.01);
  for(let i=0;i<5;i++)box(W*.62,.016,.055,'chrome',0,B-.48+i*.09,-L-.03);
  star(0,B-.28,-L-.05);
  const spareY=1.12;
  disc(.36,.14,'rubber',0,spareY,L+.18);
  disc(.14,.16,'chrome',0,spareY,L+.22);
  box(.04,.58,.04,'black',0,spareY,L+.05);
  box(W*1.92,.16,.10,'rubber',0,.52,L-.02);
 }else{
  box(W*1.80,.19,.16,'black',0,.46,-L+.11);box(W*1.86,.21,.15,'rubber',0,.48,L-.10);box(W*1.30,.09,.12,'chrome',0,.37,L-.09);
  if(!s.kidney){box(W*1.35,.21,.085,'black',0,.71,-L+.025);for(let i=0;i<3;i++)box(W*1.20,.015,.09,'chrome',0,.65+i*.057,-L+.015);}
 }
 box(W*1.16,.085,.035,'black',0,B-.07,L-.014);
 for(const z of [-L-.006,L+.017]){box(.48,.13,.025,'plate',0,.74,z);box(.043,.12,.029,'glass',-.21,.74,z);if(detailed)for(let i=0;i<7;i++)box(.022,.063,.032,'black',-.145+i*.048,.743,z);}
 if(type==='crossover'){
  box(rw*2+.10,.055,.27,'black',0,H-.015,s.rr+.055);box(.30,.025,.045,'tail',0,H-.055,s.rr+.20);
  strut([-.26,B+.20,s.rg-.12],[.12,B+.24,s.rg-.14],.022,'black');
  const badge=new THREE.TorusGeometry(.047,.009,5,20);badge.scale(1.5,1,1);add(badge,'chrome',0,B-.19,L+.025);
 }
 if(s.van){box(W*1.91,H-B-.075,L-.25,'paint',0,(H+B)/2-.02,(L+.25)/2-.08);box(.024,H-.55,.025,'black',0,(H+.55)/2,L+.018);for(const side of [-1,1])box(.055,.07,.21,'black',side*W,.99,.90);}
 if(s.taxi){box(.46,.18,.18,'plate',0,H+.09,.15);for(let i=0;i<5;i++)box(.037,.075,.19,'black',-.13+i*.065,H+.10,.15);}
 for(const side of [-1,1])for(const z of [-s.wb/2,s.wb/2]){
  const pivot=new THREE.Group();pivot.position.set(side*(W-.055),s.r,z);group.add(pivot);const spin=new THREE.Group();pivot.add(spin);
  const tire=new THREE.Mesh(new THREE.CylinderGeometry(s.r,s.r,.205,detailed?32:16),mats.rubber);tire.rotation.z=Math.PI/2;spin.add(tire);
  const hub=new THREE.Mesh(new THREE.CylinderGeometry(s.r*.65,s.r*.65,.214,detailed?24:12),mats.chrome);hub.rotation.z=Math.PI/2;spin.add(hub);
  if(detailed)for(let i=0;i<5;i++){const spoke=new THREE.Mesh(new THREE.BoxGeometry(.22,.034,s.r*1.22),mats.black);spoke.rotation.x=i*Math.PI/5;spin.add(spoke);}
  spin.children.forEach(m=>m.castShadow=true);
 }
 // Body panels hang under one pivot (after the four wheel pivots) so braking
 // dive, acceleration squat and roll can tilt the shell without the wheels.
 const body=new THREE.Group();body.name='body';group.add(body);
 for(const [name,gs]of batches){const mesh=new THREE.Mesh(mergeGeometries(gs),mats[name]);mesh.name=name;mesh.castShadow=true;mesh.receiveShadow=true;body.add(mesh);gs.forEach(g=>g.dispose());}
 if(s.kidney){
  for(const side of [-1,1]){
   const opening=new THREE.Mesh(new RoundedBoxGeometry(.32,.46,.07,2,.06),mats.black);
   opening.position.set(side*.18,.78,-L-.02);opening.name='kidney';opening.castShadow=true;body.add(opening);
   const surround=new THREE.Mesh(new THREE.TorusGeometry(.18,.022,6,12),mats.chrome);
   surround.scale.set(.9,1.25,1);surround.position.set(side*.18,.78,-L-.055);surround.name='kidney';body.add(surround);
  }
 }
 if(detailed)body.add(headBeams(s));
 return group;
}
// Stylised T. Proportions follow the familiar nose badge; the curves are drawn
// here and are not a traced brand file.
function teslaMark(){
 const s=new THREE.Shape();
 // Flared top bar and a narrow stem. Drawn here; not a traced badge file.
 s.moveTo(-.88,.18);s.lineTo(-.62,.74);s.lineTo(.62,.74);s.lineTo(.88,.18);
 s.lineTo(.20,.18);s.lineTo(.26,-.78);s.lineTo(-.26,-.78);s.lineTo(-.20,.18);s.closePath();
 return new THREE.ExtrudeGeometry(s,{depth:.06,bevelEnabled:false,curveSegments:1});
}
function buildRoadster(detailed){
 const s=specs.roadster,L=s.l/2,W=s.w/2,group=new THREE.Group(),batches=new Map();
 const mats=createVehicleMaterials();
 mats.glass.color.set('#6a542c');mats.glass.metalness=.74;mats.glass.roughness=.07;
 const nozzle=new THREE.MeshBasicMaterial({color:'#3e5158',toneMapped:false,fog:false});nozzle.name='nozzle';mats.nozzle=nozzle;
 function add(g,mat,x=0,y=0,z=0,rx=0,ry=0,rz=0){g.rotateX(rx);g.rotateY(ry);g.rotateZ(rz);g.translate(x,y,z);if(g.index)g=g.toNonIndexed();g.deleteAttribute('uv');if(!batches.has(mat))batches.set(mat,[]);batches.get(mat).push(g);}
 function box(w,h,d,mat,x,y,z,rx=0,ry=0,rz=0){add(new THREE.BoxGeometry(w,h,d),mat,x,y,z,rx,ry,rz);}
 // Low wedge, cab set back, wide rear haunches. The chase camera sits behind
 // this tail, so the lamps, nozzles and wing have to read from there.
 add(loft([
  [-L,.30,.24,.40],[-L+.40,.58,.18,.48],[-L+.95,.84,.14,.56],[-s.wb/2,W*.92,.14,.60],[-.45,W*.96,.14,.56],
  [.05,W*.94,.16,.64],[.55,W*.90,.22,.78],[1.05,W*.94,.20,.74],[1.55,W*1.04,.18,.66],[L-.18,W*.96,.24,.62],[L,W*.86,.28,.58],
 ]),'paint');
 add(loft([[.05,W*.62,.58,.64],[.48,W*.56,.62,1.04],[1.02,W*.50,.66,.98],[1.38,W*.46,.58,.70]]),'glass');
 box(W*1.15,.04,.62,'black',0,1.02,.78);
 box(W*1.55,.06,.55,'black',0,.20,-L+.28);box(W*1.35,.07,.42,'black',0,.22,L-.28);
 for(const side of [-1,1]){
  box(.06,.08,s.l*.62,'black',side*(W-.01),.36,.1);
  box(.14,.06,.20,'black',side*(W+.06),.72,.35);box(.09,.04,.012,'glass',side*(W+.08),.73,.46);
  box(.035,.03,1.35,'chrome',side*(W*.62),.62,-.35);
  for(const z of [-s.wb/2,s.wb/2])add(new THREE.TorusGeometry(s.r+.04,.045,5,detailed?12:8,Math.PI),'paint',side*(W+.02),s.r,z,0,Math.PI/2);
 }
 box(W*1.05,.03,.035,'head',0,.42,-L+.02);
 box(W*1.62,.04,.025,'tail',0,.50,L+.01);
 box(.42,.07,.018,'plate',0,.34,L+.02);
 for(const x of [-.52,-.18,.18,.52]){
  const shell=new THREE.CylinderGeometry(.07,.09,.16,8);shell.rotateX(Math.PI/2);add(shell,'black',x,.34,L-.02);
  const core=new THREE.CylinderGeometry(.038,.05,.1,7);core.rotateX(Math.PI/2);add(core,'nozzle',x,.34,L+.06);
 }
 for(const x of [-1,1]){
  const shell=new THREE.CylinderGeometry(.04,.05,.1,7);shell.rotateX(Math.PI/2);add(shell,'black',x*.62,.32,-L+.06);
  const core=new THREE.CylinderGeometry(.02,.028,.06,6);core.rotateX(Math.PI/2);add(core,'nozzle',x*.62,.32,-L+.01);
 }
 for(const x of [-1,1])for(const z of [-1.2,1.35]){
  add(new THREE.CylinderGeometry(.055,.07,.08,7),'black',x*(W-.08),.14,z);
  add(new THREE.CylinderGeometry(.028,.036,.05,6),'nozzle',x*(W-.08),.09,z);
 }
 for(const side of [-1,1])for(const z of [-s.wb/2,s.wb/2]){
  const pivot=new THREE.Group();pivot.position.set(side*(W+.02),s.r,z);group.add(pivot);const spin=new THREE.Group();pivot.add(spin);
  const tire=new THREE.Mesh(new THREE.CylinderGeometry(s.r,s.r,.24,detailed?16:12),mats.rubber);tire.rotation.z=Math.PI/2;spin.add(tire);
  const hub=new THREE.Mesh(new THREE.CylinderGeometry(s.r*.58,s.r*.58,.25,detailed?12:8),mats.chrome);hub.rotation.z=Math.PI/2;spin.add(hub);
  if(detailed)for(let i=0;i<5;i++){const spoke=new THREE.Mesh(new THREE.BoxGeometry(.016,.028,s.r*1.05),mats.black);spoke.rotation.x=i*Math.PI/5;spin.add(spoke);}
  const cap=teslaMark();cap.scale(.08,.08,.08);cap.rotateY(side>0?-Math.PI/2:Math.PI/2);cap.translate(side*.13,0,0);const capMesh=new THREE.Mesh(cap,mats.black);capMesh.name='tesla-mark';spin.add(capMesh);
  spin.children.forEach(m=>{if(m.isMesh)m.castShadow=true;});
 }
 const body=new THREE.Group();body.name='body';group.add(body);
 for(const [name,gs]of batches){const mesh=new THREE.Mesh(mergeGeometries(gs),mats[name]);mesh.name=name;mesh.castShadow=true;mesh.receiveShadow=true;body.add(mesh);gs.forEach(g=>g.dispose());}
 function badge(x,y,z,scale,rx,ry){const g=teslaMark();g.scale(scale,scale,scale);g.rotateX(rx);g.rotateY(ry);g.translate(x,y,z);const mesh=new THREE.Mesh(g,mats.black);mesh.name='tesla-mark';mesh.castShadow=true;body.add(mesh);}
 // Hood lies flat. The tail mark faces the chase camera. The deck mark is tilted up toward that same camera.
 badge(0,.50,-1.25,.11,-Math.PI/2,0);
 badge(0,.50,L+.05,.16,0,0);
 badge(0,.78,1.42,.30,-.65,0);
 const wing=new THREE.Group();wing.name='wing';wing.position.set(0,1.02,1.92);
 const plane=new THREE.Mesh(new THREE.BoxGeometry(1.72,.045,.38),mats.paint);plane.castShadow=true;wing.add(plane);
 for(const x of [-.78,.78]){const end=new THREE.Mesh(new THREE.BoxGeometry(.03,.16,.38),mats.black);end.position.set(x,-.02,0);wing.add(end);}
 for(const x of [-.42,.42]){const strut=new THREE.Mesh(new THREE.BoxGeometry(.03,.28,.04),mats.black);strut.position.set(x,-.16,-.02);wing.add(strut);}
 body.add(wing);
 const fans=new THREE.Group();fans.name='fans';
 for(const [x,z]of [[-.34,-.4],[.34,-.4],[-.34,.62],[.34,.62]]){
  const pivot=new THREE.Group();pivot.position.set(x,.12,z);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(.16,.018,4,10),mats.black);ring.rotation.x=Math.PI/2;pivot.add(ring);
  const blade=new THREE.Mesh(new THREE.BoxGeometry(.28,.012,.04),mats.chrome);pivot.add(blade);
  fans.add(pivot);
 }
 body.add(fans);
 if(detailed)body.add(headBeams(s));
 return group;
}
// Crew-cab pickup. Long hood, tall four-door cab, short open bed, big arches.
// The grille is a chrome cross. No ram's head and no badge artwork.
function buildRam(detailed){
 const s=specs.ram,L=s.l/2,W=s.w/2,B=s.belt,H=s.h,group=new THREE.Group(),batches=new Map();
 const mats=createVehicleMaterials();
 function add(g,mat,x=0,y=0,z=0,rx=0,ry=0,rz=0){g.rotateX(rx);g.rotateY(ry);g.rotateZ(rz);g.translate(x,y,z);if(g.index)g=g.toNonIndexed();g.deleteAttribute('uv');if(!batches.has(mat))batches.set(mat,[]);batches.get(mat).push(g);}
 function box(w,h,d,mat,x,y,z,rx=0,ry=0,rz=0){add(new RoundedBoxGeometry(w,h,d,detailed?2:1,Math.min(.05,w/4,h/4,d/4)),mat,x,y,z,rx,ry,rz);}
 function strut(a,b,width,mat){const v=new THREE.Vector3(...b).sub(new THREE.Vector3(...a)),g=new THREE.BoxGeometry(width,v.length(),width);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),v.clone().normalize()));g.translate(...new THREE.Vector3(...a).addScaledVector(v,.5).toArray());add(g,mat);}
 const cowl=-1.50,cabRear=1.20,bedY=.90,rail=1.22,bedStart=cabRear-.04,bedEnd=L-.05,bedMid=(bedStart+bedEnd)/2,bedLen=bedEnd-bedStart;
 add(loft([
  [-L+.08,W*.90,.48,.76],
  [-L+.42,W*.94,.42,.96],
  [-s.wb/2,W*.92,.40,1.14],
  [cowl,W*.96,.42,B-.02],
  [.05,W*.94,.42,B],
  [cabRear,W*.92,.44,B-.02],
 ],.05),'paint');
 add(loft([
  [bedStart,W*.90,.44,.84],
  [s.wb/2,W*.92,.40,.80],
  [bedEnd,W*.94,.46,.88],
  [L-.02,W*.88,.50,.92],
 ],.04),'paint');
 add(loft([
  [-L+.04,W*.64,1.14,1.28],
  [-2.15,W*.82,1.08,B-.08],
  [-s.wb/2+.05,W*.86,1.10,B-.02],
  [cowl+.06,W*.60,1.16,B+.05],
 ],.04),'paint');
 add(loft([
  [cowl+.02,W*.78,B-.01,B+.08],
  [cowl+.48,W*.74,B,H-.10],
  [cabRear-.48,W*.74,B,H-.10],
  [cabRear,W*.68,B+.16,H-.32],
 ],.04),'glass');
 box(W*1.38,.06,cabRear-cowl-.55,'paint',0,1.90,(cowl+.55+cabRear)/2);
 box(.38,.04,1.10,'paint',0,B+.02,-1.95);
 box(W*1.40,.05,.12,'black',0,B+.02,cowl+.08);
 for(const side of [-1,1]){
  strut([side*W*.90,B,cowl],[side*W*.70,H-.14,cowl+.50],.065,'paint');
  strut([side*W*.74,H-.12,.08],[side*W*.90,B,.08],.05,'black');
  strut([side*W*.70,H-.14,cabRear-.28],[side*W*.88,B+.02,cabRear],.065,'paint');
  box(.045,.05,cabRear-cowl-.35,'chrome',side*W*.84,B+.015,(cowl+cabRear)/2);
  box(.15,.065,.20,'paint',side*(W-.02),B+.07,cowl+.22);
  box(.10,.045,.012,'glass',side*(W-.015),B+.075,cowl+.33);
  for(const z of [-.72,.42])box(.038,.032,.11,'chrome',side*(W+.008),B-.015,z);
  box(.04,.04,1.55,'chrome',side*.46,1.945,.06);
  box(.10,.045,2.30,'black',side*(W-.06),.40,-.08);
  for(const z of [-s.wb/2,s.wb/2]){
   add(new THREE.TorusGeometry(s.r+.06,.085,6,detailed?22:12,Math.PI),'rubber',side*.98,s.r,z,0,Math.PI/2);
   box(.16,.48,.98,'paint',side*.90,.88,z);
  }
  box(.08,rail-bedY,bedLen,'paint',side*.86,(rail+bedY)/2,bedMid);
  box(.05,.028,bedLen-.1,'chrome',side*.86,rail+.012,bedMid);
  box(.10,.36,.04,'tail',side*(W-.22),1.04,L-.02);
  box(.30,.16,.04,'black',side*.90,1.00,-L+.04);
  box(.24,.12,.028,'head',side*.90,1.02,-L+.012);
 }
 box(1.68,.045,bedLen-.16,'black',0,bedY+.03,bedMid);
 box(W*1.70,.36,.06,'paint',0,(B+bedY)/2-.04,cabRear);
 box(1.76,.30,.05,'paint',0,(rail+bedY)/2,L-.045);
 box(W*1.86,.18,.10,'chrome',0,.62,-L+.07);
 box(W*1.50,.10,.06,'black',0,.50,L-.06);
 box(.46,.11,.018,'plate',0,.60,-L+.03);
 box(.46,.11,.018,'plate',0,1.02,L-.01);
 if(detailed)for(const z of [-L+.03,L-.01]){const y=z<0?.60:1.02;box(.036,.09,.012,'glass',-.18,y,z);for(let i=0;i<7;i++)box(.016,.05,.014,'black',-.12+i*.04,y,z);}
 for(const y of [1.16,1.08,.94,.86])box(1.14,.012,.02,'chrome',0,y,-L+.02);
 for(const side of [-1,1])for(const z of [-s.wb/2,s.wb/2]){
  const pivot=new THREE.Group();pivot.position.set(side*(W-.16),s.r,z);group.add(pivot);const spin=new THREE.Group();pivot.add(spin);
  const tire=new THREE.Mesh(new THREE.CylinderGeometry(s.r,s.r,.27,detailed?24:12),mats.rubber);tire.rotation.z=Math.PI/2;spin.add(tire);
  const hub=new THREE.Mesh(new THREE.CylinderGeometry(s.r*.6,s.r*.6,.28,detailed?16:10),mats.chrome);hub.rotation.z=Math.PI/2;spin.add(hub);
  if(detailed)for(let i=0;i<6;i++){const spoke=new THREE.Mesh(new THREE.BoxGeometry(.22,.036,s.r*1.12),mats.black);spoke.rotation.x=i*Math.PI/6;spin.add(spoke);}
  spin.children.forEach(m=>{if(m.isMesh)m.castShadow=true;});
 }
 const body=new THREE.Group();body.name='body';group.add(body);
 for(const [name,gs]of batches){const mesh=new THREE.Mesh(mergeGeometries(gs),mats[name]);mesh.name=name;mesh.castShadow=true;mesh.receiveShadow=true;body.add(mesh);gs.forEach(g=>g.dispose());}
 const gz=-L+.01,gy=1.02,gw=1.36,gh=.50;
 const opening=new THREE.Mesh(new RoundedBoxGeometry(gw,gh,.04,1,.012),mats.black);
 opening.position.set(0,gy,gz+.012);opening.castShadow=true;body.add(opening);
 function crosshair(w,h,d,x,y,z){const mesh=new THREE.Mesh(new RoundedBoxGeometry(w,h,d,1,.01),mats.chrome);mesh.position.set(x,y,z);mesh.name='crosshair';mesh.castShadow=true;body.add(mesh);}
 crosshair(.078,gh,.03,0,gy,gz);
 crosshair(gw,.062,.03,0,gy,gz-.006);
 crosshair(gw+.08,.04,.026,0,gy+gh/2,gz);
 crosshair(gw+.08,.04,.026,0,gy-gh/2,gz);
 crosshair(.04,gh+.02,.026,-gw/2,gy,gz);
 crosshair(.04,gh+.02,.026,gw/2,gy,gz);
 if(detailed)body.add(headBeams(s));
 return group;
}
// Occupied cars only. Clone first so a shared traffic template stays opaque.
export function revealCabinGlass(model){
 model?.traverse(mesh=>{
  if(!mesh.isMesh||mesh.userData.cabinGlass)return;
  const current=mesh.material;
  if(!current||current.name!=='glass')return;
  const mat=current.clone();
  mat.name='glass';
  mat.transparent=true;
  mat.opacity=.22;
  mat.depthWrite=false;
  mesh.material=mat;
  mesh.userData.cabinGlass=true;
 });
}
export function createDetailedVehicle(colour=0,detailed=false,type=detailed?PLAYER_CAR_TYPE:'sedan'){
 if(!specs[type])throw Error(`Unknown vehicle type: ${type}`);
 if(!templates.has(type))templates.set(type,type==='roadster'?buildRoadster(false):type==='ram'?buildRam(false):build(type,false));
 const model=detailed?(type==='roadster'?buildRoadster(true):type==='ram'?buildRam(true):build(type,true)):templates.get(type).clone(true);
 const finish=type==='gwagen'?GWAGEN_PAINT:type==='roadster'?ROADSTER_PAINT:type==='scala'?SCALA_PAINT:type==='x5'?X5_PAINT:type==='ram'?RAM_PAINT:palette[colour%palette.length];
 model.traverse(m=>{if(m.isMesh&&m.material.name==='paint'){m.material=registerEnvMaterial(m.material.clone());m.material.color.set(finish);if(type==='ram'){m.material.metalness=.5;m.material.roughness=.22;}}});
 model.name=type==='gwagen'?'Mercedes G':type==='roadster'?'Roadster':type==='scala'?'Škoda Scala':type==='x5'?'BMW X5':type==='ram'?'Dodge RAM':type==='crossover'?'Yaris Cross-inspired crossover':`${type} vehicle`;
 model.userData={type,spec:{...specs[type]},wheels:model.children.slice(0,4).map((pivot,i)=>({pivot,spin:pivot.children[0],front:i%2===0,radius:specs[type].r})),body:model.getObjectByName('body'),head:detailed?model.getObjectByName('head').material:null,tail:detailed?model.getObjectByName('tail').material:null,beams:detailed?model.getObjectByName('head-beams'):null,nozzleMat:model.getObjectByName('nozzle')?.material||null,wing:model.getObjectByName('wing')||null,fanPivots:model.getObjectByName('fans')?.children||null};
 return model;
}
export const PAINT_PALETTE=palette;
