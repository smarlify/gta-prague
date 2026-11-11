import './mapillary-attribution.css';
import {withUtm} from './utm.js';

// Mapillary's developer terms require a linked logo when extracted map features
// are integrated. This attribution does not grant downstream dataset rights.
export function installMapillaryAttribution(city,doc=document){
 for(const el of doc.querySelectorAll('[data-mapillary-credit]'))el.remove();
 if(!/mapillary/i.test(city?.attribution||''))return;
 function credit(className){
  const a=doc.createElement('a');a.className=className;a.dataset.mapillaryCredit='';
  a.href=withUtm('https://www.mapillary.com/','mapillary');a.target='_blank';a.rel='noreferrer';
  a.setAttribute('aria-label','Mapillary street-level data — opens in a new tab');
  const logo=doc.createElement('img');logo.src='/branding/mapillary-logo.png';logo.alt='Mapillary';logo.width=120;logo.height=40;
  a.append(logo);return a;
 }
 doc.querySelector('#app')?.append(credit('mapillary-attribution'));
 const sources=doc.querySelector('#sources-dialog');
 if(sources){
  const row=doc.createElement('p');row.className='mapillary-source-credit';row.dataset.mapillaryCredit='';
  const text=doc.createElement('span');text.textContent='Street-level imagery and extracted feature data from Mapillary. Each has its own applicable terms.';
  row.append(credit('mapillary-source-logo'),text);sources.append(row);
 }
}
