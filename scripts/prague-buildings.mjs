// npm run prague:buildings
// Replaces Prague's extruded OSM shells with IPR Praha's photogrammetric building
// model (the same LOD2 roofs published as CityGML). The public copy is an I3S
// scene layer in Web Mercator. Streets, traffic and collision stay on the OSM
// build; only public/cities/prague/buildings3d* changes.
// Raw node documents and meshes are cached in data/raw/cities/prague/ipr/.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {gzipSync, gunzipSync} from 'node:zlib';
import proj4 from 'proj4';
import {decodeTerrain, setTerrain, groundAt, terrain} from '../src/terrain.js';

const R = 6378137;
const LAYER = 'https://services5.arcgis.com/SBTXIEUGWbqzUecw/arcgis/rest/services/Budovy_3D_WSL1/SceneServer/layers/0';
const TILE = 200;
const CREDIT = 'Building shells: datový podklad © IPR Praha, CC BY 4.0 (photogrammetric LOD2 model, I3S scene layer).';

export function lonLatFromMercator(x, y) {
  const lon = (x / R) * 180 / Math.PI;
  const lat = Math.atan(Math.sinh(y / R)) * 180 / Math.PI;
  return [lon, lat];
}

// I3S local-scene positions are metres relative to the node centre, Z up,
// already in the layer CRS (EPSG:3857). The OBB quaternion orients the
// bounding box; it is not a vertex transform.
export function decodeI3sGeometry(buffer) {
  const bytes = new Uint8Array(buffer.byteLength);
  bytes.set(buffer);
  const view = new DataView(bytes.buffer);
  const vertexCount = view.getUint32(0, true);
  const featureCount = view.getUint32(4, true);
  const positionsAt = 8;
  const featuresAt = positionsAt + vertexCount * 36;
  const rangesAt = featuresAt + featureCount * 8;
  const expected = positionsAt + vertexCount * 36 + featureCount * 16;
  if (buffer.byteLength !== expected) throw new Error(`I3S geometry is ${buffer.byteLength} bytes, expected ${expected} uncompressed floats`);
  const positions = new Float32Array(bytes.buffer, positionsAt, vertexCount * 3);
  const features = [];
  for (let i = 0; i < featureCount; i++) {
    const id = view.getBigUint64(featuresAt + i * 8, true).toString();
    const first = view.getUint32(rangesAt + i * 8, true);
    const last = view.getUint32(rangesAt + i * 8 + 4, true);
    if (last < first) continue;
    const start = first * 3;
    const count = (last - first + 1) * 3;
    if (start + count > vertexCount) continue;
    features.push({id, start, count});
  }
  return {positions, features};
}

export function buildingsFromNode({geometry, center, project, extent, elevationAt}) {
  const {positions, features} = geometry;
  const out = [];
  for (const feature of features) {
    const local = [];
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity, minAbove = Infinity;
    for (let i = 0; i < feature.count; i++) {
      const o = (feature.start + i) * 3;
      const mx = center[0] + positions[o], my = center[1] + positions[o + 1], mz = center[2] + positions[o + 2];
      const [x, z] = project(mx, my);
      const above = mz - elevationAt(x, z);
      if (above < minAbove) minAbove = above;
      if (x < minX) minX = x;
      if (z < minZ) minZ = z;
      if (x > maxX) maxX = x;
      if (z > maxZ) maxZ = z;
      local.push(x, above, z);
    }
    if (!local.length || maxX < -extent || minX > extent || maxZ < -extent || minZ > extent) continue;
    const verts = [];
    let height = 0;
    for (let i = 0; i < local.length; i += 3) {
      const y = local[i + 1] - minAbove;
      if (y > height) height = y;
      verts.push(local[i], y, local[i + 2], local[i] / 8, local[i + 2] / 8);
    }
    if (height < 0.3) continue;
    out.push({
      id: `ipr-${feature.id}`,
      bbox: [round(minX), round(minZ), round(maxX), round(maxZ)],
      height: round(height),
      verts
    });
  }
  return out;
}

