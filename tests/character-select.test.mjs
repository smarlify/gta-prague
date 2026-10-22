import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  CHARACTERS,
  DEFAULT_CHARACTER_ID,
  bindCharacterPicker,
  characterById,
  characterSwitchRebuilds,
  cycleCharacter,
  isIdleDriverRecord,
  playerPageTitle,
  publishablePlayerName,
  driverFromSearch,
  readCharacter,
  resolveDriver,
  writeCharacterId,
} from '../src/character-select.js';
import { listedPlayers } from '../src/net/protocol.js';
import { createVehicle } from '../src/vehicles.js';
import { GWAGEN_PAINT, ROADSTER_PAINT, SCALA_PAINT } from '../src/vehicle-models.js';
import { makeCar } from '../src/physics.js';
import { SpatialIndex } from '../src/geo.js';
import { PlayerTravel } from '../src/player-travel.js';
import { createRideVehicle } from '../src/player-ride-models.js';
import { resolveDriverStart } from '../src/pavlova.js';
import { startCycleKey } from '../src/cities.js';

function memoryStorage() {
  const box = new Map();
  return {
    getItem: (key) => (box.has(key) ? box.get(key) : null),
    setItem: (key, value) => box.set(key, String(value)),
    removeItem: (key) => box.delete(key),
  };
}

test('the welcome choices are the eight drivers, and the Roadster is preselected', () => {
  assert.deepEqual(CHARACTERS.map((choice) => choice.label), [
    'Mercedes G — Filip Turek',
    'Tesla Roadster — Elon Musk',
    'Škoda Scala — Dave N.',
    'Bicycle — Zdeněk Hřib',
    'Motorbike — Petr Pavel',
    'Police car — Robert Šlachta',
    'Challenger — Miloš Zeman',
    'BMW X5 — Jan Kraus',
  ]);
  assert.deepEqual(CHARACTERS.map((choice) => choice.name), [
    'Filip Turek', 'Elon Musk', 'Dave N.', 'Zdeněk Hřib', 'Petr Pavel', 'Robert Šlachta', 'Miloš Zeman', 'Jan Kraus',
  ]);
  assert.equal(DEFAULT_CHARACTER_ID, 'elon');
  assert.equal(readCharacter(memoryStorage()).name, 'Elon Musk');
  assert.equal(readCharacter(memoryStorage()).type, 'roadster');
  assert.equal(characterById('nope').id, 'elon');
});

