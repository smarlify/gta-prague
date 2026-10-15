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

export function pragueHour(date=new Date(),timeZone=PRAGUE_TZ){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone,hour:'numeric',minute:'numeric',hourCycle:'h23'}).formatToParts(date).map(p=>[p.type,p.value]));
 let hour=Number(parts.hour);if(hour===24)hour=0;
 return hour+Number(parts.minute)/60;
}

// 05:00–09:30 morning, 09:30–16:00 midday, 16:00–21:00 golden evening, otherwise night.
export function clockLook(hour){
 const h=Number.isFinite(hour)?((hour%24)+24)%24:12;
 if(h>=5&&h<9.5)return 'morning';
 if(h>=9.5&&h<16)return 'midday';
 if(h>=16&&h<21)return 'golden';
 return 'night';
}

export function weatherKind(code){
 const c=Math.trunc(Number(code));
 if(!Number.isFinite(c))return 'clear';
 if(THUNDER.has(c))return 'thunder';
 if(SNOW.has(c))return 'snow';
 if(RAIN.has(c))return 'rain';
 if(OVERCAST.has(c))return 'overcast';
 return 'clear';
}

// Daytime and weather stay separate. A failed forecast keeps the clock and assumes clear.
export function lookFromForecast(hour,code,{failed=false}={}){
 const day=clockLook(hour);
 const weather=failed||!Number.isFinite(Number(code))?'clear':weatherKind(code);
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

// One Open-Meteo fetch now, then every 30 minutes. A failure keeps the clock and assumes clear.
// The hour (and the 09:30 boundary) is recomputed on a slow timer, never every frame.
export function startPragueForecast(look,{fetchImpl,intervalMs=FORECAST_EVERY_MS,hourMs=HOUR_EVERY_MS}={}){
 let code=null,failed=true,stopped=false;
 const apply=()=>{
  if(stopped)return;
  const state=lookFromForecast(pragueHour(),code,{failed});
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
