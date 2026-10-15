// Fills Troja, Bohnice, and the Stromovka edge with the same layers the centre
// already draws: roads, pavement, buildings, trees, parks, and street furniture.
// Magistrála and the airport road are not queried.
import fs from 'node:fs';
import path from 'node:path';
import {gzipSync, gunzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import proj4 from 'proj4';
import polygonClipping from 'polygon-clipping';
import {bounds, pointInPolygon} from '../src/geo.js';
import {surfaceRecord} from '../src/surface-streaming.js';
import {stripBoredTunnels} from '../src/passage.js';
import {circleRing, NORTH_LAYER_IDS, NORTH_LAYER_NOTE, CORRIDOR_PROVENANCE} from '../src/prague-corridors.js';
import {surfaceChunks} from './world-formats.mjs';

const ROOT = 'public/cities/prague';
const EXT = path.join(ROOT, 'extensions');
const RAW = 'data/raw/cities/prague/north-layers.json';
const DISK = 2400;
const CROP_Z = -2480;
const EDGE = {x0: -500, x1: 1400, z0: -3600, z1: -2100};
const CELL = 64;

const def = JSON.parse(fs.readFileSync('cities/prague/city.json', 'utf8'));
const projection = `+proj=tmerc +lat_0=${def.origin[1]} +lon_0=${def.origin[0]} +k=1 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs`;
const toLocal = proj4('EPSG:4326', projection);
const toWgs = proj4(projection, 'EPSG:4326');
const localOf = (lon, lat) => {
 const [e, n] = toLocal.forward([lon, lat]);
 return [Math.round(e * 100) / 100, Math.round(-n * 100) / 100];
};
const index = JSON.parse(fs.readFileSync(path.join(EXT, 'index.json'), 'utf8'));
const entries = Object.fromEntries(index.extensions.map(entry => [entry.id, entry]));
for (const id of NORTH_LAYER_IDS) if (!entries[id]) throw new Error(`Missing corridor ${id}`);

const disk = [circleRing(DISK, 96)];
const edgeRect = [[[EDGE.x0, EDGE.z0], [EDGE.x1, EDGE.z0], [EDGE.x1, CROP_Z], [EDGE.x0, CROP_Z], [EDGE.x0, EDGE.z0]]];
const edgeBox = [[[EDGE.x0, EDGE.z0], [EDGE.x1, EDGE.z0], [EDGE.x1, EDGE.z1], [EDGE.x0, EDGE.z1], [EDGE.x0, EDGE.z0]]];

function grid(multi) {
 const cells = new Map();
 for (const rings of multi || []) {
  if (!rings?.[0] || rings[0].length < 4) continue;
  const b = bounds(rings);
  for (let i = Math.floor(b[0] / CELL); i <= Math.floor(b[2] / CELL); i++) {
   for (let j = Math.floor(b[1] / CELL); j <= Math.floor(b[3] / CELL); j++) {
    const key = `${i},${j}`;
    let list = cells.get(key);
    if (!list) cells.set(key, list = []);
    list.push(rings);
   }
  }
 }
 return cells;
}
function inside(cells, x, z) {
 const list = cells.get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`);
 return !!list && list.some(rings => pointInPolygon(x, z, rings));
}
// Bohnice's driveable strip is a chain of road quads. Footprints sit beside
// that strip, so the neighbourhood is the same quads grown by 72 m — inside
// the 80 m corridor height search, and not a second copy of the whole district.
const STREET = 72;
function offsetRing(ring, pad) {
 const open = ring.slice(0, -1);
 if (open.length < 4) return null;
 const areaOf = pts => { let a = 0; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1]; return Math.abs(a) / 2; };
 const grow = sign => open.map((p, i) => {
  const prev = open[(i + open.length - 1) % open.length], next = open[(i + 1) % open.length];
  let nx = 0, nz = 0;
  for (const [a, b] of [[prev, p], [p, next]]) {
   const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz) || 1;
   nx += sign * dz / len; nz += sign * -dx / len;
  }
  const n = Math.hypot(nx, nz) || 1;
  return [p[0] + nx / n * pad, p[1] + nz / n * pad];
 });
 const a = grow(1), b = grow(-1);
 const ringOut = (areaOf(a) >= areaOf(b) ? a : b);
 ringOut.push(ringOut[0]);
 return ringOut;
}
function unionAll(polys) {
 let acc = [];
 for (let i = 0; i < polys.length; i += 30) {
  const batch = polys.slice(i, i + 30);
  try { acc = acc.length ? polygonClipping.union(...[acc, ...batch]) : polygonClipping.union(...batch); }
  catch { acc = acc.concat(batch); }
 }
 return acc.filter(poly => poly?.[0]?.length > 3);
}
function widen(multi, pad) {
 const grown = [];
 for (const poly of multi || []) {
  const ring = offsetRing(poly[0], pad);
  if (ring) grown.push([ring.map(p => [Math.round(p[0]), Math.round(p[1])])]);
 }
 if (grown.length < 2) return grown.length ? grown : multi;
 const union = unionAll(grown);
 console.log(`bohnice neighbourhood: ${grown.length} quads -> ${union.length} polygons`);
 return union.length ? union : grown;
}
const bohniceKeep = entries.bohnice.neighbourhood ? entries.bohnice.playable : widen(entries.bohnice.playable, STREET);
const playable = {
 troja: grid(entries.troja.playable),
 bohnice: grid(bohniceKeep),
};
function inEdge(x, z) {
 return x >= EDGE.x0 && x <= EDGE.x1 && z >= EDGE.z0 && z <= EDGE.z1;
}
function coveredByCentre(x, z) {
 return Math.hypot(x, z) <= DISK && z >= CROP_Z;
}
function corridorAt(x, z) {
 if (coveredByCentre(x, z) && !inEdge(x, z)) return null;
 if (inside(playable.bohnice, x, z)) return 'bohnice';
 if (inside(playable.troja, x, z) || (inEdge(x, z) && (z < CROP_Z || Math.hypot(x, z) > DISK))) return 'troja';
 return null;
}

const keep = {
 troja: [...entries.troja.playable, edgeBox],
 bohnice: bohniceKeep,
};
function retained(rings, id) {
 if (!rings?.[0] || rings[0].length < 4) return [];
 let hit = [];
 try { hit = polygonClipping.intersection([rings], keep[id]); } catch { return []; }
 if (!hit.length) return [];
 let outside = [];
 try { outside = polygonClipping.difference(hit, disk); } catch { outside = []; }
 let strip = [];
 if (id === 'troja') {
  try { strip = polygonClipping.intersection(hit, edgeRect); } catch { strip = []; }
 }
 const parts = [...outside, ...strip].filter(poly => poly?.[0]?.length > 3);
 return parts;
}

function fetchOsm() {
 if (fs.existsSync(RAW)) return JSON.parse(fs.readFileSync(RAW, 'utf8'));
 const corners = [[-1900, -6200], [2600, -6200], [2600, -1900], [-1900, -1900]].map(([x, z]) => toWgs.forward([x, -z]));
 const south = Math.min(...corners.map(p => p[1])), north = Math.max(...corners.map(p => p[1]));
 const west = Math.min(...corners.map(p => p[0])), east = Math.max(...corners.map(p => p[0]));
 const body = `(
  way["building"](${south},${west},${north},${east});
  way["highway"]["highway"!~"proposed|construction|raceway|elevator|platform"](${south},${west},${north},${east});
  way["leisure"~"^(park|garden|playground|nature_reserve)$"](${south},${west},${north},${east});
  way["landuse"~"^(forest|grass|meadow|village_green|recreation_ground)$"](${south},${west},${north},${east});
  way["natural"~"^(wood|water)$"](${south},${west},${north},${east});
  way["waterway"="riverbank"](${south},${west},${north},${east});
  node["natural"="tree"](${south},${west},${north},${east});
  node["highway"="street_lamp"](${south},${west},${north},${east});
  node["amenity"~"^(bench|waste_basket)$"](${south},${west},${north},${east});
 );out geom;`;
 const query = `[out:json][timeout:180];${body}`;
 const endpoints = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
 fs.mkdirSync(path.dirname(RAW), {recursive: true});
 let last = 'no attempt';
 for (const endpoint of endpoints) {
  try {
   const text = execFileSync('curl', ['-sS', '-f', '--max-time', '200', '-A', 'worldhood/0.1 (prague north)', '--data-urlencode', `data=${query}`, endpoint], {encoding: 'utf8', maxBuffer: 1 << 30});
   const json = JSON.parse(text);
   if (!Array.isArray(json.elements)) throw new Error('no elements');
   fs.writeFileSync(RAW, text);
   console.log(`overpass ${endpoint}: ${json.elements.length} elements`);
   return json;
  } catch (error) {
   last = String(error.message || error).slice(0, 180);
   console.log(`overpass failed (${endpoint}): ${last}`);
  }
 }
 throw new Error(`Overpass unavailable: ${last}`);
}

const ROAD = /^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|busway)$/;
const PAVE = /^(footway|path|pedestrian|cycleway|steps|bridleway|corridor)$/;
function lineOf(way) {
 const geom = way.geometry || [];
 if (geom.length < 2) return null;
 return geom.map(p => localOf(p.lon, p.lat));
}
function close(line) {
 if (!line || line.length < 3) return null;
 const a = line[0], b = line.at(-1);
 const ring = Math.hypot(a[0] - b[0], a[1] - b[1]) < 1 ? line.slice(0, -1) : line.slice();
 if (ring.length < 3) return null;
 return [...ring, ring[0]];
}
function bufferLine(line, width) {
 const w = width / 2, pieces = [];
 for (let i = 1; i < line.length; i++) {
  const a = line[i - 1], b = line[i], dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
  if (len < 0.5) continue;
  const nx = -dz / len * w, nz = dx / len * w;
  pieces.push([[[a[0] + nx, a[1] + nz], [b[0] + nx, b[1] + nz], [b[0] - nx, b[1] - nz], [a[0] - nx, a[1] - nz], [a[0] + nx, a[1] + nz]]]);
 }
 if (!pieces.length) return [];
 try { return polygonClipping.union(...pieces); } catch { return []; }
}
function centroid(ring) {
 let x = 0, z = 0;
 const n = Math.max(1, ring.length - 1);
 for (let i = 0; i < n; i++) { x += ring[i][0]; z += ring[i][1]; }
 return [x / n, z / n];
}

const centre = JSON.parse(gunzipSync(fs.readFileSync(path.join(ROOT, 'city.pack'))));
const taken = new Map();
function remember(kind, x, z) {
 const key = `${kind}:${Math.floor(x / 12)},${Math.floor(z / 12)}`;
 let list = taken.get(key);
 if (!list) taken.set(key, list = []);
 list.push([x, z]);
}
function nearTaken(kind, x, z, reach) {
 for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
  for (const p of taken.get(`${kind}:${Math.floor(x / 12) + i},${Math.floor(z / 12) + j}`) || []) {
   if (Math.hypot(p[0] - x, p[1] - z) < reach) return true;
  }
 }
 return false;
}
for (const b of centre.buildings || []) remember('building', (b.bbox[0] + b.bbox[2]) / 2, (b.bbox[1] + b.bbox[3]) / 2);
for (const t of centre.trees || []) if (t.p) remember('tree', t.p[0], t.p[1]);

const previousRoads = Object.fromEntries(NORTH_LAYER_IDS.map(id => {
 const city = JSON.parse(gunzipSync(fs.readFileSync(path.join(EXT, id, 'city.pack'))));
 return [id, city.roads || []];
}));
const packs = Object.fromEntries(NORTH_LAYER_IDS.map(id => [id, {buildings: [], roads: [], pavement: [], parks: [], water: [], trees: [], furniture: []}]));

const osm = fetchOsm();
let skippedCentre = 0;
for (const el of osm.elements || []) {
 const tags = el.tags || {};
 if (el.type === 'node') {
  const [x, z] = localOf(el.lon, el.lat);
  const id = corridorAt(x, z);
  if (!id) { skippedCentre++; continue; }
  if (tags.natural === 'tree') {
   if (nearTaken('tree', x, z, 3)) continue;
   remember('tree', x, z);
   packs[id].trees.push({p: [x, z], species: tags.species || tags.genus || 'tree', size: '10 - 30 cm'});
  } else if (tags.highway === 'street_lamp') packs[id].furniture.push({k: 'lamp', x, z, yaw: 0});
  else if (tags.amenity === 'bench') packs[id].furniture.push({k: 'bench', x, z, yaw: 0});
  else if (tags.amenity === 'waste_basket') packs[id].furniture.push({k: 'bin', x, z, yaw: 0});
  continue;
 }
 if (el.type !== 'way') continue;
 if (/evropsk|letišt|letist|magistrál|magistral|wilsonova|legerova|sokolsk|5\. května|5\. kvetna|brněnsk|brnensk/i.test(`${tags.name || ''} ${tags.ref || ''}`)) continue;
 const line = lineOf(el);
 if (!line) continue;
 const mid = line[Math.floor(line.length / 2)];
 const id = corridorAt(mid[0], mid[1]);
 if (!id && !line.some(p => corridorAt(p[0], p[1]))) continue;
 const owner = id || NORTH_LAYER_IDS.find(name => line.some(p => corridorAt(p[0], p[1]) === name));
 if (!owner) continue;
 const tunnel = tags.tunnel === 'yes' || tags.tunnel === 'building_passage';
 const bridge = tags.bridge === 'yes' || /\bmost\b/i.test(tags.name || '');
 if (tags.building) {
  const ring = close(line);
  if (!ring) continue;
  const parts = retained([ring], owner);
  for (const poly of parts) {
   const ringOut = poly[0].map(p => [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100]);
   const [cx, cz] = centroid(ringOut);
   if (coveredByCentre(cx, cz) && nearTaken('building', cx, cz, 8)) continue;
   remember('building', cx, cz);
   const levels = Number(tags['building:levels']);
   const height = Number(tags.height) || (Number.isFinite(levels) ? levels * 3 : undefined);
   packs[owner].buildings.push({id: `osm-way-${el.id}`, name: tags.name || '', address: '', rings: [ringOut], bbox: bounds([ringOut]), kind: 'civic', material: '', height: height || null});
  }
  continue;
 }
 if (tags.natural === 'water' || tags.waterway === 'riverbank' || tags.leisure || tags.landuse || tags.natural === 'wood') {
  const ring = close(line);
  if (!ring) continue;
  const parts = retained([ring], owner);
  const kind = tags.waterway === 'riverbank' || tags.natural === 'water' ? 'riverbank' : /forest|wood|nature_reserve/.test(`${tags.landuse} ${tags.natural} ${tags.leisure}`) ? 'Metsä' : 'Nurmikko';
  for (const poly of parts) {
   const rings = poly.map(r => r.map(p => [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100])).filter(r => r.length > 3);
   if (!rings[0]) continue;
   const item = {id: `osm-way-${el.id}`, name: tags.name || '', address: '', rings, bbox: bounds(rings), kind, material: ''};
   if (kind === 'riverbank') packs[owner].water.push(item);
   else packs[owner].parks.push(item);
  }
  continue;
 }
 const highway = tags.highway || '';
 const road = ROAD.test(highway), pave = PAVE.test(highway);
 if (!road && !pave) continue;
 const width = road ? (/motorway|trunk/.test(highway) ? 16 : 11) : 4;
 for (const poly of bufferLine(line, width)) {
  const parts = retained(poly, owner);
  for (const piece of parts) {
   const rings = piece.map(r => r.map(p => [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100])).filter(r => r.length > 3);
   if (!rings[0]) continue;
   const kind = road ? (bridge ? 'Ajorata (most)' : 'Ajorata') : /steps/.test(highway) ? 'Portaat' : /cycleway/.test(highway) ? 'Pyörätie' : 'Jalankulkualue';
   packs[owner][road ? 'roads' : 'pavement'].push({
    id: `osm-way-${el.id}`, name: tags.name || '', address: '', rings, bbox: bounds(rings), kind,
    material: road ? 'Asfaltti' : '', passage: tunnel ? 'yes' : undefined,
   });
  }
 }
}
console.log(`skipped ${skippedCentre} centre-disk nodes`);
for (const id of NORTH_LAYER_IDS) packs[id].roads.push(...previousRoads[id]);

// Rendered ground only: overlapping buffers are dissolved the way the centre
// build does. The city pack keeps every road, pavement, building, and tree.
function renderedSurfaces(pack) {
 const T = 200, safe = f => { try { return f(); } catch { return []; } };
 const out = {roads: [], pavement: [], parks: [], buildings: pack.buildings};
 const classRoads = r => /Nupu|Noppa|kivi/.test(r.material || '') ? 'stone' : 'asphalt';
 const classPave = p => /Pyör|pyör/.test(p.kind || '') ? 'cycle' : /Portaat|portaat/.test(p.kind || '') ? 'steps' : 'walk';
 const classPark = p => /Mets|forest|wood/.test(p.kind || '') ? 'Metsä' : 'Nurmikko';
 const grid = items => {
  const m = new Map();
  for (const it of items) {
   const b = it.bbox; if (!b) continue;
   for (let x = Math.floor(b[0] / T); x <= Math.floor(b[2] / T); x++) for (let z = Math.floor(b[1] / T); z <= Math.floor(b[3] / T); z++) {
    const k = `${x},${z}`; if (!m.has(k)) m.set(k, []); m.get(k).push(it);
   }
  }
  return m;
 };
 const G = {roads: grid(pack.roads.filter(r => r.passage !== 'yes')), pavement: grid(pack.pavement), parks: grid(pack.parks)};
 for (const k of new Set([...G.roads.keys(), ...G.pavement.keys(), ...G.parks.keys()])) {
  const [x, z] = k.split(',').map(Number), cell = [[[x * T, z * T], [(x + 1) * T, z * T], [(x + 1) * T, (z + 1) * T], [x * T, (z + 1) * T], [x * T, z * T]]];
  let placed = [];
  const layer = (items, classOf, order, target, make) => {
   for (const cls of order) {
    const polys = items.filter(i => classOf(i) === cls).map(i => i.rings).filter(r => r?.[0]?.length > 3);
    if (!polys.length) continue;
    let u = safe(() => polygonClipping.intersection(polygonClipping.union(...polys), cell));
    if (placed.length) u = safe(() => polygonClipping.difference(u, placed));
    if (!u.length) continue;
    placed = safe(() => polygonClipping.union(placed, u));
    for (const rings of u) if (rings?.[0]?.length > 3) target.push({...make(cls), rings, bbox: bounds(rings)});
   }
  };
  layer(G.roads.get(k) || [], classRoads, ['stone', 'asphalt'], out.roads, m => ({kind: 'Ajorata', material: m === 'stone' ? 'Nupukivi' : 'Asfaltti'}));
  layer(G.pavement.get(k) || [], classPave, ['steps', 'cycle', 'walk'], out.pavement, c => ({kind: c === 'cycle' ? 'Pyörätie' : c === 'steps' ? 'Portaat' : 'Jalankulkualue', material: ''}));
  layer(G.parks.get(k) || [], classPark, ['Metsä', 'Nurmikko'], out.parks, c => ({kind: c, material: ''}));
 }
 if (!out.roads.length) out.roads = pack.roads;
 if (!out.pavement.length) out.pavement = pack.pavement;
 if (!out.parks.length) out.parks = pack.parks;
 return out;
}

for (const id of NORTH_LAYER_IDS) {
 const pack = packs[id];
 const mobility = JSON.parse(fs.readFileSync(path.join(EXT, id, 'mobility.json'), 'utf8'));
 const stripped = stripBoredTunnels({roads: pack.roads, pavement: pack.pavement, buildings: pack.buildings, parks: pack.parks, water: pack.water, trees: pack.trees}, mobility);
 pack.roads = stripped.city.roads;
 const previous = JSON.parse(gunzipSync(fs.readFileSync(path.join(EXT, id, 'city.pack'))));
 const cityOut = {
  buildings: pack.buildings, roads: pack.roads, pavement: pack.pavement, parks: pack.parks, water: pack.water, trees: pack.trees,
 };
 fs.writeFileSync(path.join(EXT, id, 'city.pack'), gzipSync(Buffer.from(JSON.stringify(cityOut))));
 fs.writeFileSync(path.join(EXT, id, 'mobility.json'), JSON.stringify(stripped.mobility || mobility));
 const furniture = {source: 'OpenStreetMap contributors', licence: 'ODbL', items: pack.furniture};
 fs.writeFileSync(path.join(EXT, id, 'furniture.json'), JSON.stringify(furniture));
 const chunks = surfaceChunks(renderedSurfaces(pack));
 const dir = path.join(EXT, id, 'surfaces');
 fs.mkdirSync(dir, {recursive: true});
 const surfaceIndex = [];
 for (const [key, values] of chunks) {
  const file = `surfaces/${key}.bin`;
  fs.writeFileSync(path.join(EXT, id, `${file}.pack`), gzipSync(Buffer.from(new Float32Array(values).buffer)));
  surfaceIndex.push(surfaceRecord(`extensions/${id}/${file}`, values));
 }
 fs.writeFileSync(path.join(EXT, id, 'surface-index.json'), JSON.stringify(surfaceIndex));
 const entry = entries[id];
 const boxes = [entry.mapBounds, ...pack.buildings, ...pack.roads, ...pack.pavement, ...pack.parks, ...pack.trees.map(t => t.p && [t.p[0], t.p[1], t.p[0], t.p[1]])].filter(Boolean);
 const b = boxes.reduce((acc, box) => {
  const q = box.bbox || box;
  return [Math.min(acc[0], q[0]), Math.min(acc[1], q[1]), Math.max(acc[2], q[2]), Math.max(acc[3], q[3])];
 }, [Infinity, Infinity, -Infinity, -Infinity]);
 entry.mapBounds = b.map(v => Math.round(v));
 if (id === 'troja') {
  let edge = [];
  try { edge = polygonClipping.difference(edgeBox, disk); } catch { edge = []; }
  const fresh = edge.filter(poly => poly?.[0]?.length > 3 && !(entry.playable || []).some(have => pointInPolygon(centroid(poly[0])[0], centroid(poly[0])[1], have)));
  if (fresh.length) entry.playable = [...(entry.playable || []), ...fresh];
  entry.mapBounds = [Math.min(entry.mapBounds[0], EDGE.x0), Math.min(entry.mapBounds[1], EDGE.z0), Math.max(entry.mapBounds[2], EDGE.x1), Math.max(entry.mapBounds[3], Math.min(EDGE.z1, CROP_Z))].map(v => Math.round(v));
 }
 if (id === 'bohnice' && !entry.neighbourhood) {
  entry.playable = bohniceKeep;
  entry.neighbourhood = STREET;
 }
 entry.furniture = 'furniture.json';
 entry.provenance = {...CORRIDOR_PROVENANCE, note: NORTH_LAYER_NOTE};
 entry.counts = {buildings: pack.buildings.length, roads: pack.roads.length, pavement: pack.pavement.length, parks: pack.parks.length, trees: pack.trees.length, furniture: pack.furniture.length, surfaces: surfaceIndex.length, previousRoads: (previous.roads || []).length};
 console.log(id, entry.counts, 'tunnels removed', stripped.removed);
}
fs.writeFileSync(path.join(EXT, 'index.json'), JSON.stringify(index));
console.log('wrote north layers');
