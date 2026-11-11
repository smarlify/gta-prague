import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {createCarKit,wheelGeometry,headBeams} from './car-kit.js';

// The named drivers' cars. Each is drawn from the cues people recognise the real car by:
// silhouette, lamp shapes, grille and the few details that are unique to it. Original geometry,
// not manufacturer CAD; marks are plain shapes (a ring, a bar), never traced badge artwork.
// The nose points along -Z, +X is the car's right. Every finish merges into one mesh.
//
// Upper bodies are built the same way throughout: a glass hull for the cabin (the seated driver
// shows through it), a painted hull wrapped over its rear end for the pillars and tail, and the
// rear window laid on that in matt black, so it stays dark when the cabin glass turns clear.

const lerp=(a,b,t)=>a+(b-a)*t;

// Door shut lines, handles and a mirror on each side: the same job on every body.
function doors(k,{W,belt,sill=.42,seams=[],handles=[],handle='chrome',right=null}){
 for(const side of [-1,1]){
  for(const z of [...seams,...(side>0&&right?right:[])])k.slab(.014,belt-sill-.04,.014,'black',side*(W+.002),(belt+sill)/2,z);
  for(const z of handles)k.slab(.03,.032,.15,handle,side*(W+.008),belt-.13,z);
 }
}
function mirrors(k,{W,y,z,mat='paint',w=.17,h=.10,d=.09}){
 for(const side of [-1,1]){k.slab(w,h,d,mat,side*(W+w/2+.02),y,z);k.slab(w*.75,h*.7,.012,'glass',side*(W+w/2+.02),y,z+d/2+.004);k.slab(.06,.03,.05,'black',side*(W+.01),y-h/2,z);}
}

// Škoda Scala. Wide ribbed grille, split two-tier lamps, a long glass tailgate that runs down
// between C-shaped tail lamps, and the spaced lettering strip across it.
export function buildScala(s,detailed){
 const k=createCarKit(detailed),{slab,panel,ring,strut,ramp,hull}=k;
 const L=s.l/2,W=s.w/2,B=s.belt,H=s.h,cowl=-1.02;
 k.wheels(s,{spokes:5,rim:.7});k.arches(s);
 hull([[-L,W*.85,.46,.74],[-L+.07,W*.94,.35,.80],[-L+.32,W*.99,.31,.87],[-L+.75,W,.30,.92],[cowl,W,.30,B],[.9,W,.32,B+.02],[L-.5,W,.36,B+.01],[L-.10,W*.95,.42,B-.03],[L,W*.86,.50,B-.14]],'paint');
 hull([[cowl,W*.90,B-.02,B+.05],[s.rf,W*.84,B,H-.06,W*.70],[s.rr,W*.84,B,H-.07,W*.70],[s.rg,W*.88,B-.02,B+.10,W*.80]],'glass',.08);
 // Painted rear pillars and hatch, with the rear window on top.
 hull([[s.rr-.16,W*.846,B,H-.064,W*.706],[s.rr,W*.846,B,H-.068,W*.706],[s.rg,W*.886,B-.02,B+.102,W*.806]],'paint',.08);
 ramp(W*1.30,.02,'rubber',[H-.085,s.rr+.05],[B+.135,s.rg-.02]);
 panel(W*1.42,.05,s.rr-s.rf+.12,'paint',0,H-.035,(s.rr+s.rf)/2);
 slab(W*1.0,.012,(s.rr-s.rf)*.62,'glass',0,H-.006,(s.rr+s.rf)/2-.10); // panoramic roof
 slab(W*1.40,.035,.20,'black',0,H-.062,s.rr+.09); // tailgate spoiler
 slab(.04,.05,.14,'black',0,H+.012,s.rr-.2);
 for(const side of [-1,1]){
  strut([side*W*.88,B+.02,cowl+.05],[side*W*.70,H-.07,s.rf],.075,'paint');
  strut([side*W*.855,B,.16],[side*W*.71,H-.08,.16],.07,'black');
  slab(.03,.03,s.rr-s.rf-.2,'black',side*W*.67,H+.002,(s.rr+s.rf)/2);
  slab(.05,.10,s.wb*.82,'black',side*(W-.01),.35,0);
  // Split lamps: a slim upper unit and a smaller lower one in a dark housing.
  slab(.42,.16,.05,'black',side*W*.62,.69,-L+.012);
  k.lamp(.38,.062,side*W*.62,.728,-L-.012,{lens:.7});k.lamp(.24,.05,side*W*.67,.65,-L-.012,{lens:.6});
  slab(.16,.05,.03,'black',side*W*.74,.47,-L+.07);
  // C-shaped tail lamp: two bars joined at the outer edge.
  slab(.36,.045,.05,'tail',side*W*.64,.875,L-.045);slab(.36,.045,.05,'tail',side*W*.64,.745,L-.02);slab(.055,.175,.05,'tail',side*W*.845,.81,L-.05);
  slab(.14,.03,.02,'tail',side*W*.70,.44,L-.005);
 }
 // Grille: dark field, upright chrome ribs, chrome frame.
 slab(W*.80,.17,.05,'black',0,.675,-L-.004);
 for(let i=0;i<13;i++)slab(.011,.14,.02,'chrome',-W*.36+i*W*.06,.675,-L-.032);
 slab(W*.86,.018,.03,'chrome',0,.765,-L-.03);slab(W*.70,.018,.03,'chrome',0,.588,-L-.03);
 for(const side of [-1,1])strut([side*W*.43,.765,-L-.03],[side*W*.35,.588,-L-.03],.018,'chrome');
 ring(.034,.008,'chrome',0,.80,-L+.035);
 slab(W*1.40,.15,.05,'black',0,.47,-L+.03);for(let i=0;i<3;i++)slab(W*1.30,.012,.02,'rubber',0,.43+i*.04,-L+.0);
 slab(W*1.62,.035,.12,'black',0,.34,-L+.08);
 // Tailgate: the glass continues down to the lamps, with five spaced letters.
 ramp(W*1.16,.02,'rubber',[B+.09,s.rg-.02],[.81,L+.004]);
 for(let i=0;i<5;i++)ramp(.05,.03,'chrome',[.945,L-.14],[.905,L-.10],(i-2)*.115);
 slab(W*1.66,.15,.08,'black',0,.42,L-.03);slab(W*.95,.025,.04,'chrome',0,.355,L+.005);
 doors(k,{W,belt:B,seams:[-.78,.16,1.06],handles:[-.08,.84],handle:'paint'});
 mirrors(k,{W,y:B+.075,z:cowl+.22,mat:'black'});
 k.plates(-L-.03,L+.014,{y:.47,yRear:.63});
 const body=k.finish();
 if(detailed)body.add(headBeams(s));
 return k.group;
}

