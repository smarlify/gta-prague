import test from 'node:test';
import assert from 'node:assert/strict';
import {clockLook,pragueHour,weatherKind,lookFromForecast,FORECAST_URL,FORECAST_EVERY_MS,PRAGUE_TZ} from '../src/live-weather.js';
import {createLook} from '../src/weather.js';

test('clock looks split the Prague day into morning, midday, evening and night',()=>{
 assert.equal(clockLook(5),'morning');
 assert.equal(clockLook(9.49),'morning');
 assert.equal(clockLook(9.5),'midday');
 assert.equal(clockLook(12),'midday');
 assert.equal(clockLook(15.99),'midday');
 assert.equal(clockLook(16),'golden');
 assert.equal(clockLook(18),'golden');
 assert.equal(clockLook(20.99),'golden');
 assert.equal(clockLook(21),'night');
 assert.equal(clockLook(0),'night');
 assert.equal(clockLook(4.99),'night');
 for(let h=0;h<24;h+=.5)assert.notEqual(clockLook(h),'whitenight');
});

test('Europe/Prague hours come from Intl and need no request',()=>{
 const morning=pragueHour(new Date('2026-01-15T07:00:00Z'));
 assert.ok(Math.abs(morning-8)<.02);assert.equal(clockLook(morning),'morning');
 const midday=pragueHour(new Date('2026-07-15T10:00:00Z'));
 assert.ok(Math.abs(midday-12)<.02);assert.equal(clockLook(midday),'midday');
 assert.equal(clockLook(pragueHour(new Date('2026-01-15T16:30:00Z'))),'golden');
 assert.equal(clockLook(pragueHour(new Date('2026-01-15T22:00:00Z'))),'night');
 assert.equal(PRAGUE_TZ,'Europe/Prague');
});

test('drizzle and rain, thunder, and snow codes pick the precipitation look',()=>{
 for(const code of [51,53,55,56,57,61,63,65,66,67,80,81,82]){
  const state=lookFromForecast(12,code);
  assert.equal(state.look,'rain',String(code));assert.equal(state.storm,false);assert.equal(state.label,'Rain (auto)');
 }
 for(const code of [95,96,99]){
  const state=lookFromForecast(3,code);
  assert.equal(state.look,'rain');assert.equal(state.storm,true);assert.equal(weatherKind(code),'thunder');
  assert.equal(state.label,'Thunderstorm (auto)');
 }
 for(const code of [71,73,75,77,85,86]){
  const state=lookFromForecast(15,code);
  assert.equal(state.look,'snow',String(code));assert.equal(state.storm,false);assert.equal(state.label,'Snow (auto)');
 }
 assert.equal(lookFromForecast(8,0).look,'morning');
 assert.equal(lookFromForecast(8,3).label,'Morning (auto)');
});

test('a failed forecast leaves a clear clock look',()=>{
 for(const [hour,look] of [[8,'morning'],[12,'midday'],[18,'golden'],[23,'night']]){
  const state=lookFromForecast(hour,95,{failed:true});
  assert.equal(state.look,look);assert.equal(state.storm,false);assert.match(state.label,/\(auto\)$/);
 }
 const missing=lookFromForecast(12,undefined);
 assert.equal(missing.look,'midday');assert.equal(missing.storm,false);assert.equal(missing.label,'Midday (auto)');
});

test('automatic labels end in (auto) and manual labels do not',()=>{
 for(const hour of [8,12,18,23])assert.match(lookFromForecast(hour,1).label,/\(auto\)$/);
 assert.match(lookFromForecast(12,61).label,/\(auto\)$/);
 assert.match(lookFromForecast(12,95).label,/\(auto\)$/);
 assert.match(lookFromForecast(12,71).label,/\(auto\)$/);
 const live=createLook({automatic:true,initial:'midday'});
 assert.match(live.label,/\(auto\)$/);
 assert.equal(live.cycle().name,'morning');assert.equal(live.automatic,false);assert.equal(live.label,'Morning');
 let guard=0;while(!live.automatic&&guard++<20)live.cycle();
 assert.equal(live.automatic,true);assert.match(live.label,/\(auto\)$/);
 live.dispose();
});

test('the forecast is one keyless Open-Meteo call at the city origin, repeated every 30 minutes',()=>{
 assert.equal(FORECAST_EVERY_MS,30*60*1000);
 assert.match(FORECAST_URL,/latitude=50\.09/);
 assert.match(FORECAST_URL,/longitude=14\.42/);
 assert.match(FORECAST_URL,/current=weather_code/);
 assert.doesNotMatch(FORECAST_URL,/apikey|api_key|key=/i);
});
