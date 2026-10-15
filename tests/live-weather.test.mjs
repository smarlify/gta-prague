import test from 'node:test';
import assert from 'node:assert/strict';
import {clockLook,pragueHour,weatherKind,lookFromForecast,startPragueForecast,isPragueWinter,FORECAST_URL,FORECAST_EVERY_MS,PRAGUE_TZ} from '../src/live-weather.js';
import {createLook} from '../src/weather.js';

const autumn=new Date('2026-10-15T10:00:00Z');
const june=new Date('2026-06-15T10:00:00Z');
const january=new Date('2026-01-15T11:00:00Z');

function daylight(date){
 let first=null,last=null;
 for(let h=0;h<24;h+=.25){
  if(clockLook(h,date)==='night')continue;
  first??=h;last=h;
 }
 return {first,last,length:last-first};
}

test('daytime follows the Prague sun, so October 20:00 is night and June 20:00 is not',()=>{
 assert.equal(clockLook(20,autumn),'night');
 assert.equal(clockLook(20.99,autumn),'night');
 assert.equal(clockLook(pragueHour(new Date('2026-10-15T18:00:00Z')),new Date('2026-10-15T18:00:00Z')),'night');
 assert.notEqual(clockLook(20,june),'night');
 assert.notEqual(clockLook(21,june),'night');
 assert.ok(['golden','midday'].includes(clockLook(20,june)));
 assert.ok(['golden','midday'].includes(clockLook(21,june)));
 assert.equal(clockLook(12,autumn),'midday');
 assert.equal(clockLook(8,autumn),'morning');
 assert.equal(clockLook(18,autumn),'golden');
 assert.equal(clockLook(0,autumn),'night');
 assert.equal(clockLook(4,autumn),'night');
 for(const date of [autumn,june,january])for(let h=0;h<24;h+=.5)assert.notEqual(clockLook(h,date),'whitenight');
 const summer=daylight(june),winter=daylight(january);
 assert.ok(winter.first>summer.first,'winter morning starts later');
 assert.ok(winter.last<summer.last,'winter evening ends sooner');
 assert.ok(winter.length<summer.length,'winter daylight is shorter');
});

test('Europe/Prague hours come from Intl and need no request',()=>{
 const januaryMorning=new Date('2026-01-15T07:00:00Z');
 const morning=pragueHour(januaryMorning);
 assert.ok(Math.abs(morning-8)<.02);
 assert.equal(clockLook(morning,januaryMorning),'night','January 08:00 is still before sunrise');
 assert.equal(clockLook(9,januaryMorning),'morning');
 const july=new Date('2026-07-15T10:00:00Z');
 const midday=pragueHour(july);
 assert.ok(Math.abs(midday-12)<.02);assert.equal(clockLook(midday,july),'midday');
 const januaryDusk=new Date('2026-01-15T16:30:00Z');
 assert.equal(clockLook(pragueHour(januaryDusk),januaryDusk),'night');
 assert.equal(clockLook(pragueHour(new Date('2026-01-15T22:00:00Z')),new Date('2026-01-15T22:00:00Z')),'night');
 assert.equal(PRAGUE_TZ,'Europe/Prague');
});

test('a rainy morning is morning plus rain, and snow at night is night plus snow',()=>{
 const rain=lookFromForecast(8,61,{date:autumn});
 assert.equal(rain.day,'morning');assert.equal(rain.weather,'rain');
 assert.equal(rain.dayLabel,'Morning (auto)');assert.equal(rain.weatherLabel,'Rain (auto)');
 const snow=lookFromForecast(23,73,{date:autumn});
 assert.equal(snow.day,'night');assert.equal(snow.weather,'snow');
 assert.equal(snow.dayLabel,'Night (auto)');assert.equal(snow.weatherLabel,'Snow (auto)');
 const storm=lookFromForecast(3,95,{date:autumn});
 assert.equal(storm.day,'night');assert.equal(storm.weather,'thunder');
 assert.equal(storm.dayLabel,'Night (auto)');assert.equal(storm.weatherLabel,'Thunderstorm (auto)');
});

test('drizzle and rain, thunder, snow and overcast stay on the clock',()=>{
 for(const code of [51,53,55,56,57,61,63,65,66,67,80,81,82]){
  const state=lookFromForecast(12,code,{date:autumn});
  assert.equal(state.day,'midday',String(code));assert.equal(state.weather,'rain');assert.equal(state.weatherLabel,'Rain (auto)');
 }
 for(const code of [95,96,99]){
  const state=lookFromForecast(3,code,{date:autumn});
  assert.equal(state.day,'night');assert.equal(state.weather,'thunder');assert.equal(weatherKind(code),'thunder');
  assert.equal(state.weatherLabel,'Thunderstorm (auto)');
 }
 for(const code of [71,73,75,77,85,86]){
  const state=lookFromForecast(15,code,{date:autumn});
  assert.equal(state.day,'midday',String(code));assert.equal(state.weather,'snow');assert.equal(state.weatherLabel,'Snow (auto)');
 }
 assert.equal(lookFromForecast(8,0,{date:autumn}).day,'morning');assert.equal(lookFromForecast(8,0,{date:autumn}).weather,'clear');
 assert.equal(lookFromForecast(8,1,{date:autumn}).weather,'clear');assert.equal(lookFromForecast(8,2,{date:autumn}).weather,'clear');
 assert.equal(lookFromForecast(8,3,{date:autumn}).day,'morning');assert.equal(lookFromForecast(8,3,{date:autumn}).weather,'overcast');
 assert.equal(lookFromForecast(8,3,{date:autumn}).dayLabel,'Morning (auto)');assert.equal(lookFromForecast(8,3,{date:autumn}).weatherLabel,'Overcast (auto)');
 assert.equal(lookFromForecast(8,45,{date:autumn}).weather,'overcast');assert.equal(lookFromForecast(8,48,{date:autumn}).weather,'overcast');
});

