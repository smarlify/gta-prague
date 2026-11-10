// Pinned starts and the police chase Šlachta joins.
// Distances are world metres. Heading matches the rest of the city: forward is
// (-sin(heading), -cos(heading)).
import {routePoint} from './mobility.js';
import {nearestRoadPoint} from './physics.js';

export const CHASE_BEHIND = 40;
export const ARREST_RANGE = 8;
// Column on one carriageway: pursued car, two patrols, then Šlachta.
// He sits behind the rear patrol, aimed along the road at the pursuit.
export const CHASE_POLICE_BEHIND = Object.freeze([16, 32]);
export const CHASE_DRIVER_BEHIND = 48;
export const CHASE_LEAD_SPEED = 13;
export const CHASE_UNIT_SPEED = 12;
export const CHASE_JOIN_SPEED = 10;

// Ke Hradu, the street leading up to the castle. The named surface is the street.
// Not the Hradčanská tram stop and not the U Prašného mostu point.
export const KE_HRADU = Object.freeze({
  name: 'Ke Hradu',
  id: 'ke-hradu',
  district: 'Praha 1 - Hradčany',
  street: 'Ke Hradu',
  x: -1705,
  z: -154,
  heading: -0.4209,
});

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

// Sněmovní in front of the Chamber (Thunovský palác, Sněmovní 4,
// about 50.0892 N, 14.4038 E). Snapped onto the carriageway, facing
// along the street. Not inside the palace.
export const POSLANECKA_SNEMOVNA = Object.freeze({
  name: 'Poslanecká sněmovna',
  id: 'poslanecka-snemovna',
  district: 'Praha 1 - Malá Strana',
  street: 'Sněmovní',
  x: -1248.8,
  z: -192.6,
  heading: -3.133,
});

