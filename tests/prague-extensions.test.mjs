import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {extensionCredit, extensionSourcesText} from '../src/extensions.js';
import {pointInPolygon} from '../src/geo.js';
import {startClear, startSurfaces} from '../src/start-placement.js';
import {CORRIDOR_PROVENANCE, CORRIDOR_SPECS, CORRIDOR_STARTS, NORTH_LAYER_IDS, NORTH_LAYER_NOTE} from '../src/prague-corridors.js';

const index = JSON.parse(fs.readFileSync('public/cities/prague/extensions/index.json', 'utf8'));
const KEPT = ['zlute-lazne', 'barrandov', 'troja', 'palmovka', 'bohnice', 'kobylisy', 'severni-spojka'];

test('Prague corridor catalog entries carry an OpenStreetMap provenance note', () => {
 assert.deepEqual(index.extensions.map(entry => entry.id), KEPT);
 assert.ok(!fs.existsSync('public/cities/prague/extensions/magistrala'));
 assert.ok(!fs.existsSync('public/cities/prague/extensions/airport'));
 assert.ok(CORRIDOR_SPECS.some(spec => spec.id === 'severni-spojka'));
 assert.ok(CORRIDOR_SPECS.some(spec => spec.id === 'jizni-spojka'));
 assert.ok(!CORRIDOR_SPECS.some(spec => spec.id === 'magistrala' || spec.id === 'airport'));
 for (const entry of index.extensions) {
  const note = NORTH_LAYER_IDS.includes(entry.id) ? NORTH_LAYER_NOTE : CORRIDOR_PROVENANCE.note;
  assert.equal(entry.provenance.note, note);
  assert.equal(extensionCredit(entry), note);
 }
 const line = extensionSourcesText(index.extensions, {helsinki: false});
 assert.match(line, /Troja to Bohnice/);
 assert.match(line, /OpenStreetMap contributors/);
 assert.doesNotMatch(line, /Seurasaari/);
 assert.doesNotMatch(line, /City of Helsinki/);
 assert.doesNotMatch(line, /Magistrála|Airport/);
});

test('the view distance stops short of the whole city disk and the HUD names the frame rate', () => {
 const main = fs.readFileSync('src/main.js', 'utf8');
 const html = fs.readFileSync('index.html', 'utf8');
 assert.match(main, /new THREE\.Fog\('#b9cbd4',330,580\)/);
 assert.match(main, /SURFACE_STREAM_RADIUS=640/);
 assert.match(main, /new THREE\.PerspectiveCamera\(58,captureFrame\.w\/captureFrame\.h,\.25,720\)/);
 assert.match(fs.readFileSync('src/tree-species.js', 'utf8'), /far:600/);
 assert.match(fs.readFileSync('src/extensions.js', 'utf8'), /radius:1200/);
 assert.match(main, /fps-readout/);
 assert.match(html, /id="fps-readout"/);
 assert.match(html, /id="district-label"[\s\S]{0,80}id="fps-readout"/);
});

test('built corridor starts are on a clear lane inside that pack', () => {
 const listed = index.extensions.flatMap(entry => entry.starts || []);
 assert.deepEqual(listed.map(start => start.name), CORRIDOR_STARTS.map(start => start.name));
 for (const start of CORRIDOR_STARTS) {
  const entry = index.extensions.find(item => item.id === start.extension);
  const published = entry.starts.find(item => item.name === start.name);
  assert.deepEqual(published, {...start});
  assert.ok(entry.playable.some(poly => pointInPolygon(start.x, start.z, poly)), `${start.name} is inside ${start.extension}`);
  const city = JSON.parse(gunzipSync(fs.readFileSync(`public/cities/prague/extensions/${start.extension}/city.pack`)));
  assert.ok(startClear(start, startSurfaces(city.roads, city.pavement || [])), `${start.name} is not on a clear lane`);
 }
 for (const id of ['zlute-lazne', 'kobylisy']) assert.equal(index.extensions.find(entry => entry.id === id).starts, undefined);
});

test('Troja and Bohnice keep centre layers instead of a thinned outline', () => {
 for (const id of NORTH_LAYER_IDS) {
  const entry = index.extensions.find(item => item.id === id);
  const city = JSON.parse(gunzipSync(fs.readFileSync(`public/cities/prague/extensions/${id}/city.pack`)));
  assert.ok(city.roads.length > 20, `${id} roads`);
  assert.ok(city.pavement.length > 10, `${id} pavement`);
  assert.ok(city.buildings.length > 10, `${id} buildings`);
  assert.ok(city.trees.length > 10, `${id} trees`);
  assert.equal(entry.furniture, 'furniture.json');
  const furniture = JSON.parse(fs.readFileSync(`public/cities/prague/extensions/${id}/furniture.json`, 'utf8'));
  assert.ok(furniture.items.length > 0, `${id} furniture`);
  const surfaces = JSON.parse(fs.readFileSync(`public/cities/prague/extensions/${id}/surface-index.json`, 'utf8'));
  assert.ok(surfaces.length > 0, `${id} surfaces`);
 }
});

test('a Helsinki extension without a note still uses the municipal credit', () => {
 const entry = {title: 'Mannerheimintie → Töölö → Seurasaari', provenance: {fetchedAt: '2026-10-09'}, counts: {inferredForestTrees: 5608}};
 assert.match(extensionCredit(entry), /City of Helsinki data fetched 2026-10-09/);
 assert.match(extensionCredit(entry), /5,608 forest trees/);
 assert.match(extensionSourcesText([entry], {helsinki: true}), /Seurasaari is car-free in reality/);
});

test('a catalog entry with neither a note nor Helsinki counts fails closed', () => {
 assert.throws(() => extensionCredit({id: 'bohnice', title: 'Troja to Bohnice'}), /missing a provenance note/);
 assert.throws(() => extensionSourcesText([{id: 'bohnice', title: 'Troja to Bohnice', provenance: {}}], {helsinki: false}), /missing a provenance note/);
});