// Mercedes G. A box: flat panels, upright screen, round lamps in square surrounds, indicator
// pods on the wings, a rub strip and exposed hinges down the flank, the spare wheel on the door.
export function buildGwagen(s,detailed){
 const k=createCarKit(detailed),{slab,panel,tube,ring,strut,hull}=k;
 const L=s.l/2,W=s.w/2,B=s.belt,H=s.h,gf=s.gf,tail=L-.10;
 k.wheels(s,{width:.27,track:W-.075,spokes:5,rim:.62});
 hull([[-L+.10,W*.93,.60,1.16],[-L+.16,W*.96,.52,1.20],[gf-.03,W*.96,.50,1.22],[gf,W*.98,.50,B],[tail,W*.98,.50,B],[L-.05,W*.95,.56,B-.02]],'paint',.035);
 hull([[gf+.02,W*.94,B-.01,B+.03,W*.90],[gf+.16,W*.93,B,H-.05,W*.885],[tail-.04,W*.93,B,H-.05,W*.885],[tail,W*.93,B,H-.09,W*.885]],'glass',.03);
 const roofZ=(gf+.12+tail)/2,roofL=tail-gf-.06;
 panel(W*1.84,.07,roofL,'paint',0,H-.03,roofZ,0,0,0,.03);
 panel(W*1.26,.05,gf+L-.22,'paint',0,1.218,(-L+.16+gf)/2,0,0,0,.02); // raised bonnet centre
 for(const side of [-1,1]){
  slab(.03,.035,roofL,'black',side*W*.92,H-.072,roofZ); // rain gutter
  strut([side*W*.925,B,gf+.03],[side*W*.89,H-.06,gf+.17],.10,'paint');
  for(const [z,d] of [[-.07,.13],[1.01,.13],[tail-.13,.26]])slab(.05,H-B-.04,d,'paint',side*W*.905,(B+H-.05)/2,z);
  slab(.05,.10,tail-gf-.2,'paint',side*W*.925,B+.04,(gf+tail)/2); // sill of the side glass
  slab(.10,.045,.20,'plate',side*W*.80,1.235,-L+.44); // indicator pod on the wing
  slab(.035,.075,s.l*.78,'black',side*(W*.98+.012),.86,.06); // rub strip
  for(const z of [-s.wb/2,s.wb/2]){ring(s.r+.075,.075,'black',side*(W-.005),s.r,z,{axis:'x',arc:Math.PI});slab(.14,.20,.66,'black',side*(W-.02),s.r+.16,z);}
  slab(.15,.045,s.wb-1.0,'black',side*(W+.035),.42,0); // running board
  for(const z of [gf+.06,-.02])for(const y of [.74,1.14])slab(.03,.075,.05,'black',side*(W*.98+.012),y,z); // exposed hinges
  slab(.20,.17,.10,'black',side*(W+.11),B+.13,gf+.26);slab(.15,.12,.012,'glass',side*(W+.11),B+.13,gf+.315);
  tube(.036,.20,'chrome',side*(W+.01),.37,.78,'x'); // side exhaust under the rear door
  // Round lamp in a square surround, daytime strip beneath.
  slab(.30,.30,.04,'black',side*W*.66,.96,-L+.09);
  tube(.118,.04,'plate',side*W*.66,.96,-L+.08,'z',detailed?18:10);tube(.078,.05,'head',side*W*.66,.96,-L+.07,'z',detailed?14:8);ring(.118,.014,'chrome',side*W*.66,.96,-L+.05);
  slab(.22,.025,.03,'plate',side*W*.66,.775,-L+.085);
  slab(.22,.085,.04,'tail',side*W*.72,.73,L-.04);
  slab(.30,H-B-.10,.03,'paint',side*W*.73,(B+H-.09)/2,tail+.005);
 }
 // Three-louvre grille with a ringed three-point star.
 slab(W*.88,.42,.04,'black',0,.94,-L+.085);
 for(const dy of [-.13,0,.13])slab(W*.82,.036,.03,'chrome',0,.94+dy,-L+.068);
 ring(.088,.012,'chrome',0,.94,-L+.045);
 for(let i=0;i<3;i++){const g=new THREE.BoxGeometry(.018,.085,.012);g.translate(0,.042,0);k.add(g,'chrome',0,.94,-L+.045,0,0,i*Math.PI*2/3);}
 panel(W*2.02,.20,.16,'black',0,.60,-L+.07);slab(W*.86,.10,.05,'chrome',0,.52,-L+.0);
 // Rear door: paint below the window, third lamp above, the covered spare with its steel ring.
 slab(W*1.2,.17,.03,'paint',0,B+.085,tail+.005);slab(.32,.03,.03,'tail',0,H-.13,tail+.008);
 tube(.39,.17,'black',0,1.12,L+.03,'z',detailed?22:12);ring(.355,.034,'chrome',0,1.12,L+.118);tube(.11,.02,'chrome',0,1.12,L+.118,'z');
 panel(W*1.98,.18,.12,'black',0,.60,L-.05);
 doors(k,{W:W*.98,belt:B,sill:.5,seams:[gf+.02,-.05,1.0],handles:[-.24,.82]});
 k.plates(-L-.016,L+.014,{y:.60,yRear:.60});
 const body=k.finish();
 if(detailed)body.add(headBeams(s));
 return k.group;
}

