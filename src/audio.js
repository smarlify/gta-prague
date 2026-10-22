// WebAudio for the recorded city beds. Levels, distance and pan come from
// audio-math.js; this file only loads the CC0 excerpts and applies them.
import {mixerGains,ambienceMix,carSample,motorbikeEngine,crowdLevel,nearestSources,attenuation,stereoPan,tramDepartures,waterGain} from './audio-math.js';

const FILES={
 city:'/sounds/city.mp3',
 crowd:'/sounds/crowd.mp3',
 car:'/sounds/car.mp3',
 tram:'/sounds/tram.mp3',
 depart:'/sounds/tram-depart.mp3',
 water:'/sounds/water.mp3',
 // Louder of the two CC0 rain loops (Ylmir, OpenGameArt). rainSoft.ogg is kept beside it and not played.
 // Snow does not use this loop. Thunder is synthesized in playThunder, not a file.
 rain:'/sounds/rain.ogg',
};
// The strike is seen, then the clap. One shot, never a loop.
export const THUNDER_DELAY=.4;
// Long enough that the crack is still loud after one frame, then the low end rolls off.
export const THUNDER_DURATION=2.05;
export const THUNDER_PEAK=1.4;
const TRAM_SLOTS=3,TRAM_RANGE=90;

// Drop encoder silence, then blend the end back into the start so a loop
// does not click on the join.
export function seamlessLoop(ctx,buffer,fade=.05){
 const channels=buffer.numberOfChannels,lead=buffer.getChannelData(0);
 let from=0,to=lead.length;
 while(from<to-1&&Math.abs(lead[from])<.002)from++;
 while(to>from+1&&Math.abs(lead[to-1])<.002)to--;
 const fadeN=Math.min(Math.floor(buffer.sampleRate*fade),Math.floor((to-from)/4));
 const length=(to-from)-fadeN;
 if(!(fadeN>8&&length>fadeN*2))return buffer;
 const out=ctx.createBuffer(channels,length,buffer.sampleRate);
 for(let c=0;c<channels;c++){
  const src=buffer.getChannelData(c),dst=out.getChannelData(c);
  // Keep everything except the last fade, and lay that tail over the start so
  // the loop point is the next sample of the recording rather than a jump.
  dst.set(src.subarray(from,from+length));
  for(let i=0;i<fadeN;i++){const t=i/fadeN;dst[i]=src[to-fadeN+i]*(1-t)+src[from+i]*t;}
 }
 return out;
}

async function loadBuffer(ctx,url,loop){
 const res=await fetch(url);if(!res.ok)throw new Error(`${url} ${res.status}`);
 // SPA hosts (`serve -s`) can return index.html with 200 for a missing file.
 const type=res.headers.get('content-type')||'';
 if(/html/i.test(type))throw new Error(`${url} returned HTML (${type})`);
 const decoded=await ctx.decodeAudioData(await res.arrayBuffer());
 return loop?seamlessLoop(ctx,decoded):decoded;
}

async function loadOptional(ctx,url,loop){
 try{return await loadBuffer(ctx,url,loop);}
 catch(err){console.warn('City sound missing',url,err);return null;}
}

// A short uneven pulse, looped. Playback rate does the rev. No sample file.
function combustionBuffer(ctx){
 const rate=ctx.sampleRate||44100,n=Math.floor(rate*.32);
 const buffer=ctx.createBuffer(1,n,rate),data=buffer.getChannelData(0);
 for(let i=0;i<n;i++){
  const t=i/rate;
  const fire=Math.sin(2*Math.PI*46*t)>0.2?1:-.4;
  const body=Math.sin(2*Math.PI*92*t)*.32;
  const bark=Math.sin(2*Math.PI*184*t)*.1;
  data[i]=(fire*.26+body+bark)*.5;
 }
 const fade=Math.floor(rate*.012);
 for(let i=0;i<fade;i++){const w=i/fade;data[i]*=w;data[n-1-i]*=w;}
 return buffer;
}

function makeLoop(ctx,buffer,destination){
 const gain=ctx.createGain(),pan=ctx.createStereoPanner(),source=ctx.createBufferSource();
 gain.gain.value=0;
 source.buffer=buffer;source.loop=true;
 source.connect(gain);gain.connect(pan);pan.connect(destination);source.start();
 return {gain,pan,rate:source.playbackRate};
}

