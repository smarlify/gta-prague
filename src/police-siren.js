// Siren distance curve. Volume and brightness fall with distance to the
// nearest pursuing unit so a car spawning hundreds of metres away is quiet /
// inaudible; only nearby units reach the previous full loudness.
import {seamlessLoop} from './audio.js';
import {attenuation} from './audio-math.js';
export const SIREN_RANGE=200;
export const SURGE_SIREN=1.8;
export const SIREN_REF=16;
export const SIREN_ROLLOFF=2.4;
export const SIREN_PEAK=.16;
export function sirenMix(units,player,time,intensity=1){
 let d=Infinity;if(player)for(const u of units)d=Math.min(d,Math.hypot(u.x-player.x,u.z-player.z));
 if(!(d<SIREN_RANGE))return {volume:0,frequency:700,distance:d,cutoff:280};
 const near=attenuation(d,{ref:SIREN_REF,max:SIREN_RANGE,rolloff:SIREN_ROLLOFF});
 const volume=Math.min(SIREN_PEAK,SIREN_PEAK*near*intensity);
 const yelp=d<(intensity>1?90:45),period=yelp?.32:3.4,c=(time/period)%1;
 const sweep=yelp?(c<.5?c*2:2-c*2):.5-.5*Math.cos(c*Math.PI*2);
 // Far units are muffled; close units keep the full recording bandwidth.
 const cutoff=320+3480*Math.pow(near,1.35);
 return {volume,frequency:(yelp?720:640)+sweep*(yelp?640:620),distance:d,cutoff};
}
const SIREN_URL='/sounds/siren.mp3';
// sirenMix peaks at 0.16, which suited a full-scale sawtooth. The recording's
// average level is much lower, so the same curve is scaled once.
const SAMPLE_SCALE=2.4;
export function createSiren(){
 let context=null,gain,filter,level=0;
 return {
  get level(){return level;},
  update(ctx,enabled,units,player,time,intensity=1){
   if(!ctx)return;
   if(ctx!==context){
    context=ctx;level=0;
    filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=4000;filter.Q.value=.7;
    gain=ctx.createGain();gain.gain.value=0;filter.connect(gain);gain.connect(ctx.destination);
    fetch(SIREN_URL).then(r=>{if(!r.ok)throw new Error(r.status);return r.arrayBuffer();}).then(b=>ctx.decodeAudioData(b)).then(buffer=>{
     if(ctx!==context)return;
     const source=ctx.createBufferSource();source.buffer=seamlessLoop(ctx,buffer);source.loop=true;source.connect(filter);source.start();
    }).catch(err=>{console.warn('Siren failed to load',err);});
   }
   const mix=enabled?sirenMix(units,player,time,intensity):null;
   level=mix?mix.volume*SAMPLE_SCALE:0;
   if(gain)gain.gain.setTargetAtTime(level,ctx.currentTime,.08);
   if(filter)filter.frequency.setTargetAtTime(mix?mix.cutoff:280,ctx.currentTime,.12);
  },
 };
}
