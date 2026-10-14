/**
 * GTA Praha presence schema for the demo RTDB room.
 * Visual presence only — city/traffic stay local; no host election.
 */

export const PLAYER_HZ = 10;
export const DEMO_ROOM = 'demo';
export const PLAYERS_PATH = 'gta-praha/rooms/demo/players';
export const MAX_POLICE_UNITS = 12;
export const STALE_MS = 8000;

export const TRAVEL_MODES_NET = Object.freeze(['car', 'walk', 'bike', 'scooter']);

function finiteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function cleanString(value, max = 64) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

export function isAnonymousProvider(user) {
  if (!user) return true;
  if (user.isAnonymous) return true;
  const provider = user.providerData?.[0]?.providerId
    || user.providerId
    || '';
  return provider === 'anonymous' || !provider && !!user.isAnonymous;
}

/**
 * Temp default: any authenticated uid (incl. anonymous) may join the demo room.
 * Revert to Google-only (`!isAnonymousProvider(user)`) after two-tab testing.
 */
export function canJoinMultiplayer(user) {
  return !!(user && user.uid);
}

export function normalizeMode(mode) {
  const m = typeof mode === 'string' ? mode : '';
  if (m === 'swim') return 'walk';
  return TRAVEL_MODES_NET.includes(m) ? m : 'walk';
}

export function parseVehicle(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const type = cleanString(raw.type || raw.kind, 32) || 'sedan';
  const colour = cleanString(raw.colour || raw.color || raw.paint, 32) || null;
  return colour ? { type, colour } : { type };
}

export function parseWanted(raw) {
  if (!raw || typeof raw !== 'object') {
    return { level: 0, heat: 0, status: 'CLEAR', busted: false };
  }
  const level = Math.max(0, Math.min(5, Math.round(finiteNumber(raw.level, 0))));
  return {
    level,
    heat: Math.max(0, finiteNumber(raw.heat, 0)),
    status: cleanString(raw.status, 24) || (level ? 'PURSUIT' : 'CLEAR'),
    busted: !!raw.busted,
  };
}

export function parsePoliceUnit(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = cleanString(raw.id, 48);
  if (!id) return null;
  return {
    id,
    x: finiteNumber(raw.x),
    z: finiteNumber(raw.z),
    heading: finiteNumber(raw.heading),
    speed: finiteNumber(raw.speed),
    role: cleanString(raw.role, 24) || 'chase',
  };
}

export function parsePoliceList(raw, max = MAX_POLICE_UNITS) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const row of raw) {
    const unit = parsePoliceUnit(row);
    if (!unit) continue;
    out.push(unit);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Build a presence row from local game state.
 * `police` is omitted (or empty) when wanted level is clear.
 */
export function buildPresence({
  uid,
  name,
  x,
  z,
  heading,
  speed,
  mode,
  vehicle = null,
  wanted = null,
  police = null,
  updatedAt = Date.now(),
} = {}) {
  const cleanUid = cleanString(uid, 128);
  if (!cleanUid) return null;
  const wantedRow = parseWanted(wanted);
  const row = {
    uid: cleanUid,
    name: cleanString(name, 48) || 'Driver',
    x: finiteNumber(x),
    z: finiteNumber(z),
    heading: finiteNumber(heading),
    speed: finiteNumber(speed),
    mode: normalizeMode(mode),
    updatedAt: finiteNumber(updatedAt, Date.now()),
    wanted: wantedRow,
  };
  if (row.mode === 'car') {
    row.vehicle = parseVehicle(vehicle) || { type: 'crossover' };
  } else {
    row.vehicle = null;
  }
  if (wantedRow.level > 0) {
    row.police = parsePoliceList(police, MAX_POLICE_UNITS);
  } else {
    row.police = [];
  }
  return row;
}

/** Parse one RTDB player snapshot; returns null if unusable. */
export function parsePresence(raw, uidHint = '') {
  if (!raw || typeof raw !== 'object') return null;
  const uid = cleanString(raw.uid || uidHint, 128);
  if (!uid) return null;
  return buildPresence({
    uid,
    name: raw.name,
    x: raw.x,
    z: raw.z,
    heading: raw.heading,
    speed: raw.speed,
    mode: raw.mode,
    vehicle: raw.vehicle,
    wanted: raw.wanted,
    police: raw.police,
    updatedAt: raw.updatedAt,
  });
}

/** Drop stale or self rows from a players map. */
export function remotePlayersFromMap(map, selfUid, now = Date.now()) {
  const remotes = [];
  if (!map || typeof map !== 'object') return remotes;
  for (const [key, value] of Object.entries(map)) {
    const row = parsePresence(value, key);
    if (!row || row.uid === selfUid) continue;
    if (now - row.updatedAt > STALE_MS) continue;
    remotes.push(row);
  }
  return remotes;
}

/** Strip undefined (RTDB rejects undefined). */
export function toRtdb(value) {
  return JSON.parse(JSON.stringify(value));
}

/** True when this client must not write presence (no uid). */
export function shouldSkipPublish(user) {
  return !canJoinMultiplayer(user);
}
