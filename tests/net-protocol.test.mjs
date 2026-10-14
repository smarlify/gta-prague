import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PLAYER_HZ,
  DEMO_ROOM,
  PLAYERS_PATH,
  MAX_POLICE_UNITS,
  buildPresence,
  parsePresence,
  remotePlayersFromMap,
  canJoinMultiplayer,
  shouldSkipPublish,
  isAnonymousProvider,
  toRtdb,
} from '../src/net/protocol.js';

test('presence constants match the demo room plan', () => {
  assert.equal(PLAYER_HZ, 10);
  assert.equal(DEMO_ROOM, 'demo');
  assert.equal(PLAYERS_PATH, 'gta-praha/rooms/demo/players');
  assert.equal(MAX_POLICE_UNITS, 12);
});

test('anonymous users cannot join or publish', () => {
  assert.equal(canJoinMultiplayer(null), false);
  assert.equal(canJoinMultiplayer({ uid: 'a', isAnonymous: true }), false);
  assert.equal(isAnonymousProvider({ isAnonymous: true }), true);
  assert.equal(shouldSkipPublish({ uid: 'a', isAnonymous: true }), true);
  assert.equal(shouldSkipPublish(null), true);
});

test('Google-signed users can join multiplayer', () => {
  const user = { uid: 'google-1', isAnonymous: false, displayName: 'Ada', providerData: [{ providerId: 'google.com' }] };
  assert.equal(canJoinMultiplayer(user), true);
  assert.equal(shouldSkipPublish(user), false);
});

test('buildPresence serializes pose, vehicle, wanted, and capped police', () => {
  const units = Array.from({ length: 20 }, (_, i) => ({
    id: `u${i}`, x: i, z: -i, heading: 0.1, speed: 5, role: 'chase',
  }));
  const row = buildPresence({
    uid: 'uid-1',
    name: 'Dave',
    x: 10.5,
    z: -20,
    heading: 1.2,
    speed: 8,
    mode: 'car',
    vehicle: { type: 'sedan', colour: '#b4232c' },
    wanted: { level: 3, heat: 12, status: 'PURSUIT', busted: false },
    police: units,
    updatedAt: 1_700_000_000_000,
  });
  assert.equal(row.uid, 'uid-1');
  assert.equal(row.mode, 'car');
  assert.deepEqual(row.vehicle, { type: 'sedan', colour: '#b4232c' });
  assert.equal(row.wanted.level, 3);
  assert.equal(row.police.length, MAX_POLICE_UNITS);
  assert.equal(row.police[0].id, 'u0');
});

test('clear wanted omits police units (empty array)', () => {
  const row = buildPresence({
    uid: 'uid-2',
    name: 'Solo',
    x: 0,
    z: 0,
    heading: 0,
    speed: 0,
    mode: 'walk',
    wanted: { level: 0, heat: 0, status: 'CLEAR', busted: false },
    police: [{ id: 'ghost', x: 1, z: 1, heading: 0, speed: 0 }],
  });
  assert.equal(row.vehicle, null);
  assert.deepEqual(row.police, []);
});

test('parsePresence and remotePlayersFromMap drop self and stale rows', () => {
  const now = 1_700_000_010_000;
  const live = buildPresence({
    uid: 'other',
    name: 'Other',
    x: 1,
    z: 2,
    mode: 'bike',
    updatedAt: now - 1000,
  });
  const stale = buildPresence({
    uid: 'old',
    name: 'Old',
    x: 0,
    z: 0,
    mode: 'car',
    updatedAt: now - 60_000,
  });
  const self = buildPresence({
    uid: 'me',
    name: 'Me',
    x: 0,
    z: 0,
    mode: 'car',
    updatedAt: now,
  });
  const remotes = remotePlayersFromMap({
    other: live,
    old: stale,
    me: self,
  }, 'me', now);
  assert.equal(remotes.length, 1);
  assert.equal(remotes[0].uid, 'other');
  assert.equal(remotes[0].mode, 'bike');
  assert.equal(parsePresence(null), null);
});

test('toRtdb strips undefined for Firebase', () => {
  const payload = toRtdb({ a: 1, b: undefined, c: { d: 2 } });
  assert.deepEqual(payload, { a: 1, c: { d: 2 } });
});

test('anonymous does not write — shouldSkipPublish is the gate used before set()', () => {
  // Room.publishPlayer / joinDemoRoom must refuse anonymous; this documents the gate.
  assert.equal(shouldSkipPublish({ uid: 'anon', isAnonymous: true }), true);
  assert.equal(shouldSkipPublish({ uid: 'g', isAnonymous: false }), false);
});
