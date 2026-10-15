import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {createBreakableSigns} from './breakable-signs.js';
import {createKnockables} from './knockables.js';
import {signalGreen} from './mobility.js';
import {groundAt} from './terrain.js';
import {signFace,drawSignFace,PLATE_SIZE} from './sign-faces.js';

// Street furniture placed from a city's furniture.json (built by scripts/mapillary-features.mjs from
// detections in street-level photos, merged with official sign, signal and stop registers by
// scripts/digiroad-signs.mjs): lamp posts, traffic lights, sign posts and utility poles bend or snap
// when hit (breakable-signs.js); bins, barriers and cones are knocked over (knockables.js); junction
// boxes, benches, bike racks, hydrants and stop shelters are solid. Works for any city that ships the file.
// Posts are merged per 250 m chunk (two draw calls each: painted parts and sign plates) and chunks beyond
// view range are not drawn; everything else is one InstancedMesh per kind.
export const CHUNK=250,VIEW_RANGE=380,SIGNAL_RANGE=350;
export const POSTS={
 lamp:{height:8.4,radius:.09,strength:2.6},
 'traffic-light':{height:3.45,radius:.085,strength:1.8},
 'crossing-light':{height:2.9,radius:.075,strength:1.6},
 sign:{height:3,radius:.04,strength:1},
 pole:{height:8.5,radius:.14,strength:3.2},
 'parking-meter':{height:1.55,radius:.1,strength:1.3},
};
export const SOLIDS={'junction-box':[.85,.42,1.3],bench:[1.8,.6,.85],'bike-rack':[2.4,.55,.8],hydrant:[.36,.36,.8],shelter:[3.6,1.5,2.5]}; // width, depth, height
// A stable id per object: Mapillary feature id, else its source and place in the file.
const itemId=(it,i)=>`mapped-${it.k}-${it.mly?.[0]??`${it.src||'item'}-${i}`}`;
export const KNOCKABLE={bin:{radius:.26},barrier:{radius:.35},cone:{radius:.2}};

// Plates on one sign post: grouped by facing, each group stacked down from the top, complementary plates last.
export function plateLayout(faces,yaws,top=2.95,gap=.07){
 const groups=[],out=[];
 faces.forEach((face,i)=>{const yaw=yaws?.[i]??0,g=groups.find(g=>Math.abs(Math.atan2(Math.sin(g.yaw-yaw),Math.cos(g.yaw-yaw)))<1.05);if(g)g.faces.push(face);else groups.push({yaw,faces:[face]});});
 for(const g of groups){let y=top;for(const face of g.faces){const [w,h]=PLATE_SIZE[signFace(face.code??face).shape]||[.64,.64];out.push({face:face.face??face,yaw:g.yaw,y:y-h/2,width:w,height:h});y-=h+gap;}}
 return out;
}

// Vertex-coloured, non-indexed geometry so every painted part merges into one mesh.
function paint(g,hex){
 if(g.index){const o=g;g=o.toNonIndexed();o.dispose();}g.deleteAttribute('uv');
 const c=new THREE.Color(hex),n=g.attributes.position.count,a=new Float32Array(n*3);for(let i=0;i<n;i++)a.set([c.r,c.g,c.b],i*3);
 g.setAttribute('color',new THREE.BufferAttribute(a,3));return g;
}
const cyl=(r0,r1,h,y,hex,seg=7)=>paint(new THREE.CylinderGeometry(r0,r1,h,seg).translate(0,y,0),hex);
const box=(w,h,d,x,y,z,hex)=>paint(new THREE.BoxGeometry(w,h,d).translate(x,y,z),hex);
const METAL='#7d8689',DARK='#1d2629',WOOD='#5c4a3a';

