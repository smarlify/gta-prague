import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import {Scene,Box3,Color} from 'three';
import {MarketShop,STALL_KINDS,HANDOVER_SECONDS,marketActionPrompt,vendorSpot} from '../src/market-shop.js';
import {heldModel,disposeHeldModel,createMarketShopRenderer} from '../src/market-shop-renderer.js';
import {marketStallPlacements} from '../src/kauppatori.js';
import {PeopleInteraction} from '../src/people-interaction.js';
import {SpatialIndex} from '../src/geo.js';

const stand=(extra={})=>({id:'ice-stand',kind:'icecream',x:100,z:200,w:5.2,d:4.4,...extra});
const player=()=>({x:100,z:203.3,heading:0,speed:0,travelMode:'walk'});
function buyCone(id='soft-serve'){
 const shop=new MarketShop({stalls:[stand()]}),p=player();shop.update(0,p);shop.openAt(p);assert.equal(shop.buy(id).ok,true);shop.update(HANDOVER_SECONDS+.3,p);return {shop,p};
}
function watchResources(group){
 const resources=new Set();group.traverse(o=>{if(o.geometry)resources.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[])resources.add(m);});
 const disposed=new Map();for(const resource of resources)resource.addEventListener('dispose',()=>disposed.set(resource,(disposed.get(resource)||0)+1));
 return ()=>{for(const resource of resources)assert.equal(disposed.get(resource),1,'each private geometry/material is disposed exactly once');};
}

test('one existing Kauppatori canopy sells ice cream while the initial food stalls retain their menus', {skip:!fs.existsSync('public/data')},()=>{
 const city=JSON.parse(zlib.gunzipSync(fs.readFileSync('public/data/city.pack'))),stalls=marketStallPlacements(city),ice=stalls.filter(s=>s.kind==='icecream');
 assert.equal(ice.length,1);assert.deepEqual(stalls.slice(0,2).map(s=>s.kind),['soup','cafe']);
 assert.equal(ice[0].x,61.5625);assert.equal(ice[0].z,269.7916666666667);assert.equal(ice[0].w,5.2);assert.equal(ice[0].d,4.4,'existing canopy footprint');
 assert.deepEqual(STALL_KINDS.icecream.items.map(i=>i.id),['soft-serve','berry-cone','chocolate-cone']);
 for(const it of STALL_KINDS.icecream.items){assert.equal(it.encounter,'gulls');assert.equal(it.carry,'icecream');assert.equal(it.use,'eat');assert.ok(it.price>0);}
});

test('dropping a purchased cone removes only that hand, with no refund or eaten credit, and rejects stale events',()=>{
 const {shop,p}=buyCone(),held=shop.hand,money=shop.money,spent=shop.spent;
 assert.equal(held.state,'carry');assert.equal(shop.drop({hand:{...held}}).ok,false);assert.equal(shop.hand,held);
 const drop=shop.drop({hand:held,message:'The cone slipped.'});assert.equal(drop.hand,held);assert.equal(drop.item,held.item);assert.equal(drop.dropped,true);assert.equal(drop.message,'The cone slipped.');
 assert.equal(shop.hand,null);assert.equal(shop.money,money);assert.equal(shop.spent,spent);assert.deepEqual(shop.bag,[]);assert.deepEqual(shop.drainMessages(),[]);
 assert.equal(shop.drop({hand:held}).ok,false);shop.openAt(p);assert.equal(shop.buy('berry-cone').ok,true);const replacement=shop.hand;
 assert.equal(shop.drop({hand:held}).ok,false);assert.equal(shop.hand,replacement,'a late event cannot drop a new purchase');
 shop.update(HANDOVER_SECONDS+.3,p);shop.use();shop.update(.5,p);assert.equal(shop.hand.state,'using');shop.drop();assert.equal(shop.hand,null);assert.deepEqual(shop.drainMessages(),[],'partially eaten dropped food is not finished');
});

test('the existing action becomes Drop only during a chase, with keyboard and touch instructions',()=>{
 const {shop}=buyCone(),state=shop.snapshot();assert.equal(state.hand.encounter,'gulls');
 assert.match(marketActionPrompt(state,{encounter:{phase:'gather'}}).text,/^E · Eat/);
 const chase=marketActionPrompt(state,{encounter:{phase:'chase'}});assert.equal(chase.text,'E · Drop the ice cream');assert.equal(chase.intent,'drop');assert.match(chase.cue,/Shift/);
 const touch=marketActionPrompt(state,{coarse:true,encounter:{phase:'chase'}});assert.equal(touch.text,'Drop the ice cream');assert.match(touch.cue,/Run/);
 assert.equal(marketActionPrompt(state).cue,'');
 const handing={...state,hand:{...state.hand,state:'handover'},intent:null};assert.equal(marketActionPrompt(handing,{encounter:{phase:'chase'}}).text,'','stale chase does not offer a new cone before handover');
 const coffee={...state,hand:{...state.hand,encounter:null,name:'Coffee',use:'drink'}};assert.match(marketActionPrompt(coffee,{encounter:{phase:'chase'}}).text,/Drink/);
 shop.drop();assert.notEqual(marketActionPrompt(shop.snapshot(),{encounter:{phase:'chase'}}).intent,'drop');
});