test('?driver= pins Elon, Turek, Dave, or Zdeněk and an unknown value stays on the Roadster', () => {
  const saved = memoryStorage();
  writeCharacterId(saved, 'dave');
  assert.equal(driverFromSearch('?driver=elon').name, 'Elon Musk');
  assert.equal(driverFromSearch('?driver=ELON').type, 'roadster');
  assert.equal(driverFromSearch('?driver=Turek').name, 'Filip Turek');
  assert.equal(driverFromSearch('?driver=turek').type, 'gwagen');
  assert.equal(driverFromSearch('?driver=dave').name, 'Dave N.');
  assert.equal(driverFromSearch('?driver=Dave').flies, false);
  assert.equal(driverFromSearch('?driver=filip').type, 'gwagen');
  assert.equal(driverFromSearch('?driver=filip-turek').name, 'Filip Turek');
  assert.equal(driverFromSearch('?driver=dave-n').name, 'Dave N.');
  assert.equal(driverFromSearch('?city=prague&start=petrin&driver=turek&time=white-night').id, 'filip');
  assert.equal(resolveDriver('?driver=turek', saved).name, 'Filip Turek');
  assert.equal(resolveDriver('?driver=filip', saved).label, 'Mercedes G — Filip Turek');
  assert.equal(resolveDriver('?driver=dave', saved).label, 'Škoda Scala — Dave N.');
  assert.equal(resolveDriver('?driver=dave-n', saved).type, 'scala');
  assert.equal(resolveDriver('?driver=elon', saved).id, 'elon');
  assert.equal(driverFromSearch('?driver=hrib').name, 'Zdeněk Hřib');
  assert.equal(driverFromSearch('?driver=Hrib').id, 'hrib');
  assert.equal(driverFromSearch('?driver=zdenek').name, 'Zdeněk Hřib');
  assert.equal(driverFromSearch('?driver=Zdeněk').id, 'hrib');
  assert.equal(driverFromSearch('?driver=zdenek-hrib').type, 'bicycle');
  assert.equal(driverFromSearch('?driver=Zdeněk Hřib').ride, 'bike');
  assert.equal(resolveDriver('?driver=zdenek-hrib', saved).label, 'Bicycle — Zdeněk Hřib');
  assert.equal(driverFromSearch('?driver=kraus').name, 'Jan Kraus');
  assert.equal(driverFromSearch('?driver=jan').name, 'Jan Kraus');
  assert.equal(driverFromSearch('?driver=Jan').id, 'kraus');
  assert.equal(driverFromSearch('?driver=jan-kraus').type, 'x5');
  assert.equal(driverFromSearch('?driver=Jan Kraus').label, 'BMW X5 — Jan Kraus');
  assert.equal(driverFromSearch('?driver=pavel').name, 'Petr Pavel');
  assert.equal(driverFromSearch('?driver=Pavel').id, 'pavel');
  assert.equal(driverFromSearch('?driver=petr').name, 'Petr Pavel');
  assert.equal(driverFromSearch('?driver=Petr').type, 'motorbike');
  assert.equal(driverFromSearch('?driver=petr-pavel').ride, 'motorbike');
  assert.equal(driverFromSearch('?driver=milos').name, 'Miloš Zeman');
  assert.equal(driverFromSearch('?driver=Miloš').id, 'zeman');
  assert.equal(driverFromSearch('?driver=milos-zeman').type, 'challenger');
  assert.equal(driverFromSearch('?driver=zeman').water, true);
  assert.equal(driverFromSearch('?driver=robert').name, 'Robert Šlachta');
  assert.equal(driverFromSearch('?driver=Robert').id, 'slachta');
  assert.equal(driverFromSearch('?driver=slachta').police, true);
  assert.equal(driverFromSearch('?driver=robert-slachta').name, 'Robert Šlachta');
  assert.equal(driverFromSearch('?driver=Šlachta').id, 'slachta');
  assert.equal(resolveDriver('', saved, () => 0).id, 'filip');
  assert.equal(saved.getItem('gta-praha-character'), 'dave');
  assert.equal(resolveDriver('?city=prague&start=petrin', saved, () => 2).id, 'dave');
  assert.equal(resolveDriver('', memoryStorage(), () => 1).id, 'elon');
  assert.equal(resolveDriver('', memoryStorage(), () => 3).id, 'hrib');
  assert.deepEqual([0, 0.25, 0.5, 0.75].map((n) => resolveDriver('', memoryStorage(), () => n).id), ['filip', 'dave', 'pavel', 'zeman']);
  assert.equal(resolveDriver('', saved, () => 0.75).name, 'Miloš Zeman');
  const rolled = [0, 1, 2, 3, 4, 5, 6, 7].map((n) => resolveDriver('', memoryStorage(), () => n / 8).id);
  assert.deepEqual(rolled, ['filip', 'elon', 'dave', 'hrib', 'pavel', 'slachta', 'zeman', 'kraus']);
  assert.equal(saved.getItem('gta-praha-character'), 'dave', 'a roll does not write the chosen id');
  assert.equal(resolveDriver('?driver=nobody', saved).id, 'elon');
  assert.equal(resolveDriver('?driver=', memoryStorage()).id, 'elon');
  assert.equal(driverFromSearch(''), null);
});

