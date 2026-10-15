// Opens four road corridors past Prague's playable circle. Roads and the
// driving graph inside the download already exist; this writes playable
// outlines and, beyond the terrain grid, a narrow height strip.
// Extra geometry is fetched only when a named destination is still short of
// the cached roads, one small query per corridor, and that cache is reused.
import fs from 'node:fs';
import path from 'node:path';
import {gzipSync, gunzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import proj4 from 'proj4';
import polygonClipping from 'polygon-clipping';
import {decodeTerrain} from '../src/terrain.js';
import {readPng} from './city-terrain.mjs';
import {CORRIDOR_SPECS, CORRIDOR_PROVENANCE, CORRIDOR_STARTS, corridorIdFor, circleRing, simplifyRing, multiBBox, heightSamples} from '../src/prague-corridors.js';

const ROOT = 'public/cities/prague';
const RAW = 'data/raw/cities/prague';
const OVERLAP = 180;
const LINK_REACH = 26;
const DESTINATIONS = {
 'zlute-lazne': {name: 'Žluté lázně', lon: 14.4147, lat: 50.0472},
 'barrandov': {name: 'Barrandov', lon: 14.380, lat: 50.030},
 'troja': {name: 'Troja zoo', lon: 14.413, lat: 50.1165},
 'palmovka': {name: 'Palmovka', lon: 14.474, lat: 50.103},
 'bohnice': {name: 'Bohnice', lon: 14.410, lat: 50.134},
 'kobylisy': {name: 'Kobylisy', lon: 14.452, lat: 50.126},
 'severni-spojka': {name: 'Černý Most', lon: 14.577, lat: 50.104},
};

const city = JSON.parse(gunzipSync(fs.readFileSync(path.join(ROOT, 'city.pack'))));
const def = JSON.parse(fs.readFileSync('cities/prague/city.json', 'utf8'));
const radius = city.radius || def.radiusMetres;
const projection = city.projection || `+proj=tmerc +lat_0=${def.origin[1]} +lon_0=${def.origin[0]} +k=1 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs`;
const toLocal = proj4('EPSG:4326', projection);
const localOf = (lon, lat) => { const [e, n] = toLocal.forward([lon, lat]); return [Math.round(e), Math.round(-n)]; };
const terrain = decodeTerrain(gunzipSync(fs.readFileSync(path.join(ROOT, 'terrain.pack'))));
const terrainExtent = terrain.extent;
const base = terrain.base || 0;

const circle = circleRing(radius - OVERLAP, 96);
const groups = new Map(CORRIDOR_SPECS.map(spec => [spec.id, []]));

function outside(multi) {
 try {
  return polygonClipping.difference(multi, [[circle]]).map(poly => poly.map(ring => simplifyRing(ring, 6)).filter(ring => ring.length > 4)).filter(poly => poly.length);
 } catch { return []; }
}

for (const road of city.roads) {
 const id = corridorIdFor(road.name);
 if (!id || !road.rings?.[0]) continue;
 const far = road.rings[0].some(p => Math.hypot(p[0], p[1]) > radius - OVERLAP);
 if (!far) continue;
 groups.get(id).push(road);
}

const cells = new Map();
const cellKey = (x, z) => `${Math.floor(x / 20)},${Math.floor(z / 20)}`;
for (const [id, roads] of groups) for (const road of roads) for (const p of road.rings[0]) {
 if (Math.hypot(p[0], p[1]) < radius - OVERLAP) continue;
 const key = cellKey(p[0], p[1]);
 if (!cells.has(key)) cells.set(key, id);
}
function nearCorridor(x, z) {
 const cx = Math.floor(x / 20), cz = Math.floor(z / 20);
 for (let ix = cx - 1; ix <= cx + 1; ix++) for (let iz = cz - 1; iz <= cz + 1; iz++) {
  const id = cells.get(`${ix},${iz}`);
  if (!id) continue;
  return id;
 }
 return null;
}
let links = 0;
for (const road of city.roads) {
 if (corridorIdFor(road.name) || !/Ajorata/.test(road.kind || '') || !road.rings?.[0]) continue;
 let id = null;
 for (const p of road.rings[0]) {
  if (Math.hypot(p[0], p[1]) < radius - OVERLAP) continue;
  id = nearCorridor(p[0], p[1]);
  if (id) break;
 }
 if (!id) continue;
 groups.get(id).push(road);
 links++;
}
console.log(`corridor roads grouped, plus ${links} connecting links`);

function farthest(id) {
 let best = 0, at = null;
 for (const road of groups.get(id)) for (const p of road.rings[0]) {
  const d = Math.hypot(p[0], p[1]);
  if (d > best) { best = d; at = p; }
 }
 return {best, at};
}

function overpass(name, body) {
 fs.mkdirSync(RAW, {recursive: true});
 const file = path.join(RAW, `${name}.json`);
 if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
 const endpoints = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
 const query = `[out:json][timeout:20];${body}`;
 for (let attempt = 0; attempt < 1; attempt++) {
  try {
   const text = execFileSync('curl', ['-sS', '-f', '--max-time', '25', '-A', 'worldhood/0.1 (prague corridor)', '--data-urlencode', `data=${query}`, endpoints[attempt % endpoints.length]], {encoding: 'utf8', maxBuffer: 1 << 28});
   const json = JSON.parse(text);
   fs.writeFileSync(file, text);
   console.log(`  ${name}: ${json.elements.length} elements`);
   return json;
  } catch (error) {
   console.log(`  ${name}: retry ${attempt + 1} (${String(error.message).slice(0, 80)})`);
   execFileSync('sleep', ['8']);
  }
 }
 console.log(`  ${name}: skipped`);
 return {elements: []};
}

function bufferLine(line, width) {
 const w = width / 2, pieces = [];
 for (let i = 1; i < line.length; i++) {
  const a = line[i - 1], b = line[i], dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
  if (len < .5) continue;
  const nx = -dz / len * w, nz = dx / len * w;
  pieces.push([[[a[0] + nx, a[1] + nz], [b[0] + nx, b[1] + nz], [b[0] - nx, b[1] - nz], [a[0] - nx, a[1] - nz], [a[0] + nx, a[1] + nz]]]);
 }
 if (!pieces.length) return [];
 try { return polygonClipping.union(...pieces); } catch { return []; }
}

const extraRoads = [];
const extraEdges = [];
for (const spec of CORRIDOR_SPECS) {
 const dest = DESTINATIONS[spec.id];
 if (!dest) continue;
 const target = localOf(dest.lon, dest.lat);
 const reach = farthest(spec.id);
 const gap = Math.hypot(target[0] - (reach.at?.[0] || 0), target[1] - (reach.at?.[1] || 0));
 console.log(`  ${spec.id}: roads reach ${Math.round(reach.best)} m, ${dest.name} is ${Math.round(Math.hypot(target[0], target[1]))} m from origin, gap ${Math.round(gap)} m`);
 if (gap < 700) continue;
 const pad = 0.02;
 const south = Math.min(def.origin[1], dest.lat) - pad, north = Math.max(def.origin[1], dest.lat) + pad;
 const west = Math.min(def.origin[0], dest.lon) - pad, east = Math.max(def.origin[0], dest.lon) + pad;
 const pattern = {
  'severni-spojka': 'Kbelská|Cínovecká|Chlumecká|Novopacká',
  'zlute-lazne': 'Modřanská|Podolské nábřeží|U přehrady',
  barrandov: 'Barrandovský most|K Barrandovu|Strakonická',
  troja: 'Trojská|Povltavská|U trojského zámku',
  palmovka: 'Zenklova|Libeňský most',
  bohnice: 'Čimická|Lodžská|Bohnická|K Bohnicím|Ústecká|Pazder',
  kobylisy: 'Kobyliská|Střelničná|Klapkova',
 }[spec.id] || spec.title;
 const extra = overpass(`corridor-${spec.id}`, `(way["highway"]["name"~"${pattern}",i](${south},${west},${north},${east}););out geom;`);
 for (const way of extra.elements || []) {
  if (way.type !== 'way' || !way.geometry || way.geometry.length < 2) continue;
  const line = way.geometry.map(g => localOf(g.lon, g.lat));
  if (!line.some(p => Math.hypot(p[0], p[1]) > radius - OVERLAP)) continue;
  const width = /motorway|trunk/.test(way.tags?.highway || '') ? 16 : 12;
  for (const poly of bufferLine(line, width)) {
   const piece = outside(poly);
   if (piece.length) groups.get(spec.id).push({name: way.tags?.name || spec.title, kind: 'Ajorata', rings: poly[0], extra: true, piece});
  }
  let length = 0;
  for (let i = 1; i < line.length; i++) length += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]);
  if (length < 30) continue;
  extraEdges.push({name: way.tags?.name || '', points: line.map(p => [p[0], p[1]]), length: +length.toFixed(2), lane: /oneway|motorway/.test(`${way.tags?.oneway} ${way.tags?.highway}`) ? 0.35 : 1.6, crossing: false, signal: -1});
  extraRoads.push({id: `osm-way-${way.id}`, name: way.tags?.name || '', kind: 'Ajorata', material: 'Asfaltti', rings: bufferLine(line, width)[0] || [line], bbox: line.reduce((b, p) => [Math.min(b[0], p[0]), Math.min(b[1], p[1]), Math.max(b[2], p[0]), Math.max(b[3], p[1])], [Infinity, Infinity, -Infinity, -Infinity])});
 }
}

