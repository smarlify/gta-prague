/**
 * GTA Praha presence schema for the demo RTDB room.
 * Visual presence only — city/traffic stay local; no host election.
 */
import { isIdleDriverRecord, publishablePlayerName } from '../character-select.js';

export const PLAYER_HZ = 10;
/** AFK tabs heartbeat about once a second instead of the live 10 Hz pose stream. */
export const AFK_HEARTBEAT_HZ = 1;
export const DEMO_ROOM = 'demo';
export const PLAYERS_PATH = 'gta-praha/rooms/demo/players';
export const MAX_POLICE_UNITS = 12;
export const MAX_OFFICERS = 8;
export const MAX_AMBULANCES = 24;
export const STALE_MS = 8000;
/** While `afk` is set, peers keep the row for at least a minute after the last heartbeat. */
export const AFK_STALE_MS = 60_000;
const IMPULSE_TTL_MS = 2500;

export const TRAVEL_MODES_NET = Object.freeze(['car', 'walk', 'bike', 'scooter']);

function finiteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function cleanString(value, max = 64) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

/** RTDB keys reject . # $ / [ ]. */
function rtdbKey(value, max = 128) {
  return cleanString(String(value ?? ''), max).replace(/[.#$/[\]]/g, '');
}

/**
 * A new id for this tab. localStorage is shared by every window of a profile,
 * and so is the anonymous Firebase user, so the id stays in memory only.
 */
export function presenceSessionId() {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return rtdbKey(uuid, 64);
  return rtdbKey(`s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`, 64);
}

/** Presence uid for one tab. The auth uid stays the parent key the rules allow. */
export function presenceIdentity(authUid, sessionId) {
  const auth = rtdbKey(authUid, 128);
  const session = rtdbKey(sessionId, 64);
  if (!auth || !session) return '';
  return `${auth}~${session}`;
}

/**
 * Where this tab writes. A second tab of the same anonymous user gets its own
 * child, so set() cannot replace the other player. The room is always demo.
 * The driver name is not part of the path.
 */
export function playerPresencePath(authUid, sessionId) {
  const auth = rtdbKey(authUid, 128);
  const session = rtdbKey(sessionId, 64);
  if (!auth || !session) return '';
  return `${PLAYERS_PATH}/${auth}/${session}`;
}

function isPresenceRow(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return typeof value.uid === 'string' || typeof value.mode === 'string' || typeof value.updatedAt === 'number';
}

/** Flat rows (one auth uid) and per-tab children under that uid. */
export function eachPresence(map) {
  const entries = [];
  if (!map || typeof map !== 'object') return entries;
  for (const [key, value] of Object.entries(map)) {
    if (isPresenceRow(value)) {
      entries.push([key, value]);
      continue;
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    for (const [sessionId, row] of Object.entries(value)) {
      if (isPresenceRow(row)) entries.push([`${key}/${sessionId}`, row]);
    }
  }
  return entries;
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
 * Google is not required — Brave and other browsers can auto-join without sign-in.
 * Typed names come from localStorage / the name field, not from Google.
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
  const police = type === 'police' || !!raw.police;
  const vehicle = colour ? { type: police ? 'police' : type, colour } : { type: police ? 'police' : type };
  if (!police) return vehicle;
  vehicle.police = true;
  const livery = cleanString(raw.livery, 24);
  const variant = cleanString(raw.variant, 16);
  if (livery) vehicle.livery = livery;
  if (variant === 'estate' || variant === 'van') vehicle.variant = variant;
  return vehicle;
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

export function parseOfficer(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = cleanString(raw.id, 48);
  if (!id) return null;
  return {
    id,
    x: finiteNumber(raw.x),
    z: finiteNumber(raw.z),
    heading: finiteNumber(raw.heading),
    pose: cleanString(raw.pose, 24) || 'belt',
  };
}

export function parseAmbulance(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    x: finiteNumber(raw.x),
    z: finiteNumber(raw.z),
    heading: finiteNumber(raw.heading),
  };
}

export function parseAmbulanceList(raw, max = MAX_AMBULANCES) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const row of raw) {
    const unit = parseAmbulance(row);
    if (!unit) continue;
    out.push(unit);
    if (out.length >= max) break;
  }
  return out;
}

export function parseOfficerList(raw, max = MAX_OFFICERS) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const row of raw) {
    const officer = parseOfficer(row);
    if (!officer) continue;
    out.push(officer);
    if (out.length >= max) break;
  }
  return out;
}

export function parseArrest(raw) {
  if (!raw || typeof raw !== 'object' || !raw.active) {
    return { active: false, phase: 'idle', t: 0 };
  }
  return {
    active: true,
    phase: cleanString(raw.phase, 24) || 'reach',
    t: Math.max(0, finiteNumber(raw.t, 0)),
  };
}

