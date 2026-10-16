import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import proj4 from 'proj4';
import {pointInPolygon, SpatialIndex} from '../src/geo.js';
import {carSamples, makeCar} from '../src/physics.js';
import {pickStart} from '../src/cities.js';
import {cherryBlossomTrees, PETRIN} from '../src/prague-scenery.js';

const projection = '+proj=tmerc +lat_0=50.08747 +lon_0=14.42125 +k=1 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs';
const toLocal = proj4('EPSG:4326', projection);
const local = (lon, lat) => { const [x, y] = toLocal.forward([lon, lat]); return [Math.round(x * 100) / 100, Math.round(-y * 100) / 100]; };

const def = JSON.parse(readFileSync('cities/prague/city.json', 'utf8'));
const registry = JSON.parse(readFileSync('public/cities/index.json', 'utf8')).cities.find(c => c.id === 'prague');
const city = JSON.parse(gunzipSync(readFileSync('public/cities/prague/city.pack')));
const trams = JSON.parse(readFileSync('public/cities/prague/trams.json', 'utf8'));
const buildings = new SpatialIndex(city.buildings);
const roads = new SpatialIndex(city.roads);
const pavement = new SpatialIndex(city.pavement);
const parks = new SpatialIndex(city.parks);
const byName = name => city.landmarks.find(l => l.name === name);
const clear = (x, z, heading = 0) => !carSamples(makeCar(x, z, heading)).some(([a, b]) => buildings.at(a, b));

function trackDistance(x, z) {
  let best = Infinity;
  for (const path of trams.paths) for (let i = 1; i < path.points.length; i++) {
    const a = path.points[i - 1], b = path.points[i], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
    if (!l2) continue;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2));
    best = Math.min(best, Math.hypot(a[0] + dx * t - x, a[1] + dz * t - z));
  }
  return best;
}

test('Petřín is the boot start and both new places are on the list', () => {
  assert.equal(registry.defaultStart, 'Petřín');
  assert.equal(def.defaultStart, 'Petřín');
  assert.equal(registry.counts.starts, city.landmarks.length);
  assert.ok(city.landmarks.some(l => l.name === 'Petřín'));
  assert.ok(city.landmarks.some(l => l.name === 'Jelení příkop'));
  assert.equal(pickStart(city.landmarks, registry.defaultStart).name, 'Petřín');
  assert.equal(city.landmarks[0].name, 'Petřín');
});

test('Petřín starts in the middle of the sakura grove, off the road and clear of buildings', () => {
  const start = byName('Petřín');
  const cherries = cherryBlossomTrees().filter(t => Math.hypot(t.p[0] - PETRIN.x, t.p[1] - PETRIN.z) < PETRIN.radius);
  assert.ok(Math.hypot(start.x - PETRIN.x, start.z - PETRIN.z) < 1, 'middle of the hand-placed sakura cluster');
  assert.ok(cherries.some(t => Math.hypot(t.p[0] - start.x, t.p[1] - start.z) < 40), 'sakuras stand around the car');
  assert.equal(buildings.at(start.x, start.z), undefined);
  assert.equal(clear(start.x, start.z, start.heading), true);
  assert.equal(roads.at(start.x, start.z), undefined, 'not on the road at the edge of the park');
  assert.equal(city.water.some(w => pointInPolygon(start.x, start.z, w.rings)), false);
});

test('Jelení příkop starts on the moat path, not inside the castle', () => {
  const start = byName('Jelení příkop');
  assert.equal(parks.at(start.x, start.z)?.name, 'Dolní Jelení příkop');
  assert.equal(pavement.at(start.x, start.z)?.kind, 'Jalkakäytävä');
  assert.equal(buildings.at(start.x, start.z), undefined);
  assert.equal(clear(start.x, start.z, start.heading), true);
  assert.equal(roads.at(start.x, start.z), undefined);
});

test('Karlův most starts on the bridge deck, clear of the towers', () => {
  const start = byName('Karlův most');
  const deck = pavement.at(start.x, start.z);
  assert.equal(deck?.name, 'Karlův most');
  assert.match(deck?.kind || '', /Silta/);
  assert.equal(buildings.at(start.x, start.z), undefined);
  assert.equal(clear(start.x, start.z, start.heading), true);
  assert.equal(roads.at(start.x, start.z), undefined, 'the bridge is cobbled deck, not a carriageway polygon');
  assert.ok(carSamples(makeCar(start.x, start.z, start.heading)).every(([x, z]) => {
    const hit = pavement.at(x, z);
    return hit?.name === 'Karlův most' && /Silta/.test(hit.kind || '');
  }), 'the whole car sits on the bridge deck');
  const towers = city.buildings.filter(b => /mostecká věž/i.test(b.name || ''));
  assert.ok(towers.length >= 2);
  for (const tower of towers) {
    const box = tower.bbox;
    const distance = Math.hypot((box[0] + box[2]) / 2 - start.x, (box[1] + box[3]) / 2 - start.z);
    assert.ok(distance > 40, `${tower.name} is ${distance.toFixed(0)} m from the car`);
  }
});

test('Újezd starts on the road beside the Malá Strana tram stop', () => {
  const start = byName('Újezd');
  const stops = trams.stops.filter(s => s.name === 'Újezd');
  const funicular = city.roads.filter(r => r.name === 'U Lanové dráhy');
  const nearest = stops.map(s => {
    const dFun = Math.min(...funicular.map(r => Math.hypot(s.x - (r.bbox[0] + r.bbox[2]) / 2, s.z - (r.bbox[1] + r.bbox[3]) / 2)));
    return {s, dFun, d: Math.hypot(s.x - start.x, s.z - start.z)};
  }).sort((a, b) => a.dFun - b.dFun)[0];
  assert.ok(nearest.d < 6, `car is ${nearest.d.toFixed(1)} m from the Újezd stop`);
  assert.equal(nearest.s, stops.slice().sort((a, b) => {
    const d = s => Math.min(...funicular.map(r => Math.hypot(s.x - (r.bbox[0] + r.bbox[2]) / 2, s.z - (r.bbox[1] + r.bbox[3]) / 2)));
    return d(a) - d(b);
  })[0], 'that stop is the one by the funicular');
  assert.equal(roads.at(start.x, start.z)?.name, 'Újezd');
  assert.equal(clear(start.x, start.z, start.heading), true);
  assert.ok(carSamples(makeCar(start.x, start.z, start.heading)).every(([x, z]) => roads.at(x, z)), 'the whole car is on the road');
});

test('Anděl starts on the road beside the Smíchov tram stop, off the tracks', () => {
  const start = byName('Anděl');
  const stops = trams.stops.filter(s => s.name === 'Anděl');
  const nearest = Math.min(...stops.map(s => Math.hypot(s.x - start.x, s.z - start.z)));
  assert.ok(nearest < 15, `car is ${nearest.toFixed(1)} m from an Anděl stop`);
  assert.equal(roads.at(start.x, start.z)?.name, 'Nádražní');
  assert.ok(trackDistance(start.x, start.z) > 2, 'not centered on the tram rails');
  assert.equal(clear(start.x, start.z, start.heading), true);
  assert.ok(carSamples(makeCar(start.x, start.z, start.heading)).every(([x, z]) => roads.at(x, z)));
});

test('exact starts in city.json are the coordinates baked into the city pack', () => {
  for (const start of def.starts.filter(s => s.exact)) {
    const [x, z] = local(...start.at);
    const baked = byName(start.name);
    assert.deepEqual([baked.x, baked.z], [x, z], start.name);
    assert.equal(baked.heading, start.heading);
  }
});
