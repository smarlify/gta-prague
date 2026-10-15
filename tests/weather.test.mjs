import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {LOOKS,LOOK_ORDER,WEATHERS,WEATHER_ORDER,WEATHER_UNIFORMS,createLook,createRain} from '../src/weather.js';
import {createSky,SUN_OFFSET} from '../src/sky.js';
import {GRADE_DEFAULTS} from '../src/post.js';

const hex=/^#[0-9a-f]{6}$/i;

test('every look is complete, with valid colours and a sun above the horizon',()=>{
 assert.deepEqual(LOOK_ORDER,['morning','midday','golden','night','whitenight']);
 assert.deepEqual(WEATHER_ORDER,['clear','overcast','rain','thunder','snow']);
 for(const name of LOOK_ORDER){
  const l=LOOKS[name];assert.ok(l,name);assert.ok(l.label);
  for(const k of ['zenith','mid','horizon','sunGlow','cloudLit','cloudShade'])assert.match(l.sky[k],hex,`${name}.sky.${k}`);
  for(const k of ['sunColor','hemiSky','hemiGround'])assert.match(l[k],hex,`${name}.${k}`);
  for(const k of ['deep','shore','sunColor'])assert.match(l.sea[k],hex,`${name}.sea.${k}`);
  assert.equal(l.fog.color,l.sky.horizon,`${name}: fog colour must equal the horizon so distant buildings melt into the dome`);
  assert.ok(l.fog.near>0&&l.fog.far>l.fog.near&&l.fog.far<=1000,`${name}: fog inside the sky radius`);
  assert.ok(l.sunOffset[1]>0,`${name}: sun above the horizon`);
  assert.ok(l.sunIntensity>=0&&l.sunIntensity<=3&&l.hemiIntensity>0&&l.hemiIntensity<=2);
  assert.ok(l.sky.coverage>=0&&l.sky.coverage<=1&&l.sky.sunDisc>=0&&l.sky.sunDisc<=1);
  assert.equal(l.wetness,0,name);assert.equal(l.rain,0,name);assert.equal(l.snow,0,name);
  for(const k of Object.keys(GRADE_DEFAULTS))assert.ok(k in l.grade,`${name}.grade.${k}`);
  assert.ok(l.grade.exposure>.5&&l.grade.exposure<1.5);
 }
 assert.deepEqual(LOOKS.midday.sunOffset,[...SUN_OFFSET],'midday keeps the shadow light direction');
 assert.ok(LOOKS.golden.sunOffset[1]/Math.hypot(...LOOKS.golden.sunOffset)<Math.sin(25*Math.PI/180),'golden evening sun is low');
 assert.ok(LOOKS.morning.sunOffset[0]>0,'morning sun is in the east');
 assert.ok(LOOKS.morning.sunOffset[1]/Math.hypot(...LOOKS.morning.sunOffset)<Math.sin(28*Math.PI/180),'morning sun is low');
 assert.equal(LOOKS.night.fog.near,WEATHERS.rain.fog.near);assert.equal(LOOKS.night.fog.far,WEATHERS.rain.fog.far);
 assert.equal(WEATHERS.rain.wetness,1);assert.equal(WEATHERS.rain.rain,1);assert.equal(WEATHERS.rain.snow,0);
 assert.equal(WEATHERS.snow.wetness,0);assert.equal(WEATHERS.snow.rain,1);assert.equal(WEATHERS.snow.snow,1);
 assert.equal(WEATHERS.thunder.wetness,1);assert.equal(WEATHERS.thunder.rain,1);assert.equal(WEATHERS.thunder.label,'Thunderstorm');
 assert.equal(WEATHERS.clear.wetness,0);assert.equal(WEATHERS.clear.rain,0);assert.equal(WEATHERS.overcast.fog.near,230);
 assert.equal(LOOKS.whitenight.label,'White night');
});

