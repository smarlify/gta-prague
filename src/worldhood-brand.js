// Original vector mark: an orthographic globe with the current city's patch.
// The patch is exaggerated for legibility; its centre uses the city's WGS84 origin.
const radians=n=>n*Math.PI/180;
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export function worldhoodMark({longitude=24.9522,latitude=60.1701,name='Helsinki',accent='#da5e38'}={}){
 longitude=Number.isFinite(longitude)?longitude:24.9522;latitude=Number.isFinite(latitude)?Math.max(-85,Math.min(85,latitude)):60.1701;
 if(!/^#[\da-f]{6}$/i.test(accent))accent='#da5e38';
 const centre=radians(longitude-24),tilt=radians(latitude*.35),r=27;
 const project=(lon,lat)=>{const l=radians(lon)-centre,p=radians(lat),x=Math.cos(p)*Math.sin(l),y=Math.cos(tilt)*Math.sin(p)-Math.sin(tilt)*Math.cos(p)*Math.cos(l),front=Math.sin(tilt)*Math.sin(p)+Math.cos(tilt)*Math.cos(p)*Math.cos(l);return {x:32+r*x,y:32-r*y,visible:front>=0};};
 const pt=p=>`${p.x.toFixed(2)},${p.y.toFixed(2)}`;
 function line(points){let d='',pen=false;for(const [lon,lat] of points){const p=project(lon,lat);if(!p.visible){pen=false;continue;}d+=`${pen?'L':'M'}${pt(p)}`;pen=true;}return d;}
 const lines=[];
 for(const lat of [-60,-30,0,30,60])lines.push(line(Array.from({length:121},(_,i)=>[longitude-180+i*3,lat])));
 for(let lon=-180;lon<180;lon+=30)lines.push(line(Array.from({length:61},(_,i)=>[lon,-90+i*3])));
 const lo=Math.max(-87,latitude-10),hi=Math.min(87,latitude+10),patch=[];
 for(let i=0;i<=10;i++)patch.push([longitude-13+i*2.6,lo]);
 for(let i=0;i<=10;i++)patch.push([longitude+13,lo+(hi-lo)*i/10]);
 for(let i=0;i<=10;i++)patch.push([longitude+13-i*2.6,hi]);
 for(let i=0;i<=10;i++)patch.push([longitude-13,hi-(hi-lo)*i/10]);
 const dot=project(longitude,latitude),title=`GTA Praha — ${name}`;
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="${escape(title)}"><title>${escape(title)}</title><circle cx="32" cy="32" r="29" fill="#30312e"/><g transform="rotate(-12 32 32)"><g fill="none" stroke="#eee8dc" stroke-width="1.1" opacity=".52">${lines.map(d=>`<path d="${d}"/>`).join('')}</g><path d="${line(patch)}Z" fill="${accent}" stroke="#30312e" stroke-width="1.4" stroke-linejoin="round"/><circle cx="${dot.x.toFixed(2)}" cy="${dot.y.toFixed(2)}" r="2.1" fill="#fff8e9"/></g><circle cx="32" cy="32" r="27.5" fill="none" stroke="#eee8dc" stroke-width="1.25" opacity=".75"/></svg>`;
}

/** Browser tab: current street or place, never the police-car emoji. */
export function locationPageTitle({street='',place=''}={}){
 const clean=s=>String(s||'').replace(/🚔/g,'').replace(/\s+/g,' ').trim();
 const where=clean(street)||clean(place);
 return where?`${where} — GTA Praha`:'GTA Praha';
}

export function updateWorldhoodBrand(city,doc=document){
 const [longitude,latitude]=city.origin||[],svg=worldhoodMark({longitude,latitude,name:city.name});
 const parsed=new DOMParser().parseFromString(svg,'image/svg+xml');
 for(const mark of doc.querySelectorAll('.brand-icon'))mark.replaceChildren(doc.importNode(parsed.documentElement,true));
 for(const link of doc.querySelectorAll('.wordmark')){link.setAttribute('aria-label',`GTA Praha · ${city.name}`);link.title=`You’re exploring ${city.name}`;}
 for(const name of doc.querySelectorAll('.brand-name'))name.textContent='GTA Praha 🇨🇿';
 // Tab icon stays the police-car favicon in public/favicon.svg (not the in-page globe mark).
 let icon=doc.querySelector('link[rel="icon"]');if(!icon){icon=doc.createElement('link');icon.rel='icon';doc.head.append(icon);}
 icon.type='image/svg+xml';icon.href='/favicon.svg';
 // document.title is the street or place (locationPageTitle). Do not stamp a police emoji here.
}
