import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {selectCity,pickStart,slug,startUrl,dataUrl,useCity,CITIES,registerCities} from '../src/cities.js';

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
