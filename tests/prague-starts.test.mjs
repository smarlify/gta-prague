import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import proj4 from 'proj4';
import {pointInPolygon, SpatialIndex} from '../src/geo.js';
import {carSamples, makeCar} from '../src/physics.js';
import {pickStart, bootStart, startCycleKey} from '../src/cities.js';
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

function memoryStorage() {
  const data = new Map();
  return {
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(key, String(value)); },
  };
}

test('a missing start cycles every named place, and a start URL pins one', () => {
  assert.equal(registry.counts.starts, city.landmarks.length);
  assert.deepEqual(city.landmarks.map(l => l.name), def.starts.map(s => s.name));
  const names = city.landmarks.map(l => l.name);
  assert.deepEqual(names, [
    'Petřín', 'Jelení příkop', 'Národní divadlo', 'Most Legií', 'Karlův most',
    'Smetanovo nábřeží', 'Masarykovo nábřeží', 'Malostranské nábřeží', 'Mánesův most',
    'Národní muzeum', 'Klárov', 'Karlovo náměstí', 'I. P. Pavlova', 'Náměstí Míru',
    'Anděl', 'Újezd', 'Vítězné náměstí', 'Hradčanská', 'Letenské náměstí', 'Vltavská', 'Florenc',
  ]);

  const storage = memoryStorage();
  const seen = [];
  for (let i = 0; i < names.length; i++) {
    const boot = bootStart(city.landmarks, null, storage);
    seen.push(boot.start.name);
    assert.equal(boot.pinned, false);
    assert.equal(boot.start, city.landmarks[i], 'the visit uses that curated start, not a new coordinate');
  }
  assert.deepEqual(seen, names, 'each visit without start= takes the next named place');
  assert.equal(bootStart(city.landmarks, null, storage).start, city.landmarks[0], 'after the last place, the cycle returns to the first');

  const pinned = memoryStorage();
  assert.equal(bootStart(city.landmarks, null, pinned).start.name, names[0]);
  const cursor = pinned.getItem(startCycleKey('prague'));
  for (const request of ['Anděl', 'andel', 'ANDĚL', 'karluv most', 'Karlův-most', 'jeleni-prikop', 'Újezd', 'i. p. pavlova']) {
    const boot = bootStart(city.landmarks, request, pinned);
    assert.equal(boot.pinned, true);
    assert.equal(boot.start, pickStart(city.landmarks, request));
    assert.equal(pinned.getItem(startCycleKey('prague')), cursor, `${request} does not advance the cycle`);
  }
  assert.equal(bootStart(city.landmarks, 'nowhere-in-prague', pinned).start, null);
  assert.equal(pinned.getItem(startCycleKey('prague')), cursor, 'an unknown start= does not advance the cycle');
  assert.equal(bootStart(city.landmarks, null, pinned).start.name, names[1], 'the next unpinned visit continues the cycle');

  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.equal(bootStart(city.landmarks, null, blocked).start, city.landmarks[0]);
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
