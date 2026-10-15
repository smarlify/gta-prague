import * as THREE from 'three';
import {SUN_OFFSET,SKY_PALETTE,LIGHTING,FOG_COLOR} from './sky.js';
import {GRADE_DEFAULTS} from './post.js';

// Time-of-day and weather "looks". Every preset describes the whole image at once: sky dome
// palette and cloud cover, sun/hemisphere light, fog, water tint, post exposure and grade,
// rain and road wetness. Switching looks blends every value over a couple of seconds.
//
// Shared weather uniforms for other shaders (the street-surface owner can hook wet asphalt):
//   import {WEATHER_UNIFORMS} from './weather.js';
//   material.onBeforeCompile = s => { s.uniforms.uWetness = WEATHER_UNIFORMS.wetness; ... }
// wetness, rain and snow are 0..1 and already smoothed; they never need per-frame copying.
export const WEATHER_UNIFORMS=Object.freeze({wetness:{value:0},rain:{value:0},snow:{value:0}});

const clear={wetness:0,rain:0,snow:0};

const midday={
 label:'Midday',
 sky:{zenith:'#2b64bd',mid:'#6d9dd6',horizon:SKY_PALETTE.horizon,sunGlow:SKY_PALETTE.sunGlow,cloudLit:SKY_PALETTE.cloudLit,cloudShade:SKY_PALETTE.cloudShade,coverage:.5,sunDisc:1},
 sunOffset:[...SUN_OFFSET],sunColor:LIGHTING.sunColor,sunIntensity:LIGHTING.sunIntensity,
 hemiSky:LIGHTING.hemiSky,hemiGround:LIGHTING.hemiGround,hemiIntensity:LIGHTING.hemiIntensity,
 fog:{color:FOG_COLOR,near:330,far:850},
 sea:{deep:'#28332f',shore:'#434a42',sunColor:'#fff1d6'},
 grade:{...GRADE_DEFAULTS},
 ...clear,
};
// Low eastern sun, cool shade, warm light on east-facing walls.
const morning={
 label:'Morning',
 sky:{zenith:'#3a6eae',mid:'#8eb4d4',horizon:'#f3d7c2',sunGlow:'#ffe0b8',cloudLit:'#fff0dc',cloudShade:'#9aa8b8',coverage:.42,sunDisc:1},
 sunOffset:[236,96,28],sunColor:'#ffd2a2',sunIntensity:1.85,
 hemiSky:'#d5e2f2',hemiGround:'#6e7568',hemiIntensity:1.45,
 fog:{color:'#f3d7c2',near:300,far:820},
 sea:{deep:'#2a3334',shore:'#4a524c',sunColor:'#ffe0b8'},
 grade:{...GRADE_DEFAULTS,exposure:1.02,tint:[1.02,.99,.96],lift:[.015,.012,.018],saturation:1.02,bloomStrength:.22,vignette:.22},
 ...clear,
};
// Low north-western sun (~16 deg), long shadows, warm light against a cool shaded side.
const golden={
 label:'Golden evening',
 sky:{zenith:'#4d7cb7',mid:'#9ab2cf',horizon:'#f0cfae',sunGlow:'#ffd9a0',cloudLit:'#ffe3c4',cloudShade:'#9a8fa0',coverage:.56,sunDisc:1},
 sunOffset:[-208,118,-250],sunColor:'#ffc37a',sunIntensity:2.0,
 hemiSky:'#c4d2e6',hemiGround:'#746a5e',hemiIntensity:1.7,
 fog:{color:'#f0cfae',near:280,far:800},
 sea:{deep:'#2c3230',shore:'#4a4640',sunColor:'#ffd9a0'},
 grade:{...GRADE_DEFAULTS,exposure:1.0,tint:[1.03,1,.96],lift:[.02,.014,.02],saturation:1.04,bloomStrength:.3,vignette:.26},
 ...clear,
};
// Dark night. Fog reaches only as far as rain, so the city still melts out at the same distance.
const night={
 label:'Night',
 sky:{zenith:'#070d18',mid:'#121c30',horizon:'#1c283c',sunGlow:'#2a384c',cloudLit:'#243044',cloudShade:'#101820',coverage:.35,sunDisc:.2},
 sunOffset:[-30,36,-160],sunColor:'#b7c6de',sunIntensity:.16,
 hemiSky:'#243656',hemiGround:'#121418',hemiIntensity:.32,
 fog:{color:'#1c283c',near:110,far:560},
 sea:{deep:'#0c1218',shore:'#161c24',sunColor:'#b7c6de'},
 grade:{...GRADE_DEFAULTS,exposure:.62,tint:[.9,.94,1.08],lift:[.008,.01,.028],saturation:.78,contrast:1.05,bloomStrength:.16,vignette:.42},
 ...clear,
};
// June white night: the sun skims the northern horizon; dim blue-pink dusk, nothing is dark.
// Manual cycle only. The live clock uses Night after evening.
const whitenight={
 label:'White night',
 sky:{zenith:'#223a62',mid:'#4f6a99',horizon:'#e3b7b0',sunGlow:'#ffc9b0',cloudLit:'#d7b4b8',cloudShade:'#5e5d7c',coverage:.6,sunDisc:.6},
 sunOffset:[-59,42,-338],sunColor:'#ffb48c',sunIntensity:1.3,
 hemiSky:'#a9bbda',hemiGround:'#55575f',hemiIntensity:1.7,
 fog:{color:'#e3b7b0',near:260,far:780},
 sea:{deep:'#1f2630',shore:'#3b3a44',sunColor:'#ffc9b0'},
 grade:{...GRADE_DEFAULTS,exposure:.9,tint:[.98,.97,1.06],lift:[.02,.02,.05],saturation:.9,contrast:1.0,bloomStrength:.3,vignette:.3},
 ...clear,
};
const overcast={
 label:'Overcast',
 sky:{zenith:'#8d979f',mid:'#aab3ba',horizon:'#c7cdd2',sunGlow:'#d8dde1',cloudLit:'#d7dcdf',cloudShade:'#8d969d',coverage:.05,sunDisc:0},
 sunOffset:[-120,300,120],sunColor:'#e9edf1',sunIntensity:.55,
 hemiSky:'#cfd6dc',hemiGround:'#747873',hemiIntensity:1.55,
 fog:{color:'#c7cdd2',near:230,far:760},
 sea:{deep:'#2b3233',shore:'#454a48',sunColor:'#d8dde1'},
 grade:{...GRADE_DEFAULTS,exposure:1.0,tint:[.99,1,1.02],lift:[.02,.022,.03],saturation:.9,contrast:1.0,bloomStrength:.12,bloomThreshold:1.2,vignette:.2,aoStrength:.85},
 ...clear,
};
const rain={
 label:'Rain',
 sky:{zenith:'#6a737a',mid:'#8c949a',horizon:'#aab1b6',sunGlow:'#b6bcc0',cloudLit:'#b8bfc4',cloudShade:'#6c747b',coverage:.02,sunDisc:0},
 sunOffset:[-120,300,120],sunColor:'#dfe4e8',sunIntensity:.4,
 hemiSky:'#b7bfc6',hemiGround:'#5f6361',hemiIntensity:1.35,
 fog:{color:'#aab1b6',near:110,far:560},
 sea:{deep:'#262c2e',shore:'#3d4241',sunColor:'#b6bcc0'},
 grade:{...GRADE_DEFAULTS,exposure:.95,tint:[.98,1,1.03],lift:[.025,.028,.035],saturation:.84,contrast:1.0,bloomStrength:.1,bloomThreshold:1.2,vignette:.24,haze:.05,hazeColor:[.66,.7,.74],aoStrength:.85},
 wetness:1,rain:1,snow:0,
};
// Overcast sky and the rain streaks, drawn white and slower. The road stays dry.
const snow={
 label:'Snow',
 sky:{zenith:'#9aa3ab',mid:'#b7c0c6',horizon:'#d5dbe0',sunGlow:'#e4e8eb',cloudLit:'#e7ebed',cloudShade:'#9aa3aa',coverage:.08,sunDisc:0},
 sunOffset:[-80,280,80],sunColor:'#eef1f4',sunIntensity:.7,
 hemiSky:'#d5dbe0',hemiGround:'#8a8e88',hemiIntensity:1.6,
 fog:{color:'#d5dbe0',near:200,far:720},
 sea:{deep:'#2c3436',shore:'#4a5254',sunColor:'#e4e8eb'},
 grade:{...GRADE_DEFAULTS,exposure:1.05,tint:[.98,.99,1.02],lift:[.03,.032,.04],saturation:.88,contrast:.98,bloomStrength:.14,bloomThreshold:1.2,vignette:.18},
 wetness:0,rain:1,snow:1,
};
export const LOOKS=Object.freeze({morning,midday,golden,night,whitenight,overcast,rain,snow});
// Automatic is a mode in front of this list, not a sky preset. White night stays manual.
export const LOOK_ORDER=Object.freeze(['morning','midday','golden','night','whitenight','overcast','rain','snow']);

