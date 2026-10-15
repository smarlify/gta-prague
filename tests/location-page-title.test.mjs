import test from 'node:test';
import assert from 'node:assert/strict';
import {locationPageTitle} from '../src/worldhood-brand.js';
import {pragueDistrictNumber,PRAGUE_AREAS} from '../src/area-caption.js';

// most Legií in local metres (origin 14.42125, 50.08747). Nearest anchor is Praha 1.
const MOST_LEGII={x:-683.5,z:619.5};
// Vltavská start, on the Holešovice (Praha 7) / Karlín (Praha 8) line.
const VLTAVSKA={x:1234.2,z:-1282.6};
const HOLESOVICE=PRAGUE_AREAS.find(a=>a.district.includes('Holešovice'));
const KARLIN=PRAGUE_AREAS.find(a=>a.district.includes('Karlín'));

test('the tab is GTA Praha, the district number, and the street',()=>{
 assert.equal(locationPageTitle({street:'most Legií',district:1}),'GTA Praha 1 - most Legií 🇨🇿');
 assert.equal(locationPageTitle({street:'Vltavská',district:8}),'GTA Praha 8 - Vltavská 🇨🇿');
 assert.equal(locationPageTitle(),'GTA Praha 🇨🇿');
 assert.equal(locationPageTitle({street:'',place:'PRAHA 1 - STARÉ MĚSTO'}),'GTA Praha 🇨🇿');
 assert.equal(locationPageTitle({street:'🚔 most Legií',district:'1'}),'GTA Praha 1 - most Legií 🇨🇿');
});

test('the Praha number comes from the nearest area anchor',()=>{
 assert.equal(pragueDistrictNumber(PRAGUE_AREAS,MOST_LEGII.x,MOST_LEGII.z),'1');
 assert.equal(pragueDistrictNumber(PRAGUE_AREAS,HOLESOVICE.x,HOLESOVICE.z),'7');
 assert.equal(pragueDistrictNumber(PRAGUE_AREAS,KARLIN.x,KARLIN.z),'8');
 // Vltavská's start is nearer Holešovice. A point nearer Karlín is Praha 8.
 assert.equal(pragueDistrictNumber(PRAGUE_AREAS,VLTAVSKA.x,VLTAVSKA.z),'7');
 assert.equal(pragueDistrictNumber(PRAGUE_AREAS,-682.48,-3347.94),'7');
 assert.equal(pragueDistrictNumber(PRAGUE_AREAS,-783.9,-5371.15),'8');
 assert.equal(pragueDistrictNumber(PRAGUE_AREAS,3730.54,-1727.92),'8');
 const dx=HOLESOVICE.x-KARLIN.x,dz=HOLESOVICE.z-KARLIN.z,len=Math.hypot(dx,dz);
 const karlSide={x:KARLIN.x+dx/len*200,z:KARLIN.z+dz/len*200};
 assert.equal(pragueDistrictNumber(PRAGUE_AREAS,karlSide.x,karlSide.z),'8');
 assert.equal(locationPageTitle({street:'most Legií',district:pragueDistrictNumber(PRAGUE_AREAS,MOST_LEGII.x,MOST_LEGII.z)}),'GTA Praha 1 - most Legií 🇨🇿');
 assert.equal(locationPageTitle({street:'Vltavská',district:pragueDistrictNumber(PRAGUE_AREAS,karlSide.x,karlSide.z)}),'GTA Praha 8 - Vltavská 🇨🇿');
});
