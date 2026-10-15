import * as THREE from 'three';
import {SUN_OFFSET,SKY_PALETTE,LIGHTING,FOG_COLOR} from './sky.js';
import {GRADE_DEFAULTS} from './post.js';

// Daytime and weather compose. A daytime preset owns the sun, the sky and the clear grade.
// Weather only adds wetness, rain streaks or snow flakes, the snow tint, tighter fog and lightning.
// It does not move the sun: a rainy morning stays a morning sky with rain on top.
// Switching either one blends every value over a couple of seconds.
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
// Manual cycle only. Automatic night begins once the Prague sun is down.
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
export const LOOKS=Object.freeze({morning,midday,golden,night,whitenight});
// Automatic is a mode in front of this list, not a sky preset. White night stays manual.
export const LOOK_ORDER=Object.freeze(['morning','midday','golden','night','whitenight']);
// Weather sits on the daytime sun. Fog distances only pull inward; clear has no fog of its own.
// Thunderstorm is rain plus the flash in createLook, not a second sky.
export const WEATHERS=Object.freeze({
 clear:{label:'Clear',wetness:0,rain:0,snow:0},
 overcast:{label:'Overcast',wetness:0,rain:0,snow:0,fog:{near:230,far:760}},
 rain:{label:'Rain',wetness:1,rain:1,snow:0,fog:{near:110,far:560}},
 thunder:{label:'Thunderstorm',wetness:1,rain:1,snow:0,fog:{near:110,far:560}},
 snow:{label:'Snow',wetness:0,rain:1,snow:1,fog:{near:200,far:720}},
});
export const WEATHER_ORDER=Object.freeze(['clear','overcast','rain','thunder','snow']);