const round = n => Math.round(n * 100) / 100;

function mercatorBox(projectInverse, extent) {
  const corners = [[-extent, -extent], [extent, -extent], [extent, extent], [-extent, extent]];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, z] of corners) {
    const [mx, my] = projectInverse(x, z);
    if (mx < minX) minX = mx;
    if (my < minY) minY = my;
    if (mx > maxX) maxX = mx;
    if (my > maxY) maxY = my;
  }
  return [minX, minY, maxX, maxY];
}

function hitsBox(mbs, box) {
  if (!mbs) return true;
  const [cx, cy, , rad] = mbs;
  const dx = Math.max(box[0] - cx, 0, cx - box[2]);
  const dy = Math.max(box[1] - cy, 0, cy - box[3]);
  return dx * dx + dy * dy <= rad * rad;
}

async function cached(file, load) {
  if (fs.existsSync(file)) return fs.readFileSync(file);
  const bytes = Buffer.from(await load());
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, bytes);
  return bytes;
}

async function getJson(url, file) {
  const bytes = await cached(file, async () => {
    const response = await fetch(url, {headers: {'user-agent': 'worldhood/0.1 (prague buildings)'}});
    if (!response.ok) throw new Error(`${response.status} ${url}`);
    return new Uint8Array(await response.arrayBuffer());
  });
  return JSON.parse(bytes.toString('utf8'));
}

async function pool(items, limit, fn) {
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const item = items[next++];
      await fn(item);
    }
  }
  await Promise.all(Array.from({length: Math.min(limit, items.length)}, () => worker()));
}

async function leavesIn(box, rawDir) {
  const leaves = [];
  const queue = ['root'];
  const seen = new Set();
  while (queue.length) {
    const batch = [];
    while (batch.length < 8 && queue.length) {
      const id = queue.shift();
      if (seen.has(id)) continue;
      seen.add(id);
      batch.push(id);
    }
    await Promise.all(batch.map(async id => {
      const node = await getJson(`${LAYER}/nodes/${id}`, path.join(rawDir, 'nodes', `${id}.json`));
      const children = node.children || [];
      if (!children.length && node.geometryData?.length) {
        if (hitsBox(node.mbs, box)) leaves.push(node);
        return;
      }
      for (const child of children) if (hitsBox(child.mbs, box)) queue.push(String(child.id));
    }));
  }
  return leaves;
}

function loadElevation(cityDir) {
  const file = path.join(cityDir, 'terrain.pack');
  if (!fs.existsSync(file)) return () => 0;
  const decoded = decodeTerrain(gunzipSync(fs.readFileSync(file)));
  setTerrain(decoded);
  const base = terrain().base || 0;
  return (x, z) => base + groundAt(x, z);
}

