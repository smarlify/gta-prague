import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHARACTERS,
  DEFAULT_CHARACTER_ID,
  characterById,
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
  assert.equal(driverFromSearch('?city=prague&start=petrin&driver=turek&time=white-night').id, 'filip');
  assert.equal(resolveDriver('?driver=turek', saved).name, 'Filip Turek');
  assert.equal(resolveDriver('', saved).name, 'Dave N.');
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

test('the three bodies stay distinct: black boxy G, Roadster, Škoda Scala', () => {
  const g = createVehicle(0, true, 'gwagen');
  const roadster = createVehicle(0, true, 'roadster');
  const scala = createVehicle(0, true, 'scala');
  assert.equal(g.name, 'Mercedes G');
  assert.equal(g.userData.spec.boxy, true);
  assert.equal(g.getObjectByName('paint').material.color.getHexString(), '111111');
  assert.equal(roadster.name, 'Roadster');
  assert.equal(scala.name, 'Škoda Scala');
  assert.equal(scala.userData.spec.l, 4.362);
  assert.notEqual(scala.userData.spec.boxy, true);
  assert.ok(scala.getObjectByName('head-beams'), 'the Scala keeps headlights');
});
