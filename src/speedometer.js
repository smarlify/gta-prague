import {displayedSpeedKmh} from './physics.js';

export const dialAngle=speed=>-120+Math.max(0,Math.min(120,speed))*2;
export const smoothSpeed=(current,target,dt)=>current+(target-current)*(1-Math.exp(-Math.max(0,dt)*10));

export function createSpeedometer(doc=document){
 const el=id=>doc.getElementById(id),needle=el('speed-needle'),arc=el('speed-arc'),ticks=el('speed-ticks'),panel=doc.querySelector('.speedometer');
 const svgTag=(tag,attrs)=>{const n=doc.createElementNS('http://www.w3.org/2000/svg',tag);for(const [key,value]of Object.entries(attrs))n.setAttribute(key,value);return n;};
 const point=(angle,r)=>{const a=angle*Math.PI/180;return [120+Math.sin(a)*r,114-Math.cos(a)*r];};
 for(let speed=0;speed<=120;speed+=5){const angle=dialAngle(speed),major=speed%20===0,[x1,y1]=point(angle,85),[x2,y2]=point(angle,major?75:81);
  ticks.append(svgTag('line',{x1,y1,x2,y2,class:major?'major':'minor'}));
  if(major){const [x,y]=point(angle,65),label=svgTag('text',{x,y,'text-anchor':'middle','dominant-baseline':'middle'});label.textContent=speed;ticks.append(label);}
 }
 const motion=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');let shown=0;
 // The dial is updated every frame, but most frames show the same numbers: write the DOM only on change.
 const speedEl=el('speed'),gearEl=el('drive-gear'),batteryValue=el('battery-value'),batteryFill=el('battery-fill'),batteryGauge=el('battery-gauge'),batteryLabel=el('battery-label'),last={};
 const changed=(key,value)=>{if(last[key]===value)return false;last[key]=value;return true;};
 return {update(car,dt,{mode='car'}={}){
  const target=mode==='car'?displayedSpeedKmh(car.speed):Math.abs(car.speed)*3.6;shown=motion?.matches?target:smoothSpeed(shown,target,dt);
  if(Math.abs(shown-target)<.05)shown=target;
  const speedText=String(Math.round(shown)),dial=shown.toFixed(1);
  if(changed('speed',speedText))speedEl.textContent=speedText;
  if(changed('dial',dial)){needle.setAttribute('transform',`rotate(${dialAngle(shown)} 120 114)`);arc.setAttribute('stroke-dasharray',`${Math.min(100,shown/120*100)} 100`);}
  const gear=mode==='car'?(car.speed<-.2?'R':Math.abs(car.speed)>.2?'D':'P'):mode==='walk'?'W':mode==='bike'?'B':'S';
  if(changed('gear',gear))gearEl.textContent=gear;
  const charge=Math.max(0,Math.min(1,car.battery??1)),percent=(charge*100).toFixed(1);
  if(changed('battery',percent)){
   batteryValue.textContent=`${percent}%`;batteryFill.style.width=`${charge*100}%`;batteryGauge.setAttribute('aria-valuenow',percent);
   panel.classList.toggle('low-battery',charge<=.2);panel.classList.toggle('empty-battery',charge===0);
   batteryLabel.textContent=charge===0?'Battery empty':charge<=.2?'Low battery':'Battery';
  }
 }};
}
