// Prague traffic and police colours. Shapes stay the shared vehicle models;
// this only picks which finish a Praha city uses.
export const SKODA_PAINT=['#f4f5f2','#d7dbe0','#c5c9ce','#1c1e21','#2c3034','#8b9198','#6e747b','#b4232c','#1e4b8f'];

export function policeLiveryFor(cityId){
 return cityId==='prague'?'praha':'fi';
}
