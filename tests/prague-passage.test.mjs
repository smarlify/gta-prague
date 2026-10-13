import test from 'node:test';
import assert from 'node:assert/strict';
import {keptPassage,skipHighwayWay,pointInPassage} from '../src/passage.js';

test('tunnel, building_passage and covered ways are kept',()=>{
 assert.equal(keptPassage({tunnel:'yes'}),'yes');
 assert.equal(keptPassage({tunnel:'building_passage'}),'building_passage');
 assert.equal(keptPassage({tunnel:'covered'}),'covered');
 assert.equal(keptPassage({covered:'yes'}),'covered');
 assert.equal(keptPassage({covered:'arcade',tunnel:'building_passage'}),'building_passage');
 assert.equal(keptPassage({}),null);
 assert.equal(keptPassage({tunnel:'no'}),null);
 assert.equal(keptPassage({tunnel:'culvert'}),null);
});

test('the highway loops drop culverts and proposed roads, not the Karlovy lázně passage',()=>{
 assert.equal(skipHighwayWay({tunnel:'yes'}),false);
 assert.equal(skipHighwayWay({tunnel:'building_passage'}),false);
 assert.equal(skipHighwayWay({covered:'yes'}),false);
 assert.equal(skipHighwayWay({tunnel:'culvert'}),true);
 assert.equal(skipHighwayWay({area:'yes'}),true);
 assert.equal(skipHighwayWay({highway:'proposed'}),true);
 assert.equal(skipHighwayWay({highway:'construction'},{graph:true}),false);
 assert.equal(skipHighwayWay({tunnel:'yes'},{graph:true}),false);
});

test('a point inside a passage polygon is in the dry volume',()=>{
 const passages=[{bbox:[0,0,10,4],rings:[[[0,0],[10,0],[10,4],[0,4],[0,0]]]}];
 assert.equal(pointInPassage(passages,5,2),true);
 assert.equal(pointInPassage(passages,20,2),false);
 assert.equal(pointInPassage([],1,1),false);
});
