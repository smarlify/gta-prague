import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  CHARACTERS,
  DEFAULT_CHARACTER_ID,
  bindCharacterPicker,
  characterById,
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

function memoryStorage() {
  const box = new Map();
  return {
    getItem: (key) => (box.has(key) ? box.get(key) : null),
    setItem: (key, value) => box.set(key, String(value)),
    removeItem: (key) => box.delete(key),
  };
}

test('the welcome choices are the G, the Roadster, and the Scala, and the Roadster is preselected', () => {
  assert.deepEqual(CHARACTERS.map((choice) => choice.label), [
    'Mercedes G — Filip Turek',
    'Roadster — Elon Musk',
    'Škoda Scala — Dave N.',
  ]);
  assert.deepEqual(CHARACTERS.map((choice) => choice.name), ['Filip Turek', 'Elon Musk', 'Dave N.']);
  assert.equal(DEFAULT_CHARACTER_ID, 'elon');
  assert.equal(readCharacter(memoryStorage()).name, 'Elon Musk');
  assert.equal(readCharacter(memoryStorage()).type, 'roadster');
  assert.equal(characterById('nope').id, 'elon');
});

test('?driver= pins Elon, Turek, or Dave and an unknown value stays on the Roadster', () => {
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
  assert.equal(resolveDriver('', saved).name, 'Elon Musk');
  assert.equal(resolveDriver('', saved).type, 'roadster');
  assert.equal(resolveDriver('?city=prague&start=petrin', saved).id, 'elon');
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

test('car arrows wrap Filip, Elon, and Dave, and a click does not keep focus', () => {
  assert.equal(cycleCharacter('elon', 1).label, 'Škoda Scala — Dave N.');
  assert.equal(cycleCharacter('dave', 1).label, 'Mercedes G — Filip Turek');
  assert.equal(cycleCharacter('filip', -1).name, 'Dave N.');
  assert.equal(cycleCharacter('elon', -1).type, 'gwagen');
  const doc = pickerDoc();
  const picked = [];
  const picker = bindCharacterPicker({
    doc,
    storage: memoryStorage(),
    onChange: (choice) => picked.push(choice.id),
  });
  assert.equal(picker.get().id, 'elon');
  assert.equal(doc.nodes.get('character-label').textContent, 'Roadster — Elon Musk');
  const next = doc.nodes.get('character-next');
  const prev = doc.nodes.get('character-prev');
  next.listeners.click({ detail: 1 });
  assert.equal(picker.get().name, 'Dave N.');
  assert.equal(next.blurred, 1, 'a tap blurs so Enter still starts the game');
  next.listeners.click({ detail: 0 });
  assert.equal(next.blurred, 1, 'a keyboard press keeps focus on the arrow');
  assert.equal(picker.get().name, 'Filip Turek');
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
  assert.deepEqual(picked, ['elon', 'dave', 'filip', 'dave', 'elon']);
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
  assert.match(html, /id="character-label"[^>]*>Roadster — Elon Musk</);
  assert.ok(html.indexOf('id="start-next"') < html.indexOf('id="character-prev"'), 'the car row sits under the street arrows');
  assert.ok(html.indexOf('id="character-next"') < html.indexOf('id="boot-launch"'), 'the car row is not inside the hidden launch block');
  assert.match(html, /id="character-picker"[^>]*class="district-picker"|class="district-picker"[^>]*id="character-picker"/);
  assert.match(css, /body \.player-name,body \.topbar kbd,#intro \.boot-controls\{display:none\}/);
  assert.doesNotMatch(css, /body\.booting \.topbar\{display:\s*none\}/);
  assert.doesNotMatch(css, /#character-picker\{[^}]*display:\s*none/);
  assert.doesNotMatch(css, /#character-prev\{[^}]*display:\s*none/);
  assert.doesNotMatch(css, /#start-btn\{[^}]*display:\s*none/);
  const hud = await readFile(new URL('../src/style.css', import.meta.url), 'utf8');
  const touch = await readFile(new URL('../src/mobile-controls.css', import.meta.url), 'utf8');
  assert.doesNotMatch(hud, /#view-btn\{display:\s*none\}/);
  assert.doesNotMatch(touch, /\.topbar nav\{display:\s*none\}/);
  assert.doesNotMatch(hud, /body\.touch \.right-tools\{display:\s*none\}/);
});

test('a saved character does not replace the Roadster when the address names no driver', () => {
  const storage = memoryStorage();
  writeCharacterId(storage, 'filip');
  const doc = pickerDoc();
  const picked = [];
  const picker = bindCharacterPicker({
    doc,
    storage,
    initial: resolveDriver('', storage).id,
    onChange: (choice) => picked.push(choice.id),
  });
  assert.equal(picker.get().label, 'Roadster — Elon Musk');
  assert.equal(doc.nodes.get('character-label').textContent, 'Roadster — Elon Musk');
  assert.deepEqual(picked, ['elon']);
  assert.equal(storage.getItem('gta-praha-character'), 'filip');
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
