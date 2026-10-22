import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { joinDemoRoom } from '../src/net/room.js';
import {
  DEMO_ROOM,
  ONLINE_STALE_MS,
  listedPlayers,
  onlinePlayerCount,
  playerPresencePath,
  presenceJoinAllowed,
} from '../src/net/protocol.js';

test('a normal visit may join, and the suite, a smoke browser, or presence=off may not', () => {
  assert.equal(presenceJoinAllowed({ search: '', webdriver: false, testContext: '' }), true);
  assert.equal(presenceJoinAllowed({ search: '?city=prague', webdriver: false, testContext: '' }), true);
  assert.equal(presenceJoinAllowed({ search: '?city=prague&presence=off', webdriver: false, testContext: '' }), false);
  assert.equal(presenceJoinAllowed({ search: '', webdriver: true, testContext: '' }), false);
  assert.equal(presenceJoinAllowed({ testContext: process.env.NODE_TEST_CONTEXT }), false);
  assert.equal(DEMO_ROOM, 'demo');
});

test('the suite does not write a player into the live demo room', async (t) => {
  const written = new Map();
  t.after(() => { written.clear(); });
  const result = await joinDemoRoom({ uid: 'suite-user' }, {
    name: 'Ada',
    roomId: 'demo',
    sessionId: 'tab-suite',
    db: { fake: true },
    write: async (path, row) => { written.set(path, row); },
  });
  assert.equal(result.kind, 'solo');
  assert.equal(written.size, 0);
  for (const path of written.keys()) {
    assert.equal(String(path).includes('/rooms/demo/'), false);
  }
});

test('a fake room records a row outside demo and the test removes it afterwards', async (t) => {
  const written = new Map();
  t.after(() => { written.clear(); });
  const result = await joinDemoRoom({ uid: 'suite-user' }, {
    name: 'Driver',
    roomId: 'suite',
    sessionId: 'tab-suite',
    db: written,
    write: async (path, row) => { written.set(path, row); },
  });
  assert.equal(result.kind, 'joined');
  assert.equal(written.size, 1);
  const [path, row] = [...written.entries()][0];
  assert.equal(path, playerPresencePath('suite-user', 'tab-suite', 'suite'));
  assert.equal(path.includes('/rooms/demo/'), false);
  assert.notEqual(row.name, 'Driver');
  t.after(() => {
    written.clear();
    assert.equal(written.size, 0);
  });
});

test('a stale heartbeat is not counted and a fresh one is', () => {
  const now = 5_000_000;
  const map = {
    ada: { uid: 'ada', name: 'Ada', mode: 'car', updatedAt: now - 500 },
    quiet: { uid: 'quiet', name: 'Bo', mode: 'car', updatedAt: now - ONLINE_STALE_MS - 50 },
  };
  assert.deepEqual(listedPlayers(map, '', now).map((row) => row.name), ['Ada']);
  assert.equal(onlinePlayerCount(map, '', now), 1);
  assert.equal(onlinePlayerCount(map, '', now - 100), 2);
});

test('test files do not sign in, and game smokes opt out of presence', () => {
  const testsDir = new URL('.', import.meta.url);
  for (const name of readdirSync(testsDir)) {
    if (!name.endsWith('.test.mjs') || name === 'demo-room.test.mjs') continue;
    const text = readFileSync(new URL(name, testsDir), 'utf8');
    assert.equal(text.includes('signInAnonymously'), false, name);
    assert.equal(text.includes('firebase/database'), false, name);
    assert.equal(text.includes('joinDemoRoom'), false, name);
  }
  const scriptsDir = new URL('../scripts/', import.meta.url);
  for (const name of readdirSync(scriptsDir)) {
    if (!name.endsWith('.mjs')) continue;
    const text = readFileSync(new URL(name, scriptsDir), 'utf8');
    if (!text.includes('page.goto') || !text.includes('/?city=')) continue;
    assert.match(text, /presence=off/, name);
  }
});