// BMW X5. Tall rounded SUV: the joined double kidney between slim twin lamps, an air breather
// behind the front wheel, a forward-leaning rear pillar, L-shaped tail lamps and a split tailgate.
export function buildX5(s,detailed){
 const k=createCarKit(detailed),{slab,panel,ring,strut,ramp,hull}=k;
 const L=s.l/2,W=s.w/2,B=s.belt,H=s.h,cowl=-1.18;
 k.wheels(s,{width:.28,track:W-.09,spokes:5,rim:.72});k.arches(s,{x:W-.03,grow:.03,lip:0});
 hull([[-L,W*.84,.52,.98],[-L+.10,W*.94,.40,1.05],[-L+.6,W,.36,1.09],[cowl,W,.36,B],[.8,W,.38,B+.03],[L-.5,W,.40,B+.03],[L-.12,W*.96,.46,B],[L,W*.86,.56,B-.12]],'paint');
 hull([[cowl,W*.90,B-.02,B+.05],[s.rf,W*.86,B,H-.07,W*.72],[s.rr,W*.86,B+.02,H-.10,W*.70],[s.rg,W*.88,B,B+.16,W*.80]],'glass',.08);
 hull([[s.rr-.30,W*.866,B+.015,H-.092,W*.716],[s.rr,W*.866,B+.02,H-.098,W*.706],[s.rg,W*.886,B,B+.162,W*.806]],'paint',.08);
 ramp(W*1.30,.02,'rubber',[H-.115,s.rr+.05],[B+.20,s.rg-.02]);
 panel(W*1.50,.06,s.rr-s.rf+.14,'paint',0,H-.05,(s.rr+s.rf)/2);
 slab(W*1.44,.04,.22,'paint',0,H-.105,s.rr+.13);slab(.045,.06,.16,'black',0,H,s.rr-.25);
 for(const side of [-1,1]){
  strut([side*W*.885,B+.02,cowl+.05],[side*W*.72,H-.08,s.rf],.08,'paint');
  strut([side*W*.87,B,.12],[side*W*.725,H-.09,.12],.075,'black');
  slab(.02,.03,s.rr-.30-cowl-.2,'chrome',side*W*.905,B+.035,(cowl+s.rr-.30)/2+.08); // chrome window line
  slab(.036,.04,s.rr-s.rf-.12,'chrome',side*W*.65,H-.005,(s.rr+s.rf)/2); // roof rail
  for(const z of [-s.wb/2,s.wb/2])ring(s.r+.065,.055,'black',side*(W-.012),s.r,z,{axis:'x',arc:Math.PI});
  slab(.06,.13,s.wb-.86,'black',side*(W-.012),.43,0);
  // Air breather behind the front wheel.
  slab(.016,.17,.055,'black',side*(W+.003),.80,-s.wb/2+.64);slab(.02,.19,.014,'chrome',side*(W+.004),.80,-s.wb/2+.675);
  // Slim twin-element lamps that reach the kidneys.
  slab(.44,.12,.05,'black',side*W*.62,.92,-L+.012);
  k.lamp(.19,.085,side*W*.515,.92,-L-.012,{lens:.62});k.lamp(.19,.085,side*W*.725,.92,-L-.012,{lens:.62});
  slab(.055,.21,.05,'black',side*W*.76,.62,-L+.0); // air curtain
  // L-shaped tail lamp, and the trapezoid tailpipe below.
  slab(.50,.07,.05,'tail',side*W*.58,B-.10,L-.035);slab(.11,.16,.05,'tail',side*W*.855,B-.145,L-.07);
  slab(.21,.075,.06,'chrome',side*W*.56,.475,L-.01);
 }
 slab(W*.92,.17,.05,'black',0,.62,-L-.0);slab(W*.84,.05,.06,'chrome',0,.49,-L+.01);
 slab(W*.62,.02,.03,'chrome',0,B-.10,L+.0);
 slab(W*1.74,.012,.02,'black',0,.86,L-.03); // split tailgate
 slab(W*1.80,.20,.08,'black',0,.52,L-.045);slab(W*.5,.05,.05,'chrome',0,.44,L-.01);
 doors(k,{W,belt:B,sill:.5,seams:[-.92,.12,1.12],handles:[-.14,.92],handle:'paint'});
 mirrors(k,{W,y:B+.09,z:cowl+.26,w:.19,h:.12});
 k.plates(-L-.016,L+.014,{y:.60,yRear:.70});
 const body=k.finish();
 // The double kidney: two dark openings in one piece, chrome surrounds and upright slats in another.
 const openings=[],frames=[],gz=-L-.012,gy=.91;
 for(const side of [-1,1]){
  openings.push(new RoundedBoxGeometry(.25,.26,.07,1,.05).translate(side*.16,gy,gz));
  const surround=new THREE.TorusGeometry(.19,.03,5,4);surround.rotateZ(Math.PI/4);surround.scale(1,1.02,1);surround.translate(side*.16,gy,gz-.04);frames.push(surround);
  for(let i=0;i<3;i++)frames.push(new THREE.BoxGeometry(.012,.21,.02).translate(side*.16-.06+i*.06,gy,gz-.036));
 }
 body.add(k.named('kidney',openings,'black'),k.named('kidney',frames,'chrome'));
 if(detailed)body.add(headBeams(s));
 return k.group;
}

