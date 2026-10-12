// npm run city:terrain -- <id> [--refresh]
// Ground elevation for a city built with city:build: Mapterhorn terrain tiles (terrarium-encoded, keyless;
// in Finland the National Land Survey's 2 m elevation model, CC BY 4.0) resampled to a 3 m grid over the
// city square, smoothed so streets are drivable, bridges spanned as straight decks between their banks and
// every mapped water body given a flat surface (steps kept where the river drops over a dam).
// Output: public/cities/<id>/terrain.pack (src/terrain.js format) and a `terrain` entry in the city registry.
// Raw tiles are cached in data/raw/cities/<id>/terrain/ (ignored by git).
import fs from 'node:fs';
import path from 'node:path';
import {gzipSync,inflateSync,gunzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import proj4 from 'proj4';
import {encodeTerrain} from '../src/terrain.js';

const ZOOM=15,TILE=512,CELL=3;
export const TERRAIN_SOURCES={
 fi:'Elevation: National Land Survey of Finland, Elevation model 2 m, CC BY 4.0, via Mapterhorn terrain tiles (mapterhorn.com).',
 default:'Elevation: Mapterhorn terrain tiles (mapterhorn.com); see mapterhorn.com/attribution for the sources and licences of your area.'
};

// Minimal PNG reader (8-bit RGB/RGBA, non-interlaced): what sips and browsers write for a decoded tile.
export function readPng(buf){
 let o=8,w,h,type,idat=[];
 while(o<buf.length){const len=buf.readUInt32BE(o),kind=buf.toString('ascii',o+4,o+8),data=buf.subarray(o+8,o+8+len);o+=12+len;
  if(kind==='IHDR'){w=data.readUInt32BE(0);h=data.readUInt32BE(4);if(data[8]!==8||data[12])throw Error('Only 8-bit non-interlaced PNG');type=data[9];}
  else if(kind==='IDAT')idat.push(data);else if(kind==='IEND')break;}
 const bpp=type===6?4:type===2?3:0;if(!bpp)throw Error(`PNG colour type ${type} not supported`);
 const raw=inflateSync(Buffer.concat(idat)),stride=w*bpp,out=new Uint8Array(w*h*3);let prev=new Uint8Array(stride);
 for(let y=0;y<h;y++){const f=raw[y*(stride+1)],line=raw.subarray(y*(stride+1)+1,(y+1)*(stride+1)),cur=new Uint8Array(stride);
  for(let x=0;x<stride;x++){const a=x>=bpp?cur[x-bpp]:0,b=prev[x],c=x>=bpp?prev[x-bpp]:0;let v=line[x];
   if(f===1)v+=a;else if(f===2)v+=b;else if(f===3)v+=(a+b)>>1;else if(f===4){const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);v+=pa<=pb&&pa<=pc?a:pb<=pc?b:c;}
   cur[x]=v&255;}
  for(let x=0;x<w;x++)for(let k=0;k<3;k++)out[(y*w+x)*3+k]=cur[x*bpp+k];prev=cur;}
 return {w,h,rgb:out};
}
// Lossless WebP → RGB. macOS sips when present, else the Playwright browser (a dev dependency).
async function decodeWebp(files){
 const out=new Map(),todo=[];
 for(const f of files){const png=f.replace(/\.webp$/,'.png');if(fs.existsSync(png))out.set(f,readPng(fs.readFileSync(png)));else todo.push(f);}
 if(!todo.length)return out;
 let sips=false;try{execFileSync('sips',['--help'],{stdio:'ignore'});sips=true;}catch{}
 if(sips){for(const f of todo){const png=f.replace(/\.webp$/,'.png');execFileSync('sips',['-s','format','png',f,'--out',png],{stdio:'ignore'});out.set(f,readPng(fs.readFileSync(png)));}return out;}
 const {chromium}=await import('@playwright/test');const browser=await chromium.launch();const page=await browser.newPage();
 try{for(const f of todo){const b64=fs.readFileSync(f).toString('base64');
  const rgba=await page.evaluate(async s=>{const blob=await (await fetch(`data:image/webp;base64,${s}`)).blob(),bmp=await createImageBitmap(blob,{colorSpaceConversion:'none',premultiplyAlpha:'none'});
   const c=new OffscreenCanvas(bmp.width,bmp.height),x=c.getContext('2d');x.drawImage(bmp,0,0);return Array.from(x.getImageData(0,0,bmp.width,bmp.height).data);},b64);
  const rgb=new Uint8Array(TILE*TILE*3);for(let i=0;i<TILE*TILE;i++)for(let k=0;k<3;k++)rgb[i*3+k]=rgba[i*4+k];out.set(f,{w:TILE,h:TILE,rgb});}}
 finally{await browser.close();}
 return out;
}

