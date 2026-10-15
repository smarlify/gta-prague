import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {panelOutline,checkPanel} from '../src/photo-panels-data.js';
import {createPhotoPanels} from '../src/photo-panels.js';

const base={name:'test-front',building:'building-1',photo:'reference.jpg',corners:[[0,0],[100,0],[100,100],[0,100]],u:[-5,5],y:[0,10]};
const ring=[[-5,0],[5,0],[5,5],[-5,5],[-5,0]];

test('clipping an obstructed photo leaves its original texture coordinates intact',()=>{
 const panel={...base,visibleY:[7,10]};
 assert.deepEqual(checkPanel(panel),[]);
 const group=createPhotoPanels([panel],{ringOf:()=>ring});
 const {position,uv}=group.children[0].geometry.attributes;
 for(let i=0;i<position.count;i++){
  assert.ok(position.getY(i)>=7&&position.getY(i)<=10,'foreground pixels never become wall geometry');
  assert.ok(Math.abs(uv.getY(i)-position.getY(i)/10)<1e-6,'upper windows retain their scale');
 }
 assert.equal(group.children.length,1,'clipping adds no draw calls');
});

test('visible photo range clips gable slopes and rejects invalid ranges',()=>{
 const outline=panelOutline({...base,shape:'gable',eave:6,visibleY:[8,10]});
 assert.ok(outline.every(([x,y])=>Math.abs(x)<=2.5&&y>=8&&y<=10));
 assert.ok(outline.some(([x,y])=>x===0&&y===10),'gable peak remains');
 for(const visibleY of [[-1,10],[0,11],[8,7],[7,7],[NaN,10],[0,Infinity],'7,10']){
  assert.ok(checkPanel({...base,visibleY}).some(e=>e.includes('visibleY')));
 }
});

test('Sumelius wall excludes the taxis, people and canopy roofs in its source photo', {skip:!fs.existsSync('public/cities/tampere')},()=>{
 const ref=JSON.parse(fs.readFileSync('cities/tampere/keskustori-reference.json'));
 const place=JSON.parse(fs.readFileSync('public/cities/tampere/places/keskustori.json'));
 const source=ref.photoPanels.find(p=>p.name==='sumelius-north');
 const shipped=place.photoPanels.find(p=>p.name===source.name);
 assert.deepEqual(shipped.visibleY,source.visibleY,'a place rebuild retains the crop');
 assert.ok(panelOutline(shipped).every(([,y])=>y>=11.3),'only unobstructed top storey appears');
 const front=JSON.parse(fs.readFileSync('public/cities/tampere/facades.json')).buildings[source.building];
 assert.equal(front.ground.type,'arcade','modeled arched storefront replaces the obstructed image');
});