const tiles = new Map();
function rememberTile(file) { tiles.set(file, null); }
function elevationAt(x, z) {
 const [lon, lat] = proj4(projection, 'EPSG:4326').forward([x, -z]);
 const zoom = 14, n = 2 ** zoom, tile = 512;
 const px = (lon + 180) / 360 * n * tile;
 const py = (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n * tile;
 const tx = Math.floor(px / tile), ty = Math.floor(py / tile);
 const file = path.join(RAW, 'terrain', `${zoom}-${tx}-${ty}.webp`);
 if (!fs.existsSync(file)) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  execFileSync('curl', ['-fsS', '--max-time', '40', '-A', 'worldhood/0.1 (prague corridor)', '-o', file, `https://tiles.mapterhorn.com/${zoom}/${tx}/${ty}.webp`]);
 }
 const png = file.replace(/\.webp$/, '.png');
 if (!fs.existsSync(png)) execFileSync('sips', ['-s', 'format', 'png', file, '--out', png], {stdio: 'ignore'});
 let decoded = tiles.get(file);
 if (!decoded) { decoded = readPng(fs.readFileSync(png)); tiles.set(file, decoded); }
 const i = (Math.floor(py) - ty * tile) * tile + (Math.floor(px) - tx * tile);
 const rgb = decoded.rgb;
 return rgb[i * 3] * 256 + rgb[i * 3 + 1] + rgb[i * 3 + 2] / 256 - 32768;
}

