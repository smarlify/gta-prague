import {dataUrl} from './cities.js';
import {BusSimulation} from './bus-simulation.js';
import {createBusRenderer} from './bus-renderer.js';
import {createBusTerminal} from './bus-terminal.js';

// Praha asks for two FlixBus and two RegioJet. Other cities keep the simulation default of 2.
export const PRAGUE_COACH_CAP=4;

// FlixBus is already in bus-corridors.json under kind "city". Tag it at load; do not rewrite that file.
// RegioJet arrives in coach-corridors.json when the disk has a drivable path. Never paint a FlixBus shape yellow.
export function applyPragueBusLiveries(data,coachData=null){
 const paths=(data.paths||[]).map(path=>{
  if(String(path.routeName||'').startsWith('Flixbus'))return {...path,kind:'coach',livery:'flixbus'};
  if((path.kind||'city')==='city')return {...path,livery:path.livery||'dpp'};
  return path;
 });
 const coaches=(coachData?.paths||[]).filter(path=>path.livery!=='flixbus'&&!String(path.routeName||'').startsWith('Flixbus')).map(path=>({...path,kind:'coach',livery:'regiojet'}));
 return {...data,paths:[...paths,...coaches]};
}

export function busFleetOptions(cityId){
 return cityId==='prague'?{coachCount:PRAGUE_COACH_CAP}:{};
}

async function loadOptional(file){
 try{const response=await fetch(dataUrl(file));if(!response.ok)return null;return await response.json();}catch{return null;}
}

export async function createBusSystem(scene,world,player,{cityId=null}={}){
 const response=await fetch(dataUrl('bus-corridors.json'));if(!response.ok)throw new Error(`Bus corridor load failed: ${response.status}`);
 let data=await response.json();
 if(cityId==='prague')data=applyPragueBusLiveries(data,await loadOptional('coach-corridors.json'));
 const simulation=new BusSimulation(data,world,busFleetOptions(cityId));simulation.reset(player);const renderer=createBusRenderer(simulation);scene.add(renderer.group);renderer.update(player);
 const terminal=createBusTerminal(data.stationStops||[],world);scene.add(terminal);
 return {simulation,renderer,terminal,reset(player,traffic){simulation.reset(player,traffic);renderer.update(player);},step(dt,player,traffic=[]){simulation.step(dt,player,traffic);renderer.update(player);},get obstacles(){return simulation.obstacles;},get bodies(){return simulation.bodies;},snapshot(){return simulation.snapshot();}};
}
