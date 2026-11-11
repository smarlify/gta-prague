import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {registerEnvMaterial} from './environment.js';
import {PAINT_FLAKE_UNIFORM,PAINT_FLAKE_SCALE_UNIFORM} from './surface-textures.js';

// Shared parts for every car body: finishes, the lofted shell, one-mesh wheels and a batcher that
// merges all panels of one finish into a single draw. A car is at most one mesh per finish plus
// four wheels, however much detail the builder adds.

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
 // Tyre, rim and spokes are one mesh; the colours are baked into its vertices.
 const wheel=new THREE.MeshStandardMaterial({vertexColors:true,metalness:.45,roughness:.5});
 const mats={paint,glass,rubber,black,chrome,head,tail,plate,wheel};
 for(const [name,m] of Object.entries(mats))m.name=name;
 registerEnvMaterial(paint,1);registerEnvMaterial(glass,1.5);registerEnvMaterial(chrome,1.1);registerEnvMaterial(black,.7);registerEnvMaterial(rubber,.35);registerEnvMaterial(tail,.6);registerEnvMaterial(wheel,.6);
 return mats;
}

// Chamfered eight-sided hull through cross-sections [z, halfWidth, lo, hi, topHalfWidth?].
// A narrower top gives the tumblehome of a cabin or the taper of a bonnet. Normals are smoothed
// across the chamfers, so the flat facets read as a rounded panel.
export function loft(sections,chamfer=.10){
 const vertices=[],indices=[],n=8;
 for(const [z,w,lo,hi,top=w]of sections){const b=Math.min(chamfer,(hi-lo)*.2,w*.5,top*.5);for(const [x,y]of[[-w+b,lo],[w-b,lo],[w,lo+b],[top,hi-b],[top-b,hi],[-top+b,hi],[-top,hi-b],[-w,lo+b]])vertices.push(x,y,z);}
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

const TYRE=new THREE.Color('#17191c'),RIM=new THREE.Color('#c9cfd2'),SPOKE=new THREE.Color('#1a1e21');
function tint(geometry,color){
 const g=geometry.index?geometry.toNonIndexed():geometry;g.deleteAttribute('uv');
 const colors=new Float32Array(g.attributes.position.count*3);
 for(let i=0;i<colors.length;i+=3){colors[i]=color.r;colors[i+1]=color.g;colors[i+2]=color.b;}
 g.setAttribute('color',new THREE.BufferAttribute(colors,3));return g;
}
const wheelCache=new Map();
// One wheel as a single geometry, axle along X. `rim` is the rim radius as a share of the tyre.
// `spokes` dark bars cross the bright rim; `dish` covers the rim with a dark disc for steel wheels.
export function wheelGeometry(r,width,{detailed=false,spokes=5,rim=.65,rimColor=RIM,spokeColor=SPOKE,dish=false}={}){
 const key=[r,width,detailed,spokes,rim,new THREE.Color(rimColor).getHexString(),new THREE.Color(spokeColor).getHexString(),dish].join('|');
 if(wheelCache.has(key))return wheelCache.get(key);
 const parts=[tint(new THREE.CylinderGeometry(r,r,width,detailed?24:14).rotateZ(Math.PI/2),TYRE),tint(new THREE.CylinderGeometry(r*rim,r*rim,width+.012,detailed?16:10).rotateZ(Math.PI/2),new THREE.Color(rimColor))];
 if(detailed){
  for(let i=0;i<spokes;i++)parts.push(tint(new THREE.BoxGeometry(width+.022,.034,r*rim*1.9).rotateX(i*Math.PI/spokes),new THREE.Color(spokeColor)));
  if(dish)parts.push(tint(new THREE.CylinderGeometry(r*rim*.55,r*rim*.55,width+.03,10).rotateZ(Math.PI/2),new THREE.Color(spokeColor)));
  parts.push(tint(new THREE.CylinderGeometry(r*.14,r*.14,width+.036,8).rotateZ(Math.PI/2),new THREE.Color(rimColor)));
 }
 const geometry=mergeGeometries(parts);parts.forEach(g=>g.dispose());geometry.userData.shared=true;
 wheelCache.set(key,geometry);return geometry;
}

// Four pivots in the order the animation expects: left front, left rear, right front, right rear.
export function addWheels(group,mats,spec,{detailed=false,track=spec.w/2-.055,width=.205,positions=[-spec.wb/2,spec.wb/2],...style}={}){
 const geometry=wheelGeometry(spec.r,width,{detailed,...style});
 for(const side of [-1,1])for(const z of positions){
  const pivot=new THREE.Group();pivot.position.set(side*track,spec.r,z);group.add(pivot);
  const spin=new THREE.Group();pivot.add(spin);
  const mesh=new THREE.Mesh(geometry,mats.wheel);mesh.name='wheel';mesh.castShadow=true;spin.add(mesh);
 }
}

// Collects panels by finish, then merges each finish into one mesh under a `body` pivot.
// Wheel pivots must be added before finish(): callers read the first four children as the wheels.
export function createCarKit(detailed,mats=createVehicleMaterials()){
 const group=new THREE.Group(),batches=new Map();
 function add(g,mat,x=0,y=0,z=0,rx=0,ry=0,rz=0){
  if(rx)g.rotateX(rx);if(ry)g.rotateY(ry);if(rz)g.rotateZ(rz);g.translate(x,y,z);
  if(g.index)g=g.toNonIndexed();g.deleteAttribute('uv');
  if(!batches.has(mat))batches.set(mat,[]);batches.get(mat).push(g);
 }
 // Plain twelve-triangle box: trim, lamps, seams — anything too small for its corners to show.
 function slab(w,h,d,mat,x,y,z,rx=0,ry=0,rz=0){add(new THREE.BoxGeometry(w,h,d),mat,x,y,z,rx,ry,rz);}
 // Soft-cornered panel for the few large parts whose edges catch the light.
 function panel(w,h,d,mat,x,y,z,rx=0,ry=0,rz=0,radius=.05){add(new RoundedBoxGeometry(w,h,d,1,Math.min(radius,w/4,h/4,d/4)),mat,x,y,z,rx,ry,rz);}
 // Cylinder whose axis points along `axis`.
 function tube(r,length,mat,x,y,z,axis='z',segments=detailed?14:8,r2=r){
  const g=new THREE.CylinderGeometry(r,r2,length,segments);
  if(axis==='z')g.rotateX(Math.PI/2);else if(axis==='x')g.rotateZ(Math.PI/2);
  add(g,mat,x,y,z);
 }
 function ring(r,thickness,mat,x,y,z,{axis='z',arc=Math.PI*2,segments=detailed?20:12,sx=1,sy=1}={}){
  const g=new THREE.TorusGeometry(r,thickness,5,segments,arc);if(sx!==1||sy!==1)g.scale(sx,sy,1);
  add(g,mat,x,y,z,0,axis==='x'?Math.PI/2:0);
 }
 // Bar from a to b. `depth` is its size along the car's length, so a wide pillar stays flush with
 // the flank it leans on and does not twist outwards.
 function strut(a,b,width,mat,depth=width){
  const from=new THREE.Vector3(...a),v=new THREE.Vector3(...b).sub(from),length=v.length(),y=v.clone().normalize();
  const x=Math.abs(y.z)>.92?new THREE.Vector3(1,0,0):new THREE.Vector3().crossVectors(y,new THREE.Vector3(0,0,1)).normalize();
  const z=new THREE.Vector3().crossVectors(x,y).normalize();x.crossVectors(y,z);
  const g=new THREE.BoxGeometry(width,length,depth);g.applyMatrix4(new THREE.Matrix4().makeBasis(x,y,z));
  g.translate(...from.addScaledVector(v,.5).toArray());add(g,mat);
 }
 // A lamp that still reads in daylight: a pale reflector with the lens set into it. The lens is
 // the `head` finish, dark until the lamps are on.
 function lamp(w,h,x,y,z,{lens=.6,depth=.05}={}){
  slab(w,h,depth,'plate',x,y,z);slab(w*lens,h*.56,depth,'head',x,y,z-.012);
 }
 // Flat panel spanning two points in the Y/Z plane (windscreens, sloping roofs and tailgates).
 function ramp(width,thickness,mat,[y0,z0],[y1,z1],x=0){
  const dy=y1-y0,dz=z1-z0,length=Math.hypot(dy,dz);
  add(new THREE.BoxGeometry(width,thickness,length),mat,x,(y0+y1)/2,(z0+z1)/2,-Math.atan2(dy,dz));
 }
 function hull(sections,mat,chamfer,x=0,y=0,z=0){add(loft(sections,chamfer),mat,x,y,z);}
 // Dark well behind each wheel and a thin lip over it, so the wheel sits in an arch and not
 // against a flat flank.
 function arches(spec,{x=spec.w/2-.012,grow=.05,lip=.022,positions=[-spec.wb/2,spec.wb/2]}={}){
  for(const side of [-1,1])for(const z of positions){
   tube(spec.r+grow,.03,'black',side*x,spec.r+.01,z,'x',detailed?20:12);
   if(lip)ring(spec.r+grow+.01,lip,'black',side*(x+.014),spec.r+.01,z,{axis:'x',arc:Math.PI,segments:detailed?16:10});
  }
 }
 const wheels=(spec,options={})=>addWheels(group,mats,spec,{detailed,...options});
 // Body panels hang under one pivot (after the wheel pivots) so braking dive, acceleration
 // squat and roll can tilt the shell without the wheels.
 function finish(){
  const body=new THREE.Group();body.name='body';group.add(body);
  for(const [name,gs]of batches){const mesh=new THREE.Mesh(mergeGeometries(gs),mats[name]);mesh.name=name;mesh.castShadow=true;mesh.receiveShadow=true;body.add(mesh);gs.forEach(g=>g.dispose());}
  batches.clear();
  return body;
 }
 // A named mesh of its own, for parts the game or the tests look up by name.
 function named(name,geometries,mat){
  const mesh=new THREE.Mesh(geometries.length>1?mergeGeometries(geometries.map(g=>{const n=g.index?g.toNonIndexed():g;n.deleteAttribute('uv');return n;})):geometries[0],mats[mat]);
  mesh.name=name;mesh.castShadow=true;return mesh;
 }
 // Number plate with a blue EU band and dark characters, front and rear.
 function plates(front,rear,{y=.5,yRear=y,width=.48}={}){
  for(const [z,py,dir]of [[front,y,-1],[rear,yRear,1]]){
   if(z==null)continue;
   slab(width,.11,.02,'plate',0,py,z);slab(.04,.105,.024,'glass',-width/2+.03,py,z+dir*.001);
   if(detailed)for(let i=0;i<7;i++)slab(.022,.06,.024,'black',-width/2+.1+i*.05,py,z+dir*.001);
  }
 }
 return {group,mats,add,slab,panel,tube,ring,strut,ramp,lamp,hull,arches,wheels,finish,named,plates};
}