const catalog = [];
const extensionRoot = path.join(ROOT, 'extensions');
fs.mkdirSync(extensionRoot, {recursive: true});
for (const spec of CORRIDOR_SPECS) {
 const roads = groups.get(spec.id);
 const piecesFor = list => {
  const pieces = [];
  for (const road of list) {
   const multi = road.extra ? (road.piece || []) : (road.rings ? outside([road.rings]) : []);
   pieces.push(...multi.filter(poly => poly?.[0]?.length > 3));
  }
  return pieces;
 };
 const unite = pieces => {
  if (!pieces.length) return [];
  try { return polygonClipping.union(...pieces); } catch { return pieces; }
 };
 let playable = unite(piecesFor(roads));
 if (!playable.length) playable = unite(piecesFor(roads.filter(road => !road.extra)));
 playable = playable.map(poly => poly.map(ring => simplifyRing(ring, 8)).filter(ring => ring.length > 3)).filter(poly => poly[0]?.length > 3);
 // Bohnice sits past Trojská. A union of the buffers drops segments and leaves
 // gaps, so the driveable strip is the overlapping quads themselves.
 if (spec.id === 'bohnice') {
  const quads = [];
  const addLine = line => {
   if (!line || line.length < 2) return;
   const w = 14;
   for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i], dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
    if (len < 0.5) continue;
    if (Math.hypot(a[0], a[1]) < 3000 && Math.hypot(b[0], b[1]) < 3000) continue;
    const ux = dx / len, uz = dz / len, ext = 12;
    const a2 = [a[0] - ux * ext, a[1] - uz * ext], b2 = [b[0] + ux * ext, b[1] + uz * ext];
    const nx = -uz * w, nz = ux * w;
    const ring = [[a2[0] + nx, a2[1] + nz], [b2[0] + nx, b2[1] + nz], [b2[0] - nx, b2[1] - nz], [a2[0] - nx, a2[1] - nz], [a2[0] + nx, a2[1] + nz]];
    quads.push([ring.map(p => [Math.round(p[0]), Math.round(p[1])])]);
   }
  };
  for (const road of roads) if (!road.extra) addLine(road.rings?.[0]);
  for (const road of city.roads) {
   if (!/trojsk|havránk|havrank/i.test(road.name || '') || !road.rings?.[0]) continue;
   if (!road.rings[0].some(p => p[1] < -2800 && Math.hypot(p[0], p[1]) > 3000)) continue;
   addLine(road.rings[0]);
  }
  for (const edge of extraEdges) if (corridorIdFor(edge.name) === spec.id) addLine(edge.points);
  if (quads.length) playable = quads;
 }
 if (!playable.length) { console.log(`  ${spec.id}: no ground outside the circle`); continue; }
 const bounds = multiBBox(playable);
 const samples = heightSamples(playable, {minRadius: terrainExtent - 40, step: 40});
 const heights = [];
 let failed = 0;
 for (const sample of samples) {
  try { heights.push({...sample, h: +((elevationAt(sample.x, sample.z) - base).toFixed(2))}); }
  catch { failed++; }
 }
 if (spec.id === 'bohnice') {
  const seen = new Set(heights.map(s => `${Math.round(s.x / 40)},${Math.round(s.z / 40)}`));
  const extraPts = [];
  for (const edge of extraEdges) if (corridorIdFor(edge.name) === spec.id) extraPts.push(...edge.points);
  for (const road of city.roads) {
   if (!/trojsk|bohnic/i.test(road.name || '') || !road.rings?.[0]) continue;
   extraPts.push(...road.rings[0]);
  }
  for (const p of extraPts) {
   if (Math.hypot(p[0], p[1]) < terrainExtent - 40) continue;
   const key = `${Math.round(p[0] / 40)},${Math.round(p[1] / 40)}`;
   if (seen.has(key)) continue;
   seen.add(key);
   try { heights.push({x: Math.round(p[0]), z: Math.round(p[1]), h: +((elevationAt(p[0], p[1]) - base).toFixed(2))}); }
   catch { failed++; }
  }
 }
 console.log(`  ${spec.id}: ${roads.length} roads, ${playable.length} polygons, ${heights.length} heights${failed ? `, ${failed} height samples skipped` : ''}`);
 const dir = path.join(extensionRoot, spec.id);
 fs.mkdirSync(dir, {recursive: true});
 const cityOut = {buildings: [], roads: extraRoads.filter(r => corridorIdFor(r.name) === spec.id), pavement: [], parks: [], water: [], trees: []};
 const nodes = [], edges = [];
 for (const edge of extraEdges) {
  if (corridorIdFor(edge.points && '') === spec.id) continue;
 }
 // Extra carriageways belong to the corridor whose name matches.
 const mine = extraEdges.filter(edge => corridorIdFor(edge.name) === spec.id);
 for (const edge of mine) {
  const a = nodes.length; nodes.push(edge.points[0]);
  const b = nodes.length; nodes.push(edge.points.at(-1));
  edges.push({from: a, to: b, ...edge});
  edges.push({from: b, to: a, ...edge, points: [...edge.points].reverse()});
 }
 fs.writeFileSync(path.join(dir, 'city.pack'), gzipSync(Buffer.from(JSON.stringify(cityOut))));
 fs.writeFileSync(path.join(dir, 'buildings3d-index.json'), JSON.stringify({source: 'Corridor buildings stay on the main city build.', tiles: [], buildings: 0}));
 fs.writeFileSync(path.join(dir, 'surface-index.json'), '[]');
 fs.writeFileSync(path.join(dir, 'mobility.json'), JSON.stringify({signals: [], roads: {nodes, edges}, walks: {nodes: [], edges: []}}));
 const starts = CORRIDOR_STARTS.filter(start => start.extension === spec.id);
 catalog.push({id: spec.id, dir: `extensions/${spec.id}`, title: spec.title, mapBounds: bounds.map(v => Math.round(v)), playable, heights, provenance: CORRIDOR_PROVENANCE, ...(starts.length ? {starts} : {})});
}
fs.writeFileSync(path.join(extensionRoot, 'index.json'), JSON.stringify({schemaVersion: 1, extensions: catalog}));
const big = [];
const walk = dir => { for (const name of fs.readdirSync(dir)) { const p = path.join(dir, name), st = fs.statSync(p); if (st.isDirectory()) walk(p); else if (st.size >= 100 * 1024 * 1024) big.push(p); } };
walk(extensionRoot);
if (big.length) throw new Error(`Corridor file over 100 MB: ${big.join(', ')}`);
console.log(`wrote ${catalog.length} corridors`);