// Separable Gaussian blur of a size×size grid; cells where keep[i] is set are left unchanged.
export function blur(values,size,sigmaCells,keep=null){
 const r=Math.ceil(sigmaCells*2.5),k=[];let s=0;for(let i=-r;i<=r;i++){const v=Math.exp(-i*i/(2*sigmaCells*sigmaCells));k.push(v);s+=v;}for(let i=0;i<k.length;i++)k[i]/=s;
 const tmp=new Float32Array(values.length),out=new Float32Array(values.length);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){let a=0;for(let d=-r;d<=r;d++){const xx=Math.min(size-1,Math.max(0,x+d));a+=values[y*size+xx]*k[d+r];}tmp[y*size+x]=a;}
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){let a=0;for(let d=-r;d<=r;d++){const yy=Math.min(size-1,Math.max(0,y+d));a+=tmp[yy*size+x]*k[d+r];}const i=y*size+x;out[i]=keep?.[i]?values[i]:a;}
 return out;
}
// Water surfaces: each water cell takes the median of the elevation model's water cells within `radius`
// cells (lakes come out dead flat, a dam keeps its step), then the level spreads `spread` cells onto the
// banks so draped water edges never sample land.
export function levelWater(dem,mask,size,radius=4,spread=3){
 const water=new Float32Array(size*size).fill(NaN),vals=[];
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){const i=y*size+x;if(!mask[i])continue;vals.length=0;
  for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){if(dx*dx+dy*dy>radius*radius)continue;const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=size||yy>=size)continue;const j=yy*size+xx;if(mask[j])vals.push(dem[j]);}
  vals.sort((a,b)=>a-b);water[i]=vals[vals.length>>1];}
 for(let pass=0;pass<spread;pass++){const next=water.slice();
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){const i=y*size+x;if(!Number.isNaN(water[i]))continue;let s=0,n=0;
   for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=size||yy>=size)continue;const v=water[yy*size+xx];if(!Number.isNaN(v)){s+=v;n++;}}
   if(n)next[i]=s/n;}
  water.set(next);}
 return water;
}
const sampler=(grid,size,cell,extent)=>(x,z)=>{const u=Math.max(0,Math.min(size-1.001,(x+extent)/cell)),v=Math.max(0,Math.min(size-1.001,(z+extent)/cell)),i=Math.floor(u),j=Math.floor(v),a=u-i,b=v-j,k=j*size+i;return (grid[k]*(1-a)+grid[k+1]*a)*(1-b)+(grid[k+size]*(1-a)+grid[k+size+1]*a)*b;};
const segDist=(x,z,a,b)=>{const dx=b[0]-a[0],dz=b[1]-a[1],l=dx*dx+dz*dz,t=l?Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/l)):0;return [Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t),t];};
// Bridges: the elevation model is bare ground, so a bridge would dip into its river or cutting. Each
// bridge (chained OSM ways) becomes a straight deck between the ground just beyond its two ends.
// Grade separation: a foot or cycle bridge never lifts a carriageway on a lower layer (`low`, from
// roadLayers); the street below keeps its own level and the light deck dips to meet it instead. `over`
// (Int8Array, -128 = none) records the highest deck layer stamped on each cell.
export function stampBridges(ground,size,cell,extent,bridges,low=null,over=null){
 const at=sampler(ground,size,cell,extent);
 const decks=bridges.map(({points,half})=>{
  const cum=[0];for(let i=1;i<points.length;i++)cum.push(cum[i-1]+Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]));
  const L=cum.at(-1)||1,beyond=(p,q)=>{const l=Math.hypot(p[0]-q[0],p[1]-q[1])||1;return [p[0]+(p[0]-q[0])/l*4,p[1]+(p[1]-q[1])/l*4];};
  return {points,cum,L,half,h0:at(...beyond(points[0],points[1])),h1:at(...beyond(points.at(-1),points.at(-2)))};
 });
 const out=ground.slice(),FALL=6;
 for(const d of decks){
  let b=[Infinity,Infinity,-Infinity,-Infinity];for(const p of d.points){b=[Math.min(b[0],p[0]),Math.min(b[1],p[1]),Math.max(b[2],p[0]),Math.max(b[3],p[1])];}
  const r=d.half+FALL,x0=Math.max(0,Math.floor((b[0]-r+extent)/cell)),x1=Math.min(size-1,Math.ceil((b[2]+r+extent)/cell)),z0=Math.max(0,Math.floor((b[1]-r+extent)/cell)),z1=Math.min(size-1,Math.ceil((b[3]+r+extent)/cell));
  for(let j=z0;j<=z1;j++)for(let i=x0;i<=x1;i++){const x=i*cell-extent,z=j*cell-extent;let best=Infinity,s=0;
   for(let k=1;k<d.points.length;k++){const [dist,t]=segDist(x,z,d.points[k-1],d.points[k]);if(dist<best){best=dist;s=d.cum[k-1]+(d.cum[k]-d.cum[k-1])*t;}}
   if(best>r)continue;const deck=d.h0+(d.h1-d.h0)*s/d.L,q=j*size+i;if(low&&!d.car&&low[q]<(d.layer??1))continue;
   if(best<=d.half){out[q]=deck;if(over)over[q]=Math.max(over[q],d.layer??1);}else{const w=1-(best-d.half)/FALL,smooth=w*w*(3-2*w);if(out[q]<deck)out[q]=Math.max(out[q],ground[q]+(deck-ground[q])*smooth);}
  }
 }
 return out;
}
// Height source for a street on `layer`: the ground with bridge decks, except under a higher deck.
export const streetLevel=(deck,bare,over,size,cell,extent)=>{const d=sampler(deck,size,cell,extent),b=bare?sampler(bare,size,cell,extent):d;
 return layer=>over?(x,z)=>over[Math.round(Math.max(0,Math.min(size-1,(z+extent)/cell)))*size+Math.round(Math.max(0,Math.min(size-1,(x+extent)/cell)))]>layer?b(x,z):d(x,z):d;};