// nábřeží Edvarda Beneše in front of Úřad vlády (Strakova akademie,
// about 50.0919 N, 14.4110 E). Snapped onto the carriageway, facing
// along the quay. Not inside the building.
export const URAD_VLADY = Object.freeze({
  name: 'Úřad vlády',
  id: 'urad-vlady',
  district: 'Praha 1 - Malá Strana',
  street: 'nábřeží Edvarda Beneše',
  x: -736.5,
  z: -494.0,
  heading: -0.755,
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

function finitePoint(body) {
  return !!body && Number.isFinite(body.x) && Number.isFinite(body.z);
}

/**
 * The other player Šlachta joins. Nearest live body wins.
 * Null when nobody else is online, so the chase is staged on the road at the pin.
 */
export function chaseQuarry(origin, {players} = {}) {
  const live = (Array.isArray(players) ? players : []).filter(finitePoint);
  if (!live.length) return null;
  if (!origin || !Number.isFinite(origin.x) || !Number.isFinite(origin.z)) return {kind: 'player', body: live[0]};
  let best = null;
  let bestD = Infinity;
  for (const body of live) {
    const distance = Math.hypot(body.x - origin.x, body.z - origin.z);
    if (distance < bestD) {
      best = body;
      bestD = distance;
    }
  }
  return best ? {kind: 'player', body: best} : null;
}

function incomingOf(graph) {
  if (graph.incoming) return graph.incoming;
  const incoming = Array.from({length: graph.nodes?.length || 0}, () => []);
  for (const edge of graph.edges || []) incoming[edge.to]?.push(edge);
  return incoming;
}

function edgeBefore(incoming, edge) {
  const list = (incoming[edge.from] || []).filter((candidate) => candidate && candidate !== edge);
  if (!list.length) return null;
  const ahead = routePoint(edge, Math.min(edge.length, 1));
  let best = list[0];
  let score = -Infinity;
  for (const candidate of list) {
    const end = routePoint(candidate, Math.max(0, candidate.length - 0.5));
    const align = Math.cos((end.heading || 0) - (ahead.heading || 0));
    if (align > score) {
      score = align;
      best = candidate;
    }
  }
  return best;
}

function seatOnEdge(edge, s, fits) {
  const lane = Number.isFinite(edge.lane) ? edge.lane : 0;
  const offsets = [];
  for (const offset of [lane, 0, lane * 0.5, -lane]) {
    if (!offsets.some((have) => Math.abs(have - offset) < 0.05)) offsets.push(offset);
  }
  let fallback = null;
  for (const offset of offsets) {
    const p = routePoint(edge, s, offset);
    const spot = {edge, s, x: p.x, z: p.z, heading: p.heading, offset};
    if (!fallback) fallback = spot;
    if (!fits || fits(spot.x, spot.z, spot.heading)) return spot;
  }
  return fallback;
}

/** A point `metres` back along the route, still on the carriageway. */
export function behindOnRoute(graph, spot, metres, incoming = incomingOf(graph), fits = null) {
  if (!graph || !spot?.edge || !Number.isFinite(spot.s) || !(metres >= 0)) return null;
  let edge = spot.edge;
  let s = Math.max(0, Math.min(spot.s, edge.length || 0));
  let left = metres;
  for (let hop = 0; hop < 16 && left > 0.05; hop++) {
    if (s >= left) return seatOnEdge(edge, s - left, fits);
    left -= s;
    const prev = edgeBefore(incoming, edge);
    if (!prev) return null;
    edge = prev;
    s = edge.length;
  }
  return null;
}

/** Nearest driveable sample on the mobility graph, or null when the road is too far. */
export function graphSpot(graph, x, z, maxDistance = 90) {
  if (!graph?.edges?.length || !Number.isFinite(x) || !Number.isFinite(z)) return null;
  let best = null;
  let bestD = maxDistance;
  for (const edge of graph.edges) {
    if (!(edge.length > 6)) continue;
    const step = Math.max(6, edge.length / 20);
    const samples = Math.max(1, Math.ceil(edge.length / step));
    for (let i = 0; i <= samples; i++) {
      const at = Math.min(edge.length, i * step);
      const p = routePoint(edge, at);
      const distance = Math.hypot(p.x - x, p.z - z);
      if (distance < bestD) {
        bestD = distance;
        best = {edge, s: at, x: p.x, z: p.z, heading: p.heading};
      }
    }
  }
  return best;
}

function leadWithRoom(graph, spot, room, incoming, fits) {
  if (spot.s < room && spot.edge.length >= room + 8 && !behindOnRoute(graph, spot, room, incoming, fits)) {
    const s = Math.min(spot.edge.length - 4, room);
    const back = behindOnRoute(graph, {edge: spot.edge, s}, room, incoming, fits);
    if (back) return seatOnEdge(spot.edge, s, fits);
  }
  let edge = spot.edge;
  let s = spot.s;
  for (let hop = 0; hop < 24; hop++) {
    if (behindOnRoute(graph, {edge, s}, room, incoming, fits)) return seatOnEdge(edge, s, fits);
    if (edge.length >= room && s < room) {
      s = Math.min(edge.length - 1, room);
      continue;
    }
    const outs = (graph.outgoing?.[edge.to] || []).filter((candidate) => candidate && candidate !== edge);
    const next = outs.find((candidate) => candidate.to !== edge.from) || outs[0];
    if (!next) return null;
    edge = next;
    s = Math.min(edge.length, Math.max(room, 1));
  }
  return null;
}

function columnFrom(graph, anchor, room, incoming, fits) {
  const near = graphSpot(graph, anchor.x, anchor.z);
  if (!near) return null;
  const lead = leadWithRoom(graph, near, room, incoming, fits);
  if (!lead) return null;
  const police = [];
  for (const metres of CHASE_POLICE_BEHIND) {
    const spot = behindOnRoute(graph, lead, metres, incoming, fits);
    if (!spot) return null;
    police.push({...spot, speed: CHASE_UNIT_SPEED, role: 'chase'});
  }
  const driver = behindOnRoute(graph, lead, room, incoming, fits);
  if (!driver) return null;
  return {lead, police, driver};
}

/**
 * Šlachta's seat in a chase that is already on the road.
 * A live player is the quarry, and he is placed behind that pursuit.
 * With nobody online the quarry is a point on the road at `origin`, which the
 * traffic sim then drives, with two patrols between him and that car.
 * Null when the graph has no carriageway long enough to hold the column.
 */
export function slachtaChaseLayout({origin, players, graph, room = CHASE_DRIVER_BEHIND, fits = null} = {}) {
  if (!origin || !Number.isFinite(origin.x) || !Number.isFinite(origin.z) || !graph?.edges?.length) return null;
  const incoming = incomingOf(graph);
  const quarryBody = chaseQuarry(origin, {players});
  let column = null;
  let kind = 'traffic';
  let uid = '';
  if (quarryBody) {
    column = columnFrom(graph, quarryBody.body, room, incoming, fits);
    if (column) {
      kind = 'player';
      uid = quarryBody.body.uid || '';
    }
  }
  if (!column) {
    column = columnFrom(graph, origin, room, incoming, fits);
    kind = 'traffic';
    uid = '';
  }
  if (!column) return null;
  const {lead, police, driver} = column;
  return {
    kind,
    quarry: {...lead, speed: CHASE_LEAD_SPEED, uid},
    police,
    spawn: {
      x: driver.x,
      z: driver.z,
      heading: headingToward(driver, lead),
      street: '',
      chase: true,
      edge: driver.edge,
      s: driver.s,
    },
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

function wantedStars(body) {
  const level = body?.wanted?.level ?? body?.wantedLevel;
  return Number.isFinite(level) ? level : 0;
}

/**
 * Šlachta arrests only while he is driving his own police car with the sirens on,
 * and only a player who already has at least one wanted star.
 * Anyone else, sirens off, a stolen cruiser, or a clean player returns null.
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
  const target = nearestWithin(actor, (others || []).filter((body) => wantedStars(body) >= 1), range);
  if (!target) return null;
  return {active: true, phase: 'bust', t: 0, target: target.uid};
}

const SLACHTA_NAME = 'robert šlachta';

/** Published name for Robert Šlachta. A renamed player is someone else. */
export function isSlachtaName(name) {
  return String(name ?? '').replace(/\s+/g, ' ').trim().toLowerCase() === SLACHTA_NAME;
}

/** On foot, or at the wheel of his own cruiser. Another character never wears it. */
export function slachtaWearsUniform({police = false, mode = '', policeCar = false, name = ''} = {}) {
  const officer = !!police || isSlachtaName(name);
  if (!officer) return false;
  if (mode === 'walk') return true;
  return mode === 'car' && !!policeCar;
}