// How far roads and the ground move toward white. Grass and leaves keep a fuller mix.
// A dusting only: no cover, tracks or piles.
export const SNOW_DUST=.32;
// Grass and leaf materials mix toward white from WEATHER_UNIFORMS.snow. Bark is a separate
// material, or a foliage attribute of 0 on the shared species mesh.
export function attachSnow(material,{leaves=false,amount=1}={}){
 const previous=material.onBeforeCompile,previousKey=material.customProgramCacheKey;
 const cover=leaves?'vLeaf':String(amount);
 material.onBeforeCompile=function(shader){
  previous?.call(this,shader);
  shader.uniforms.uSnow=WEATHER_UNIFORMS.snow;
  const mix=`diffuseColor.rgb=mix(diffuseColor.rgb,vec3(0.94),clamp(uSnow,0.0,1.0)*${cover});`;
  if(leaves)shader.vertexShader='attribute float aFoliage;\nvarying float vLeaf;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvLeaf=aFoliage;');
  const lead=leaves?'uniform float uSnow;\nvarying float vLeaf;\n':'uniform float uSnow;\n';
  shader.fragmentShader=lead+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>\n${mix}`);
 };
 material.customProgramCacheKey=function(){return `${previousKey?.call(this)??''}|snow${leaves?'-leaf':amount===1?'':'-dust'}`;};
}

// Rain: one draw call of short line segments falling through a box that wraps around the camera.
// Snow is a second draw of soft round flakes in that same box. Only one of the two is visible.
const RAIN_COUNT=2600,SNOW_COUNT=1600,RAIN_BOX=new THREE.Vector3(44,26,44);
const rndStream=start=>{let s=start;return ()=>((s=(s*1664525+1013904223)>>>0)/4294967296);};
const RAIN_VERTEX=/* glsl */`
attribute vec3 aSeed;
uniform float uTime;
uniform vec3 uBox;
varying float vAlpha;
void main(){
 vec3 origin=cameraPosition-uBox*.5;
 vec3 p=aSeed*uBox;
 float fall=8.5+4.5*aSeed.x;
 p.y-=uTime*fall;p.x+=uTime*1.1;
 p=origin+mod(p-origin,uBox);
 float len=.45+.5*aSeed.y;
 vec3 q=p+vec3(-.1*len,len,0.0)*position.x; // tail above the drop head
 float d=distance(p,cameraPosition);
 vAlpha=smoothstep(.6,2.5,d)*(1.0-smoothstep(uBox.x*.3,uBox.x*.5,d))*mix(.14,.38,aSeed.z);
 gl_Position=projectionMatrix*viewMatrix*vec4(q,1.0);
}`;
const RAIN_FRAGMENT=/* glsl */`
uniform float uRain;
uniform vec3 uColor;
varying float vAlpha;
void main(){gl_FragColor=vec4(uColor,vAlpha*uRain);}`;
const SNOW_VERTEX=/* glsl */`
attribute vec3 aSeed;
uniform float uTime;
uniform vec3 uBox;
varying float vAlpha;
void main(){
 vec3 origin=cameraPosition-uBox*.5;
 vec3 p=aSeed*uBox;
 float fall=.55+.75*aSeed.y;
 p.y-=uTime*fall;
 p.x+=sin(uTime*(.4+aSeed.z)+aSeed.x*6.28318)*(.4+.6*aSeed.z);
 p.z+=cos(uTime*.33+aSeed.y*6.28318)*.3;
 p=origin+mod(p-origin,uBox);
 vec4 mv=viewMatrix*vec4(p,1.0);
 gl_Position=projectionMatrix*mv;
 float depth=max(.8,-mv.z);
 gl_PointSize=mix(5.0,14.0,aSeed.x)*(10.0/depth);
 float d=distance(p,cameraPosition);
 vAlpha=smoothstep(.8,2.4,d)*(1.0-smoothstep(uBox.x*.32,uBox.x*.5,d))*mix(.35,.85,aSeed.y);
}`;
const SNOW_FRAGMENT=/* glsl */`
uniform float uSnow;
varying float vAlpha;
void main(){
 vec2 q=gl_PointCoord-vec2(.5);
 float r=dot(q,q);
 if(r>.25)discard;
 float soft=smoothstep(.25,.02,r);
 gl_FragColor=vec4(vec3(.97,.98,1.0),soft*vAlpha*uSnow);
}`;
function precipitation(name,count,vertexShader,fragmentShader,uniforms,kind){
 const geometry=new THREE.BufferGeometry(),rnd=rndStream(name==='snow'?67891:12345);
 const position=new Float32Array(count*(kind==='lines'?2:1)*3),seed=new Float32Array(position.length);
 for(let i=0;i<count;i++){const a=rnd(),b=rnd(),c=rnd(),n=kind==='lines'?2:1;
  for(let k=0;k<n;k++){const j=(i*n+k)*3;position[j]=kind==='lines'?k:0;seed[j]=a;seed[j+1]=b;seed[j+2]=c;}}
 geometry.setAttribute('position',new THREE.BufferAttribute(position,3));
 geometry.setAttribute('aSeed',new THREE.BufferAttribute(seed,3));
 geometry.boundingSphere=new THREE.Sphere(new THREE.Vector3(),1e6);
 const material=new THREE.ShaderMaterial({name,vertexShader,fragmentShader,uniforms,transparent:true,depthWrite:false,fog:false,toneMapped:false});
 const mesh=kind==='lines'?new THREE.LineSegments(geometry,material):new THREE.Points(geometry,material);
 mesh.name=name==='Snow flakes'?'snow':'rain';mesh.frustumCulled=false;mesh.renderOrder=50;mesh.visible=false;
 mesh.raycast=()=>{};mesh.castShadow=mesh.receiveShadow=false;return mesh;
}
export function createRain(){
 return precipitation('Rain streaks',RAIN_COUNT,RAIN_VERTEX,RAIN_FRAGMENT,{uTime:{value:0},uRain:WEATHER_UNIFORMS.rain,uBox:{value:RAIN_BOX.clone()},uColor:{value:new THREE.Color('#b4bcc4')}},'lines');
}
export function createSnow(){
 return precipitation('Snow flakes',SNOW_COUNT,SNOW_VERTEX,SNOW_FRAGMENT,{uTime:{value:0},uSnow:WEATHER_UNIFORMS.snow,uBox:{value:RAIN_BOX.clone()}},'points');
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

function compose(dayName,weatherName){
 const state=materialise(LOOKS[dayName]),fx=WEATHERS[weatherName];
 state.wetness=fx.wetness;state.rain=fx.rain;state.snow=fx.snow;
 if(fx.fog){state.fog.near=Math.min(state.fog.near,fx.fog.near);state.fog.far=Math.min(state.fog.far,fx.fog.far);}
 return state;
}
function stepList(order,name,isAuto,leaveAuto,applyNext,restore){
 if(isAuto()){leaveAuto();return applyNext(order[0]);}
 const i=order.indexOf(name());
 if(i<0||i+1>=order.length)return restore();
 return applyNext(order[i+1]);
}

export function createLook({scene,sky,hemi,sun,post,surfaces=[],getSea=()=>null,initial='midday',weather:initialWeather='clear',automatic=false,transition=.7}={}){
 if(!LOOKS[initial])throw Error(`Unknown daytime "${initial}"`);
 if(!WEATHERS[initialWeather])throw Error(`Unknown weather "${initialWeather}"`);
 let day=initial,wx=initialWeather,target=compose(day,wx);
 let settled=target,lastSkyEvent=0,dayAuto=!!automatic,wxAuto=!!automatic,liveDay=day,liveWx=wx,flash=0,thunderIn=8,thunderCues=0;
 // A transition has settled when every numeric channel of the blended state is within 1% of its target.
 const settledEnough=(a,b)=>Object.keys(a).every(key=>{const x=a[key],y=b[key];
  if(x instanceof THREE.Color||x instanceof THREE.Vector3){const p=x.toArray(),q=y.toArray();return p.every((v,i)=>Math.abs(v-q[i])<.01);}
  if(Array.isArray(x))return x.every((v,i)=>Math.abs(v-y[i])<.01);
  if(typeof x==='number')return Math.abs(x-y)<.01;
  return x&&typeof x==='object'?settledEnough(x,y):true;});
 const current=compose(day,wx);
 const rainLines=createRain(),snowFlakes=createSnow();if(scene)scene.add(rainLines,snowFlakes);
 const baseColors=new Map(surfaces.map(m=>[m,m.color.clone()]));
 const listeners=new Set();
 function daytimeLabel(){const base=LOOKS[day].label;return dayAuto?`${base} (auto)`:base;}
 function conditionsLabel(){const base=WEATHERS[wx].label;return wxAuto?`${base} (auto)`:base;}
 function emit(){for(const fn of listeners)fn(day,daytimeLabel(),wx,conditionsLabel());}
 function retarget(instant){target=compose(day,wx);if(instant){blend(current,target,1);apply();}}
 function apply(){
  const c=current;
  if(sky){const u=sky.uniforms;u.uZenith.value.copy(c.sky.zenith);u.uMid.value.copy(c.sky.mid);u.uHorizon.value.copy(c.sky.horizon);u.uSunGlow.value.copy(c.sky.sunGlow);u.uCloudLit.value.copy(c.sky.cloudLit);u.uCloudShade.value.copy(c.sky.cloudShade);u.uCoverage.value=c.sky.coverage;u.uSunDisc.value=c.sky.sunDisc;sky.setSun(c.sunOffset);}
  if(sun){sun.color.copy(c.sunColor);sun.intensity=c.sunIntensity;sun.position.copy(sun.target.position).add(c.sunOffset);}
  if(hemi){hemi.color.copy(c.hemiSky);hemi.groundColor.copy(c.hemiGround);hemi.intensity=c.hemiIntensity;}
  if(scene){if(scene.fog){scene.fog.color.copy(c.fog.color);scene.fog.near=c.fog.near;scene.fog.far=c.fog.far;}if(scene.background?.isColor)scene.background.copy(c.fog.color);}
  const sea=getSea();if(sea?.material?.uniforms){const u=sea.material.uniforms;u.uDeep.value.copy(c.sea.deep);u.uShore.value.copy(c.sea.shore);u.uSunColor.value.copy(c.sea.sunColor);}
  if(post){post.setGrade(c.grade);post.setGrade({wetness:c.wetness,wetSky:[c.fog.color.r*.9,c.fog.color.g*.9,c.fog.color.b*.9]});}
  WEATHER_UNIFORMS.wetness.value=c.wetness;WEATHER_UNIFORMS.rain.value=c.rain;WEATHER_UNIFORMS.snow.value=c.snow;
  const snowing=c.snow>.02&&c.snow>=c.rain*.5;
  rainLines.visible=c.rain>.01&&!snowing;snowFlakes.visible=snowing;
  for(const [m,base] of baseColors){m.roughness=1-c.wetness*.72;m.color.copy(base).multiplyScalar(1-c.wetness*.3);}
 }
 // Lightning is a short flash on the thunderstorm weather only. The daytime sun stays put between flashes.
 // Each strike queues one thunder cue. Ordinary rain and snow never do.
 function stepFlash(dt){
  const storm=wx==='thunder';
  if(!(storm&&current.rain>.45))flash=storm?Math.max(0,flash-dt*3.2):0;
  else{
   flash=Math.max(0,flash-dt*3.2);thunderIn-=dt;
   if(thunderIn<=0){flash=1;thunderIn=7+Math.random()*10;thunderCues++;}
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
  get name(){return day;},
  get label(){return daytimeLabel();},
  get weather(){return wx;},
  get weatherLabel(){return conditionsLabel();},
  get automatic(){return dayAuto;},
  get weatherAutomatic(){return wxAuto;},
  get storm(){return wx==='thunder';},
  consumeThunder(){const n=thunderCues;thunderCues=0;return n;},
  get current(){return current;},
  uniforms:WEATHER_UNIFORMS,
  rain:rainLines,
  snow:snowFlakes,
  set(next,{instant=false,keepAutomatic=false}={}){
   if(!LOOKS[next])throw Error(`Unknown daytime "${next}"`);
   if(!keepAutomatic)dayAuto=false;
   day=next;retarget(instant);emit();return api;
  },
  setWeather(next,{instant=false,keepAutomatic=false}={}){
   if(!WEATHERS[next])throw Error(`Unknown weather "${next}"`);
   if(!keepAutomatic)wxAuto=false;
   wx=next;retarget(instant);emit();return api;
  },
  // Remember the live Prague clock. Apply it only while daytime is automatic, and not every frame.
  followDay(next){
   if(!LOOKS[next])throw Error(`Unknown daytime "${next}"`);
   liveDay=next;
   if(!dayAuto||day===next)return api;
   return api.set(next,{keepAutomatic:true});
  },
  followWeather(next){
   if(!WEATHERS[next])throw Error(`Unknown weather "${next}"`);
   liveWx=next;
   if(!wxAuto||wx===next)return api;
   return api.setWeather(next,{keepAutomatic:true});
  },
  // Automatic is the first step, so T can leave the live clock and later return to it.
  cycle(){
   return stepList(LOOK_ORDER,()=>day,()=>dayAuto,()=>{dayAuto=false;},next=>api.set(next),()=>{
    dayAuto=true;
    if(day!==liveDay)return api.set(liveDay,{keepAutomatic:true});
    emit();return api;
   });
  },
  // Y cycles weather the same way. It does not change the hour.
  cycleWeather(){
   return stepList(WEATHER_ORDER,()=>wx,()=>wxAuto,()=>{wxAuto=false;},next=>api.setWeather(next),()=>{
    wxAuto=true;
    if(wx!==liveWx)return api.setWeather(liveWx,{keepAutomatic:true});
    emit();return api;
   });
  },
  onChange(fn){listeners.add(fn);return()=>listeners.delete(fn);},
  update(dt,seconds){
   const k=Number.isFinite(dt)&&dt>0?1-Math.exp(-dt/transition):0;
   if(k>0)blend(current,target,k);
   if(Number.isFinite(seconds)){const t=seconds%1000;rainLines.material.uniforms.uTime.value=t;snowFlakes.material.uniforms.uTime.value=t;}
   apply();
   stepFlash(Number.isFinite(dt)&&dt>0?dt:0);
   // Reflective materials share one sky environment map (environment.js); refresh it while a look transition
   // is running, at most every 0.5 s, and once more when it settles — never every frame.
   if(typeof window!=='undefined'&&target!==settled){const now=Number.isFinite(seconds)?seconds:0;const done=k>0&&settledEnough(current,target);
    if(done||now-lastSkyEvent>.5){lastSkyEvent=now;window.dispatchEvent(new Event('skychange'));if(done)settled=target;}}
  },
  dispose(){for(const mesh of [rainLines,snowFlakes]){mesh.removeFromParent();mesh.geometry.dispose();mesh.material.dispose();}},
 };
 return api;
}
