// WebAudio for the recorded city beds. Levels, distance and pan come from
// audio-math.js; this file only loads the CC0 excerpts and applies them.
import {mixerGains,ambienceMix,carSample,crowdLevel,nearestSources,attenuation,stereoPan,tramDepartures,waterGain} from './audio-math.js';

const FILES={
 city:'/sounds/city.mp3',
 crowd:'/sounds/crowd.mp3',
 car:'/sounds/car.mp3',
 tram:'/sounds/tram.mp3',
 depart:'/sounds/tram-depart.mp3',
 water:'/sounds/water.mp3',
};
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
 const decoded=await ctx.decodeAudioData(await res.arrayBuffer());
 return loop?seamlessLoop(ctx,decoded):decoded;
}

function makeLoop(ctx,buffer,destination){
 const gain=ctx.createGain(),pan=ctx.createStereoPanner(),source=ctx.createBufferSource();
 gain.gain.value=0;
 source.buffer=buffer;source.loop=true;
 source.connect(gain);gain.connect(pan);pan.connect(destination);source.start();
 return {gain,pan,rate:source.playbackRate};
}

export function createCityAudio(){
 let context=null,master,buses,loops,tramVoices,departBuffer,waiting=new Map(),ready=false,loading=null;
 const levels={ready:false,city:0,crowd:0,car:0,carRate:1,tram:0,water:0};
 let analyser=null,listener={x:0,z:0};

 function ensure(ctx){
  if(!ctx||ctx===context||loading)return loading;
  context=ctx;ready=false;levels.ready=false;
  master=ctx.createGain();master.gain.value=0;master.connect(ctx.destination);
  analyser=ctx.createAnalyser();analyser.fftSize=256;master.connect(analyser);
  const branch=()=>{const g=ctx.createGain();g.connect(master);return g;};
  buses={engine:branch(),vehicles:branch(),ambience:branch()};
  loading=Promise.all([
   loadBuffer(ctx,FILES.city,true),loadBuffer(ctx,FILES.crowd,true),loadBuffer(ctx,FILES.car,true),
   loadBuffer(ctx,FILES.tram,true),loadBuffer(ctx,FILES.depart,false),loadBuffer(ctx,FILES.water,true),
  ]).then(([city,crowd,car,tram,depart,water])=>{
   if(ctx!==context)return;
   loops={city:makeLoop(ctx,city,buses.ambience),crowd:makeLoop(ctx,crowd,buses.ambience),car:makeLoop(ctx,car,buses.engine),water:makeLoop(ctx,water,buses.ambience)};
   tramVoices=Array.from({length:TRAM_SLOTS},()=>makeLoop(ctx,tram,buses.vehicles));
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
  update(ctx,state={}){
   if(ctx)ensure(ctx);
   if(!ready||ctx!==context)return;
   const {enabled=false,active=false,driving=false,car=null,surface=null,people=[],trams=[],heading=0,throttle=false,reverse=false,brake=false,waterDistance=Infinity}=state;
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
   const sample=carSample(car?.speed||0,surface,{throttle,reverse,brake});
   const carGain=driving&&car?sample.gain:0;
   loops.car.gain.gain.setTargetAtTime(carGain,now,.12);
   loops.car.rate.setTargetAtTime(sample.playbackRate,now,.1);
   levels.car=carGain;levels.carRate=sample.playbackRate;
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