test('a failed forecast leaves a clear clock look outside winter',()=>{
 for(const [hour,day] of [[8,'morning'],[12,'midday'],[18,'golden'],[23,'night']]){
  const state=lookFromForecast(hour,95,{failed:true,date:autumn});
  assert.equal(state.day,day);assert.equal(state.weather,'clear');
  assert.match(state.dayLabel,/\(auto\)$/);assert.equal(state.weatherLabel,'Clear (auto)');
 }
 const missing=lookFromForecast(12,undefined,{date:autumn});
 assert.equal(missing.day,'midday');assert.equal(missing.weather,'clear');assert.equal(missing.dayLabel,'Midday (auto)');
 assert.equal(isPragueWinter(autumn),false);
 assert.equal(lookFromForecast(12,0,{date:new Date('2026-03-15T11:00:00Z')}).weather,'clear');
 assert.equal(lookFromForecast(12,0,{date:new Date('2026-11-15T11:00:00Z')}).weather,'clear');
});

test('winter automatic weather defaults to snow, and a thunderstorm stays thunder',()=>{
 for(const date of [january,new Date('2026-02-15T11:00:00Z'),new Date('2026-12-15T11:00:00Z')]){
  assert.equal(isPragueWinter(date),true,date.toISOString());
  assert.equal(lookFromForecast(12,0,{date}).weather,'snow');
  assert.equal(lookFromForecast(12,1,{date}).weather,'snow');
  assert.equal(lookFromForecast(12,2,{date}).weather,'snow');
  assert.equal(lookFromForecast(12,3,{date}).weather,'snow');
  assert.equal(lookFromForecast(12,45,{date}).weather,'snow');
  assert.equal(lookFromForecast(12,48,{date}).weather,'snow');
  assert.equal(lookFromForecast(12,4,{date}).weather,'snow');
  assert.equal(lookFromForecast(12,undefined,{date}).weather,'snow');
  assert.equal(lookFromForecast(12,95,{failed:true,date}).weather,'snow');
  assert.equal(lookFromForecast(12,73,{date}).weather,'snow');
  assert.equal(lookFromForecast(12,61,{date}).weather,'rain');
  assert.equal(lookFromForecast(12,51,{date}).weather,'rain');
  for(const code of [95,96,99])assert.equal(lookFromForecast(15,code,{date}).weather,'thunder',String(code));
 }
 assert.equal(lookFromForecast(15,95,{date:january}).weatherLabel,'Thunderstorm (auto)');
 assert.equal(lookFromForecast(12,0,{date:january}).weatherLabel,'Snow (auto)');
});

test('automatic labels for both end in (auto) and manual labels do not',()=>{
 for(const hour of [8,12,18,23]){
  const state=lookFromForecast(hour,1);
  assert.match(state.dayLabel,/\(auto\)$/);assert.match(state.weatherLabel,/\(auto\)$/);
 }
 assert.match(lookFromForecast(12,61).weatherLabel,/\(auto\)$/);
 assert.match(lookFromForecast(12,95).dayLabel,/\(auto\)$/);
 assert.match(lookFromForecast(12,95).weatherLabel,/\(auto\)$/);
 assert.match(lookFromForecast(12,71).weatherLabel,/\(auto\)$/);
 const live=createLook({automatic:true,initial:'midday',weather:'rain'});
 assert.match(live.label,/\(auto\)$/);assert.match(live.weatherLabel,/\(auto\)$/);
 assert.equal(live.cycle().name,'morning');assert.equal(live.automatic,false);assert.equal(live.label,'Morning');
 assert.equal(live.weather,'rain');assert.match(live.weatherLabel,/\(auto\)$/);
 let guard=0;while(!live.automatic&&guard++<20)live.cycle();
 assert.equal(live.automatic,true);assert.match(live.label,/\(auto\)$/);assert.equal(live.name,'midday');
 assert.notEqual(live.name,'whitenight');
 assert.equal(live.cycleWeather().weather,'clear');assert.equal(live.weatherAutomatic,false);assert.equal(live.weatherLabel,'Clear');
 assert.equal(live.name,'midday');
 guard=0;while(!live.weatherAutomatic&&guard++<20)live.cycleWeather();
 assert.equal(live.weatherAutomatic,true);assert.match(live.weatherLabel,/\(auto\)$/);assert.equal(live.weather,'rain');
 live.dispose();
});

test('the forecast applies the clock and the weather code separately',async()=>{
 const calls=[];
 const look={followDay(day){calls.push(['day',day]);return look;},followWeather(weather){calls.push(['weather',weather]);return look;}};
 const stop=startPragueForecast(look,{fetchImpl:async()=>({ok:true,json:async()=>({current:{weather_code:61}})}),intervalMs:1e9,hourMs:1e9});
 await new Promise(resolve=>setTimeout(resolve,20));
 stop();
 assert.deepEqual(calls.at(-2),['day',clockLook(pragueHour())]);
 assert.deepEqual(calls.at(-1),['weather','rain']);
 assert.equal(calls.filter(([,value])=>value==='whitenight').length,0);
});

test('the forecast is one keyless Open-Meteo call at the city origin, repeated every 30 minutes',()=>{
 assert.equal(FORECAST_EVERY_MS,30*60*1000);
 assert.match(FORECAST_URL,/latitude=50\.09/);
 assert.match(FORECAST_URL,/longitude=14\.42/);
 assert.match(FORECAST_URL,/current=weather_code/);
 assert.doesNotMatch(FORECAST_URL,/apikey|api_key|key=/i);
});