// Post templates in local space: base at the origin, facing +Z (lamp arms reach towards +Z, over the road).
function postParts(kind){
 if(kind==='lamp')return [cyl(.055,.1,8.4,4.2,METAL),box(.07,.07,1.5,0,8.3,.72,METAL),box(.26,.1,.6,0,8.27,1.5,'#3a4245'),box(.2,.02,.5,0,8.21,1.5,'#f2efe0')];
 if(kind==='traffic-light')return [cyl(.065,.085,3.4,1.7,'#566166',6),box(.27,.8,.23,0,3.1,.05,DARK)];
 if(kind==='crossing-light')return [cyl(.06,.075,2.85,1.42,'#566166',6),box(.25,.56,.2,0,2.5,.05,DARK)];
 if(kind==='pole')return [cyl(.11,.14,8.5,4.25,WOOD),box(1.4,.08,.08,0,7.9,0,WOOD)];
 if(kind==='parking-meter')return [cyl(.04,.045,1.1,.55,'#4a5255'),box(.24,.38,.2,0,1.3,0,'#2b5d8f')];
 return [];
}
const LENSES={'traffic-light':[[3.35,'red'],[3.1,'amber'],[2.85,'green']],'crossing-light':[[2.62,'red'],[2.38,'green']]};
const LENS_ON={red:'#ff392b',amber:'#ffb43a',green:'#47ec9b'},LENS_OFF={red:'#382927',amber:'#3a3322',green:'#233a32'};

// Sign atlas: every face used by the city, front and a grey back silhouette, drawn once on a canvas.
function signAtlas(faces,cell=128){
 const cols=16,rows=Math.max(1,Math.ceil(faces.length*2/cols)),canvas=document.createElement('canvas');canvas.width=cols*cell;canvas.height=rows*cell;
 const c=canvas.getContext('2d'),uv=new Map();
 faces.forEach(({face,code},i)=>{
  const spec=signFace(code||face);
  for(const back of [0,1]){const k=i*2+back,x=(k%cols)*cell,y=Math.floor(k/cols)*cell;
   c.save();c.beginPath();c.rect(x,y,cell,cell);c.clip();drawSignFace(c,spec,x+2,y+2,cell-4,cell-4);
   if(back){c.globalCompositeOperation='source-atop';c.fillStyle='#8f989b';c.fillRect(x,y,cell,cell);}c.restore();
   uv.set(`${face}:${back}`,[x/canvas.width,1-(y+cell)/canvas.height,cell/canvas.width,cell/canvas.height]);}
 });
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;
 return {texture,uv};
}
function plateGeometry(size,rect){
 const g=new THREE.PlaneGeometry(size,size),uv=g.attributes.uv;
 for(let i=0;i<uv.count;i++)uv.setXY(i,rect[0]+uv.getX(i)*rect[2],rect[1]+uv.getY(i)*rect[3]);
 g.deleteAttribute('normal');g.computeVertexNormals();return g.toNonIndexed();
}

