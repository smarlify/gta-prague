import test from 'node:test';
import assert from 'node:assert/strict';
import {keptPassage,skipHighwayWay,pointInPassage,stripBoredTunnels,isBoredTunnelRoad} from '../src/passage.js';

test('building_passage and covered ways are kept; bored tunnels are not',()=>{
 assert.equal(keptPassage({tunnel:'yes'}),null);
 assert.equal(keptPassage({tunnel:'building_passage'}),'building_passage');
 assert.equal(keptPassage({tunnel:'covered'}),'covered');
 assert.equal(keptPassage({covered:'yes'}),'covered');
 assert.equal(keptPassage({covered:'arcade',tunnel:'building_passage'}),'building_passage');
 assert.equal(keptPassage({}),null);
 assert.equal(keptPassage({tunnel:'no'}),null);
 assert.equal(keptPassage({tunnel:'culvert'}),null);
});

test('the highway loops drop bored tunnels and culverts, not covered passages',()=>{
 assert.equal(skipHighwayWay({tunnel:'yes'}),true);
 assert.equal(skipHighwayWay({tunnel:'building_passage'}),false);
 assert.equal(skipHighwayWay({covered:'yes'}),false);
 assert.equal(skipHighwayWay({tunnel:'culvert'}),true);
 assert.equal(skipHighwayWay({area:'yes'}),true);
 assert.equal(skipHighwayWay({highway:'proposed'}),true);
 assert.equal(skipHighwayWay({highway:'construction'},{graph:true}),false);
 assert.equal(skipHighwayWay({tunnel:'yes'},{graph:true}),true);
});

test('a point inside a passage polygon is in the dry volume',()=>{
 const passages=[{bbox:[0,0,10,4],rings:[[[0,0],[10,0],[10,4],[0,4],[0,0]]]}];
 assert.equal(pointInPassage(passages,5,2),true);
 assert.equal(pointInPassage(passages,20,2),false);
 assert.equal(pointInPassage([],1,1),false);
});

test('stripBoredTunnels removes bored road polygons and edges that run through them',()=>{
 assert.equal(isBoredTunnelRoad({passage:'yes'}),true);
 assert.equal(isBoredTunnelRoad({passage:'building_passage'}),false);
 const city={roads:[
  {id:'bore',passage:'yes',rings:[[[0,0],[20,0],[20,8],[0,8],[0,0]]],bbox:[0,0,20,8]},
  {id:'pass',passage:'building_passage',rings:[[[40,0],[50,0],[50,4],[40,4],[40,0]]],bbox:[40,0,50,4]},
  {id:'street',rings:[[[100,0],[120,0],[120,6],[100,6],[100,0]]],bbox:[100,0,120,6]},
 ]};
 const mobility={roads:{nodes:[[0,0],[20,4],[100,3]],edges:[
  {from:0,to:1,points:[[2,4],[18,4]],length:16},
  {from:1,to:2,points:[[100,3],[120,3]],length:20},
 ]},walks:{nodes:[],edges:[{from:0,to:1,points:[[3,3],[10,3]],length:7}]}};
 const out=stripBoredTunnels(city,mobility);
 assert.equal(out.removed,1);
 assert.deepEqual(out.city.roads.map(r=>r.id),['pass','street']);
 assert.equal(out.mobility.roads.edges.length,1);
 assert.deepEqual(out.mobility.roads.edges[0].points,[[100,3],[120,3]]);
 assert.equal(out.mobility.walks.edges.length,0);
});
