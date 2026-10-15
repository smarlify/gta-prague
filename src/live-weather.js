import {LOOKS,WEATHERS} from './weather.js';

// Prague local time from Intl. No request. The forecast is a separate call.
export const PRAGUE_TZ='Europe/Prague';
export const PRAGUE_LATITUDE=50.09;
export const PRAGUE_LONGITUDE=14.42;
export const FORECAST_URL=`https://api.open-meteo.com/v1/forecast?latitude=${PRAGUE_LATITUDE}&longitude=${PRAGUE_LONGITUDE}&current=weather_code`;
export const FORECAST_EVERY_MS=30*60*1000;
const HOUR_EVERY_MS=30*1000;

const OVERCAST=new Set([3,45,48]);
const RAIN=new Set([51,53,55,56,57,61,63,65,66,67,80,81,82]);
const SNOW=new Set([71,73,75,77,85,86]);
const THUNDER=new Set([95,96,99]);

const DEG=Math.PI/180,RAD=180/Math.PI;
// Absolute low sun. Winter noon is only ~16°, so the band shrinks with that peak
// and a short December day still has a midday.
const LOW_SUN=15;

export function pragueWallClock(date=new Date(),timeZone=PRAGUE_TZ){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date).map(p=>[p.type,p.value]));
 const hour=Number(parts.hour)===24?0:Number(parts.hour);
 const minute=Number(parts.minute),second=Number(parts.second);
 return {year:Number(parts.year),month:Number(parts.month),day:Number(parts.day),hour,minute,second,decimalHour:hour+minute/60+second/3600};
}

export function pragueHour(date=new Date(),timeZone=PRAGUE_TZ){
 return pragueWallClock(date,timeZone).decimalHour;
}

// Meteorological winter in Europe/Prague: December, January, February.
export function isPragueWinter(date=new Date(),timeZone=PRAGUE_TZ){
 const month=pragueWallClock(date,timeZone).month;
 return month===12||month===1||month===2;
}

function pragueOffsetHours(date,timeZone){
 const wall=pragueWallClock(date,timeZone);
 const asUtc=Date.UTC(wall.year,wall.month-1,wall.day,wall.hour,wall.minute,wall.second);
 return (asUtc-date.getTime())/3600000;
}

function dateAtPragueHour(date,decimalHour,timeZone=PRAGUE_TZ){
 const wall=pragueWallClock(date,timeZone);
 const whole=Math.round(decimalHour*3600);
 const hh=Math.floor(whole/3600)%24,rest=whole-hh*3600,mm=Math.floor(rest/60),ss=rest-mm*60;
 const utcWall=Date.UTC(wall.year,wall.month-1,wall.day,hh,mm,ss);
 let instant=utcWall;
 for(let i=0;i<2;i++)instant=utcWall-pragueOffsetHours(new Date(instant),timeZone)*3600000;
 return new Date(instant);
}

function dayOfYear(year,month,day){
 return Math.floor((Date.UTC(year,month-1,day)-Date.UTC(year,0,0))/86400000);
}

// NOAA equation of time and solar elevation. Prague only; no sun request.
export function solarElevation(date,{latitude=PRAGUE_LATITUDE,longitude=PRAGUE_LONGITUDE,timeZone=PRAGUE_TZ}={}){
 const wall=pragueWallClock(date,timeZone);
 const gamma=2*Math.PI/365*(dayOfYear(wall.year,wall.month,wall.day)-1+(wall.decimalHour-12)/24);
 const eqTime=229.18*(0.000075+0.001868*Math.cos(gamma)-0.032077*Math.sin(gamma)-0.014615*Math.cos(2*gamma)-0.040849*Math.sin(2*gamma));
 const decl=0.006918-0.399912*Math.cos(gamma)+0.070257*Math.sin(gamma)-0.006758*Math.cos(2*gamma)+0.000907*Math.sin(2*gamma)-0.002697*Math.cos(3*gamma)+0.00148*Math.sin(3*gamma);
 const trueSolar=wall.decimalHour*60+eqTime+4*longitude-60*pragueOffsetHours(date,timeZone);
 let ha=trueSolar/4-180;
 ha=((ha+180)%360+360)%360-180;
 const lat=latitude*DEG,haRad=ha*DEG;
 const cosZenith=Math.sin(lat)*Math.sin(decl)+Math.cos(lat)*Math.cos(decl)*Math.cos(haRad);
 const elevation=90-Math.acos(Math.min(1,Math.max(-1,cosZenith)))*RAD;
 const noon=Math.asin(Math.min(1,Math.max(-1,Math.sin(lat)*Math.sin(decl)+Math.cos(lat)*Math.cos(decl))))*RAD;
 return {elevation,hourAngle:ha,noon};
}