test('look blends toward the target and drives sky, lights, fog and weather uniforms',()=>{
 const scene=new THREE.Scene();scene.fog=new THREE.Fog('#b9cbd4',330,850);scene.background=new THREE.Color('#b9cbd4');
 const sky=createSky({scene});const hemi=new THREE.HemisphereLight(),sun=new THREE.DirectionalLight();sun.target.position.set(10,0,20);
 const grades=[];const post={setGrade:g=>grades.push(g)};
 const surface=new THREE.MeshStandardMaterial({roughness:1});
 const look=createLook({scene,sky,hemi,sun,post,surfaces:[surface]});
 assert.equal(look.name,'midday');assert.equal(look.weather,'clear');assert.ok(scene.children.includes(look.rain));assert.equal(look.rain.visible,false);
 assert.ok(sun.position.clone().sub(sun.target.position).distanceTo(new THREE.Vector3(...SUN_OFFSET))<1e-6);
 look.set('morning',{instant:true});
 look.setWeather('rain');
 for(let i=0;i<800;i++)look.update(1/60,i/60);
 assert.equal(look.name,'morning');assert.equal(look.weather,'rain');
 assert.ok(Math.abs(WEATHER_UNIFORMS.wetness.value-1)<.01&&Math.abs(WEATHER_UNIFORMS.rain.value-1)<.01&&WEATHER_UNIFORMS.snow.value<.01);
 assert.ok(look.rain.visible);assert.ok(surface.roughness<.4,'wet road is glossier');
 assert.equal(scene.fog.color.getHexString(),new THREE.Color(LOOKS.morning.fog.color).getHexString(),'rain keeps the morning horizon');
 assert.ok(Math.abs(scene.fog.near-WEATHERS.rain.fog.near)<1&&Math.abs(scene.fog.far-WEATHERS.rain.fog.far)<1,'rain tightens fog');
 assert.ok(Math.abs(sun.intensity-LOOKS.morning.sunIntensity)<.01&&Math.abs(hemi.intensity-LOOKS.morning.hemiIntensity)<.01,'rain keeps the morning sun');
 assert.ok(sun.position.clone().sub(sun.target.position).distanceTo(new THREE.Vector3(...LOOKS.morning.sunOffset))<1e-3);
 assert.ok(Math.abs(sky.uniforms.uSunDisc.value-LOOKS.morning.sky.sunDisc)<.01);
 assert.equal(sky.uniforms.uZenith.value.getHexString(),new THREE.Color(LOOKS.morning.sky.zenith).getHexString());
 assert.ok(grades.at(-1).wetness>.99);
 assert.ok(Math.abs(grades.at(-2).exposure-LOOKS.morning.grade.exposure)<.01,'rain keeps the morning grade');
 look.set('golden',{instant:true});
 const dir=sun.position.clone().sub(sun.target.position).normalize();
 assert.ok(dir.distanceTo(new THREE.Vector3(...LOOKS.golden.sunOffset).normalize())<1e-6,'light follows the preset sun');
 assert.ok(sky.uniforms.uSunDir.value.distanceTo(dir)<1e-6,'sky dome sun follows the light');
 assert.equal(look.weather,'rain','changing the hour leaves the weather');
 assert.equal(look.cycle().name,'night');
 let changed=null;look.onChange((n,label)=>{changed=[n,label];});look.cycle();assert.deepEqual(changed,['whitenight','White night']);
 look.setWeather('snow',{instant:true});
 assert.equal(look.name,'whitenight');assert.equal(look.label,'White night');assert.equal(look.weatherLabel,'Snow');
 assert.equal(WEATHER_UNIFORMS.snow.value,1);assert.equal(WEATHER_UNIFORMS.wetness.value,0);
 assert.ok(look.rain.visible);assert.equal(look.rain.material.uniforms.uSnow,WEATHER_UNIFORMS.snow);
 assert.ok(surface.roughness>.9,'snow does not gloss the road');
 assert.ok(sun.position.clone().sub(sun.target.position).distanceTo(new THREE.Vector3(...LOOKS.whitenight.sunOffset))<1e-3,'snow keeps the daytime sun');
 look.dispose();assert.ok(!scene.children.includes(look.rain));
});

