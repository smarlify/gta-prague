// Siren distance curve. Volume falls off with distance. `intensity` above 1
// (finale surge) makes it louder and switches the yelp sooner. The returned
// frequency is the old oscillator sweep; playback uses the two-tone recording
// instead, so that sweep is not applied on top of the clip.
import {seamlessLoop} from './audio.js';
export const SIREN_RANGE=260;
export const SURGE_SIREN=1.8;
export function sirenMix(units,player,time,intensity=1){
 let d=Infinity;if(player)for(const u of units)d=Math.min(d,Math.hypot(u.x-player.x,u.z-player.z));
 if(!(d<SIREN_RANGE))return {volume:0,frequency:700,distance:d};
 const near=1-d/SIREN_RANGE,volume=Math.min(.16,.075*near*near*intensity);
 const yelp=d<(intensity>1?90:45),period=yelp?.32:3.4,c=(time/period)%1;
 const sweep=yelp?(c<.5?c*2:2-c*2):.5-.5*Math.cos(c*Math.PI*2);
 return {volume,frequency:(yelp?720:640)+sweep*(yelp?640:620),distance:d};
}
const SIREN_URL='/sounds/siren.mp3';
// sirenMix peaks at 0.16, which suited a full-scale sawtooth. The recording's
// average level is much lower, so the same curve is scaled once.
const SAMPLE_SCALE=2.4;
export function createSiren(){
 let context=null,gain,level=0;
 return {
  get level(){return level;},
  update(ctx,enabled,units,player,time,intensity=1){
   if(!ctx)return;
   if(ctx!==context){
    context=ctx;level=0;gain=ctx.createGain();gain.gain.value=0;gain.connect(ctx.destination);
    fetch(SIREN_URL).then(r=>{if(!r.ok)throw new Error(r.status);return r.arrayBuffer();}).then(b=>ctx.decodeAudioData(b)).then(buffer=>{
     if(ctx!==context)return;
     const source=ctx.createBufferSource();source.buffer=seamlessLoop(ctx,buffer);source.loop=true;source.connect(gain);source.start();
    }).catch(err=>{console.warn('Siren failed to load',err);});
   }
   const mix=enabled?sirenMix(units,player,time,intensity):null;
   level=mix?mix.volume*SAMPLE_SCALE:0;
   if(gain)gain.gain.setTargetAtTime(level,ctx.currentTime,.08);
  },
 };
}
