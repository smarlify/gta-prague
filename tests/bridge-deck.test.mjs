import test from 'node:test';
import assert from 'node:assert/strict';
import {createBridgeDeck,createKarluvMostDeck,isBridgeRoad,isKarluvMost} from '../src/bridge-deck.js';

test('bridge roads are detected from Silta / most labels',()=>{
 assert.equal(isBridgeRoad({kind:'Ajorata (Silta)',name:''}),true);
 assert.equal(isBridgeRoad({kind:'Ajorata',name:'most Legií'}),true);
 assert.equal(isBridgeRoad({kind:'Ajorata',name:'Národní'}),false);
});

test('createBridgeDeck builds merged deck meshes for a span over water',()=>{
 const road={
  id:'osm-way-1',name:'most Legií',kind:'Ajorata (Silta)',
  rings:[[[-20,-4],[20,-4],[20,4],[-20,4],[-20,-4]]],
  bbox:[-20,-4,20,4],
 };
 const mesh=createBridgeDeck([road],{
  groundAt:(x,z)=>Math.abs(x)<12?-8:0,
  inWater:(x)=>Math.abs(x)<12,
  limit:10,
 });
 assert.ok(mesh.children.length>=1);
 assert.ok(mesh.userData.bridges>=1);
 assert.ok(mesh.children.every(c=>c.isMesh));
});

test('Karlův most pavement gets a scenic deck mesh',()=>{
 assert.equal(isKarluvMost({name:'Karlův most'}),true);
 assert.equal(isKarluvMost({name:'most Legií'}),false);
 const mesh=createKarluvMostDeck([{
  id:'osm-way-kb',name:'Karlův most',kind:'Jalkakäytävä (Silta)',
  rings:[[[-40,-3],[40,-3],[40,3],[-40,3],[-40,-3]]],
  bbox:[-40,-3,40,3],
 }],{
  groundAt:(x)=>Math.abs(x)<25?-6:1,
  inWater:(x)=>Math.abs(x)<25,
 });
 assert.ok(mesh.userData.bridges>=1);
 assert.ok(mesh.children.length>=1);
});