// Snow must not start the rain bed, even while the streak uniform is up.
// Thunder is one clap per flash cue, and only while sound is on.
export function weatherBeds({enabled=false,precipitation=false,snow=false,thunder=0}={}){
 return {
  rain:enabled&&precipitation&&!snow?0.5:0,
  claps:enabled&&thunder>0?Math.trunc(thunder):0,
 };
}

// One clap after the flash. The lowpass stays open for the crack, then falls
// into the rumble. A 420 Hz muffler died in a few milliseconds, under the rain.
export function playThunder(ctx,destination,when=0){
 const start=(Number.isFinite(when)?when:0)+THUNDER_DELAY,duration=THUNDER_DURATION,rate=ctx.sampleRate||44100;
 const frames=Math.max(1,Math.floor(rate*duration));
 const buffer=ctx.createBuffer(1,frames,rate),data=buffer.getChannelData(0);
 for(let i=0;i<frames;i++)data[i]=Math.random()*2-1;
 const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();
 source.buffer=buffer;source.loop=false;
 filter.type='lowpass';
 const open=Math.min(7200,rate*.45);
 filter.frequency.setValueAtTime(open,start);
 filter.frequency.exponentialRampToValueAtTime(Math.min(110,open),start+duration);
 gain.gain.setValueAtTime(.001,start);
 gain.gain.exponentialRampToValueAtTime(THUNDER_PEAK,start+.012);
 gain.gain.exponentialRampToValueAtTime(.015,start+duration);
 source.connect(filter);filter.connect(gain);gain.connect(destination);
 source.start(start);source.stop(start+duration+.02);
 return source;
}