export async function importPragueBuildings({id = 'prague'} = {}) {
  const def = JSON.parse(fs.readFileSync(path.join('cities', id, 'city.json'), 'utf8'));
  const cityDir = path.join('public/cities', id);
  if (!fs.existsSync(path.join(cityDir, 'buildings3d-index.json'))) throw new Error(`Build ${id} first: npm run city:build -- ${id}`);
  const extent = Math.round(def.radiusMetres * 1.25);
  const [lon0, lat0] = def.origin;
  const projection = `+proj=tmerc +lat_0=${lat0} +lon_0=${lon0} +k=1 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs`;
  const toLocal = proj4('EPSG:4326', projection);
  const toWgs = proj4(projection, 'EPSG:4326');
  const project = (mx, my) => {
    const [lon, lat] = lonLatFromMercator(mx, my);
    const [east, north] = toLocal.forward([lon, lat]);
    return [east, -north];
  };
  const projectInverse = (x, z) => {
    const [lon, lat] = toWgs.forward([x, -z]);
    const [mx, my] = [lon * Math.PI / 180 * R, Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) * R];
    return [mx, my];
  };
  const rawDir = path.join('data/raw/cities', id, 'ipr');
  const box = mercatorBox(projectInverse, extent);
  console.log(`Fetching IPR building leaves inside ${extent} m…`);
  const leaves = await leavesIn(box, rawDir);
  console.log(`  ${leaves.length} mesh nodes`);
  const elevationAt = loadElevation(cityDir);
  const tiles = new Map();
  let kept = 0, failed = 0;
  await pool(leaves, 6, async node => {
    const file = path.join(rawDir, 'geometries', `${node.id}.bin`);
    let buffer;
    try {
      buffer = await cached(file, async () => {
        const url = `${LAYER}/nodes/${node.id}/geometries/0`;
        const response = await fetch(url, {headers: {'user-agent': 'worldhood/0.1 (prague buildings)'}});
        if (!response.ok) throw new Error(`${response.status} ${url}`);
        return new Uint8Array(await response.arrayBuffer());
      });
      const geometry = decodeI3sGeometry(buffer);
      const buildings = buildingsFromNode({geometry, center: node.obb.center, project, extent, elevationAt});
      for (const building of buildings) {
        const key = `${Math.floor(((building.bbox[0] + building.bbox[2]) / 2) / TILE)},${Math.floor(((building.bbox[1] + building.bbox[3]) / 2) / TILE)}`;
        if (!tiles.has(key)) tiles.set(key, {chunks: [], floats: 0, parts: []});
        const tile = tiles.get(key);
        const chunk = Float32Array.from(building.verts);
        tile.parts.push({
          id: building.id, bbox: building.bbox, height: building.height, ratu: undefined, texture: null,
          color: [.78, .76, .71], start: tile.floats / 5, count: chunk.length / 5, address: '', name: ''
        });
        tile.chunks.push(chunk);
        tile.floats += chunk.length;
        kept++;
      }
    } catch (error) {
      failed++;
      console.log(`  node ${node.id} skipped: ${error.message}`);
    }
  });
  if (!kept) throw new Error('No IPR buildings were written');
  const meshDir = path.join(cityDir, 'buildings3d');
  fs.rmSync(meshDir, {recursive: true, force: true});
  fs.mkdirSync(meshDir, {recursive: true});
  const index = {
    source: `${CREDIT} OpenStreetMap footprints remain the collision shapes.`,
    tiles: [],
    buildings: kept
  };
  let ti = 0;
  for (const tile of tiles.values()) {
    const rel = `buildings3d/${ti++}.pack`;
    const data = new Float32Array(tile.floats);
    let offset = 0;
    for (const chunk of tile.chunks) {data.set(chunk, offset); offset += chunk.length;}
    fs.writeFileSync(path.join(cityDir, rel), gzipSync(Buffer.from(data.buffer), {level: 9}));
    const bbox = tile.parts.reduce((b, p) => [Math.min(b[0], p.bbox[0]), Math.min(b[1], p.bbox[1]), Math.max(b[2], p.bbox[2]), Math.max(b[3], p.bbox[3])], [Infinity, Infinity, -Infinity, -Infinity]);
    index.tiles.push({file: rel, bbox, parts: tile.parts});
  }
  fs.writeFileSync(path.join(cityDir, 'buildings3d-index.json'), JSON.stringify(index));
  const registryPath = 'public/cities/index.json';
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  const city = registry.cities.find(c => c.id === id);
  if (city) {
    if (!city.attribution.includes('IPR Praha')) city.attribution = `${city.attribution} ${CREDIT}`;
    city.counts.buildings = kept;
    fs.writeFileSync(registryPath, JSON.stringify(registry, null, 1));
  }
  console.log(JSON.stringify({buildings: kept, tiles: index.tiles.length, skippedNodes: failed}));
  return {buildings: kept, tiles: index.tiles.length, skippedNodes: failed};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await importPragueBuildings();
