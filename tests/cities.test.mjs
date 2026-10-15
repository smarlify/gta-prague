import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {selectCity,pickStart,slug,startUrl,dataUrl,useCity,CITIES,registerCities,sceneQuery,applySceneQuery} from '../src/cities.js';
import {createLook} from '../src/weather.js';

const starts=[{name:'Olympia Terminal'},{name:'Töölö (National Opera)'},{name:'Seurasaari bridge'},{name:'Senate Square'}];
test('start names become accent-free URL slugs',()=>{
 assert.equal(slug('Töölö (National Opera)'),'toolo-national-opera');assert.equal(slug('  Senate  Square '),'senate-square');
});
test('?start= finds exact, prefix and partial matches, or nothing',()=>{
 assert.equal(pickStart(starts,'seurasaari-bridge').name,'Seurasaari bridge');
 assert.equal(pickStart(starts,'seurasaari').name,'Seurasaari bridge');
 assert.equal(pickStart(starts,'Töölö').name,'Töölö (National Opera)');
 assert.equal(pickStart(starts,'opera').name,'Töölö (National Opera)');
 assert.equal(pickStart(starts,'tampere'),null);assert.equal(pickStart(starts,''),null);
});
test('?city= defaults to Prague and rejects cities not in the build',()=>{
 assert.throws(()=>selectCity(''),/Default city “prague” is not in this build/);
 const registry=JSON.parse(readFileSync('public/cities/index.json','utf8'));
 registerCities(registry.cities);
 assert.equal(selectCity('').id,'prague');
 assert.equal(selectCity('?city=').id,'prague');
 assert.throws(()=>selectCity('?city=helsinki'),/not in this build yet/);
 assert.throws(()=>selectCity('?city=Helsinki'),/not in this build yet/);
 assert.throws(()=>selectCity('?city=tampere'),/not in this build yet/);
 assert.throws(()=>selectCity('?city=oulu'),/not in this build yet/);
 assert.equal(registry.cities.some(c=>c.id==='tampere'),false);
 assert.equal(CITIES.helsinki,undefined);
});
test('?time= and ?weather= pin a look; unknown or missing values do not',()=>{
 const page='?city=prague&start=petrin&time=white-night&weather=thunderstorm';
 const starts=[{name:'Petřín'},{name:'Újezd'},{name:'Anděl'},{name:'Jelení příkop'}];
 const q=sceneQuery(page);
 assert.equal(q.time,'whitenight');
 assert.equal(q.weather,'thunder');
 assert.equal(pickStart(starts,new URLSearchParams(page).get('start')).name,'Petřín');
 assert.equal(sceneQuery('?time=whitenight').time,'whitenight');
 assert.equal(sceneQuery('?time=white night').time,'whitenight');
 assert.equal(sceneQuery('?time=White night').time,'whitenight');
 assert.equal(sceneQuery('?time=golden').time,'golden');
 assert.equal(sceneQuery('?time=golden-evening').time,'golden');
 assert.equal(sceneQuery('?time=morning').time,'morning');
 assert.equal(sceneQuery('?time=midday').time,'midday');
 assert.equal(sceneQuery('?time=night').time,'night');
 assert.equal(sceneQuery('?weather=thunder').weather,'thunder');
 assert.equal(sceneQuery('?weather=Thunderstorm').weather,'thunder');
 assert.equal(sceneQuery('?weather=clear').weather,'clear');
 assert.equal(sceneQuery('?weather=overcast').weather,'overcast');
 assert.equal(sceneQuery('?weather=rain').weather,'rain');
 assert.equal(sceneQuery('?weather=snow').weather,'snow');
 assert.equal(pickStart(starts,'ujezd').name,'Újezd');
 assert.equal(pickStart(starts,'andel').name,'Anděl');
 assert.equal(pickStart(starts,'jeleni-prikop').name,'Jelení příkop');
 assert.equal(pickStart(starts,'jeleni prikop').name,'Jelení příkop');
 assert.equal(sceneQuery('?weather=hail').weather,null);
 assert.equal(sceneQuery('?time=noon').time,null);
 assert.deepEqual(sceneQuery(''),{time:null,weather:null});
 assert.deepEqual(sceneQuery('?city=prague&start=petrin'),{time:null,weather:null});
 assert.equal(startUrl(new URL('https://gtapraha.online/?city=prague&start=petrin&time=white-night&weather=thunderstorm'),{id:'prague'},starts[0]),'/?city=prague&start=petrin&time=white-night&weather=thunderstorm');

 const pinned=createLook({automatic:true,initial:q.time,weather:q.weather});
 applySceneQuery(pinned,q);
 assert.equal(pinned.name,'whitenight');
 assert.equal(pinned.weather,'thunder');
 assert.equal(pinned.automatic,false);
 assert.equal(pinned.weatherAutomatic,false);
 pinned.followDay('midday');pinned.followWeather('snow');
 assert.equal(pinned.name,'whitenight','a pinned hour ignores the live clock');
 assert.equal(pinned.weather,'thunder','a pinned weather ignores the forecast');
 pinned.dispose();

 const hourOnly=createLook({automatic:true,initial:'whitenight',weather:'clear'});
 applySceneQuery(hourOnly,sceneQuery('?time=white-night'));
 assert.equal(hourOnly.automatic,false);
 assert.equal(hourOnly.weatherAutomatic,true,'a missing weather param leaves the forecast automatic');
 hourOnly.followWeather('rain');
 assert.equal(hourOnly.weather,'rain');
 hourOnly.followDay('midday');
 assert.equal(hourOnly.name,'whitenight');
 hourOnly.dispose();

 const skyOnly=createLook({automatic:true,initial:'morning',weather:'thunder'});
 applySceneQuery(skyOnly,sceneQuery('?weather=thunderstorm'));
 assert.equal(skyOnly.automatic,true,'a missing time param leaves the clock automatic');
 assert.equal(skyOnly.weatherAutomatic,false);
 skyOnly.followDay('night');
 assert.equal(skyOnly.name,'night');
 skyOnly.followWeather('clear');
 assert.equal(skyOnly.weather,'thunder');
 skyOnly.dispose();

 const live=createLook({automatic:true,initial:'night',weather:'rain'});
 applySceneQuery(live,sceneQuery('?weather=hail&time=noon'));
 assert.equal(live.automatic,true);
 assert.equal(live.weatherAutomatic,true);
 assert.equal(live.name,'night');
 assert.equal(live.weather,'rain');
 live.dispose();
});
test('the address bar keeps city and start shareable; data stays under the city root',()=>{
 const helsinkiFixture={id:'helsinki',name:'Helsinki',dataRoot:'/data'};
 assert.equal(startUrl(new URL('http://x/?foo=1'),helsinkiFixture,starts[2]),'/?foo=1&city=helsinki&start=seurasaari-bridge');
 useCity(helsinkiFixture);assert.equal(dataUrl('city.pack'),'/data/city.pack');
 useCity({id:'prague',dataRoot:'/cities/prague'});
});
test('every shipped city includes a JSON extension catalog even when it has no regions',()=>{
 const registry=JSON.parse(readFileSync('public/cities/index.json','utf8'));
 for(const city of registry.cities){
  const file=path.join('public',city.dataRoot,'extensions/index.json');
  const catalog=JSON.parse(readFileSync(file,'utf8'));
  assert.ok(Array.isArray(catalog.extensions),`${city.id} needs an extension catalog; missing files can return the host's HTML fallback`);
 }
});
