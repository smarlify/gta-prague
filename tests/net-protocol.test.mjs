import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PLAYER_HZ,
  AFK_HEARTBEAT_HZ,
  AFK_STALE_MS,
  DEMO_ROOM,
  PLAYERS_PATH,
  MAX_POLICE_UNITS,
  MAX_OFFICERS,
  buildPresence,
  parsePresence,
  parseCrashImpulse,
  crashImpulsePayload,
  remotePlayersFromMap,
  presencePublishHz,
  presencePublishes,
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

test('unsigned users cannot join or publish', () => {
  assert.equal(canJoinMultiplayer(null), false);
  assert.equal(canJoinMultiplayer({}), false);
  assert.equal(shouldSkipPublish(null), true);
  assert.equal(isAnonymousProvider({ isAnonymous: true }), true);
});

test('anonymous users can join the demo room (temp default)', () => {
  const anon = { uid: 'a', isAnonymous: true };
  assert.equal(canJoinMultiplayer(anon), true);
  assert.equal(shouldSkipPublish(anon), false);
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

test('afk presence is parsed and held for at least a minute', () => {
  const now = 1_700_000_100_000;
  const sleepy = buildPresence({
    uid: 'sleepy',
    name: 'Ada',
    x: 4,
    z: -2,
    heading: 0.4,
    speed: 0,
    mode: 'car',
    afk: true,
    afkSince: now - 30_000,
    updatedAt: now - 30_000,
  });
  assert.equal(sleepy.afk, true);
  assert.equal(sleepy.afkSince, now - 30_000);
  const kept = remotePlayersFromMap({ sleepy }, 'me', now);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].afk, true);
  assert.equal(parsePresence(sleepy).afkSince, now - 30_000);
  const expired = buildPresence({
    uid: 'sleepy',
    name: 'Ada',
    x: 4,
    z: -2,
    mode: 'car',
    afk: true,
    afkSince: now - 90_000,
    updatedAt: now - AFK_STALE_MS - 1000,
  });
  assert.equal(remotePlayersFromMap({ sleepy: expired }, 'me', now).length, 0);
  const awake = buildPresence({
    uid: 'awake',
    name: 'Bea',
    x: 0,
    z: 0,
    mode: 'car',
    afk: false,
    updatedAt: now - 30_000,
  });
  assert.equal(awake.afk, false);
  assert.equal(awake.afkSince, 0);
  assert.equal(remotePlayersFromMap({ awake }, 'me', now).length, 0);
});

test('heartbeat fields: AFK publishes slowly, a bust still publishes while paused', () => {
  assert.equal(AFK_HEARTBEAT_HZ, 1);
  assert.equal(presencePublishHz({ afk: true }), AFK_HEARTBEAT_HZ);
  assert.equal(presencePublishHz({ afk: false }), PLAYER_HZ);
  assert.equal(presencePublishHz({ afk: true, busted: true }), PLAYER_HZ);
  assert.equal(presencePublishes({ paused: true, afk: true }), true);
  assert.equal(presencePublishes({ paused: true, busted: true }), true);
  assert.equal(presencePublishes({ paused: true }), false);
  assert.equal(presencePublishes({ paused: false }), true);
});

test('officers and arrest stay on the row through a bust', () => {
  const officers = Array.from({ length: 20 }, (_, i) => ({
    id: `o${i}`, x: i, z: i, heading: 0.2, pose: i ? 'belt' : 'stop',
  }));
  officers.push({ id: '', x: 0, z: 0, pose: 'nope' });
  const row = buildPresence({
    uid: 'pursuit',
    name: 'Cop',
    x: 1,
    z: 2,
    mode: 'car',
    wanted: { level: 0, heat: 0, status: 'BUSTED', busted: true },
    police: [{ id: 'u1', x: 3, z: 4, heading: 1, speed: 0, role: 'chase' }],
    officers,
    arrest: { active: true, phase: 'cuff', t: 2.4 },
  });
  assert.equal(row.wanted.busted, true);
  assert.equal(row.police.length, 1);
  assert.equal(row.police[0].id, 'u1');
  assert.equal(row.officers.length, MAX_OFFICERS);
  assert.equal(row.officers[0].pose, 'stop');
  assert.deepEqual(row.arrest, { active: true, phase: 'cuff', t: 2.4 });
  const parsed = parsePresence(row);
  assert.equal(parsed.officers.length, MAX_OFFICERS);
  assert.equal(parsed.arrest.phase, 'cuff');
  const clear = buildPresence({
    uid: 'clear',
    name: 'Clear',
    x: 0,
    z: 0,
    mode: 'walk',
    officers: [{ id: 'ghost', x: 1, z: 1, heading: 0, pose: 'stop' }],
    arrest: { active: false, phase: 'idle', t: 0 },
  });
  assert.deepEqual(clear.officers, []);
  assert.equal(clear.arrest.active, false);
});

