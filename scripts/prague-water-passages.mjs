// Adds the Vltava channel and drivable tunnel decks to the existing Prague pack.
// Reads cached OpenStreetMap only. Does not delete public/cities/prague.
import fs from 'node:fs';
import path from 'node:path';
import {gzipSync, gunzipSync} from 'node:zlib';
import proj4 from 'proj4';
import polygonClipping from 'polygon-clipping';
import {bounds, pointInPolygon} from '../src/geo.js';
import {keptPassage} from '../src/passage.js';
import {decodeTerrain, setTerrain, groundAt} from '../src/terrain.js';

const ROOT = 'public/cities/prague';
const RAW = 'data/raw/cities/prague';
const def = JSON.parse(fs.readFileSync('cities/prague/city.json', 'utf8'));
const [lon0, lat0] = def.origin;
const projection = `+proj=tmerc +lat_0=${lat0} +lon_0=${lon0} +k=1 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs`;
const toLocal = proj4('EPSG:4326', projection);
const local = (lon, lat) => { const [e, n] = toLocal.forward([lon, lat]); return [Math.round(e), Math.round(-n)]; };
const terrain = decodeTerrain(gunzipSync(fs.readFileSync(path.join(ROOT, 'terrain.pack'))));
setTerrain(terrain);
const LIMIT = terrain.extent;
const inside = p => Math.abs(p[0]) < LIMIT && Math.abs(p[1]) < LIMIT;
const square = [[[-LIMIT, -LIMIT], [LIMIT, -LIMIT], [LIMIT, LIMIT], [-LIMIT, LIMIT], [-LIMIT, -LIMIT]]];
const city = JSON.parse(gunzipSync(fs.readFileSync(path.join(ROOT, 'city.pack'))));
const mobility = JSON.parse(fs.readFileSync(path.join(ROOT, 'mobility.json'), 'utf8'));
const areas = JSON.parse(fs.readFileSync(path.join(RAW, 'areas.json'), 'utf8'));

const lines = [];
for (const element of areas.elements) {
 const tags = element.tags || {};
 if (element.type !== 'way' || tags.waterway !== 'river' || !/vltava/i.test(tags.name || '') || !element.geometry || element.geometry.length < 2) continue;
 const line = element.geometry.map(g => local(g.lon, g.lat)).filter(inside);
 if (line.length > 1) lines.push(line);
}
function buffer(line, half) {
 const pieces = [];
 for (let i = 1; i < line.length; i++) {
  const a = line[i - 1], b = line[i], dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
  if (len < 1) continue;
  const nx = -dz / len * half, nz = dx / len * half;
  pieces.push([[a[0] + nx, a[1] + nz], [b[0] + nx, b[1] + nz], [b[0] - nx, b[1] - nz], [a[0] - nx, a[1] - nz], [a[0] + nx, a[1] + nz]]);
 }
 if (!pieces.length) return [];
 try { return polygonClipping.intersection(polygonClipping.union(...pieces.map(ring => [ring])), [square]); }
 catch { return []; }
}
const addedWater = [];
for (const line of lines) for (const rings of buffer(line, 95)) {
 if (!rings?.[0] || rings[0].length < 4) continue;
 const body = {id: 'vltava', name: 'Vltava', kind: 'river', rings, bbox: bounds(rings)};
 if (pointInPolygon(0, 0, rings)) continue;
 addedWater.push(body);
}
console.log(`river polygons ${addedWater.length} from ${lines.length} centrelines`);