// "Jezdím na naftu – nepatřím do šrotu": drawn once, shared by both sides and the rear doors.
export const TRANSPORTER_LABEL=['JEZDÍM NA NAFTU','NEPATŘÍM DO ŠROTU'];
let labelTexture=null;
function transporterLabel(){
 if(labelTexture||typeof document==='undefined')return labelTexture;
 const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=320;
 const ctx=canvas.getContext('2d');if(!ctx)return null;
 ctx.clearRect(0,0,1024,320);ctx.textAlign='center';ctx.textBaseline='middle';
 ctx.font='800 104px "Arial Black",Arial,sans-serif';ctx.fillStyle='#14233f';ctx.fillText(TRANSPORTER_LABEL[0],512,92,990);
 ctx.fillStyle='#c4161c';ctx.fillRect(40,156,944,8);
 ctx.font='800 96px "Arial Black",Arial,sans-serif';ctx.fillText(TRANSPORTER_LABEL[1],512,238,990);
 labelTexture=new THREE.CanvasTexture(canvas);labelTexture.colorSpace=THREE.SRGBColorSpace;labelTexture.anisotropy=8;
 return labelTexture;
}

// Volkswagen Transporter panel van. Short sloping bonnet, big screen, one long flat box, black
// bumpers and rub strips, tall corner lamps, a sliding door on the kerb side, and the slogan.
export function buildTransporter(s,detailed){
 const k=createCarKit(detailed),{slab,panel,ring,strut,hull}=k;
 const L=s.l/2,W=s.w/2,B=s.belt,H=s.h,ws0=-L+.78,ws1=-L+1.50,cab=-L+2.05;
 k.wheels(s,{width:.23,track:W-.07,spokes:6,rim:.6,rimColor:'#aeb4b7'});k.arches(s);
 hull([[-L,W*.88,.46,.90],[-L+.10,W*.96,.34,.98],[ws0-.06,W,.32,1.14],[ws0,W,.32,B],[L-.08,W,.34,B],[L,W*.97,.42,B-.02]],'paint',.08);
 hull([[ws0+.02,W*.95,B-.02,B+.04,W*.92],[ws1,W*.975,B,H-.02,W*.89],[cab,W*.975,B,H-.02,W*.89]],'glass',.08);
 hull([[cab,W*.985,B-.01,H,W*.90],[L-.10,W*.985,B-.01,H,W*.90],[L-.02,W*.97,B-.01,H-.05,W*.89]],'paint',.09);
 panel(W*1.82,.05,cab-ws1+.16,'paint',0,H-.022,(ws1+cab)/2-.03);
 for(let i=0;i<3;i++)slab(W*1.5,.02,.10,'paint',0,H+.004,cab+.5+i*.85); // roof ribs
 slab(W*1.72,.012,.014,'black',0,.985,-L+.11); // bonnet shut line
 for(const side of [-1,1]){
  strut([side*W*.945,B+.02,ws0+.06],[side*W*.89,H-.04,ws1],.09,'paint');
  slab(.03,.09,s.l*.86,'black',side*(W+.005),.62,0); // rub strip
  slab(.42,.19,.05,'black',side*W*.64,.80,-L+.012);k.lamp(.38,.15,side*W*.64,.80,-L-.012,{lens:.62});
  slab(.16,.05,.03,'plate',side*W*.70,.47,-L-.012);
  // Big door mirror on a stalk.
  slab(.13,.25,.15,'black',side*(W+.14),B+.20,ws0+.42);slab(.10,.20,.012,'glass',side*(W+.14),B+.20,ws0+.50);slab(.10,.03,.04,'black',side*(W+.04),B+.10,ws0+.40);
  slab(.12,.56,.04,'tail',side*W*.855,1.17,L-.005); // tall corner lamp
  slab(W*.62,.50,.02,'rubber',side*W*.40,B+.44,L-.012); // rear door window
  slab(.03,.03,.16,'black',side*(W+.008),B-.13,ws0+1.05);
 }
 // Two-bar grille with a plain ring between the lamps.
 slab(W*.60,.15,.04,'black',0,.82,-L-.0);for(const dy of [-.035,.035])slab(W*.60,.022,.03,'chrome',0,.82+dy,-L-.012);
 ring(.075,.014,'chrome',0,.82,-L-.03);
 panel(W*1.99,.27,.15,'black',0,.50,-L+.065);for(let i=0;i<3;i++)slab(W*1.0,.018,.02,'rubber',0,.44+i*.045,-L-.012);
 panel(W*1.99,.21,.12,'black',0,.48,L-.05);
 slab(.016,H-.60,.02,'black',0,(H+.60)/2,L-.012);slab(.04,.14,.03,'black',.07,B-.06,L+.0);slab(.30,.03,.03,'tail',0,H-.07,L-.02);
 // Kerb side: sliding door and its rail.
 doors(k,{W,belt:B,sill:.44,seams:[ws0+.18,cab],right:[cab+1.12]});
 slab(.02,.035,1.28,'black',W*.985+.006,B+.03,cab+1.72);slab(.03,.03,.16,'black',W+.008,B-.13,cab+.16);
 k.plates(-L-.016,L+.014,{y:.52,yRear:.50});
 const body=k.finish();
 // The slogan on both flanks and across the rear doors.
 const map=transporterLabel(),material=new THREE.MeshStandardMaterial({map,color:map?'#ffffff':'#14233f',transparent:true,opacity:map?1:0,roughness:.55,polygonOffset:true,polygonOffsetFactor:-2});
 material.name='label';
 const lean=Math.atan2(W*.085,H-B),sideX=W*.985-(.42/(H-B))*W*.085+.012;
 for(const side of [-1,1]){const g=new THREE.PlaneGeometry(2.25,.70);g.rotateY(side*Math.PI/2);g.rotateZ(side*lean);g.translate(side*sideX,B+.42,(cab+L)/2+.05);const mesh=new THREE.Mesh(g,material);mesh.name='label';body.add(mesh);}
 const rear=new THREE.Mesh(new THREE.PlaneGeometry(1.36,.42).translate(0,.86,L+.006),material);rear.name='label';body.add(rear);
 body.userData.label=TRANSPORTER_LABEL.join(' – ');
 if(detailed)body.add(headBeams(s));
 return k.group;
}