test('a saved choice is remembered and an unknown id falls back to the Roadster', () => {
  const storage = memoryStorage();
  assert.equal(writeCharacterId(storage, 'filip').name, 'Filip Turek');
  assert.equal(readCharacter(storage).type, 'gwagen');
  assert.equal(readCharacter(storage).pavlova, true);
  storage.setItem('gta-praha-character', 'not-a-person');
  assert.equal(readCharacter(storage).id, 'elon');
  assert.equal(writeCharacterId(storage, 'dave').name, 'Dave N.');
  assert.equal(readCharacter(storage).flies, false);
});

test('the local player is never published as Driver', () => {
  assert.equal(publishablePlayerName(''), 'Elon Musk');
  assert.equal(publishablePlayerName('Driver'), 'Elon Musk');
  assert.equal(publishablePlayerName('  driver  '), 'Elon Musk');
  assert.equal(publishablePlayerName('Filip Turek'), 'Filip Turek');
  assert.equal(publishablePlayerName('', 'Dave N.'), 'Dave N.');
  assert.equal(playerPageTitle('Dave N.', { street: 'most Legií', district: 'Praha 1' }), 'Dave N. · GTA Praha 1 - most Legií 🇨🇿');
});

test('Online drops idle Driver leftovers and keeps everyone else', () => {
  const now = 1_000_000;
  const fresh = { uid: 'ada', name: 'Ada', x: 0, z: 0, heading: 0, speed: 1, mode: 'car', updatedAt: now };
  const driver = { uid: 'old', name: 'Driver', x: 1, z: 1, heading: 0, speed: 0, mode: 'car', updatedAt: now - 10_000 };
  const blank = { uid: 'blank', name: '   ', x: 2, z: 2, heading: 0, speed: 0, mode: 'car', updatedAt: now };
  const named = { uid: 'bo', name: 'Bo', x: 3, z: 3, heading: 0, speed: 0, mode: 'walk', updatedAt: now - 3_000 };
  assert.equal(isIdleDriverRecord(driver), true);
  assert.equal(isIdleDriverRecord(blank), true);
  assert.equal(isIdleDriverRecord(fresh), false);
  const rows = listedPlayers({ ada: fresh, old: driver, blank, bo: named, me: { ...fresh, uid: 'me', name: 'Elon Musk' } }, 'me', now);
  assert.deepEqual(rows.map((row) => row.name), ['Ada', 'Bo', 'Elon Musk']);
  assert.equal(rows.find((row) => row.uid === 'me').you, true);
});

test('the three bodies stay distinct: black boxy G, Ano White Roadster, Phoenix Orange Scala', () => {
  const g = createVehicle(0, true, 'gwagen');
  const roadster = createVehicle(0, true, 'roadster');
  const scala = createVehicle(0, true, 'scala');
  assert.equal(g.name, 'Mercedes G');
  assert.equal(g.userData.spec.boxy, true);
  assert.equal(GWAGEN_PAINT, '#111111');
  assert.equal(g.getObjectByName('paint').material.color.getHexString(), '111111');
  assert.equal(roadster.name, 'Roadster');
  assert.equal(ROADSTER_PAINT, '#f2efe6');
  assert.equal(roadster.getObjectByName('paint').material.color.getHexString(), 'f2efe6');
  assert.equal(scala.name, 'Škoda Scala');
  assert.equal(SCALA_PAINT, '#ee5a1c');
  assert.equal(scala.getObjectByName('paint').material.color.getHexString(), 'ee5a1c');
  assert.equal(scala.userData.spec.l, 4.362);
  assert.notEqual(scala.userData.spec.boxy, true);
  assert.ok(scala.getObjectByName('head-beams'), 'the Scala keeps headlights');
});

