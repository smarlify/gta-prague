import test from 'node:test';
import assert from 'node:assert/strict';
import {createGameResilience} from '../src/game-resilience.js';
import {createLoadingScreen} from '../src/loading-screen.js';

class Element extends EventTarget{
 constructor(){super();this.classes=new Set();this.classList={add:(...names)=>names.forEach(n=>this.classes.add(n)),remove:(...names)=>names.forEach(n=>this.classes.delete(n)),contains:name=>this.classes.has(name)};this.attributes=new Map();this.style={};this.hidden=false;this.inert=false;this.disabled=true;}
 setAttribute(key,value){this.attributes.set(key,value);}
 removeAttribute(key){this.attributes.delete(key);}
 contains(target){return target===this;}
 focus(){this.focused=true;}
}
function setup(){
 const elements=new Map(['world','intro','start-btn','load-fill','load-percent','load-detail','boot-title','boot-loader','boot-launch','start-label'].map(id=>[id,new Element()]));
 const progress=new Element(),enter=new Element(),dialog={close(){this.closed=true;}},body=new Element();
 elements.get('intro').querySelector=selector=>selector==='[role="progressbar"]'?progress:enter;
 const doc={getElementById:id=>elements.get(id),body,querySelectorAll:()=>[dialog]},win=new EventTarget();let reloads=0;
 const screen=createLoadingScreen(doc),guard=createGameResilience({win,doc,screen,reload:()=>reloads++,log:()=>{}});
 const emit=(target,type,properties={})=>{const event=new Event(type,{cancelable:true});for(const [key,value] of Object.entries(properties))Object.defineProperty(event,key,{value});target.dispatchEvent(event);return event;};
 return {elements,progress,enter,dialog,body,doc,win,screen,guard,emit,reloads:()=>reloads};
}

test('graphics loss reveals an entered loading screen, stops once, and waits for a deliberate reload',()=>{
 const s=setup();let stops=0;s.guard.onStop(()=>stops++);s.screen.ready();s.screen.enter();
 const lost=s.emit(s.elements.get('world'),'webglcontextlost');
 assert.equal(lost.defaultPrevented,true);assert.equal(s.guard.stopped,true);assert.equal(stops,1);
 const intro=s.elements.get('intro');assert.equal(intro.inert,false);assert.equal(intro.classList.contains('gone'),false);assert.equal(intro.classList.contains('failed'),true);assert.equal(s.dialog.closed,true);
 assert.match(s.elements.get('load-detail').textContent,/graphics connection/);assert.equal(s.progress.hidden,true);assert.equal(s.reloads(),0);
 s.emit(s.elements.get('world'),'webglcontextrestored');assert.match(s.elements.get('load-detail').textContent,/available again/);assert.equal(s.guard.stopped,true);assert.equal(s.reloads(),0);
 // A late ready/progress callback from loading another asset must not conceal recovery.
 createLoadingScreen(s.doc).ready('Late successful tile');s.screen.progress(90,'Still loading');s.screen.enter();
 assert.equal(intro.classList.contains('gone'),false);assert.equal(s.elements.get('boot-title').textContent,'Ready to restart');
 s.emit(s.win,'click',{target:s.elements.get('start-btn')});assert.equal(s.reloads(),1);assert.equal(stops,1);s.guard.dispose();
});

test('unsupported WebGL has clear recovery and no automatic retry loop',()=>{
 const s=setup();assert.equal(s.guard.fail(new Error('Error creating WebGL context.'),'startup'),true);
 assert.match(s.elements.get('load-detail').textContent,/hardware acceleration/);assert.equal(s.elements.get('boot-title').textContent,'3D graphics unavailable');assert.equal(s.reloads(),0);
 assert.equal(s.guard.fail(new Error('Repeated renderer failure')),false);assert.equal(s.reloads(),0);
 s.emit(s.win,'keydown',{code:'Enter',repeat:true});assert.equal(s.reloads(),0);
 s.emit(s.win,'keydown',{code:'Enter',repeat:false});assert.equal(s.reloads(),1);s.guard.dispose();
});

test('uncaught errors stop gameplay, optional resource errors do not, and failure blocks input handlers',()=>{
 const s=setup();s.emit(s.win,'error');assert.equal(s.guard.stopped,false);
 let moves=0;s.win.addEventListener('keydown',()=>moves++);s.emit(s.win,'keydown',{code:'KeyW'});assert.equal(moves,1);
 s.emit(s.win,'unhandledrejection',{reason:new Error('Frame invariant failed')});assert.equal(s.guard.stopped,true);
 assert.deepEqual(s.win.worldhoodFailure,{kind:'runtime',message:'Frame invariant failed'});
 s.emit(s.win,'keydown',{code:'KeyW'});assert.equal(moves,1);assert.equal(s.reloads(),0);
 let lateStop=0;s.guard.onStop(()=>lateStop++);assert.equal(lateStop,1);s.guard.dispose();
});

test('Permissions-Policy sensor denials from a sandboxed iframe do not stop the game',()=>{
 const s=setup();
 s.emit(s.win,'error',{error:new Error('Permissions policy violation: accelerometer is not allowed in this document.'),message:'Permissions policy violation: accelerometer is not allowed in this document.'});
 assert.equal(s.guard.stopped,false);
 s.emit(s.win,'unhandledrejection',{reason:new Error('Permissions policy violation: gyroscope is not allowed in this document.')});
 assert.equal(s.guard.stopped,false);
 s.guard.dispose();
});