// Grass and leaf materials mix toward white from WEATHER_UNIFORMS.snow. Bark is a separate
// material, or a foliage attribute of 0 on the shared species mesh.
export function attachSnow(material,{leaves=false}={}){
 const previous=material.onBeforeCompile,previousKey=material.customProgramCacheKey;
 material.onBeforeCompile=function(shader){
  previous?.call(this,shader);
  shader.uniforms.uSnow=WEATHER_UNIFORMS.snow;
  const mix=leaves
   ?'diffuseColor.rgb=mix(diffuseColor.rgb,vec3(0.94),clamp(uSnow,0.0,1.0)*vLeaf);'
   :'diffuseColor.rgb=mix(diffuseColor.rgb,vec3(0.94),clamp(uSnow,0.0,1.0));';
  if(leaves)shader.vertexShader='attribute float aFoliage;\nvarying float vLeaf;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvLeaf=aFoliage;');
  const lead=leaves?'uniform float uSnow;\nvarying float vLeaf;\n':'uniform float uSnow;\n';
  shader.fragmentShader=lead+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>\n${mix}`);
 };
 material.customProgramCacheKey=function(){return `${previousKey?.call(this)??''}|snow${leaves?'-leaf':''}`;};
}

// Rain: one draw call of short line segments falling through a box that wraps around the camera.
// Snow reuses the same streaks: white, and a slower fall, from the shared snow uniform.
const RAIN_COUNT=2600,RAIN_BOX=new THREE.Vector3(44,26,44);
const RAIN_VERTEX=/* glsl */`
attribute vec3 aSeed;
uniform float uTime;
uniform float uSnow;
uniform vec3 uBox;
varying float vAlpha;
void main(){
 vec3 origin=cameraPosition-uBox*.5;
 vec3 p=aSeed*uBox;
 float fall=mix(8.5+4.5*aSeed.x,1.4+0.9*aSeed.x,uSnow);
 p.y-=uTime*fall;p.x+=uTime*mix(1.1,0.2,uSnow);
 p=origin+mod(p-origin,uBox);
 float len=.45+.5*aSeed.y;
 vec3 q=p+vec3(-.1*len,len,0.0)*position.x; // tail above the drop head
 float d=distance(p,cameraPosition);
 vAlpha=smoothstep(.6,2.5,d)*(1.0-smoothstep(uBox.x*.3,uBox.x*.5,d))*mix(.14,.38,aSeed.z);
 gl_Position=projectionMatrix*viewMatrix*vec4(q,1.0);
}`;
const RAIN_FRAGMENT=/* glsl */`
uniform float uRain;
uniform float uSnow;
uniform vec3 uColor;
varying float vAlpha;
void main(){gl_FragColor=vec4(mix(uColor,vec3(0.96,0.97,0.99),uSnow),vAlpha*uRain);}`;
export function createRain(){
 const geometry=new THREE.BufferGeometry();
 const position=new Float32Array(RAIN_COUNT*2*3),seed=new Float32Array(RAIN_COUNT*2*3);
 let s=12345;const rnd=()=>((s=(s*1664525+1013904223)>>>0)/4294967296);
 for(let i=0;i<RAIN_COUNT;i++){const a=rnd(),b=rnd(),c=rnd();for(let k=0;k<2;k++){const j=(i*2+k)*3;position[j]=k;seed[j]=a;seed[j+1]=b;seed[j+2]=c;}}
 geometry.setAttribute('position',new THREE.BufferAttribute(position,3));
 geometry.setAttribute('aSeed',new THREE.BufferAttribute(seed,3));
 geometry.boundingSphere=new THREE.Sphere(new THREE.Vector3(),1e6);
 const material=new THREE.ShaderMaterial({name:'Rain streaks',vertexShader:RAIN_VERTEX,fragmentShader:RAIN_FRAGMENT,
  uniforms:{uTime:{value:0},uRain:WEATHER_UNIFORMS.rain,uSnow:WEATHER_UNIFORMS.snow,uBox:{value:RAIN_BOX.clone()},uColor:{value:new THREE.Color('#b4bcc4')}},
  transparent:true,depthWrite:false,fog:false,toneMapped:false});
 const lines=new THREE.LineSegments(geometry,material);lines.name='rain';lines.frustumCulled=false;lines.renderOrder=50;lines.visible=false;
 lines.raycast=()=>{};lines.castShadow=lines.receiveShadow=false;
 return lines;
}

const color=hex=>new THREE.Color(hex);
const FLASH=new THREE.Color('#e8f0ff');
function materialise(p){
 return {
  sky:{zenith:color(p.sky.zenith),mid:color(p.sky.mid),horizon:color(p.sky.horizon),sunGlow:color(p.sky.sunGlow),cloudLit:color(p.sky.cloudLit),cloudShade:color(p.sky.cloudShade),coverage:p.sky.coverage,sunDisc:p.sky.sunDisc},
  sunOffset:new THREE.Vector3(...p.sunOffset),sunColor:color(p.sunColor),sunIntensity:p.sunIntensity,
  hemiSky:color(p.hemiSky),hemiGround:color(p.hemiGround),hemiIntensity:p.hemiIntensity,
  fog:{color:color(p.fog.color),near:p.fog.near,far:p.fog.far},
  sea:{deep:color(p.sea.deep),shore:color(p.sea.shore),sunColor:color(p.sea.sunColor)},
  grade:{...p.grade,tint:[...p.grade.tint],lift:[...p.grade.lift],hazeColor:[...p.grade.hazeColor]},
  wetness:p.wetness,rain:p.rain,snow:p.snow,
 };
}
// Blend every field of `a` toward `b` in place (colours in linear light, offsets as vectors).
function blend(a,b,k){
 for(const key of Object.keys(a)){
  const x=a[key],y=b[key];
  if(x instanceof THREE.Color)x.lerp(y,k);
  else if(x instanceof THREE.Vector3)x.lerp(y,k);
  else if(Array.isArray(x))for(let i=0;i<x.length;i++)x[i]+=(y[i]-x[i])*k;
  else if(typeof x==='number')a[key]=x+(y-x)*k;
  else if(x&&typeof x==='object')blend(x,y,k);
 }
}

export function createLook({scene,sky,hemi,sun,post,surfaces=[],getSea=()=>null,initial='midday',automatic=false,transition=.7}={}){
 let name=initial,target=materialise(LOOKS[name]);
 let settled=target,lastSkyEvent=0,auto=!!automatic,storm=false,liveLook=initial,liveStorm=false,flash=0,thunderIn=8;
 // A transition has settled when every numeric channel of the blended state is within 1% of its target.
 const settledEnough=(a,b)=>Object.keys(a).every(key=>{const x=a[key],y=b[key];
  if(x instanceof THREE.Color||x instanceof THREE.Vector3){const p=x.toArray(),q=y.toArray();return p.every((v,i)=>Math.abs(v-q[i])<.01);}
  if(Array.isArray(x))return x.every((v,i)=>Math.abs(v-y[i])<.01);
  if(typeof x==='number')return Math.abs(x-y)<.01;
  return x&&typeof x==='object'?settledEnough(x,y):true;});
 const current=materialise(LOOKS[name]);
 const rainLines=createRain();if(scene)scene.add(rainLines);
 const baseColors=new Map(surfaces.map(m=>[m,m.color.clone()]));
 const listeners=new Set();
 function currentLabel(){
  const base=auto&&storm&&name==='rain'?'Thunderstorm':LOOKS[name].label;
  return auto?`${base} (auto)`:base;
 }
 function emit(){for(const fn of listeners)fn(name,currentLabel());}
 function apply(){
  const c=current;
  if(sky){const u=sky.uniforms;u.uZenith.value.copy(c.sky.zenith);u.uMid.value.copy(c.sky.mid);u.uHorizon.value.copy(c.sky.horizon);u.uSunGlow.value.copy(c.sky.sunGlow);u.uCloudLit.value.copy(c.sky.cloudLit);u.uCloudShade.value.copy(c.sky.cloudShade);u.uCoverage.value=c.sky.coverage;u.uSunDisc.value=c.sky.sunDisc;sky.setSun(c.sunOffset);}
  if(sun){sun.color.copy(c.sunColor);sun.intensity=c.sunIntensity;sun.position.copy(sun.target.position).add(c.sunOffset);}
  if(hemi){hemi.color.copy(c.hemiSky);hemi.groundColor.copy(c.hemiGround);hemi.intensity=c.hemiIntensity;}
  if(scene){if(scene.fog){scene.fog.color.copy(c.fog.color);scene.fog.near=c.fog.near;scene.fog.far=c.fog.far;}if(scene.background?.isColor)scene.background.copy(c.fog.color);}
  const sea=getSea();if(sea?.material?.uniforms){const u=sea.material.uniforms;u.uDeep.value.copy(c.sea.deep);u.uShore.value.copy(c.sea.shore);u.uSunColor.value.copy(c.sea.sunColor);}
  if(post){post.setGrade(c.grade);post.setGrade({wetness:c.wetness,wetSky:[c.fog.color.r*.9,c.fog.color.g*.9,c.fog.color.b*.9]});}
  WEATHER_UNIFORMS.wetness.value=c.wetness;WEATHER_UNIFORMS.rain.value=c.rain;WEATHER_UNIFORMS.snow.value=c.snow;
  rainLines.visible=c.rain>.01;
  for(const [m,base] of baseColors){m.roughness=1-c.wetness*.72;m.color.copy(base).multiplyScalar(1-c.wetness*.3);}
 }
 // Thunderstorm is the rain look plus a short sky and hemisphere flash. Clear rain and snow do not flash.
 function stepFlash(dt){
  if(!(storm&&current.rain>.45))flash=storm?Math.max(0,flash-dt*3.2):0;
  else{
   flash=Math.max(0,flash-dt*3.2);thunderIn-=dt;
   if(thunderIn<=0){flash=1;thunderIn=7+Math.random()*10;}
  }
  if(flash<=.02)return;
  const k=Math.min(1,flash);
  if(sky){sky.uniforms.uZenith.value.lerp(FLASH,k);sky.uniforms.uMid.value.lerp(FLASH,k*.85);sky.uniforms.uHorizon.value.lerp(FLASH,k*.45);}
  if(hemi)hemi.intensity+=k*2.4;
  if(scene?.fog?.color)scene.fog.color.lerp(FLASH,k*.35);
  if(scene?.background?.isColor)scene.background.lerp(FLASH,k*.35);
 }
 apply();
 const api={
  get name(){return name;},
  get label(){return currentLabel();},
  get automatic(){return auto;},
  get storm(){return storm;},
  get current(){return current;},
  uniforms:WEATHER_UNIFORMS,
  rain:rainLines,
  set(next,{instant=false,keepAutomatic=false,storm:nextStorm}={}){
   if(!LOOKS[next])throw Error(`Unknown look "${next}"`);
   if(nextStorm!==undefined)storm=!!nextStorm;
   else if(!keepAutomatic)storm=false;
   name=next;target=materialise(LOOKS[next]);
   if(instant){blend(current,target,1);apply();}
   emit();
   return api;
  },
  // Remember the live Prague look. Apply it only while automatic, and not every frame.
  follow(next,{storm:nextStorm=false}={}){
   if(!LOOKS[next])throw Error(`Unknown look "${next}"`);
   liveLook=next;liveStorm=!!nextStorm;
   if(!auto||(name===next&&storm===liveStorm))return api;
   if(name!==next)return api.set(next,{keepAutomatic:true,storm:liveStorm});
   storm=liveStorm;emit();return api;
  },
  // Automatic is the first step, so T can leave the live look and later return to it.
  cycle(){
   if(auto){auto=false;storm=false;return api.set(LOOK_ORDER[0]);}
   const i=LOOK_ORDER.indexOf(name);
   if(i<0||i+1>=LOOK_ORDER.length){
    auto=true;storm=liveStorm;
    if(name!==liveLook)return api.set(liveLook,{keepAutomatic:true,storm:liveStorm});
    emit();return api;
   }
   storm=false;return api.set(LOOK_ORDER[i+1]);
  },
  onChange(fn){listeners.add(fn);return()=>listeners.delete(fn);},
  update(dt,seconds){
   const k=Number.isFinite(dt)&&dt>0?1-Math.exp(-dt/transition):0;
   if(k>0)blend(current,target,k);
   if(Number.isFinite(seconds))rainLines.material.uniforms.uTime.value=seconds%1000;
   apply();
   stepFlash(Number.isFinite(dt)&&dt>0?dt:0);
   // Reflective materials share one sky environment map (environment.js); refresh it while a look transition
   // is running, at most every 0.5 s, and once more when it settles — never every frame.
   if(typeof window!=='undefined'&&target!==settled){const now=Number.isFinite(seconds)?seconds:0;const done=k>0&&settledEnough(current,target);
    if(done||now-lastSkyEvent>.5){lastSkyEvent=now;window.dispatchEvent(new Event('skychange'));if(done)settled=target;}}
  },
  dispose(){rainLines.removeFromParent();rainLines.geometry.dispose();rainLines.material.dispose();},
 };
 return api;
}