export function createMappedFurniture(layer,{player=()=>null,mobility=()=>null,night=()=>false,canvas=globalThis.document}={}){
 const group=new THREE.Group();group.name='Mapped street furniture';
 const items=layer?.items||[],obstacles=[],chunks=new Map(),lights=[],streetLamps=[];
 const painted=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.6,metalness:.2});
 const atlas=canvas&&layer.faces?.length?signAtlas(layer.faces):null;
 const plates=new THREE.MeshStandardMaterial({map:atlas?.texture||null,alphaTest:.5,roughness:.55,side:THREE.FrontSide});
 const templates=new Map(),m4=new THREE.Matrix4(),q=new THREE.Quaternion(),UP=new THREE.Vector3(0,1,0),one=new THREE.Vector3(1,1,1),zero=new THREE.Vector3(),v=new THREE.Vector3();
 const chunkOf=(x,z)=>{const key=`${Math.floor(x/CHUNK)},${Math.floor(z/CHUNK)}`;
  if(!chunks.has(key)){const signs=createBreakableSigns(`Mapped furniture posts ${key}`),g=new THREE.Group();g.name='Mapped furniture chunk';group.add(g);
   chunks.set(key,{key,group:g,signs,painted:[],plates:[],centre:[(Math.floor(x/CHUNK)+.5)*CHUNK,(Math.floor(z/CHUNK)+.5)*CHUNK]});}
  return chunks.get(key);};
 const place=(geometry,x,z,yaw,chunk,i,list)=>{geometry.applyMatrix4(m4.compose(v.set(x,groundAt(x,z),z),q.setFromAxisAngle(UP,yaw),one));chunk.signs.tag(geometry,i);list.push(geometry);};

 // Breakable posts.
 items.forEach((it,index)=>{const spec=POSTS[it.k];if(!spec)return;
  const chunk=chunkOf(it.x,it.z),yaw=it.yaw||0;let height=spec.height;
  const layout=it.k==='sign'?plateLayout((it.faces||[]).map(face=>({face,code:layer.faces.find(f=>f.face===face)?.code})),it.yaws):[];
  if(layout.length)height=Math.max(...layout.map(p=>p.y+p.height/2))+.05;
  const i=chunk.signs.post({id:itemId(it,index),x:it.x,z:it.z,y:groundAt(it.x,it.z),yaw,height,radius:spec.radius,strength:spec.strength});
  if(it.k==='sign')place(cyl(.031,.031,height,height/2,'#929b9d',6),it.x,it.z,0,chunk,i,chunk.painted);
  else{if(!templates.has(it.k))templates.set(it.k,mergeGeometries(postParts(it.k)));place(templates.get(it.k).clone(),it.x,it.z,yaw,chunk,i,chunk.painted);}
  for(const p of layout){const rect=atlas?.uv.get(`${p.face}:0`),back=atlas?.uv.get(`${p.face}:1`);if(!rect)continue;const size=Math.max(p.width,p.height);
   const front=plateGeometry(size,rect);front.translate(0,p.y,.045);place(front,it.x,it.z,p.yaw,chunk,i,chunk.plates);
   const rear=plateGeometry(size,back);rear.rotateY(Math.PI);rear.translate(0,p.y,.035);place(rear,it.x,it.z,p.yaw,chunk,i,chunk.plates);}
  if(LENSES[it.k])lights.push({x:it.x,z:it.z,yaw,kind:it.k,post:chunk.signs.bodies[i],edge:undefined});
  if(it.k==='lamp')streetLamps.push({x:it.x,z:it.z,yaw,post:chunk.signs.bodies[i],chunk});
 });
 for(const chunk of chunks.values()){
  if(chunk.painted.length){const m=chunk.signs.mesh(mergeGeometries(chunk.painted),painted);m.name='Mapped furniture posts';chunk.group.add(m);}
  if(chunk.plates.length){const m=chunk.signs.mesh(mergeGeometries(chunk.plates),plates,{castShadow:false});m.name='Mapped sign plates';chunk.group.add(m);}
  [...chunk.painted,...chunk.plates].forEach(g=>g.dispose());chunk.painted=chunk.plates=null;
  chunk.group.add(chunk.signs.finish());
 }
 for(const g of templates.values())g.dispose();

 // Signal lenses: one instanced disc per lens, lit from the nearest signalled approach the head faces.
 const lensCount=lights.reduce((n,l)=>n+LENSES[l.kind].length,0);let lenses=null;
 if(lensCount){
  const g=new THREE.CircleGeometry(.08,10);lenses=new THREE.InstancedMesh(g,new THREE.MeshBasicMaterial(),lensCount);lenses.name='Mapped signal lenses';lenses.frustumCulled=false;group.add(lenses);
  let k=0;for(const l of lights){l.lens=k;l.shown=false;k+=LENSES[l.kind].length;}
  m4.makeScale(0,0,0);for(let i=0;i<lensCount;i++)lenses.setMatrixAt(i,m4);
 }
 function signalEdge(l,roads){
  // The head faces oncoming traffic: the approach that ends near it and travels towards its face.
  const fx=Math.sin(l.yaw),fz=Math.cos(l.yaw);let best=null,score=Infinity;
  for(const e of roads.edges){if(e.signal<0||e.points.length<2)continue;const a=e.points.at(-2),b=e.points.at(-1),d=Math.hypot(b[0]-l.x,b[1]-l.z);if(d>35)continue;
   const len=Math.hypot(b[0]-a[0],b[1]-a[1])||1,facing=((b[0]-a[0])*fx+(b[1]-a[1])*fz)/len,s=d+12*(1+facing);if(s<score){score=s;best=e;}}
  return best;
 }
 const colour=new THREE.Color();
 function updateLenses(p){
  if(!lenses)return;const sim=mobility();let moved=false,coloured=false;
  for(const l of lights){
   const show=!!p&&l.post.state==='upright'&&Math.abs(l.x-p.x)<SIGNAL_RANGE&&Math.abs(l.z-p.z)<SIGNAL_RANGE;
   if(show!==l.shown){l.shown=show;moved=true;
    LENSES[l.kind].forEach(([y],j)=>{m4.compose(v.set(l.x+Math.sin(l.yaw)*.18,y+groundAt(l.x,l.z),l.z+Math.cos(l.yaw)*.18),q.setFromAxisAngle(UP,l.yaw),show?one:zero);lenses.setMatrixAt(l.lens+j,m4);});}
   if(!show)continue;
   if(l.edge===undefined&&sim?.roads)l.edge=signalEdge(l,sim.roads);
   // Vehicle heads show the approach's phase; pedestrian heads show the opposite.
   const green=l.edge&&sim?signalGreen(l.edge,sim.time):null,go=l.kind==='crossing-light'&&green!==null?!green:green;
   LENSES[l.kind].forEach(([,c],j)=>{lenses.setColorAt(l.lens+j,colour.set((c==='red'&&go===false)||(c==='green'&&go===true)||(c==='amber'&&go===null)?LENS_ON[c]:LENS_OFF[c]));});coloured=true;
  }
  if(moved)lenses.instanceMatrix.needsUpdate=true;if(coloured&&lenses.instanceColor)lenses.instanceColor.needsUpdate=true;
 }

 // The cream lamp head is merged into the post, so it cannot glow on its own. One unlit bulb
 // sits on that head, inside the same view range, and only after dark. No point lights.
 let bulbs=null;
 if(streetLamps.length){
  bulbs=new THREE.InstancedMesh(new THREE.SphereGeometry(.16,8,6),new THREE.MeshBasicMaterial({color:'#fff1c8',toneMapped:false,fog:false}),streetLamps.length);
  bulbs.name='Street lamp bulbs';bulbs.frustumCulled=false;bulbs.count=0;bulbs.castShadow=bulbs.receiveShadow=false;group.add(bulbs);
 }
 function updateStreetLamps(p){
  if(!bulbs)return;
  const on=!!(p&&night());let n=0;
  if(on)for(const lamp of streetLamps){
   if(!lamp.chunk.group.visible||lamp.post.state!=='upright')continue;
   if(Math.hypot(lamp.x-p.x,lamp.z-p.z)>VIEW_RANGE)continue;
   const yaw=lamp.yaw;m4.compose(v.set(lamp.x+Math.sin(yaw)*1.5,8.21+groundAt(lamp.x,lamp.z),lamp.z+Math.cos(yaw)*1.5),q.setFromAxisAngle(UP,yaw),one);bulbs.setMatrixAt(n++,m4);
  }
  if(bulbs.count!==n||n){bulbs.count=n;bulbs.instanceMatrix.needsUpdate=true;}
 }

 // Knockable light items and solid boxes.
 const knock=[];
 const binParts=()=>[cyl(.028,.028,.55,.275,'#5b615f',6),cyl(.215,.2,.68,.86,'#3a4541',10),cyl(.23,.215,.06,1.22,'#2f3836',10)];
 const barrierParts=()=>[box(1.2,.05,.4,0,.03,0,'#2b2f30'),box(.05,1,.05,-.55,.5,0,'#c9ccc8'),box(.05,1,.05,.55,.5,0,'#c9ccc8'),box(1.2,.2,.03,0,.85,0,'#df4732'),box(1.2,.2,.03,0,.55,0,'#f5f5ef')];
 const coneParts=()=>[box(.34,.04,.34,0,.02,0,'#1d2022'),cyl(.03,.15,.68,.36,'#f06a2a',10),cyl(.075,.105,.12,.42,'#f5f5ef',10)];
 for(const [kind,parts] of [['bin',binParts],['barrier',barrierParts],['cone',coneParts]]){
  const list=items.filter(i=>i.k===kind);if(!list.length)continue;
  const g=mergeGeometries(parts());g.computeVertexNormals();
  const k=createKnockables(list.map((it,i)=>({id:itemId(it,i),x:it.x,z:it.z,yaw:it.yaw||0})),[{geometry:g,material:painted}],KNOCKABLE[kind]);
  k.group.name=`Mapped ${kind}s`;group.add(k.group);knock.push(k);
 }
 const solidParts={'junction-box':([w,d,h])=>[box(w,h,d,0,h/2,0,'#8a9086'),box(w+.04,.05,d+.04,0,h+.02,0,'#6d736a')],
  bench:([w,d,h])=>[box(w,.06,.42,0,.45,.05,'#7a5a3e'),box(w,.4,.05,0,.75,-.18,'#7a5a3e'),box(.06,.45,.45,-w/2+.12,.22,0,'#2d3133'),box(.06,.45,.45,w/2-.12,.22,0,'#2d3133')],
  'bike-rack':([w,d,h])=>Array.from({length:5},(_,i)=>box(.04,h,d,-w/2+.2+i*(w-.4)/4,h/2,0,'#8e979a')),
  hydrant:([w,,h])=>[cyl(w*.4,w*.45,h,h/2,'#b8322a',8),cyl(w*.5,w*.5,.08,h,'#b8322a',8)],
  // Stop shelter, open towards the road (+Z): steel frame, roof, back and side glass, a bench and an advert panel at one end.
  shelter:([w,d,h])=>[...[-w/2+.05,w/2-.05].flatMap(x=>[box(.08,h,.08,x,h/2,-d/2+.06,'#3e4a4f'),box(.08,h,.08,x,h/2,d/2-.12,'#3e4a4f')]),box(w+.2,.12,d+.25,0,h+.06,0,'#4a565b'),
   box(w-.1,h-.35,.03,0,h/2+.1,-d/2+.06,'#a9c4cb'),box(.03,h-.35,d*.55,-w/2+.05,h/2+.1,-d*.2,'#a9c4cb'),box(.05,1.75,d*.62,w/2-.05,1.15,-d*.18,'#d8d3c4'),box(1.5,.06,.38,-.3,.47,-d/2+.3,'#5c4a3a'),box(.06,.45,.3,-.95,.23,-d/2+.3,'#2d3133'),box(.06,.45,.3,.35,.23,-d/2+.3,'#2d3133')]};
 for(const [kind,size] of Object.entries(SOLIDS)){
  const list=items.filter(i=>i.k===kind);if(!list.length)continue;
  const g=mergeGeometries(solidParts[kind](size));g.computeVertexNormals();
  const mesh=new THREE.InstancedMesh(g,painted,list.length);mesh.name=`Mapped ${kind}`;mesh.castShadow=mesh.receiveShadow=true;
  list.forEach((it,i)=>{const yaw=it.yaw||0;mesh.setMatrixAt(i,m4.compose(v.set(it.x,groundAt(it.x,it.z),it.z),q.setFromAxisAngle(UP,yaw),one));
   const [w,d]=size,c=Math.cos(yaw),s=Math.sin(yaw),ring=[[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]].map(([a,b])=>[it.x+a*c+b*s,it.z-a*s+b*c]);
   obstacles.push({id:itemId(it,i),name:kind,rings:[ring],bbox:[Math.min(...ring.map(p=>p[0])),Math.min(...ring.map(p=>p[1])),Math.max(...ring.map(p=>p[0])),Math.max(...ring.map(p=>p[1]))]});});
  mesh.computeBoundingSphere();group.add(mesh);
 }

 // Distance culling for post chunks; lenses follow the player.
 function update(){
  const p=player();if(!p)return;
  for(const c of chunks.values())c.group.visible=Math.hypot(c.centre[0]-p.x,c.centre[1]-p.z)<VIEW_RANGE+CHUNK*.71;
  updateLenses(p);updateStreetLamps(p);
 }
 const counts={};for(const it of items)counts[it.k]=(counts[it.k]||0)+1;
 group.userData={source:layer?.source,licence:layer?.licence,counts,chunks:chunks.size,lights:lights.length};
 // Knockables-compatible: main.js steps and updates it with the rest (posts step through breakableSigns).
 const knockables={get bodies(){return knock.flatMap(k=>k.bodies);},step(dt,car,world){for(const k of knock)k.step(dt,car,world);},update(){for(const k of knock)k.update();update();},
  resetAll(){for(const k of knock)k.resetAll();}, // posts reset with every other breakable sign set
  snapshot(){const s=knock.map(k=>k.snapshot()),posts=[...chunks.values()].map(c=>c.signs.snapshot()),sum=(l,k)=>l.reduce((n,x)=>n+x[k],0);
   return {count:sum(s,'count'),knocked:sum(s,'knocked'),hits:sum(s,'hits'),posts:{count:sum(posts,'count'),knocked:sum(posts,'knocked'),bent:sum(posts,'bent'),broken:sum(posts,'broken')}};}};
 return {group,obstacles,knockables,update,lights,chunks};
}