// Morning is the low sun after dawn, golden evening the low sun before sunset,
// and night once the sun is down. The bands move with the day of the year.
export function clockLook(hour,date=new Date()){
 const h=Number.isFinite(hour)?((hour%24)+24)%24:12;
 const sun=solarElevation(dateAtPragueHour(date,h));
 if(sun.elevation<=0)return 'night';
 const low=Math.min(LOW_SUN,sun.noon*.75);
 if(sun.elevation>=low)return 'midday';
 return sun.hourAngle<0?'morning':'golden';
}

export function weatherKind(code,{winter=false}={}){
 const c=Math.trunc(Number(code));
 if(!Number.isFinite(c))return winter?'snow':'clear';
 if(THUNDER.has(c))return 'thunder';
 if(SNOW.has(c))return 'snow';
 if(RAIN.has(c))return 'rain';
 if(winter)return 'snow';
 if(OVERCAST.has(c))return 'overcast';
 return 'clear';
}

// Daytime follows the seasonal sun. Outside winter a failed forecast stays clear.
// In December–February, clear, cloud, fog and a failed fetch default to snow;
// live rain, drizzle and thunderstorm codes still win.
export function lookFromForecast(hour,code,{failed=false,date=new Date()}={}){
 const day=clockLook(hour,date);
 const winter=isPragueWinter(date);
 const weather=failed||!Number.isFinite(Number(code))?(winter?'snow':'clear'):weatherKind(code,{winter});
 return {
  day,weather,
  dayLabel:`${LOOKS[day].label} (auto)`,
  weatherLabel:`${WEATHERS[weather].label} (auto)`,
 };
}

export async function readWeatherCode(fetchImpl=globalThis.fetch,url=FORECAST_URL){
 const res=await fetchImpl(url);
 if(!res?.ok)throw new Error('forecast failed');
 const data=await res.json();
 const code=Number(data?.current?.weather_code);
 if(!Number.isFinite(code))throw new Error('forecast missing weather_code');
 return code;
}

// One Open-Meteo fetch now, then every 30 minutes. A failure keeps the clock.
// Winter then shows snow unless the code is rain or a thunderstorm.
// The hour and the seasonal sun are recomputed on a slow timer, never every frame.
export function startPragueForecast(look,{fetchImpl,intervalMs=FORECAST_EVERY_MS,hourMs=HOUR_EVERY_MS}={}){
 let code=null,failed=true,stopped=false;
 const apply=()=>{
  if(stopped)return;
  const now=new Date();
  const state=lookFromForecast(pragueHour(now),code,{failed,date:now});
  look.followDay(state.day);
  look.followWeather(state.weather);
 };
 const pull=async()=>{
  try{
   const next=await readWeatherCode(fetchImpl);
   if(stopped)return;
   code=next;failed=false;
  }catch{
   if(stopped)return;
   code=null;failed=true;
  }
  apply();
 };
 apply();
 pull();
 const forecastTimer=setInterval(pull,intervalMs);
 const hourTimer=setInterval(apply,hourMs);
 return ()=>{stopped=true;clearInterval(forecastTimer);clearInterval(hourTimer);};
}