// Points every `step` metres along a polyline.
export function resample(pts,step=2){
 const s=[];for(let i=1;i<pts.length;i++){const a=pts[i-1],b=pts[i],n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/step));for(let k=i>1?1:0;k<=n;k++)s.push([a[0]+(b[0]-a[0])*k/n,a[1]+(b[1]-a[1])*k/n]);}
 return s;
}
// A carriageway's own height profile: outliers against a running median replaced, then a Gaussian.
export function roadProfile(h,{reach=15,sigma=6,step=2}={}){
 const r=Math.round(reach/step),g=Math.round(sigma/step*2.5);
 const m=h.map((_,i)=>{const w=h.slice(Math.max(0,i-r),i+r+1).sort((a,b)=>a-b);return w[w.length>>1];});h=h.map((v,i)=>Math.abs(v-m[i])>.3?m[i]:v);
 return h.map((_,i)=>{let a=0,w=0;for(let k=-g;k<=g;k++){const j=Math.max(0,Math.min(h.length-1,i+k)),q=Math.exp(-((k*step)**2)/(2*sigma*sigma));a+=h[j]*q;w+=q;}return a/w;});
}
// Drivable streets: the profile along each carriageway (sampled every 2 m from `source`) loses its outliers
// against a running median over ±reach metres (dips and spikes up to `reach` long: bridges the map does not mark, kerbs, walls and
// embankment edges bleeding in; slopes pass unchanged) and a Gaussian; cells within `half`
// metres of a carriageway take the profile, blending back to the surrounding ground over `fall` metres.
// Lines are point lists or {points,layer}; with `bare` and `over` (stampBridges), a street under a higher
// bridge deck reads its profile from the bare ground there (the deck is not its own). With `max`, profiles
// are also grade separated (gradeSeparate).
export function conditionRoads(ground,source,size,cell,extent,lines,{half=4,fall=6,reach=15,sigma=6,step=2,bare=null,over=null,junctions=null,max=0,steep=.2,couple=6,passes=80}={}){
 const level=streetLevel(source,bare,over,size,cell,extent),roads=[];
 for(const line of lines){const l=Array.isArray(line)?{points:line,layer:0}:line,s=resample(l.points,step);if(s.length<2)continue;const at=level(l.layer);
  const h=roadProfile(s.map(p=>at(p[0],p[1])),{reach,sigma,step});roads.push({s,h,allow:allowedGrades(h,{max,steep,step,flat:junctionTest(junctions,size,cell,extent),s})});}
 if(max)gradeSeparate(roads,{step,couple,passes});
 const num=new Float32Array(size*size),den=new Float32Array(size*size),best=new Float32Array(size*size);
 for(const {s,h:sm} of roads){
  for(let i=0;i<s.length;i++){const [x,z]=s[i],R=half+fall;
   for(let j=Math.max(0,Math.floor((z-R+extent)/cell));j<=Math.min(size-1,Math.ceil((z+R+extent)/cell));j++)for(let k=Math.max(0,Math.floor((x-R+extent)/cell));k<=Math.min(size-1,Math.ceil((x+R+extent)/cell));k++){
    const d=Math.hypot(k*cell-extent-x,j*cell-extent-z);if(d>R)continue;const t=d<=half?1:1-(d-half)/fall,w=t*t*(3-2*t),q=j*size+k;
    num[q]+=w*sm[i];den[q]+=w;if(w>best[q])best[q]=w;}}
 }
 // Crossing carriageways share a cell by averaging (grade-separated junctions cannot be one surface).
 const out=ground.slice();for(let i=0;i<out.length;i++)if(den[i]>0)out[i]=ground[i]*(1-best[i])+num[i]/den[i]*best[i];
 return out;
}
// The steepest each sample of a profile may be: `max`, or the profile's own grade where it is genuinely
// steeper (a real steep street), never more than `steep`. Near grade-separated junctions (`flat`(x,z) true
// for the points `s`) a steep profile is an artefact of the decks above or below, so `max` holds.
export const allowedGrades=(h,{max=.12,steep=.2,step=2,flat=null,s=null}={})=>grades(h,step,3).map((g,i)=>flat?.(...s[i])?max:Math.min(steep,Math.max(max,g*1.15)));
// Cells within `reach` metres of a bridge deck or of a carriageway off the ground layer (roadLayers).
export function junctionMask(over,low,size,cell,reach=40){
 let m=new Uint8Array(size*size);for(let q=0;q<m.length;q++)m[q]=over[q]>-128||low[q]!==127&&low[q]!==0?1:0;
 const r=Math.round(reach/cell);
 for(const [a,b] of [[1,size],[size,1]]){const out=new Uint8Array(m.length);
  for(let line=0;line<size;line++){let last=-Infinity;for(let k=0;k<size;k++){if(m[line*b+k*a])last=k;if(k-last<=r)out[line*b+k*a]=1;}
   last=Infinity;for(let k=size-1;k>=0;k--){if(m[line*b+k*a])last=k;if(last-k<=r)out[line*b+k*a]=1;}}
  m=out;}
 return m;
}
const junctionTest=(m,size,cell,extent)=>m&&((x,z)=>m[Math.round(Math.max(0,Math.min(size-1,(z+extent)/cell)))*size+Math.round(Math.max(0,Math.min(size-1,(x+extent)/cell)))]===1);
// The mean of a profile's upper and lower grade-limited envelopes: within the limits it is unchanged, a spike
// becomes a ramp up and down, a dip a sag (both half as deep), and no step is steeper than its allowance.
export function limitProfile(h,allow,step=2){
 const n=h.length,U=h.slice(),D=h.slice();
 for(let i=1;i<n;i++){const g=Math.max(allow[i],allow[i-1])*step;U[i]=Math.min(U[i],U[i-1]+g);D[i]=Math.max(D[i],D[i-1]-g);}
 for(let i=n-2;i>=0;i--){const g=Math.max(allow[i],allow[i+1])*step;U[i]=Math.min(U[i],U[i+1]+g);D[i]=Math.max(D[i],D[i+1]-g);}
 return U.map((u,i)=>(u+D[i])/2);
}
// Grade-separated junctions in one height field. Where a bridge crosses a street, or a ramp runs beside its
// main road, carriageways on different levels share ground, and averaging them gave jumps of several metres
// in a few metres. Here the profiles agree first: points of different roads closer than `couple` metres are
// pulled to a common height, each road is then held within its grade allowance, and the two steps alternate
// until both hold. Interchanges become gentle humps and sags; everything else is left as it was.
export function gradeSeparate(roads,{max=.12,steep=.2,step=2,couple=6,passes=80}={}){
 const allow=roads.map(r=>r.allow||allowedGrades(r.h,{max,steep,step})),key=(x,z)=>`${Math.floor(x/couple)},${Math.floor(z/couple)}`,grid=new Map(),links=[];
 roads.forEach((r,a)=>r.s.forEach(([x,z],i)=>{const k=key(x,z);if(!grid.has(k))grid.set(k,[]);grid.get(k).push([a,i]);}));
 roads.forEach((r,a)=>r.s.forEach(([x,z],i)=>{const near=[];const cx=Math.floor(x/couple),cz=Math.floor(z/couple);
  for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)for(const [b,j] of grid.get(`${cx+dx},${cz+dz}`)||[]){if(b===a)continue;const p=roads[b].s[j];if(Math.hypot(p[0]-x,p[1]-z)<couple)near.push([b,j]);}
  if(near.length)links.push([a,i,near]);}));
 if(!links.length)return roads;
 const touched=[...new Set(links.map(l=>l[0]))];
 for(let pass=0;pass<passes;pass++){
  const mean=links.map(([a,i,near])=>{let s=roads[a].h[i];for(const [b,j] of near)s+=roads[b].h[j];return s/(near.length+1);});
  links.forEach(([a,i],k)=>{roads[a].h[i]=mean[k];});
  let moved=0;for(const a of touched){const r=roads[a],h=limitProfile(r.h,allow[a],step);for(let i=0;i<h.length;i++)moved=Math.max(moved,Math.abs(h[i]-r.h[i]));r.h=h;}
  if(moved<.01)break;
 }
 return roads;
}
// Chain bridge ways that share end nodes (a long bridge is often split) into polylines.
export function bridgeChains(ways){
 const left=ways.map(w=>({...w})),chains=[];
 while(left.length){const c=left.pop();let grew=true;
  while(grew){grew=false;for(let i=0;i<left.length;i++){const w=left[i];
   if(w.nodes[0]===c.nodes.at(-1)){c.nodes=[...c.nodes,...w.nodes.slice(1)];c.points=[...c.points,...w.points.slice(1)];}
   else if(w.nodes.at(-1)===c.nodes[0]){c.nodes=[...w.nodes,...c.nodes.slice(1)];c.points=[...w.points,...c.points.slice(1)];}
   else continue;c.half=Math.max(c.half,w.half);c.car=c.car||w.car;c.layer=Math.max(c.layer??1,w.layer??1);left.splice(i,1);grew=true;break;}}
  chains.push(c);}
 return chains;
}
const WIDE=/^(motorway|trunk|primary)/,MID=/^(secondary|tertiary)/,ROAD=/^(residential|unclassified|service|living_street|pedestrian)/;
export function bridgeHalfWidth(t){const w=parseFloat(t.width);if(w>0)return w/2+1;return WIDE.test(t.highway)?9:MID.test(t.highway)?8:ROAD.test(t.highway)?7:3;}
// Carriageways from the raw OSM ways (the same ones city:build makes drivable; tunnels stay out of the
// world): points, half width and layer (the layer tag, else 1 on a bridge).
const CAR={motorway:16,trunk:14,primary:12,secondary:10,tertiary:8.5,unclassified:6.5,residential:6.5,living_street:5.5,service:4.5,motorway_link:7,trunk_link:7,primary_link:7,secondary_link:7,tertiary_link:6.5};
const yes=v=>v&&v!=='no';
export const layerOf=t=>{const l=parseInt(t.layer,10);return Number.isFinite(l)?l:yes(t.bridge)?1:yes(t.tunnel)?-1:0;};
export const isCarriageway=t=>!!CAR[t.highway]&&!yes(t.tunnel)&&t.area!=='yes'&&t.access!=='private'&&t.service!=='parking_aisle'&&t.motor_vehicle!=='no';
export function roadLines(ways,point){
 return ways.filter(w=>isCarriageway(w.tags||{})).map(w=>({points:w.nodes.map(point).filter(Boolean),half:CAR[w.tags.highway]/2,layer:layerOf(w.tags),bridge:yes(w.tags.bridge),name:w.tags.name||w.tags.highway})).filter(l=>l.points.length>1);
}
// Lowest carriageway layer within each cell (127 where there is none).
export function roadLayers(lines,size,cell,extent){
 const low=new Int8Array(size*size).fill(127);
 for(const l of lines)for(const [x,z] of resample(l.points,cell/2)){const R=l.half;
  for(let j=Math.max(0,Math.floor((z-R+extent)/cell));j<=Math.min(size-1,Math.ceil((z+R+extent)/cell));j++)for(let k=Math.max(0,Math.floor((x-R+extent)/cell));k<=Math.min(size-1,Math.ceil((x+R+extent)/cell));k++){
   const q=j*size+k;if(Math.hypot(k*cell-extent-x,j*cell-extent-z)<=R&&l.layer<low[q])low[q]=l.layer;}}
 return low;
}
// Grade along each sample of a profile `step` metres apart: rise over ±`span` samples.
const grades=(h,step,span)=>h.map((_,i)=>{const a=Math.max(0,i-span),b=Math.min(h.length-1,i+span);return b>a?Math.abs(h[b]-h[a])/((b-a)*step):0;});
// Build check: stretches of carriageway (inside `radius`) steeper than their allowance over a `span`-metre
// baseline (the allowance comes from each road's own profile, `level(layer)` as in conditionRoads), one entry
// per spot (the steepest within 60 m), steepest first. Height sources are (x,z) → metres.
export function gradeSpikes(height,lines,{max=.12,steep=.2,level=null,junctions=null,step=2,span=6,radius=Infinity,slack=.02}={}){
 const hits=[],k=Math.max(1,Math.round(span/step));
 for(const l of lines){const s=resample(l.points,step);if(s.length<=k)continue;const src=level?.(l.layer);
  const allow=src?allowedGrades(roadProfile(s.map(p=>src(p[0],p[1])),{step}),{max,steep,step,flat:junctions,s}):s.map(()=>max),h=s.map(p=>height(p[0],p[1]));
  for(let i=0;i+k<s.length;i++){const [x,z]=s[i];if(Math.hypot(x,z)>radius)continue;const g=Math.abs(h[i+k]-h[i])/(k*step),limit=Math.max(...allow.slice(i,i+k+1))+slack;if(g>limit)hits.push({x:+x.toFixed(0),z:+z.toFixed(0),grade:+g.toFixed(3),limit:+limit.toFixed(3),name:l.name||''});}}
 hits.sort((a,b)=>b.grade-a.grade);const spots=[];for(const h of hits)if(!spots.some(p=>Math.hypot(p.x-h.x,p.z-h.z)<60))spots.push(h);
 return spots;
}
// Connected areas of exactly level elevation (water in the elevation model) of at least minArea cells,
// outside mapped water and land; each keeps its median level (the game spreads it to meet the shore).
export function findLakes(dem,mapped,land,size,{minArea=2200,tolerance=.02,spread=0}={}){
 const lake=new Float32Array(size*size).fill(NaN),seen=new Uint8Array(size*size),flat=i=>!mapped[i]&&!land[i];
 for(let s=0;s<size*size;s++){if(seen[s]||!flat(s))continue;const q=[s];seen[s]=1;
  for(let k=0;k<q.length;k++){const i=q[k],x=i%size,y=(i-x)/size;
   for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=size||yy>=size)continue;const j=yy*size+xx;if(seen[j]||!flat(j)||Math.abs(dem[j]-dem[i])>tolerance)continue;seen[j]=1;q.push(j);}}
  if(q.length<minArea)continue;const levels=q.map(i=>dem[i]).sort((a,b)=>a-b),level=levels[levels.length>>1];for(const i of q)lake[i]=level;}
 for(let pass=0;pass<spread;pass++){const next=lake.slice();
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){const i=y*size+x;if(!Number.isNaN(lake[i]))continue;
   for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=size||yy>=size)continue;const v=lake[yy*size+xx];if(!Number.isNaN(v)){next[i]=v;break;}}}
  lake.set(next);}
 return lake;
}
// Lake beds: the elevation model's water surface is the ground there, and shallows or noise a few
// decimetres above the level poke through the water as blocky islands along the shore. Lake cells, and the
// cells next to them up to `reach` cells out that lie less than `rise` above the level (not mapped land),
// sink `depth` below it, so after smoothing the bank meets the water along its own contour.
export function lakeBed(bare,lake,land,size,{reach=6,rise=.45,depth=.8}={}){
 const level=lake.slice(),out=bare.slice();
 for(let pass=0;pass<reach;pass++){const next=level.slice();let grew=0;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){const i=y*size+x;if(!Number.isNaN(level[i])||land[i])continue;
   for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=size||yy>=size)continue;const v=level[yy*size+xx];if(!Number.isNaN(v)&&bare[i]<v+rise){next[i]=v;grew++;break;}}}
  level.set(next);if(!grew)break;}
 for(let i=0;i<out.length;i++)if(!Number.isNaN(level[i]))out[i]=Math.min(out[i],level[i]-depth);
 return out;
}
const lakeCells=l=>l.reduce((n,v)=>n+(Number.isNaN(v)?0:1),0);
function rasterise(polys,size,cell,extent){
 const mask=new Uint8Array(size*size);
 for(const {rings} of polys){
  const b=rings[0].reduce((b,p)=>[Math.min(b[0],p[0]),Math.min(b[1],p[1]),Math.max(b[2],p[0]),Math.max(b[3],p[1])],[Infinity,Infinity,-Infinity,-Infinity]);
  for(let j=Math.max(0,Math.floor((b[1]+extent)/cell));j<=Math.min(size-1,Math.ceil((b[3]+extent)/cell));j++){const z=j*cell-extent,xs=[];
   for(const r of rings)for(let k=0;k<r.length;k++){const a=r[k],c=r[(k+1)%r.length];if((a[1]>z)!==(c[1]>z))xs.push(a[0]+(z-a[1])*(c[0]-a[0])/(c[1]-a[1]));}
   xs.sort((a,b)=>a-b);for(let k=0;k+1<xs.length;k+=2)for(let i=Math.max(0,Math.ceil((xs[k]+extent)/cell));i<=Math.min(size-1,Math.floor((xs[k+1]+extent)/cell));i++)mask[j*size+i]=1;}
 }
 return mask;
}