test('an ice cream seller explains pehmis and the gull encounter, then opens the exact generic stall',()=>{
 const stall=stand({x:-750,z:880,facing:Math.PI/2}),spot=vendorSpot(stall),p={x:stall.x+stall.d/2+1,z:stall.z,heading:Math.PI/2,travelMode:'walk'};
 const actor={id:'seller-any-city',...spot,walking:false,talkable:true,speed:0,vendor:{stall,stallId:stall.id,kind:'icecream'}};
 const chat=new PeopleInteraction({buildings:new SpatialIndex([]),roads:new SpatialIndex([]),pavement:new SpatialIndex([]),water:[]});
 assert.equal(chat.interact(p,[actor],{enabled:true}).ok,true);assert.match(chat.snapshot().response,/pehmis.*soft-serve.*gulls/is);
 assert.equal(chat.choose('pehmis').ok,true);assert.match(chat.snapshot().response,/vanilla.*€4.50/);
 assert.equal(chat.choose('flavours').ok,true);assert.match(chat.snapshot().response,/berry.*chocolate/is);
 assert.equal(chat.choose('gulls').ok,true);assert.match(chat.snapshot().response,/run.*cone go.*eating/is);
 const action=chat.choose('shop');assert.equal(action.action.stallId,stall.id);assert.equal(chat.snapshot().active,false);
 const shop=new MarketShop({stalls:[stall]});shop.update(0,p);assert.equal(shop.openStall(action.action.stallId,p).ok,true);assert.equal(shop.buy('soft-serve').ok,true);chat.dispose();
});

test('held cones have a vanilla swirl or coloured scoop and remain attached to the player hand',()=>{
 for(const item of STALL_KINDS.icecream.items){
  const model=heldModel(item),bounds=new Box3().setFromObject(model);assert.ok(bounds.min.y<0&&bounds.max.y>.20,'the waffle cone straddles the grip and the ice cream rises above it');
  const cream=model.getObjectByName(item.flavour==='vanilla'?'Soft-serve swirl':`${item.flavour} scoop`);assert.ok(cream);assert.ok(cream.material.color.equals(new Color(item.color)));
  const assertDisposed=watchResources(model);disposeHeldModel(model);assertDisposed();
 }
 const scene=new Scene(),{shop,p}=buyCone(),renderer=createMarketShopRenderer(scene,shop.stalls),hand={x:101,y:1.35,z:203,heading:.6};
 renderer.update(.1,{shop,hand,viewer:p});const held=renderer.group.children.find(g=>g.name==='Held Pehmis soft serve');assert.ok(held?.visible);assert.equal(held.position.x,hand.x);assert.equal(held.position.z,hand.z);assert.ok(Math.abs(held.position.y-hand.y)<.06,'grip stays against the held hand');
 assert.equal(renderer.group.children.filter(g=>g.name==='Pehmis ice cream sign').length,1);assert.equal(renderer.vendors[0].vendor.kind,'icecream');renderer.dispose();assert.equal(scene.children.length,0);
});

test('one falling cone settles into a spill, reuses cloned records, and disposes on replacement, expiry and reset',()=>{
 const scene=new Scene(),renderer=createMarketShopRenderer(scene),item=STALL_KINDS.icecream.items[0],record={id:'drop-1',item,x:4,z:8,heading:.4,startY:1.55,age:0,life:3};
 renderer.update(.1,{dropped:record});const first=renderer.group.getObjectByName('Dropped ice cream'),assertFirstDisposed=watchResources(first),cone=first.getObjectByName('Held Pehmis soft serve'),height=cone.position.y;
 assert.ok(Math.abs(first.position.y+cone.position.y-(record.startY-.05))<1e-8,'a raised hand releases the cone at its carried grip height');
 renderer.update(.1,{dropped:{...record,item:{...item},age:.25}});assert.equal(renderer.group.getObjectByName('Dropped ice cream'),first,'snapshot copies do not allocate new geometry');assert.ok(cone.position.y<height&&cone.rotation.z<0);
 renderer.update(.1,{dropped:{...record,age:.6}});assert.equal(first.getObjectByName('Spilled ice cream').visible,true);assert.equal(renderer.group.children.filter(g=>g.name==='Dropped ice cream').length,1);
 const next={...record,id:'drop-2',item:STALL_KINDS.icecream.items[1]};renderer.update(.1,{dropped:next});assert.equal(first.parent,null);assertFirstDisposed();
 const second=renderer.group.getObjectByName('Dropped ice cream'),assertSecondDisposed=watchResources(second);renderer.update(.1,{dropped:{...next,age:3}});assert.equal(renderer.group.getObjectByName('Dropped ice cream'),undefined);assertSecondDisposed();
 renderer.update(.1,{dropped:record});const assertResetDisposed=watchResources(renderer.group.getObjectByName('Dropped ice cream'));renderer.reset();assertResetDisposed();
 renderer.update(.1,{dropped:record});const assertFinalDisposed=watchResources(renderer.group.getObjectByName('Dropped ice cream'));renderer.dispose();renderer.dispose();assertFinalDisposed();assert.equal(scene.children.length,0);
 renderer.update(.1,{dropped:record});assert.equal(scene.children.length,0,'a disposed renderer cannot recreate a dropped mesh');
});