test('crash impulse parses direction, speed and a short lifetime', () => {
  const now = 1_800_000_000_000;
  const hit = parseCrashImpulse({ uid: 'victim', nx: 0, nz: -4, speed: 6, spin: 1.2, at: now - 400 }, now);
  assert.equal(hit.uid, 'victim');
  assert.equal(hit.nz, -1);
  assert.equal(hit.speed, 6);
  assert.equal(hit.spin, 1.2);
  assert.equal(parseCrashImpulse({ uid: 'victim', nx: 1, nz: 0, speed: 3, at: now - 4000 }, now), null);
  assert.equal(parseCrashImpulse({ nx: 1, nz: 0, speed: 3, at: now }, now), null);
  const payload = crashImpulsePayload(
    { remote: true, uid: 'other' },
    { nx: 1, nz: 0, dv: 4, spin: 0.5 },
    now,
  );
  assert.equal(payload.uid, 'other');
  assert.equal(payload.speed, 4);
  const row = buildPresence({
    uid: 'hitter',
    name: 'Hit',
    x: 0,
    z: 5,
    mode: 'car',
    impulse: payload,
    updatedAt: now,
  });
  assert.equal(parsePresence(row).impulse.uid, 'other');
  assert.equal(crashImpulsePayload({ remote: false, uid: 'nope' }, payload, now), null);
});

test('stolen police siren is only published on a police car', () => {
  const on = buildPresence({
    uid: 'thief',
    name: 'Thief',
    x: 0,
    z: 0,
    mode: 'car',
    vehicle: { type: 'police', police: true, livery: 'praha', variant: 'estate' },
    siren: true,
  });
  assert.equal(on.siren, true);
  assert.equal(on.vehicle.police, true);
  assert.equal(on.vehicle.livery, 'praha');
  assert.equal(on.vehicle.variant, 'estate');
  const off = buildPresence({
    uid: 'thief',
    name: 'Thief',
    x: 0,
    z: 0,
    mode: 'car',
    vehicle: { type: 'sedan', colour: '#fff' },
    siren: true,
  });
  assert.equal(off.siren, false);
  assert.equal(off.vehicle.police, undefined);
});

test('ambulance poses stay on the row so another player in the demo room can draw them', () => {
  const now = 1_700_000_000_000;
  const filip = buildPresence({
    uid: 'filip',
    name: 'Filip Turek',
    x: 640,
    z: 1364,
    heading: Math.PI,
    speed: 4,
    mode: 'car',
    vehicle: { type: 'gwagen', colour: '#111111' },
    ambulances: [
      { x: 630, z: 1360, heading: 1.2 },
      { x: 650, z: 1370, heading: 0.4 },
      null,
    ],
    updatedAt: now,
  });
  assert.equal(filip.vehicle.type, 'gwagen');
  assert.equal(filip.ambulances.length, 2);
  assert.equal(filip.ambulances[0].x, 630);
  assert.equal(filip.ambulances[0].heading, 1.2);
  const dave = buildPresence({
    uid: 'dave',
    name: 'Dave N.',
    x: 641,
    z: 1365,
    mode: 'car',
    vehicle: { type: 'scala', colour: '#ee5a1c' },
    updatedAt: now,
  });
  assert.deepEqual(dave.ambulances, []);
  assert.equal(dave.vehicle.type, 'scala');
  const remotes = remotePlayersFromMap({ filip, dave }, 'dave', now);
  assert.equal(remotes.length, 1);
  assert.equal(remotes[0].uid, 'filip');
  assert.equal(remotes[0].ambulances.length, 2);
  assert.equal(parsePresence(filip).ambulances[1].z, 1370);
});

test('shouldSkipPublish is the gate used before set() — any authenticated uid', () => {
  assert.equal(shouldSkipPublish({ uid: 'anon', isAnonymous: true }), false);
  assert.equal(shouldSkipPublish({ uid: 'g', isAnonymous: false, providerData: [{ providerId: 'google.com' }] }), false);
  assert.equal(shouldSkipPublish(null), true);
});