// Porsche Panamera. Long and low, wings standing a little higher than the bonnet with the lamps
// set into them, a roof that falls in one line to the tail, wide hips and a full-width light strip.
export function buildPanamera(s,detailed){
 const k=createCarKit(detailed),{slab,panel,tube,strut,ramp,hull}=k;
 const L=s.l/2,W=s.w/2,B=s.belt,H=s.h,cowl=-1.05,tailZ=s.rg;
 k.wheels(s,{width:.29,track:W-.10,spokes:5,rim:.76});k.arches(s,{x:W-.02,grow:.035});
 hull([[-L,W*.78,.40,.62],[-L+.14,W*.92,.28,.71],[-L+.70,W,.26,.78],[cowl,W,.26,B-.03],[.2,W*.985,.26,B],[1.25,W*1.03,.28,B+.01],[L-.55,W*1.02,.30,B-.02],[L-.12,W*.95,.38,B-.10],[L,W*.84,.46,B-.20]],'paint');
 hull([[cowl,W*.86,B-.03,B+.03],[-.30,W*.82,B,H-.04,W*.62],[.45,W*.82,B,H-.03,W*.62],[1.08,W*.832,B,H-.168,W*.606]],'glass',.08);
 // Fastback: one painted tail from behind the doors to the lip, the rear window laid into it.
 hull([[.92,W*.834,B-.01,H-.118,W*.618],[1.35,W*.85,B-.01,H-.215,W*.612],[tailZ,W*.84,B-.03,B+.07,W*.68],[tailZ+.16,W*.80,B-.05,B+.0,W*.70]],'paint',.08);
 ramp(W*1.04,.02,'rubber',[H-.128,.98],[B+.185,1.76]);
 panel(W*1.27,.05,.84,'paint',0,H-.02,.07);ramp(W*1.25,.045,'paint',[H-.022,.47],[H-.128,.97]);
 slab(W*.80,.012,.56,'glass',0,H+.007,.03); // glass roof
 slab(W*1.34,.022,.10,'black',0,B+.065,tailZ+.03); // spoiler lip
 for(const side of [-1,1]){
  // Wing standing proud of the bonnet, with a long lamp set into its top.
  hull([[-L+.10,.13,.60,.705],[-L+.45,.20,.66,.80],[-L+1.0,.20,.74,.865],[cowl+.12,.15,.82,.90]],'paint',.06,side*W*.70);
  ramp(.22,.03,'plate',[.712,-L+.13],[.800,-L+.46],side*W*.70);for(const dx of [-.055,.055])for(const t of [.3,.7])ramp(.05,.036,'head',[lerp(.712,.80,t)-.016,lerp(-L+.13,-L+.46,t)-.045],[lerp(.712,.80,t)+.016,lerp(-L+.13,-L+.46,t)+.045],side*W*.70+dx);
  slab(W*.44,.11,.05,'black',side*W*.50,.47,-L-.0);slab(.30,.018,.03,'plate',side*W*.50,.545,-L-.012);
  strut([side*W*.845,B+.01,cowl+.05],[side*W*.62,H-.05,-.30],.07,'paint');
  strut([side*W*.83,B,.10],[side*W*.625,H-.045,.10],.06,'black');
  slab(.016,.09,.24,'black',side*(W+.002),.60,-s.wb/2+.52);slab(.02,.018,.24,'chrome',side*(W+.004),.60,-s.wb/2+.52); // air outlet
  slab(.05,.09,s.wb-.84,'black',side*(W-.012),.31,0);
  slab(.30,.07,.05,'tail',side*W*.72,.715,L-.06);
  for(const dx of [-.07,.07])tube(.046,.09,'chrome',side*W*.50+dx,.37,L-.015,'z',detailed?12:8); // twin pipes each side
 }
 slab(W*.46,.07,.04,'black',0,.45,-L-.005);
 // Full-width strip with spaced letters beneath.
 slab(W*1.70,.034,.04,'tail',0,.765,L-.045);slab(W*.62,.045,.02,'black',0,.705,L-.012);
 for(let i=0;i<7;i++)slab(.032,.026,.024,'chrome',(i-3)*.075,.705,L-.012);
 slab(W*1.34,.13,.08,'black',0,.385,L-.05);
 doors(k,{W,belt:B,sill:.36,seams:[-.68,.10,1.02],handles:[-.10,.84],handle:'paint'});
 mirrors(k,{W:W-.06,y:B+.05,z:cowl+.46,w:.16,h:.075});
 k.plates(-L-.016,L+.014,{y:.52,yRear:.55});
 const body=k.finish();
 if(detailed)body.add(headBeams(s));
 return k.group;
}