const highways = JSON.parse(fs.readFileSync(path.join(RAW, 'highways.json'), 'utf8'));
const nodes = new Map();
for (const element of highways.elements) if (element.type === 'node') nodes.set(element.id, local(element.lon, element.lat));
const CAR = /^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link)$/;
const WALK = /^(pedestrian|footway|path|steps|corridor|cycleway)$/;
const passages = [];
for (const way of highways.elements) {
 if (way.type !== 'way') continue;
 const tags = way.tags || {};
 const passage = keptPassage(tags);
 if (!passage) continue;
 const line = (way.nodes || []).map(id => nodes.get(id)).filter(Boolean);
 if (line.length < 2 || !line.some(inside)) continue;
 const baths = passage === 'building_passage' && line.some(p => Math.hypot(p[0] + 500, p[1] - 620) < 140);
 const drivable = CAR.test(tags.highway || '') || tags.railway === 'tram' || tags.railway === 'light_rail' || (passage === 'building_passage' && !WALK.test(tags.highway || '')) || baths;
 if (!drivable) continue;
 let length = 0; const cum = [0];
 for (let i = 1; i < line.length; i++) { length += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]); cum.push(length); }
 if (length < 8) continue;
 const h0 = groundAt(line[0][0], line[0][1]), h1 = groundAt(line.at(-1)[0], line.at(-1)[1]);
 const deck = line.map((p, i) => [p[0], p[1], +((h0 + (h1 - h0) * (cum[i] / length)).toFixed(2))]);
 const half = Math.max(4, (parseFloat(tags.width) || 8) / 2);
 const rings = [];
 for (let i = 1; i < line.length; i++) {
  const a = line[i - 1], b = line[i], dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
  if (len < .4) continue;
  const nx = -dz / len * half, nz = dx / len * half;
  rings.push([[a[0] + nx, a[1] + nz], [b[0] + nx, b[1] + nz], [b[0] - nx, b[1] - nz], [a[0] - nx, a[1] - nz], [a[0] + nx, a[1] + nz]]);
 }
 if (!rings.length) continue;
 passages.push({id: `osm-way-${way.id}`, name: tags.name || '', passage, half, deck, rings, line, length});
}
console.log(`passage ways ${passages.length}`);

const water = city.water.slice();
const cuts = passages.flatMap(p => p.rings);
for (const body of addedWater) {
 if (!cuts.length) { water.push(body); continue; }
 let parts;
 try { parts = polygonClipping.difference([body.rings], ...cuts.map(ring => [ring])); }
 catch { water.push(body); continue; }
 const pieces = parts.filter(rings => rings?.[0]?.length > 3).map(rings => ({...body, rings, bbox: bounds(rings)}));
 water.push(...(pieces.length ? pieces : [body]));
}
for (const passage of passages) passage.rings.forEach((ring, index) => {
 const rings = [ring];
 city.roads.push({id: `${passage.id}:${index}`, name: passage.name, passage: passage.passage, half: passage.half, deck: passage.deck, kind: 'Ajorata (Tunel)', material: 'Asfaltti', rings, bbox: bounds(rings)});
});

const cells = new Map();
const keyOf = p => `${Math.floor(p[0])},${Math.floor(p[1])}`;
mobility.roads.nodes.forEach((p, i) => { const k = keyOf(p); if (!cells.has(k)) cells.set(k, []); cells.get(k).push(i); });
function snap(p) {
 const x = Math.floor(p[0]), z = Math.floor(p[1]);
 for (let i = x - 2; i <= x + 2; i++) for (let j = z - 2; j <= z + 2; j++) for (const n of cells.get(`${i},${j}`) || []) {
  if (Math.hypot(mobility.roads.nodes[n][0] - p[0], mobility.roads.nodes[n][1] - p[1]) < 1.5) return n;
 }
 const n = mobility.roads.nodes.length;
 mobility.roads.nodes.push([p[0], p[1]]);
 const k = keyOf(p); if (!cells.has(k)) cells.set(k, []); cells.get(k).push(n);
 return n;
}
for (const passage of passages) {
 const from = snap(passage.line[0]), to = snap(passage.line.at(-1));
 if (from === to) continue;
 const edge = {from, to, points: passage.line.map(p => [p[0], p[1]]), length: +passage.length.toFixed(2), lane: 0.35, crossing: false, signal: -1};
 mobility.roads.edges.push(edge);
 mobility.roads.edges.push({...edge, from: to, to: from, points: [...edge.points].reverse()});
}

city.water = water;
const pack = path.join(ROOT, 'city.pack');
const nextPack = `${pack}.next`;
fs.writeFileSync(nextPack, gzipSync(Buffer.from(JSON.stringify(city))));
const nextMobility = path.join(ROOT, 'mobility.json.next');
fs.writeFileSync(nextMobility, JSON.stringify(mobility));
for (const file of [nextPack, nextMobility]) {
 const size = fs.statSync(file).size;
 if (size >= 100 * 1024 * 1024) throw new Error(`${file} is ${(size / 1024 / 1024).toFixed(1)} MB`);
}
fs.renameSync(nextPack, pack);
fs.renameSync(nextMobility, path.join(ROOT, 'mobility.json'));
console.log(JSON.stringify({water: city.water.length, passages: passages.length, roads: city.roads.length}));