export function createCityAudio(){
 let context=null,master,buses,loops,tramVoices,departBuffer,waiting=new Map(),ready=false,loading=null;
 const levels={ready:false,city:0,crowd:0,car:0,carRate:1,tram:0,water:0,rain:0};
 let analyser=null,listener={x:0,z:0};

 function ensure(ctx){
  if(!ctx||ctx===context||loading)return loading;
  context=ctx;ready=false;levels.ready=false;
  master=ctx.createGain();master.gain.value=0;master.connect(ctx.destination);
  analyser=ctx.createAnalyser();analyser.fftSize=256;master.connect(analyser);
  const branch=()=>{const g=ctx.createGain();g.connect(master);return g;};
  buses={engine:branch(),vehicles:branch(),ambience:branch()};
  // Load each clip on its own so one missing file (common when a custom
  // domain still points at a parking page, or SPA fallback returns HTML)
  // does not silence the rest of the bed.
  loading=Promise.all([
   loadOptional(ctx,FILES.city,true),loadOptional(ctx,FILES.crowd,true),loadOptional(ctx,FILES.car,true),
   loadOptional(ctx,FILES.tram,true),loadOptional(ctx,FILES.depart,false),loadOptional(ctx,FILES.water,true),
   loadOptional(ctx,FILES.rain,true),
  ]).then(([city,crowd,car,tram,depart,water,rain])=>{
   if(ctx!==context)return;
   if(!city&&!crowd&&!car&&!tram&&!depart&&!water&&!rain){loading=null;context=null;return;}
   const param=()=>({value:0,setTargetAtTime(){}});
   const silent=(bus)=>{const g=ctx.createGain();g.gain.value=0;g.connect(bus);return {gain:g,pan:{pan:param()},rate:param()};};
   loops={
    city:city?makeLoop(ctx,city,buses.ambience):silent(buses.ambience),
    crowd:crowd?makeLoop(ctx,crowd,buses.ambience):silent(buses.ambience),
    car:car?makeLoop(ctx,car,buses.engine):silent(buses.engine),
    motorbike:makeLoop(ctx,combustionBuffer(ctx),buses.engine),
    water:water?makeLoop(ctx,water,buses.ambience):silent(buses.ambience),
    rain:rain?makeLoop(ctx,rain,buses.ambience):silent(buses.ambience),
   };
   tramVoices=Array.from({length:TRAM_SLOTS},()=>tram?makeLoop(ctx,tram,buses.vehicles):silent(buses.vehicles));
   departBuffer=depart;ready=true;levels.ready=true;
  }).catch(err=>{console.warn('City sounds failed to load',err);loading=null;context=null;});
  return loading;
 }

 function playDepart(tram,heading){
  const source=context.createBufferSource(),gain=context.createGain(),pan=context.createStereoPanner();
  const distance=Math.hypot(tram.x-listener.x,tram.z-listener.z);
  source.buffer=departBuffer;
  gain.gain.value=attenuation(distance,{ref:12,max:80,rolloff:1.4})*.7;
  pan.pan.value=stereoPan(listener,heading,tram.x,tram.z);
  source.connect(gain);gain.connect(pan);pan.connect(buses.vehicles);source.start();
 }

 function rms(){
  if(!analyser)return 0;
  const data=new Float32Array(analyser.fftSize);analyser.getFloatTimeDomainData(data);
  let sum=0;for(const v of data)sum+=v*v;return Math.sqrt(sum/data.length);
 }

 return {
  attach:ensure,
  snapshot:()=>({...levels,rms:rms()}),
  // Cues arrive after look.update, so this is separate from the bed mix above.
  clap(ctx,{enabled=false,cues=0}={}){
   const {claps}=weatherBeds({enabled,thunder:cues});
   if(!ready||ctx!==context||claps<=0)return 0;
   const now=ctx.currentTime;
   for(let i=0;i<claps;i++)playThunder(ctx,buses.ambience,now);
   return claps;
  },
  update(ctx,state={}){
   if(ctx)ensure(ctx);
   if(!ready||ctx!==context)return;
   const {enabled=false,active=false,driving=false,ride=null,rideSpeed=0,car=null,surface=null,people=[],trams=[],heading=0,throttle=false,reverse=false,brake=false,waterDistance=Infinity,precipitation=false,snow=false}=state;
   const mix=mixerGains({enabled,active}),now=ctx.currentTime;
   listener=car||listener;
   master.gain.setTargetAtTime(mix.master,now,.08);
   buses.engine.gain.setTargetAtTime(mix.engine,now,.05);
   buses.vehicles.gain.setTargetAtTime(mix.vehicles,now,.05);
   buses.ambience.gain.setTargetAtTime(mix.ambience,now,.05);
   const city=ambienceMix({speed:car?.speed||0}).city*.34;
   loops.city.gain.gain.setTargetAtTime(city,now,.2);levels.city=city;
   const crowd=crowdLevel(people,listener)*.62;
   loops.crowd.gain.gain.setTargetAtTime(crowd,now,.15);levels.crowd=crowd;
   const river=waterGain(waterDistance)*.4;
   loops.water.gain.gain.setTargetAtTime(river,now,.25);levels.water=river;
   const beds=weatherBeds({enabled,precipitation,snow});
   loops.rain.gain.gain.setTargetAtTime(beds.rain,now,.25);levels.rain=beds.rain;
   const sample=carSample(car?.speed||0,surface,{throttle,reverse,brake});
   const carGain=driving&&car?sample.gain:0;
   loops.car.gain.gain.setTargetAtTime(carGain,now,.12);
   loops.car.rate.setTargetAtTime(sample.playbackRate,now,.1);
   levels.car=carGain;levels.carRate=sample.playbackRate;
   const riding=ride==='motorbike';
   const bike=motorbikeEngine(rideSpeed);
   loops.motorbike.gain.gain.setTargetAtTime(riding?bike.gain:0,now,.08);
   if(riding)loops.motorbike.rate.setTargetAtTime(bike.playbackRate,now,.08);
   const near=nearestSources(trams.filter(t=>(t.speed||0)>.4),listener,TRAM_SLOTS,TRAM_RANGE);
   let tramPeak=0;
   for(let i=0;i<TRAM_SLOTS;i++){
    const voice=tramVoices[i],src=near[i];
    if(!src){voice.gain.gain.setTargetAtTime(0,now,.1);continue;}
    const g=attenuation(src.distance,{ref:8,max:TRAM_RANGE,rolloff:1.3})*.55;
    tramPeak=Math.max(tramPeak,g);
    voice.gain.gain.setTargetAtTime(g,now,.08);
    voice.pan.pan.setTargetAtTime(stereoPan(listener,heading,src.entity.x,src.entity.z),now,.05);
   }
   levels.tram=tramPeak;
   const depart=tramDepartures(trams,waiting);waiting=depart.waiting;
   if(mix.master>0)for(const tram of depart.departed)playDepart(tram,heading);
  },
 };
}