test('car arrows wrap Filip, Elon, Dave, and Zdeněk, and a click does not keep focus', () => {
  assert.equal(cycleCharacter('elon', 1).label, 'Škoda Scala — Dave N.');
  assert.equal(cycleCharacter('dave', 1).name, 'Zdeněk Hřib');
  assert.equal(cycleCharacter('hrib', 1).label, 'Motorbike — Petr Pavel');
  assert.equal(cycleCharacter('kraus', 1).label, 'Mercedes G — Filip Turek');
  assert.equal(cycleCharacter('filip', -1).name, 'Jan Kraus');
  assert.equal(cycleCharacter('elon', -1).type, 'gwagen');
  const doc = pickerDoc();
  const picked = [];
  const picker = bindCharacterPicker({
    doc,
    storage: memoryStorage(),
    onChange: (choice) => picked.push(choice.id),
  });
  assert.equal(picker.get().id, 'elon');
  assert.equal(doc.nodes.get('character-label').textContent, 'Tesla Roadster — Elon Musk');
  const next = doc.nodes.get('character-next');
  const prev = doc.nodes.get('character-prev');
  next.listeners.click({ detail: 1 });
  assert.equal(picker.get().name, 'Dave N.');
  assert.equal(next.blurred, 1, 'a tap blurs so Enter still starts the game');
  next.listeners.click({ detail: 0 });
  assert.equal(next.blurred, 1, 'a keyboard press keeps focus on the arrow');
  assert.equal(picker.get().name, 'Zdeněk Hřib');
  prev.listeners.click({ detail: 1 });
  assert.equal(picker.get().label, 'Škoda Scala — Dave N.');
  let stopped = false;
  prev.listeners.keydown({
    code: 'ArrowLeft',
    preventDefault() {},
    stopPropagation() { stopped = true; },
  });
  assert.equal(stopped, true, 'car arrows do not take the place arrows');
  assert.equal(picker.get().name, 'Elon Musk');
  assert.deepEqual(picked, ['elon', 'dave', 'hrib', 'dave', 'elon']);
});