// Lexus ES. The hourglass "spindle" grille filling the whole nose, sharp lamps with an arrowhead
// running light beneath, a low coupe roofline and tail lamps joined across the boot lid.
export function buildEs(s,detailed){
 const k=createCarKit(detailed),{slab,panel,ring,strut,ramp,hull}=k;
 const L=s.l/2,W=s.w/2,B=s.belt,H=s.h,cowl=-1.08;
 k.wheels(s,{width:.235,track:W-.07,spokes:7,rim:.70});k.arches(s);
 hull([[-L,W*.86,.42,.74],[-L+.12,W*.95,.30,.81],[-L+.65,W,.28,.87],[cowl,W,.28,B-.01],[.6,W,.30,B+.02],[1.55,W,.32,B+.03],[L-.35,W*.98,.36,B+.02],[L-.08,W*.94,.42,B-.02],[L,W*.84,.50,B-.12]],'paint');
 hull([[cowl,W*.88,B-.02,B+.04],[s.rf,W*.84,B,H-.05,W*.68],[s.rr,W*.84,B+.01,H-.06,W*.67],[s.rg,W*.86,B+.01,B+.07,W*.74]],'glass',.08);
 hull([[s.rr-.22,W*.846,B+.012,H-.052,W*.682],[s.rr,W*.846,B+.012,H-.058,W*.676],[s.rg,W*.866,B+.012,B+.072,W*.746]],'paint',.08);
 ramp(W*1.20,.02,'rubber',[H-.075,s.rr+.05],[B+.095,s.rg-.03]);
 panel(W*1.40,.05,s.rr-s.rf+.12,'paint',0,H-.03,(s.rr+s.rf)/2);
 slab(.04,.05,.15,'black',0,H+.01,s.rr-.05);
 slab(W*1.50,.02,.06,'paint',0,B+.012,L-.17); // boot lip
 for(const side of [-1,1]){
  strut([side*W*.865,B+.02,cowl+.05],[side*W*.68,H-.06,s.rf],.075,'paint');
  strut([side*W*.85,B,.14],[side*W*.69,H-.07,.14],.065,'black');
  slab(.02,.028,s.rr-.22-cowl-.2,'chrome',side*W*.885,B+.03,(cowl+s.rr-.22)/2+.08); // chrome window line
  slab(.02,.03,s.wb-.8,'chrome',side*(W+.003),.40,0);slab(.05,.09,s.wb-.84,'black',side*(W-.012),.33,0);
  // Sharp lamp and the arrowhead running light under it.
  slab(.42,.10,.05,'black',side*W*.63,.775,-L+.012);k.lamp(.38,.062,side*W*.63,.787,-L-.014,{lens:.7});
  strut([side*W*.47,.70,-L-.02],[side*W*.84,.715,-L-.02],.02,'plate');strut([side*W*.47,.70,-L-.02],[side*W*.58,.65,-L-.02],.02,'plate');
  slab(.20,.13,.05,'black',side*W*.72,.50,-L+.0);
  // L-shaped tail lamp.
  slab(.48,.06,.05,'tail',side*W*.60,B-.08,L-.04);slab(.075,.15,.05,'tail',side*W*.865,B-.125,L-.075);
  slab(.14,.025,.02,'tail',side*W*.70,.47,L-.0);
 }
 // Spindle grille: an hourglass field, chrome outline, bars that follow its width.
 const outline=[[-.33,.775],[.33,.775],[.19,.62],[.44,.34],[-.44,.34],[-.19,.62]];
 const shape=new THREE.Shape();outline.forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y));shape.closePath();
 k.add(new THREE.ExtrudeGeometry(shape,{depth:.06,bevelEnabled:false}),'black',0,0,-L-.035);
 outline.forEach(([x,y],i)=>{const [nx,ny]=outline[(i+1)%outline.length];strut([x,y,-L-.04],[nx,ny,-L-.04],.022,'chrome');});
 for(let y=.385;y<.76;y+=.047){const half=y>=.62?lerp(.19,.33,(y-.62)/.155):lerp(.44,.19,(y-.34)/.28);slab(half*2-.07,.012,.02,'chrome',0,y,-L-.04);}
 ring(.05,.009,'chrome',0,.66,-L-.052,{sx:1.35});
 slab(W*.72,.025,.03,'chrome',0,B-.07,L-.0);
 slab(W*1.62,.15,.08,'black',0,.42,L-.045);slab(W*1.2,.02,.03,'chrome',0,.375,L-.0);
 doors(k,{W,belt:B,sill:.38,seams:[-.84,.14,1.08],handles:[-.10,.88]});
 mirrors(k,{W,y:B+.07,z:cowl+.26});
 k.plates(-L-.078,L+.014,{y:.50,yRear:.66});
 const body=k.finish();
 if(detailed)body.add(headBeams(s));
 return k.group;
}

