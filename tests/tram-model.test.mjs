import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import * as THREE from 'three';
import {createArticModules,drawSignRow,destinationLines,ARTIC_PROFILE,SIGN_REGIONS,SIGN_ATLAS,SIGN_WHITE_UV,TRAM_DISPLAYS} from '../src/tram-model.js';
import {createTramRenderer} from '../src/trams.js';
import {TramSimulation,TRAM_DIMENSIONS} from '../src/tram-simulation.js';
const bounds=g=>{g.computeBoundingBox();return g.boundingBox;};
test('Artic modules carry see-through glazing, an interior and lettering within the spec envelope',()=>{
 const modules=createArticModules();assert.equal(modules.length,3);
 for(const [i,m] of modules.entries()){
  for(const k of ['paint','glass','interior','lit'])assert.ok(m[k]?.attributes.position.count>0,`module ${i} has ${k}`);
  for(const g of Object.values(m).filter(Boolean))assert.ok(g.attributes.position.array.every(Number.isFinite));
  const b=bounds(m.paint),half=TRAM_DIMENSIONS.sections[i]/2,reach=i===1?TRAM_DIMENSIONS.width/2+.02:1.36;
  assert.ok(b.max.x<=reach&&b.min.x>=-reach,'body stays within 2.4 m (cab modules add camera-mirror stubs)');
  assert.ok(b.min.z>=-half-.35&&b.max.z<=half+.05,'module stays within its articulated length');
  const roof=bounds(m.paint.clone().translate(0,.12,0));if(i>0)assert.ok(roof.max.y<=TRAM_DIMENSIONS.height+.001,'roof equipment within 3.83 m');
  const interior=bounds(m.interior);assert.ok(interior.max.x<1.2&&interior.min.y>=ARTIC_PROFILE.floor-.1,'interior sits inside the shell');
 }
 // Lettering rides in the lamp batch: lamps sample the white atlas texel, signs their own region.
 // Triangle centroids of the lettering quads (lamps sit exactly on the white texel).
 const signUvs=m=>{const uv=m.lit.attributes.uv,out=[];for(let i=0;i+2<uv.count;i+=3){const u=(uv.getX(i)+uv.getX(i+1)+uv.getX(i+2))/3,v=(uv.getY(i)+uv.getY(i+1)+uv.getY(i+2))/3;if(Math.abs(u-SIGN_WHITE_UV[0])>1e-6||Math.abs(v-SIGN_WHITE_UV[1])>1e-6)out.push([u,v]);}return out;};
 assert.equal(signUvs(modules[1]).length,0,'middle module carries no lettering');
 const inRegion=(name,[u,v])=>{const r=SIGN_REGIONS[name],w=SIGN_ATLAS.width,h=SIGN_ATLAS.rowHeight;return u>=r.x[0]/w-1e-6&&u<=r.x[1]/w+1e-6&&v>=1-r.y[1]/h-1e-6&&v<=1-r.y[0]/h+1e-6;};
 const front=signUvs(modules[0]),rear=signUvs(modules[2]);
 assert.equal(front.filter(uv=>inRegion('display',uv)).length,4,'front destination display and kerb-side display (two quads)');
 assert.equal(front.filter(uv=>inRegion('line',uv)).length,4,'line number in both first side windows');
 assert.ok(front.some(uv=>inRegion('fleet',uv))&&front.some(uv=>inRegion('livery',uv)));
 assert.equal(rear.length,2,'rear cab shows only the line number');assert.ok(rear.every(uv=>inRegion('line',uv)));
 for(const m of modules)assert.ok(m.lit.attributes.uv.array.every(Number.isFinite));
 // The front display sits just proud of the raked windscreen (0-8 cm along its
 // whole height) so the tinted glass does not dim it.
 const pos=modules[0].lit.attributes.position,uv=modules[0].lit.attributes.uv,screen=modules[0].glass.attributes.position;
 let lo=null,hi=null;for(let i=0;i<screen.count;i++){const x=screen.getX(i),y=screen.getY(i),z=screen.getZ(i);if(Math.abs(x)>.05||z>0)continue;if(y<1.5)lo=[y,z];else if(y>2.5)hi=[y,z];}
 assert.ok(lo&&hi,'windscreen centre line found');let checked=0;
 for(let i=0;i<pos.count;i++){if(!inRegion('display',[uv.getX(i),uv.getY(i)])||Math.abs(pos.getX(i))>1.05)continue;checked++;
  const y=pos.getY(i),glassZ=lo[1]+(hi[1]-lo[1])*(y-lo[0])/(hi[0]-lo[0]),gap=glassZ-pos.getZ(i);assert.ok(gap>0&&gap<.08,`display corner ${gap.toFixed(3)} m in front of the windscreen`);}
 assert.equal(checked,6);
 assert.ok(TRAM_DISPLAYS.front[0]>=1.9&&TRAM_DISPLAYS.front[1]>=.45,'front display is large enough to read from the road');
 const glass=modules[1].glass.attributes.position;let right=0,left=0;for(let i=0;i<glass.count;i++){const x=glass.getX(i);if(x>1)right++;if(x<-1)left++;}
 assert.ok(right>left,'plug doors are glazed on the kerb (right) side only');
});
test('six Artic trams render as a fixed set of instanced batches', {skip:'Finland city is not part of this build'},()=>{
 const data=JSON.parse(readFileSync('public/data/trams.json'));
 const sim=new TramSimulation(data,{buildings:{at:()=>undefined},roads:{at:()=>true},pavement:{at:()=>true}});sim.reset({x:0,z:117.7});
 const scene=new THREE.Scene(),renderer=createTramRenderer(scene,sim);renderer.update({x:0,z:117.7});
 const meshes=renderer.kinds.flat();assert.ok(meshes.every(m=>m.isInstancedMesh));assert.equal(meshes.length,15,`draw batches ${meshes.length}`); // 4 per module + animated passengers
 const visible=sim.trams.filter(t=>Math.hypot(t.x,t.z-117.7)<470).length;assert.ok(visible>=4);
 for(const m of meshes)assert.equal(m.count,visible);
 const glass=meshes.find(m=>/glass/.test(m.name));assert.ok(glass.material.transparent&&glass.material.opacity<.6,'windows are see-through');
 assert.equal(glass.castShadow,false);
 const lit=meshes.find(m=>/module 2 lit/.test(m.name));assert.ok(lit.geometry.attributes.signRow,'rear module lettering selects its atlas row');
});
// A recording 2D context: enough of the canvas API for drawSignRow.
function stubContext(){const calls=[];const ctx={calls,font:'',fillStyle:'',textAlign:'',textBaseline:'',shadowBlur:0,shadowColor:'',lineWidth:0,strokeStyle:'',
 measureText(t){const px=parseFloat(ctx.font.match(/(\d+)px/)?.[1]||'0');return {width:t.length*px*.58};},
 fillText(t,x,y,max){calls.push({t:String(t),x,y,max,font:ctx.font,fill:ctx.fillStyle,align:ctx.textAlign});},
 fillRect(){},clearRect(){},save(){},restore(){},beginPath(){},arc(){},stroke(){}};return ctx;}
