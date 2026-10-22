// Pinned starts and the police chase spot for the Prague welcome card.
// Distances are world metres. Heading matches the rest of the city: forward is
// (-sin(heading), -cos(heading)).
import {nearestRoadPoint} from './physics.js';

export const CHASE_BEHIND = 40;
export const ARREST_RANGE = 8;

// U Prašného mostu, the driveable road at the castle. Not the Hradčanská tram stop.
export const PRAZSKY_HRAD = Object.freeze({
  name: 'Pražský hrad',
  id: 'prazsky-hrad',
  district: 'Praha 1 - Hradčany',
  street: 'U Prašného mostu',
  x: -1638.49,
  z: -641.42,
  heading: -1.7,
});

// Open water halfway from Karlův most to Most Legií, off both decks.
export const VLTAVA_START = Object.freeze({
  name: 'Vltava',
  id: 'vltava',
  district: 'Praha 1',
  street: '',
  x: -688.3,
  z: 379.6,
  heading: -2.9668,
  water: true,
});

// Jungmannova in front of Palác Adria (pasáž Adria), east of Národní divadlo.
// Snapped onto the carriageway, facing along the street. Not inside the palace.
export const DIVADLO_BEZ_ZABRADLI = Object.freeze({
  name: 'Divadlo Bez zábradlí',
  id: 'divadlo-bez-zabradli',
  district: 'Praha 1 - Nové Město',
  street: 'Jungmannova',
  x: 73.6,
  z: 552.4,
  heading: -2.993,
});

/** A point `metres` behind a body, opposite the way it is facing. */
export function behindPoint(target, metres = CHASE_BEHIND) {
  const heading = target?.heading || 0;
  return {
    x: target.x + Math.sin(heading) * metres,
    z: target.z + Math.cos(heading) * metres,
  };
}

/** Heading that looks from `from` toward `to`. */
export function headingToward(from, to) {
  return Math.atan2(-(to.x - from.x), -(to.z - from.z));
}

/**
 * Who Šlachta waits behind. A remote player wins, then the nearest traffic car.
 * Null when neither list exists yet, so the start stays Letenské náměstí.
 * A missing list must not throw.
 */
export function chaseBody(origin, {players, traffic} = {}) {
  if (!origin || !Number.isFinite(origin.x) || !Number.isFinite(origin.z)) return null;
  const remotes = Array.isArray(players) ? players : [];
  const player = remotes.find((body) => body && Number.isFinite(body.x) && Number.isFinite(body.z));
  if (player) return {kind: 'player', body: player};
  const cars = Array.isArray(traffic) ? traffic : [];
  let best = null;
  let bestD = Infinity;
  for (const source of cars) {
    const actor = source?.actor;
    if (!actor || !Number.isFinite(actor.x) || !Number.isFinite(actor.z)) continue;
    const distance = Math.hypot(actor.x - origin.x, actor.z - origin.z);
    if (distance < bestD) {
      best = actor;
      bestD = distance;
    }
  }
  return best ? {kind: 'traffic', body: best} : null;
}

/**
 * Road point about 40 m behind `target`, facing them.
 * `roads` is the city road array; `buildings` is a spatial index with `.at`.
 * Null when no clear carriageway is close enough to search.
 */
export function chasePlacement(target, roads, buildings) {
  if (!target || !Number.isFinite(target.x) || !Number.isFinite(target.z) || !roads?.length) return null;
  const behind = behindPoint(target, CHASE_BEHIND);
  let spot;
  try {
    spot = nearestRoadPoint(behind.x, behind.z, roads, buildings);
  } catch {
    return null;
  }
  if (!spot) return null;
  return {
    x: spot.x,
    z: spot.z,
    heading: headingToward(spot, target),
    street: spot.name || '',
    chase: true,
  };
}

/** The nearest other body within `range` metres, or null. */
export function nearestWithin(actor, others, range = ARREST_RANGE) {
  if (!actor || !Number.isFinite(actor.x) || !Number.isFinite(actor.z)) return null;
  let best = null;
  let bestD = range;
  for (const other of others || []) {
    if (!other?.uid || !Number.isFinite(other.x) || !Number.isFinite(other.z)) continue;
    const distance = Math.hypot(other.x - actor.x, other.z - actor.z);
    if (distance <= bestD) {
      best = other;
      bestD = distance;
    }
  }
  return best;
}

/**
 * Šlachta arrests only while he is driving his own police car with the sirens on.
 * Anyone else, sirens off, or a stolen cruiser returns null.
 */
export function slachtaArrest({
  characterId = '',
  siren = false,
  drivingHomePolice = false,
  actor = null,
  others = [],
  range = ARREST_RANGE,
} = {}) {
  if (characterId !== 'slachta' || !siren || !drivingHomePolice) return null;
  const target = nearestWithin(actor, others, range);
  if (!target) return null;
  return {active: true, phase: 'bust', t: 0, target: target.uid};
}