/** Published shove from one client onto another player's car. `speed` is the impulse magnitude. */
export function parseCrashImpulse(raw, now = Date.now()) {
  if (!raw || typeof raw !== 'object') return null;
  const uid = cleanString(raw.uid, 128);
  if (!uid) return null;
  const nx = finiteNumber(raw.nx);
  const nz = finiteNumber(raw.nz);
  const len = Math.hypot(nx, nz);
  const speed = Math.max(0, Math.min(40, finiteNumber(raw.speed ?? raw.dv, 0)));
  const spin = Math.max(-3, Math.min(3, finiteNumber(raw.spin, 0)));
  const at = finiteNumber(raw.at, 0);
  if (!(len > 0) || !(at > 0)) return null;
  if (now - at > IMPULSE_TTL_MS || at - now > 2000) return null;
  if (speed < 0.05 && Math.abs(spin) < 0.02) return null;
  return { uid, nx: nx / len, nz: nz / len, speed, spin, at };
}

export function crashImpulsePayload(body, impulse, at = Date.now()) {
  if (!body?.remote || !impulse) return null;
  return parseCrashImpulse({
    uid: body.uid,
    nx: impulse.nx,
    nz: impulse.nz,
    speed: impulse.dv ?? impulse.speed,
    spin: impulse.spin,
    at,
  }, at);
}

/** Live pose stream, or the slow AFK heartbeat. Busts stay on the live rate. */
export function presencePublishHz({ afk = false, busted = false } = {}) {
  return afk && !busted ? AFK_HEARTBEAT_HZ : PLAYER_HZ;
}

/** AFK and busts keep writing. A plain pause (map, no heartbeat) does not. */
export function presencePublishes({ paused = false, afk = false, busted = false } = {}) {
  if (busted || afk) return true;
  return !paused;
}

export function presenceStaleMs(row) {
  return row?.afk ? AFK_STALE_MS : STALE_MS;
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
  officers = null,
  arrest = null,
  afk = false,
  afkSince = 0,
  siren = false,
  impulse = null,
  ambulances = null,
  updatedAt = Date.now(),
} = {}) {
  const cleanUid = cleanString(uid, 128);
  if (!cleanUid) return null;
  const wantedRow = parseWanted(wanted);
  let arrestRow = parseArrest(arrest);
  if (wantedRow.busted && !arrestRow.active) {
    arrestRow = { active: true, phase: arrestRow.phase === 'idle' ? 'bust' : arrestRow.phase, t: arrestRow.t };
  }
  const showForce = wantedRow.level > 0 || wantedRow.busted || arrestRow.active;
  const row = {
    uid: cleanUid,
    name: publishablePlayerName(cleanString(name, 48)),
    x: finiteNumber(x),
    z: finiteNumber(z),
    heading: finiteNumber(heading),
    speed: finiteNumber(speed),
    mode: normalizeMode(mode),
    updatedAt: finiteNumber(updatedAt, Date.now()),
    wanted: wantedRow,
    afk: !!afk,
    afkSince: 0,
    siren: false,
    officers: showForce ? parseOfficerList(officers, MAX_OFFICERS) : [],
    arrest: arrestRow,
    ambulances: parseAmbulanceList(ambulances),
  };
  if (row.afk) row.afkSince = finiteNumber(afkSince, row.updatedAt) || row.updatedAt;
  if (row.mode === 'car') {
    row.vehicle = parseVehicle(vehicle) || { type: 'roadster' };
  } else {
    row.vehicle = null;
  }
  row.siren = !!siren && row.mode === 'car' && !!row.vehicle?.police;
  if (showForce) {
    row.police = parsePoliceList(police, MAX_POLICE_UNITS);
  } else {
    row.police = [];
  }
  const hit = parseCrashImpulse(impulse, row.updatedAt);
  if (hit) row.impulse = hit;
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
    officers: raw.officers,
    arrest: raw.arrest,
    afk: raw.afk,
    afkSince: raw.afkSince,
    siren: raw.siren,
    impulse: raw.impulse,
    ambulances: raw.ambulances,
    updatedAt: raw.updatedAt,
  });
}

/** Drop stale or self rows from a players map. */
export function remotePlayersFromMap(map, selfUid, now = Date.now()) {
  const remotes = [];
  for (const [key, value] of eachPresence(map)) {
    if (isIdleDriverRecord(value)) continue;
    const row = parsePresence(value, key);
    if (!row || row.uid === selfUid) continue;
    if (now - row.updatedAt > presenceStaleMs(row)) continue;
    remotes.push(row);
  }
  return remotes;
}

/** Rows for the Online list. Idle Driver leftovers are omitted; every other name stays. */
export function listedPlayers(map, selfUid = '') {
  const out = [];
  const self = typeof selfUid === 'string' ? selfUid : '';
  for (const [key, value] of eachPresence(map)) {
    if (isIdleDriverRecord(value)) continue;
    const row = parsePresence(value, key);
    if (!row) continue;
    out.push({ name: row.name, uid: row.uid, you: !!self && row.uid === self });
  }
  return out;
}

/** The Online button uses this length, including yourself. */
export function onlinePlayerCount(map, selfUid = '') {
  return listedPlayers(map, selfUid).length;
}

/** Strip undefined (RTDB rejects undefined). */
export function toRtdb(value) {
  return JSON.parse(JSON.stringify(value));
}

/** True when this client must not write presence (no uid). */
export function shouldSkipPublish(user) {
  return !canJoinMultiplayer(user);
}