test('the LED display rows carry the real line and destination, splitting long names over two lines',()=>{
 const ctx=stubContext();drawSignRow(ctx,3,{line:'4',destination:'Munkkiniemi',fleet:429});
 const amber=ctx.calls.filter(c=>c.fill==='#ffbe46');
 assert.ok(amber.some(c=>c.t==='4'&&c.align==='right'&&/132px/.test(c.font)),'line number large at the left of the display');
 const dest=amber.filter(c=>c.t==='Munkkiniemi');assert.ok(dest.length>=2&&dest.every(c=>c.align==='left'&&parseFloat(c.font.match(/(\d+)px/)[1])>=80));
 const y=3*SIGN_ATLAS.rowHeight;assert.ok(dest.every(c=>c.y>y&&c.y<y+SIGN_ATLAS.rowHeight),'drawn in row 3');
 assert.ok(amber.some(c=>c.t==='4'&&c.align==='center'),'line-number display for rear and side windows');
 assert.ok(ctx.calls.some(c=>c.t==='429'&&c.fill==='#eef0f2')&&ctx.calls.some(c=>c.t==='429'&&c.fill==='#d9ab3c'),'fleet number front (white) and side (yellow)');
 const two=destinationLines(stubContext(),'Meilahden sairaala',446);assert.deepEqual(two.lines,['Meilahden','sairaala']);assert.ok(two.px>=50);
 assert.deepEqual(destinationLines(stubContext(),'Eira',446).lines,['Eira']);
 assert.deepEqual(destinationLines(stubContext(),'Pikku Huopalahti',446).lines,['Pikku','Huopalahti']);
});
