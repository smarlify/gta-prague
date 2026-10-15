import test from 'node:test';
import assert from 'node:assert/strict';
import {areaName,areaCaption,HELSINKI_AREAS,PRAGUE_AREAS} from '../src/area-caption.js';

const starts=[];
const helsinki=[...HELSINKI_AREAS,...starts];
test('the minimap caption names the area around the player',{skip:'Finland city is not part of this build'},()=>{
 const at=name=>{const s=starts.find(s=>s.name===name);return areaName(helsinki,s.x+40,s.z-30,'Helsinki');};
 assert.equal(at('Lauttasaari'),'LAUTTASAARI');assert.equal(at('Keilaniemi'),'KEILANIEMI');assert.equal(at('Tapiola centre'),'TAPIOLA');
 assert.equal(areaName(helsinki,-3800,-1400,'Helsinki'),'SEURASAARI');
 assert.equal(areaName(helsinki,195,1084,'Helsinki'),'HELSINKI CENTRE','Olympia Terminal');
 assert.equal(areaName(helsinki,-120,140,'Helsinki'),'HELSINKI CENTRE');assert.equal(areaName(helsinki,-1100,200,'Helsinki'),'KAMPPI');
});
test('other cities: districts named after the city read as its centre; far away falls back to the city',()=>{
 const tampere=[{name:'Keskustori',district:'Tampere',x:-49,z:5},{name:'Laukontori',district:'Tampere',x:14,z:282}];
 assert.equal(areaName(tampere,0,100,'Tampere'),'TAMPERE CENTRE');
 assert.equal(areaName([{district:'Pispala',x:-3000,z:0}],5000,0,'Tampere'),'TAMPERE CENTRE');
 assert.equal(areaName([{district:'Pispala',x:-3000,z:0}],-2900,0,'Tampere'),'PISPALA');
 assert.equal(areaName([],0,0,'Oulu'),'OULU CENTRE');
});
test('the caption recomputes at most twice a second',()=>{
 const caption=areaCaption([{district:'A',x:0,z:0},{district:'B',x:1000,z:0}],'City');
 assert.equal(caption(0,0,0),'A');assert.equal(caption(1000,0,200),'A','throttled');assert.equal(caption(1000,0,500),'B');
});
test('Prague anchors name the neighbourhood, not PRAHA CENTRE',()=>{
 assert.match(areaName(PRAGUE_AREAS,-50,50,'Praha'),/STARÉ MĚSTO|STARE MESTO/);
 assert.match(areaName(PRAGUE_AREAS,-1800,-1200,'Praha'),/DEJVICE/);
 assert.match(areaName(PRAGUE_AREAS,-1100,1500,'Praha'),/SMÍCHOV|SMICHOV/);
});