test('snow at night keeps the night sun and adds the snow tint',()=>{
 const scene=new THREE.Scene();scene.fog=new THREE.Fog('#b9cbd4',330,850);scene.background=new THREE.Color('#b9cbd4');
 const sky=createSky({scene});const hemi=new THREE.HemisphereLight(),sun=new THREE.DirectionalLight();sun.target.position.set(10,0,20);
 const look=createLook({scene,sky,hemi,sun,post:{setGrade(){}},surfaces:[]});
 look.set('night',{instant:true});look.setWeather('snow',{instant:true});
 assert.equal(look.name,'night');assert.equal(look.weather,'snow');
 assert.ok(sun.position.clone().sub(sun.target.position).distanceTo(new THREE.Vector3(...LOOKS.night.sunOffset))<1e-3);
 assert.ok(Math.abs(sun.intensity-LOOKS.night.sunIntensity)<.01);
 assert.equal(sky.uniforms.uZenith.value.getHexString(),new THREE.Color(LOOKS.night.sky.zenith).getHexString());
 assert.equal(scene.fog.color.getHexString(),new THREE.Color(LOOKS.night.fog.color).getHexString());
 assert.equal(WEATHER_UNIFORMS.snow.value,1);assert.equal(WEATHER_UNIFORMS.wetness.value,0);assert.equal(WEATHER_UNIFORMS.rain.value,1);
 look.setWeather('overcast',{instant:true});
 assert.ok(Math.abs(sky.uniforms.uSunDisc.value-LOOKS.night.sky.sunDisc)<.01,'overcast does not hide the night sun');
 assert.ok(Math.abs(scene.fog.near-LOOKS.night.fog.near)<1,'night fog is already as tight as overcast');
 look.dispose();
});

test('cycling daytime leaves the weather code and cycling weather leaves the hour',()=>{
 const look=createLook({automatic:true,initial:'midday',weather:'rain'});
 assert.match(look.label,/\(auto\)$/);assert.match(look.weatherLabel,/\(auto\)$/);
 assert.equal(look.cycle().weather,'rain');
 assert.equal(look.name,'morning');assert.equal(look.automatic,false);assert.equal(look.weatherAutomatic,true);
 assert.equal(look.cycleWeather().name,'morning');
 assert.equal(look.weather,'clear');assert.equal(look.weatherAutomatic,false);assert.equal(look.weatherLabel,'Clear');
 const hour=look.name;
 look.cycleWeather();assert.equal(look.name,hour);assert.equal(look.weather,'overcast');
 look.followDay('night');assert.equal(look.name,'morning','a manual hour ignores the live clock');
 look.followWeather('snow');assert.equal(look.weather,'overcast','a manual weather ignores the forecast');
 look.dispose();
 const back=createLook({automatic:true,initial:'night',weather:'snow'});
 assert.equal(back.cycleWeather().name,'night');
 assert.equal(back.weather,'clear');assert.equal(back.automatic,true);
 back.dispose();
});

test('rain is a single transparent line batch that never writes depth',()=>{
 const rain=createRain();
 assert.ok(rain.isLineSegments);assert.equal(rain.material.transparent,true);assert.equal(rain.material.depthWrite,false);
 assert.equal(rain.frustumCulled,false);assert.ok(rain.geometry.attributes.position.count>=2000);
 assert.equal(rain.material.uniforms.uRain,WEATHER_UNIFORMS.rain,'opacity follows the shared weather uniform');
});

test('a look transition fires skychange while blending and once more when it settles, then stays quiet',()=>{
 // environment.js rebuilds the shared reflection map on this event; it must not fire every frame.
 const events=[];globalThis.window={dispatchEvent:e=>events.push(e.type)};
 try{
  const scene=new THREE.Scene();scene.fog=new THREE.Fog('#b9cbd4',330,850);scene.background=new THREE.Color('#b9cbd4');
  const sky=createSky({scene});const hemi=new THREE.HemisphereLight(),sun=new THREE.DirectionalLight();
  const look=createLook({scene,sky,hemi,sun,post:{setGrade(){}},surfaces:[]});
  let t=0;for(let i=0;i<120;i++){t+=1/60;look.update(1/60,t);}
  assert.equal(events.length,0,'no events while idle');
  look.set('golden');for(let i=0;i<600;i++){t+=1/60;look.update(1/60,t);}
  const during=events.length;assert.ok(during>=2&&during<=25,`throttled during the transition, got ${during}`);
  for(let i=0;i<600;i++){t+=1/60;look.update(1/60,t);}
  assert.equal(events.length,during,'quiet again once settled');
 }finally{delete globalThis.window;}
});
