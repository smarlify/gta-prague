// Starting-point picker on the welcome card: ‹ Olympia Terminal › cycles through the same
// starts as the city map. Buttons, ←/→ before the game starts, and a horizontal swipe on touch.
// Prague also gets a district row (Praha 1 / Praha 2 / …) that filters the place list.
// The pure helpers below are what tests/start-picker.test.mjs checks; the DOM part stays thin.

// Wraps in both directions: step -1 from the first start goes to the last.
export function cycleIndex(length,index,step){
 if(!(length>0))return -1;
 const i=Number.isInteger(index)&&index>=0&&index<length?index:0;
 return ((i+step)%length+length)%length;
}

// The start `step` places away from `current` (matched by identity, then by name).
export function cycleStart(starts,current,step){
 if(!starts?.length)return null;
 let index=starts.indexOf(current);
 if(index<0&&current)index=starts.findIndex(s=>(s.id||s.name)===(current.id||current.name));
 return starts[cycleIndex(starts.length,index,step)];
}

export const PICKER_KEYS=Object.freeze({ArrowLeft:-1,ArrowRight:1});

// ←/→ choose a start only while the welcome card is up. Once the game has started (or a
// dialog/arrest screen owns the keyboard) they return 0 and stay steering keys.
export function pickerStep(code,{ready=false,started=false,blocked=false}={}){
 if(!ready||started||blocked)return 0;
 return PICKER_KEYS[code]||0;
}

// A deliberate horizontal swipe: left shows the next start, right the previous one.
export function swipeStep(dx,dy,{min=40,ms=0,maxMs=700}={}){
 if(ms>maxMs||Math.abs(dx)<min||Math.abs(dx)<Math.abs(dy)*1.5)return 0;
 return dx<0?1:-1;
}

export const startPosition=(index,length)=>`${index+1} / ${length}`;

// "Praha 1 - Staré Město" → "Praha 1". Helsinki-style single names stay as-is.
export function districtGroup(start){
 const d=String(start?.district||'').trim();
 if(!d)return '';
 const m=d.match(/^(Praha\s+\d+)\b/i);
 return m?m[1].replace(/\s+/g,' ').replace(/^praha/i,'Praha'):d;
}

export function districtGroups(starts){
 const seen=new Set(),list=[];
 for(const s of starts||[]){const g=districtGroup(s);if(!g||seen.has(g))continue;seen.add(g);list.push(g);}
 return list;
}

export function startsInDistrict(starts,group){
 if(!group)return starts||[];
 return (starts||[]).filter(s=>districtGroup(s)===group);
}

export function createStartPicker({doc=document,starts,current,onChange,districts=false}){
 const el=id=>doc.getElementById(id);
 const root=el('intro'),title=el('boot-title'),count=el('start-count'),status=el('start-status');
 const prev=el('start-prev'),next=el('start-next');
 const districtRow=el('start-district-picker'),districtLabel=el('start-district'),districtPrev=el('district-prev'),districtNext=el('district-next');
 let selected=current;
 const groups=districts?districtGroups(starts):[];
 const useDistricts=districts&&groups.length>1&&districtRow&&districtLabel&&districtPrev&&districtNext;
 let group=useDistricts?(districtGroup(selected)||groups[0]):'';
 if(useDistricts&&!groups.includes(group))group=groups[0];
 function visibleStarts(){return useDistricts?startsInDistrict(starts,group):starts;}
 function ensureSelected(){
  const list=visibleStarts();
  if(!list.length){selected=starts[0]||selected;return;}
  if(list.includes(selected))return;
  if(selected&&list.some(s=>(s.id||s.name)===(selected.id||selected.name))){
   selected=list.find(s=>(s.id||s.name)===(selected.id||selected.name));return;
  }
  selected=list[0];
 }
 ensureSelected();
 const many=()=>visibleStarts().length>1;
 function syncArrows(){
  const show=many();prev.hidden=next.hidden=count.hidden=!show;root.classList.toggle('has-picker',show||useDistricts);
  if(useDistricts){districtRow.hidden=false;districtLabel.textContent=group;root.classList.add('has-districts');}
  else if(districtRow)districtRow.hidden=true;
 }
 function render(direction=0){
  ensureSelected();syncArrows();
  const list=visibleStarts(),index=Math.max(0,list.indexOf(selected));
  title.textContent=selected.name;count.textContent=startPosition(index,list.length);
  if(direction){title.classList.remove('slide-next','slide-prev');void title.offsetWidth;title.classList.add(direction>0?'slide-next':'slide-prev');}
  return index;
 }
 function step(direction){
  if(!many()||!direction)return;
  selected=cycleStart(visibleStarts(),selected,direction);
  const index=render(direction);
  const list=visibleStarts();
  status.textContent=`${selected.name}, starting point ${index+1} of ${list.length}`;
  onChange(selected);
 }
 function stepDistrict(direction){
  if(!useDistricts||!direction)return;
  group=groups[cycleIndex(groups.length,groups.indexOf(group),direction)];
  ensureSelected();render(direction);
  status.textContent=`${group}, ${selected.name}`;
  onChange(selected);
 }
 // A mouse or touch click (detail>0) hands focus back to the page so “or press Enter” still
 // starts the game. A keyboard press (Enter/Space, detail 0) keeps focus on the arrow, so
 // pressing it again picks the next place, as a button should.
 const arrow=(button,direction,fn)=>button?.addEventListener('click',e=>{if(e?.detail>0)button.blur?.();fn(direction);});
 arrow(prev,-1,step);arrow(next,1,step);
 if(useDistricts){arrow(districtPrev,-1,stepDistrict);arrow(districtNext,1,stepDistrict);}
 let touch=null;
 root.addEventListener('touchstart',e=>{touch=e.touches.length===1&&!e.target.closest('a,summary,select,.boot-controls')?{x:e.touches[0].clientX,y:e.touches[0].clientY,t:e.timeStamp}:null;},{passive:true});
 root.addEventListener('touchend',e=>{
  if(!touch)return;const t=e.changedTouches[0];
  const s=swipeStep(t.clientX-touch.x,t.clientY-touch.y,{ms:e.timeStamp-touch.t});touch=null;
  if(s&&!root.classList.contains('gone'))step(s);
 },{passive:true});
 render();
 return {
  step,
  stepDistrict,
  get selected(){return selected;},
  get district(){return group;},
  // A start that could not load: show the one still in place.
  set(start){
   selected=start;
   if(useDistricts){const g=districtGroup(start);if(groups.includes(g))group=g;}
   render();
  },
  // While a picked place loads: the button says so and a progress line runs under the picker.
  busy(on){
   root.classList.toggle('switching',on);title.setAttribute('aria-busy',String(on));
   const label=el('start-label');if(label){label.dataset.idle??=label.textContent;label.textContent=on?`Loading ${selected.name}…`:label.dataset.idle;}
   if(on)status.textContent=`Loading ${selected.name}`;
  },
 };
}