// Tuktuk. One wheel under a rounded nose with a single lamp, an open cab with handlebars, a bench
// in a low tub over two rear wheels, and a canvas canopy on thin posts.
export const TUKTUK_CANOPY='#f2c230';
export function buildTuktuk(s,detailed){
 const k=createCarKit(detailed),{slab,panel,tube,ring,strut,ramp,hull}=k;
 const L=s.l/2,W=s.w/2,H=s.h,front=-s.wb/2,rear=s.wb/2,track=W-.09;
 const canopy=new THREE.MeshStandardMaterial({color:TUKTUK_CANOPY,roughness:.85,metalness:0});canopy.name='canopy';k.mats.canopy=canopy;
 // Pivot order is left front, left rear, right front, right rear; the single front wheel takes
 // the first slot and the third stays empty, so steering and spin need no special case.
 const geometry=wheelGeometry(s.r,.13,{detailed,spokes:4,rim:.55});
 for(const [x,z,real] of [[0,front,true],[-track,rear,true],[0,front,false],[track,rear,true]]){
  const pivot=new THREE.Group();pivot.position.set(x,s.r,z);k.group.add(pivot);const spin=new THREE.Group();pivot.add(spin);
  if(real){const mesh=new THREE.Mesh(geometry,k.mats.wheel);mesh.name='wheel';mesh.castShadow=true;spin.add(mesh);}
 }
 // Nose cowl, mudguards and the passenger tub.
 hull([[-L+.04,.15,.52,.84],[-L+.2,.30,.42,1.0],[-L+.48,.42,.36,1.06],[-L+.74,.47,.34,1.02]],'paint',.08);
 ring(s.r+.055,.05,'paint',0,s.r,front,{axis:'x',arc:Math.PI});
 for(const side of [-1,1])ring(s.r+.055,.05,'paint',side*track,s.r,rear,{axis:'x',arc:Math.PI});
 hull([[-.12,W*.94,.30,.70],[.85,W,.30,.78],[L-.08,W*.98,.34,.80],[L,W*.92,.42,.76]],'paint',.07);
 slab(W*1.5,.07,1.0,'black',0,.33,-.35); // cab floor
 slab(.5,.02,.012,'chrome',0,.80,-L+.07);slab(.36,.02,.012,'chrome',0,.72,-L+.06); // nose trim
 // Single round lamp, screen in a dark frame, wiper.
 tube(.10,.05,'plate',0,.93,-L+.045,'z',detailed?16:10);tube(.066,.07,'head',0,.93,-L+.03,'z',detailed?12:8);ring(.10,.014,'chrome',0,.93,-L+.01);
 ramp(.84,.02,'glass',[1.06,-L+.50],[1.64,-L+.68]);
 for(const side of [-1,1])strut([side*.44,1.03,-L+.49],[side*.44,1.68,-L+.69],.036,'black');
 ramp(.90,.036,'black',[1.64,-L+.675],[1.69,-L+.69]);strut([-.1,1.10,-L+.50],[.16,1.34,-L+.575],.012,'black');
 // Handlebars, driver's saddle and the bar behind it.
 strut([0,.98,-L+.50],[0,1.04,-L+.66],.03,'black');tube(.018,.62,'black',0,1.04,-L+.66,'x');
 for(const side of [-1,1])tube(.026,.10,'rubber',side*.30,1.04,-L+.66,'x');
 slab(.52,.10,.36,'black',0,.62,-.36);tube(.02,W*1.8,'chrome',0,.98,-.14,'x');slab(W*1.7,.30,.035,'black',0,.82,-.14);
 // Passenger bench and backrest.
 slab(1.08,.13,.44,'black',0,.72,.50);slab(1.12,.46,.09,'black',0,1.02,.78,-.12);
 slab(W*1.86,.36,.04,'paint',0,.98,.88);
 // Canopy on thin posts, with a valance down each side.
 panel(W*2.06,.07,s.l-.25,'canopy',0,H-.04,.02,0,0,0,.03);slab(W*2.0,.09,.05,'canopy',0,H-.10,-L+.16);
 for(const side of [-1,1]){
  slab(.03,.12,s.l-.35,'canopy',side*W*1.01,H-.11,.02);
  for(const [z,y] of [[-.14,.74],[.88,.80],[L-.12,.80]])tube(.018,H-.08-y,'chrome',side*W*.96,(H-.08+y)/2,z,'y');
  strut([side*W*.96,1.69,-L+.69],[side*W*.96,H-.08,-L+.72],.03,'chrome');strut([side*.44,1.69,-L+.69],[side*W*.96,1.69,-L+.69],.03,'black');
  strut([side*W*.99,.80,.88],[side*W*.99,.80,L-.12],.03,'chrome'); // grab rail
  slab(.10,.10,.04,'tail',side*W*.78,.62,L+.0);slab(.07,.05,.03,'plate',side*.36,.80,-L+.21);
 }
 tube(.03,W*1.9,'chrome',0,.40,L+.03,'x');
 k.plates(null,L+.012,{yRear:.60,width:.34});
 const body=k.finish();
 if(detailed)body.add(headBeams(s));
 return k.group;
}