test('the welcome card puts the car on the same arrow row as the district, outside the hidden launch block', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/loading-screen.css', import.meta.url), 'utf8');
  const district = html.match(/id="district-prev"[\s\S]*?<\/button>/)[0];
  const car = html.match(/id="character-prev"[\s\S]*?<\/button>/)[0];
  assert.match(district, /class="start-arrow"/);
  assert.match(car, /class="start-arrow"/);
  assert.match(car, /M15 5l-7 7 7 7/);
  assert.match(district, /M15 5l-7 7 7 7/);
  assert.match(html, /id="character-next"[^>]*class="start-arrow"/);
  assert.match(html, /id="character-label"[^>]*>Tesla Roadster — Elon Musk</);
  assert.ok(html.indexOf('id="character-prev"') < html.indexOf('id="district-prev"'), 'the car row sits above the district');
  assert.ok(html.indexOf('id="district-prev"') < html.indexOf('id="start-prev"'), 'the district row sits above the street');
  assert.ok(html.indexOf('id="boot-title"') < html.indexOf('id="load-detail"'), 'the loading line sits under the heading');
  assert.ok(html.indexOf('id="character-next"') < html.indexOf('id="boot-launch"'), 'the car row is not inside the hidden launch block');
  assert.match(html, /id="character-picker"[^>]*class="district-picker"|class="district-picker"[^>]*id="character-picker"/);
  assert.match(css, /body \.player-name,body \.topbar kbd,#intro \.boot-controls\{display:none\}/);
  assert.doesNotMatch(css, /body\.booting \.topbar\{display:\s*none\}/);
  assert.match(css, /#intro:not\(\.ready\) #character-picker\{display:none\}/);
  assert.doesNotMatch(css, /(^|\n)#character-picker\{[^}]*display:\s*none/);
  assert.doesNotMatch(css, /#intro:not\(\.ready\) #boot-loader\{[^}]*display:\s*none/);
  assert.doesNotMatch(css, /#intro:not\(\.ready\) #start-district-picker/);
  assert.doesNotMatch(css, /#intro:not\(\.ready\) #boot-title/);
  assert.doesNotMatch(css, /#intro:not\(\.ready\) #start-btn/);
  assert.doesNotMatch(css, /#character-prev\{[^}]*display:\s*none/);
  assert.doesNotMatch(css, /#start-btn\{[^}]*display:\s*none/);
  const phone = css.slice(css.indexOf('@media(max-width:700px)'));
  assert.doesNotMatch(phone, /#character-picker\{[^}]*display:\s*none/);
  const hud = await readFile(new URL('../src/style.css', import.meta.url), 'utf8');
  const touch = await readFile(new URL('../src/mobile-controls.css', import.meta.url), 'utf8');
  assert.doesNotMatch(hud, /#view-btn\{display:\s*none\}/);
  assert.doesNotMatch(touch, /\.topbar nav\{display:\s*none\}/);
  assert.doesNotMatch(hud, /body\.touch \.right-tools\{display:\s*none\}/);
});

test('a missing driver rolls once and does not keep the saved choice', () => {
  const storage = memoryStorage();
  writeCharacterId(storage, 'dave');
  const doc = pickerDoc();
  const picked = [];
  const picker = bindCharacterPicker({
    doc,
    storage,
    initial: resolveDriver('', storage, () => 0).id,
    onChange: (choice) => picked.push(choice.id),
  });
  assert.equal(resolveDriver('?driver=turek', storage).id, 'filip');
  assert.equal(picker.get().label, 'Mercedes G — Filip Turek');
  assert.equal(doc.nodes.get('character-label').textContent, 'Mercedes G — Filip Turek');
  assert.deepEqual(picked, ['filip']);
  assert.equal(storage.getItem('gta-praha-character'), 'dave');
  assert.equal(resolveDriver('?driver=elon', storage).id, 'elon');
  assert.equal(storage.getItem('gta-praha-character'), 'dave');
  assert.equal(resolveDriver('', memoryStorage(), () => 1).name, 'Elon Musk');
});

test('choosing Hřib on the start card occupies his pedal bicycle, not the Roadster or the G', async () => {
  const fromRoadster = characterById('elon');
  const fromG = characterById('filip');
  const doc = pickerDoc();
  const picker = bindCharacterPicker({ doc, storage: memoryStorage(), initial: 'elon' });
  assert.equal(picker.get().type, 'roadster');
  doc.nodes.get('character-next').listeners.click({ detail: 1 });
  doc.nodes.get('character-next').listeners.click({ detail: 1 });
  const choice = picker.get();
  assert.equal(choice.id, 'hrib');
  assert.equal(choice.name, 'Zdeněk Hřib');
  assert.equal(choice.ride, 'bike');
  assert.equal(choice.type, 'bicycle');
  assert.equal(doc.nodes.get('character-label').textContent, 'Bicycle — Zdeněk Hřib');
  assert.equal(characterSwitchRebuilds(fromRoadster, choice), true);
  assert.equal(characterSwitchRebuilds(fromG, choice), true);
  assert.equal(characterSwitchRebuilds(fromRoadster, characterById('dave')), false);
  const world = {buildings: new SpatialIndex([]), roads: new SpatialIndex([{rings: [[[-200, -200], [200, -200], [200, 200], [-200, 200]]]}]), pavement: new SpatialIndex([{rings: [[[-200, -200], [200, -200], [200, 200], [-200, 200]]]}]), water: []};
  const travel = new PlayerTravel(makeCar(0, 0), world, {ride: fromRoadster.ride || null});
  assert.equal(travel.mode, 'car');
  assert.equal(travel.riding, null);
  if (characterSwitchRebuilds(fromRoadster, choice)) travel.reset(makeCar(0, 0), world, {ride: choice.ride || null});
  assert.equal(travel.mode, 'bike');
  assert.equal(travel.actor, travel.riding);
  assert.equal(travel.riding.id, 'bike');
  assert.equal(travel.riding.visual.kind, 'bicycle');
  assert.notEqual(travel.riding.visual.kind, 'citybike');
  assert.notEqual(travel.riding.mode, 'scooter');
  assert.notEqual(travel.mode, 'car');
  const mesh = createRideVehicle(travel.riding.visual, travel.mode);
  assert.equal(mesh.root.userData.kind, 'bicycle');
  assert.notEqual(mesh.root.name, 'Player citybike');
  mesh.dispose();
  const back = picker.choose('filip');
  assert.equal(back.id, 'filip');
  assert.equal(back.type, 'gwagen');
  assert.equal(characterSwitchRebuilds(choice, back), true);
  travel.reset(makeCar(0, 0), world, {ride: back.ride || null});
  assert.equal(travel.mode, 'car');
  assert.equal(travel.riding, null);
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /characterSwitchRebuilds\(previous,choice\)/);
  assert.match(main, /characterSwitchRebuilds\(\{ride:occupiedRide\(travel\)\},chosenCharacter\)/);
  assert.equal(driverFromSearch('?driver=hrib').id, 'hrib');
  assert.equal(driverFromSearch('?driver=zdenek').ride, 'bike');
  assert.equal(driverFromSearch('?driver=zdenek-hrib').type, 'bicycle');
});

test('Zdeněk starts on a pedal bicycle at the normal start, not the museum and not the city bike', () => {
  const hrib = characterById('hrib');
  assert.equal(hrib.name, 'Zdeněk Hřib');
  assert.equal(hrib.ride, 'bike');
  assert.equal(hrib.pavlova, false);
  const starts = [
    {name: 'Národní muzeum', id: 'narodni-muzeum', heading: 1},
    {name: 'Petřín', heading: 2},
    {name: 'Letenské náměstí', heading: -1.3},
  ];
  const storage = memoryStorage();
  storage.setItem(startCycleKey('prague'), '0');
  const opened = resolveDriverStart(starts, null, storage, 'prague', hrib, null);
  assert.equal(opened.start.name, 'Letenské náměstí');
  assert.notEqual(opened.start.name, 'Národní muzeum');
  assert.equal(storage.getItem(startCycleKey('prague')), '0', 'Letná does not advance the cycle');
  const pinned = resolveDriverStart(starts, 'Národní muzeum', memoryStorage(), 'prague', hrib, null);
  assert.equal(pinned.start.name, 'Národní muzeum');
  assert.equal(pinned.pinned, true);
  const world = {buildings: new SpatialIndex([]), roads: new SpatialIndex([{rings: [[[-200, -200], [200, -200], [200, 200], [-200, 200]]]}]), pavement: new SpatialIndex([{rings: [[[-200, -200], [200, -200], [200, 200], [-200, 200]]]}]), water: []};
  const car = makeCar(0, 0);
  const travel = new PlayerTravel(car, world, {ride: hrib.ride});
  assert.equal(travel.mode, 'bike');
  assert.equal(travel.actor.x, 0);
  assert.equal(travel.actor.z, 0);
  assert.equal(travel.riding.visual.kind, 'bicycle');
  assert.notEqual(travel.riding.visual.kind, 'citybike');
  assert.notEqual(travel.riding.mode, 'scooter');
  const pedal = createRideVehicle(travel.riding.visual, 'bike');
  const city = createRideVehicle({kind: 'citybike'}, 'bike');
  assert.equal(pedal.root.userData.kind, 'bicycle');
  assert.equal(pedal.pedals?.length || pedal.motion?.pedals?.length, 2);
  assert.equal(city.root.userData.kind, 'citybike');
  assert.notEqual(pedal.root.name, city.root.name);
  pedal.dispose();
  city.dispose();
});

function pickerDoc() {
  const nodes = new Map();
  const make = (id) => {
    const node = {
      id,
      textContent: '',
      dataset: {},
      blurred: 0,
      listeners: {},
      setAttribute() {},
      addEventListener(type, fn) { node.listeners[type] = fn; },
      blur() { node.blurred += 1; },
      querySelectorAll() { return []; },
    };
    nodes.set(id, node);
    return node;
  };
  for (const id of ['character-picker', 'character-label', 'character-prev', 'character-next']) make(id);
  return { nodes, getElementById: (id) => nodes.get(id) };
}
