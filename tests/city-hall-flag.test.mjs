import test from 'node:test';
import assert from 'node:assert/strict';
import {CITY_HALL_FLAG,createCityHallFlag,isFinnishCross} from '../src/city-hall-flag.js';
test('Finnish flag has 11:18 proportions and correctly offset blue cross', {skip:'Finland city is not part of this build'},()=>{
 assert.ok(Math.abs(CITY_HALL_FLAG.width/CITY_HALL_FLAG.height-18/11)<1e-9);
 let blue=0;for(let x=0;x<18;x++)for(let y=0;y<11;y++)if(isFinnishCross((x+.5)/18,(y+.5)/11))blue++;
 assert.equal(blue,78);assert.equal(isFinnishCross(.1,.1),false);assert.equal(isFinnishCross(6/18,.1),true);assert.equal(isFinnishCross(.9,.5),true);
});
test('City Hall flag is attached, finite and bounded while its free edge waves', {skip:'Finland city is not part of this build'},()=>{
 const flag=createCityHallFlag(),p=flag.cloth.geometry.attributes.position,before=Array.from(p.array);
 flag.update(1,{x:flag.group.position.x,z:flag.group.position.z});
 assert.equal(flag.group.userData.buildingRatu,216);assert.equal(flag.group.children.length,4);
 assert.deepEqual(flag.group.userData.streetFlags,['Finland','Ukraine',null,null,null]);
 assert.equal(flag.group.userData.mastCount,6);assert.equal(flag.streetCloths.length,2);
 assert.ok(flag.group.position.x>30&&flag.group.position.x<45&&flag.group.position.z>230&&flag.group.position.z<240);
 assert.ok(p.array.every(Number.isFinite));assert.ok(p.array.some((v,i)=>v!==before[i]));
 for(let i=0;i<p.count;i++){if(p.getX(i)===0){assert.ok(p.getZ(i)===0);assert.equal(p.getY(i),before[i*3+1]);}assert.ok(Math.abs(p.getZ(i))<.31);}
 flag.update(2,{x:5000,z:5000});assert.equal(flag.group.visible,false);
 flag.update(3,{x:38,z:233});assert.equal(flag.group.visible,true);
});
