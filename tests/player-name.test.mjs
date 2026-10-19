import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPresence, parsePresence } from '../src/net/protocol.js';
import {
  PLAYER_NAME_STORAGE_KEY,
  cleanPlayerName,
  currentPresenceName,
  readStoredPlayerName,
  rememberGoogleName,
  resolvePresenceName,
  writeStoredPlayerName,
} from '../src/net/player-name.js';

function memoryStorage() {
  const box = new Map();
  return {
    getItem: (key) => (box.has(key) ? box.get(key) : null),
    setItem: (key, value) => box.set(key, String(value)),
    removeItem: (key) => box.delete(key),
  };
}

test('typed name is stored and wins over the Google profile', () => {
  const storage = memoryStorage();
  assert.equal(writeStoredPlayerName('  Dave  2  ', storage), 'Dave 2');
  assert.equal(storage.getItem(PLAYER_NAME_STORAGE_KEY), 'Dave 2');
  assert.equal(readStoredPlayerName(storage), 'Dave 2');
  assert.equal(currentPresenceName('David Nekovář', storage), 'Dave 2');
  rememberGoogleName('Someone Else', storage);
  assert.equal(readStoredPlayerName(storage), 'Dave 2');
});

test('an empty browser remembers the Google name once, then keeps edits', () => {
  const storage = memoryStorage();
  assert.equal(currentPresenceName('Dave', storage), 'Dave');
  assert.equal(rememberGoogleName('Dave', storage), 'Dave');
  assert.equal(readStoredPlayerName(storage), 'Dave');
  writeStoredPlayerName('Dave 2', storage);
  assert.equal(currentPresenceName('Dave', storage), 'Dave 2');
});

test('presence row publishes the typed name instead of Driver', () => {
  const storage = memoryStorage();
  writeStoredPlayerName('Dave 2', storage);
  const row = buildPresence({
    uid: 'uid-dave',
    name: currentPresenceName('Driver', storage),
    x: 3,
    z: -4,
    mode: 'car',
  });
  assert.equal(row.name, 'Dave 2');
  assert.equal(parsePresence(row).name, 'Dave 2');
  assert.equal(buildPresence({ uid: 'uid-empty', name: cleanPlayerName('') }).name, 'Elon Musk');
  assert.equal(buildPresence({ uid: 'uid-driver', name: 'Driver' }).name, 'Elon Musk');
});

test('live input wins over empty localStorage so remotes never see Driver', () => {
  const storage = memoryStorage();
  assert.equal(resolvePresenceName({
    inputValue: 'Dave',
    googleName: '',
    storage,
  }), 'Dave');
  assert.equal(storage.getItem(PLAYER_NAME_STORAGE_KEY), 'Dave');
  assert.equal(resolvePresenceName({
    inputValue: '  Dave 2 ',
    googleName: 'Google',
    storage,
  }), 'Dave 2');
  assert.equal(parsePresence(buildPresence({
    uid: 'uid-live',
    name: resolvePresenceName({ inputValue: 'Dave 2', storage }),
    x: 0,
    z: 0,
    mode: 'car',
  })).name, 'Dave 2');
});