export async function buildTerrain(id,{refresh=false}={}){
 const def=JSON.parse(fs.readFileSync(path.join('cities',id,'city.json'))),OUT=path.join('public/cities',id),RAW=path.join('data/raw/cities',id,'terrain');
 const [lon0,lat0]=def.origin,EXTENT=Math.round(def.radiusMetres*1.25),size=Math.round(2*EXTENT/CELL)+1;
 // Mapterhorn's finest zoom is not published everywhere. Prague has zoom 14
 // (about 3 m) and no zoom 15; a city can set terrainZoom in city.json.
 const zoom=def.terrainZoom||ZOOM;
 const projection=`+proj=tmerc +lat_0=${lat0} +lon_0=${lon0} +k=1 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs`,toWgs=proj4(projection,'EPSG:4326'),toLocal=proj4('EPSG:4326',projection);
 const n=2**zoom,px=lon=>(lon+180)/360*n*TILE,py=lat=>{const r=lat*Math.PI/180;return (1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2*n*TILE;};
 const corners=[[-EXTENT,-EXTENT],[EXTENT,-EXTENT],[EXTENT,EXTENT],[-EXTENT,EXTENT]].map(([x,z])=>toWgs.forward([x,-z]));
 const tx0=Math.floor(Math.min(...corners.map(c=>px(c[0])))/TILE)-1,tx1=Math.floor(Math.max(...corners.map(c=>px(c[0])))/TILE)+1,ty0=Math.floor(Math.min(...corners.map(c=>py(c[1])))/TILE)-1,ty1=Math.floor(Math.max(...corners.map(c=>py(c[1])))/TILE)+1;
 fs.mkdirSync(RAW,{recursive:true});const files=[];
 for(let ty=ty0;ty<=ty1;ty++)for(let tx=tx0;tx<=tx1;tx++){const f=path.join(RAW,`${zoom}-${tx}-${ty}.webp`);files.push(f);
  if(fs.existsSync(f)&&!refresh)continue;
  const r=await fetch(`https://tiles.mapterhorn.com/${zoom}/${tx}/${ty}.webp`,{headers:{'User-Agent':'city-terrain build script'}});
  if(!r.ok)throw Error(`Mapterhorn tile ${zoom}/${tx}/${ty}: HTTP ${r.status}`);fs.writeFileSync(f,Buffer.from(await r.arrayBuffer()));fs.rmSync(f.replace(/\.webp$/,'.png'),{force:true});}
 console.log(`terrain: ${files.length} Mapterhorn tiles at z${zoom} (${(40075016*Math.cos(lat0*Math.PI/180)/n/TILE).toFixed(2)} m pixels)`);
 const decoded=await decodeWebp(files);
 const elevation=(x,y)=>{const tx=Math.floor(x/TILE),ty=Math.floor(y/TILE),t=decoded.get(path.join(RAW,`${zoom}-${tx}-${ty}.webp`)),i=((Math.floor(y)-ty*TILE)*TILE+(Math.floor(x)-tx*TILE))*3;return t.rgb[i]*256+t.rgb[i+1]+t.rgb[i+2]/256-32768;};
 const sample=(x,y)=>{x-=.5;y-=.5;const i=Math.floor(x),j=Math.floor(y),a=x-i,b=y-j;return (elevation(i,j)*(1-a)+elevation(i+1,j)*a)*(1-b)+(elevation(i,j+1)*(1-a)+elevation(i+1,j+1)*a)*b;};

 // Raw elevation on the local grid (x east, z south).
 const dem=new Float32Array(size*size);
 for(let j=0;j<size;j++)for(let i=0;i<size;i++){const [lon,lat]=toWgs.forward([i*CELL-EXTENT,-(j*CELL-EXTENT)]);dem[j*size+i]=sample(px(lon),py(lat));}
 // Water: mapped water polygons from the built city.
 const city=JSON.parse(gunzipSync(fs.readFileSync(path.join(OUT,'city.pack'))));
 const mask=rasterise(city.water.filter(w=>w.rings?.[0]?.length>2),size,CELL,EXTENT),water=levelWater(dem,mask,size);
 // Lakes the map leaves out (large water bodies are often missing or clipped): the elevation model's water
 // surfaces are dead flat, so big flat areas away from streets and buildings become open water at their level.
 const land=rasterise([...city.roads,...city.pavement,...city.buildings],size,CELL,EXTENT),lake=findLakes(dem,mask,land,size);
 // Land: water cells hold their level, banks and streets get a 4.5 m Gaussian so kerbs and lidar noise vanish.
 let bare=dem.slice();for(let i=0;i<bare.length;i++)if(!Number.isNaN(water[i])&&mask[i])bare[i]=water[i];
 bare=lakeBed(bare,lake,land,size);
 let ground=blur(bare,size,1.5);
 // Bridges from the raw OSM ways the city was built from.
 const rawWays=path.join('data/raw/cities',id,'highways.json'),hw=fs.existsSync(rawWays)?JSON.parse(fs.readFileSync(rawWays)):{elements:[]},nodes=new Map(hw.elements.filter(e=>e.type==='node').map(e=>[e.id,e]));
 const local=id=>{const p=nodes.get(id);if(!p)return null;const [x,y]=toLocal.forward([p.lon,p.lat]);return [x,-y];};
 const ways=hw.elements.filter(e=>e.type==='way'&&e.tags?.bridge&&e.tags.bridge!=='no'&&!/^(proposed|construction)$/.test(e.tags.highway)).map(w=>({nodes:w.nodes,half:bridgeHalfWidth(w.tags),car:isCarriageway(w.tags),layer:layerOf(w.tags),points:w.nodes.map(local).filter(Boolean)})).filter(w=>w.points.length>1);
 // Carriageways with their layers (the routable graph without tags when the raw ways are gone).
 const mobility=JSON.parse(fs.readFileSync(path.join(OUT,'mobility.json'))),osmRoads=roadLines(hw.elements.filter(e=>e.type==='way'),local);
 const roads=osmRoads.length?osmRoads:mobility.roads.edges.map(e=>({points:e.points,half:4,layer:0,name:''})),low=roadLayers(roads,size,CELL,EXTENT);
 const chains=bridgeChains(ways),over=new Int8Array(size*size).fill(-128);ground=stampBridges(ground,size,CELL,EXTENT,chains,low,over);
 // Streets: each carriageway's own profile from the unsmoothed model, cleared of dips and spikes, laid along it.
 const decks=stampBridges(bare,size,CELL,EXTENT,chains,low);
 // Interchanges: no carriageway steeper than 12 % unless the street itself really is; then report what is left.
 const junctions=junctionMask(over,low,size,CELL);
 ground=blur(conditionRoads(ground,decks,size,CELL,EXTENT,roads,{bare,over,junctions,max:.12}),size,.8);
 const spikes=gradeSpikes(sampler(ground,size,CELL,EXTENT),roads,{level:streetLevel(decks,bare,over,size,CELL,EXTENT),junctions:junctionTest(junctions,size,CELL,EXTENT),radius:def.radiusMetres});
 console.log(`terrain: ${spikes.length} road grade spikes above 12 % in the playable circle${spikes.length?': '+spikes.slice(0,8).map(p=>`${p.name} ${(p.grade*100).toFixed(0)} % at ${p.x},${p.z}`).join('; '):''}`);
 const at=(x,z)=>ground[Math.round((z+EXTENT)/CELL)*size+Math.round((x+EXTENT)/CELL)];
 const base=Math.round(at(0,0));
 let lo=Infinity,hi=-Infinity;for(let j=0;j<size;j++)for(let i=0;i<size;i++){const x=i*CELL-EXTENT,z=j*CELL-EXTENT;if(Math.hypot(x,z)>def.radiusMetres)continue;const h=ground[j*size+i];lo=Math.min(lo,h);hi=Math.max(hi,h);}
 const source=def.terrainSource||(lon0>19&&lon0<32&&lat0>59.5&&lat0<70.2?TERRAIN_SOURCES.fi:TERRAIN_SOURCES.default);
 const packed=gzipSync(encodeTerrain({size,cell:CELL,extent:EXTENT,base,ground,water,lake,source}),{level:9});
 fs.writeFileSync(path.join(OUT,'terrain.pack'),packed);
 const regFile='public/cities/index.json',reg=JSON.parse(fs.readFileSync(regFile)),entry=reg.cities.find(c=>c.id===id);
 const summary={file:'terrain.pack',cell:CELL,base,min:+lo.toFixed(1),max:+hi.toFixed(1),bridges:chains.length,gradeSpikes:spikes.length,source};
 if(entry){entry.terrain=summary;if(!entry.attribution.includes(source))entry.attribution=`${entry.attribution} ${source}`;fs.writeFileSync(regFile,JSON.stringify(reg,null,1));}
 console.log(`terrain: ${size}×${size} cells of ${CELL} m, ${(packed.length/1024).toFixed(0)} kB; ground ${lo.toFixed(1)}–${hi.toFixed(1)} m in the playable circle (base ${base} m); ${chains.length} bridges; ${mask.reduce((a,b)=>a+b,0)} water cells, ${lakeCells(lake)} lake cells`);
 return summary;
}

if(import.meta.url===pathToFileURL(process.argv[1]||'').href){
 const id=process.argv[2];if(!/^[a-z0-9-]+$/.test(id||''))throw Error('Usage: npm run city:terrain -- <id> [--refresh]');
 await buildTerrain(id,{refresh:process.argv.includes('--refresh')});
}
