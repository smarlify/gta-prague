import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {SpatialIndex} from './geo.js';
import {solidBox} from './world-objects.js';
import {PRAGUE_AREAS} from './area-caption.js';
import {boardId, paintPlaceholder, facesForDay, pragueDayKey} from '../firebase/functions/ad-credits.js';
import storedSites from './prague-billboard-sites.json' with {type: 'json'};

export const BOARDS_PER_DISTRICT = 10;
export const BILLBOARD_COUNT = BOARDS_PER_DISTRICT;
export const BILLBOARD_BUY_REACH = 18;
export const BILLBOARD_BUY_RELEASE = 26;
// Longer than one HUD sample (~140 ms). A single far reading must not drop the control.
export const BILLBOARD_BUY_RELEASE_HOLD = 0.5;
export const BUY_BILLBOARD_LABEL = 'Buy this billboard';
const BOARD_WIDTH = 7.2;
const BOARD_HEIGHT = 3.6;
const BOARD_BOTTOM = 2.5;

function driveable(road) {
  const kind = road?.kind || '';
  return kind.startsWith('Ajorata') && !kind.includes('Tunel');
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let next = Math.imul(state ^ (state >>> 15), 1 | state);
    next = (next + Math.imul(next ^ (next >>> 7), 61 | next)) ^ next;
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function nearestArea(x, z, areas) {
  let best = areas[0];
  let distance = Infinity;
  for (const area of areas) {
    const gap = Math.hypot(area.x - x, area.z - z);
    if (gap < distance) {
      distance = gap;
      best = area;
    }
  }
  return best;
}

function districtSlug(name) {
  return String(name).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// Standalone ads page. The in-game button opens a modal and does not assign this URL.
export function billboardPurchaseUrl(siteId) {
  return `/ads.html?board=${encodeURIComponent(siteId)}`;
}

// Player position is the same x/z on foot and in a car. Equal distances keep the earlier site id.
export function nearestBillboard(player, sites, reach = BILLBOARD_BUY_REACH) {
  if (!player || !Number.isFinite(player.x) || !Number.isFinite(player.z)) return null;
  let best = null;
  let bestDistance = reach;
  for (const site of sites || []) {
    if (!site || !Number.isFinite(site.x) || !Number.isFinite(site.z)) continue;
    const gap = Math.hypot(site.x - player.x, site.z - player.z);
    if (gap > reach) continue;
    const closer = gap < bestDistance - 1e-9;
    const tied = Math.abs(gap - bestDistance) <= 1e-9 && best && String(site.id) < String(best.id);
    if (!best || closer || tied) {
      best = site;
      bestDistance = gap;
    }
  }
  return best;
}

function finitePoint(point) {
  return !!point && Number.isFinite(point.x) && Number.isFinite(point.z);
}

function siteGap(player, site) {
  return Math.hypot(site.x - player.x, site.z - player.z);
}

// The action turns on inside the show reach and stays on through the band where a car,
// a step, or one bad sample crosses 18 m. It turns off only after the player remains
// past the release reach for longer than the hold, and only on a later sample.
// The camera is not part of the check. The same body x/z applies on foot and in a car.
export function billboardBuyOffer(player, sites, previous = null, {dt = 0, near = BILLBOARD_BUY_REACH, far = BILLBOARD_BUY_RELEASE, hold = BILLBOARD_BUY_RELEASE_HOLD} = {}) {
  const step = Math.max(0, Number.isFinite(dt) ? dt : 0);
  const latchedId = previous?.id || '';
  const awayFor = Math.max(0, Number(previous?.awayFor) || 0);
  const list = sites || [];
  const latched = latchedId ? list.find((site) => site?.id === latchedId && finitePoint(site)) : null;
  const playerOk = finitePoint(player);
  const offer = (site, away) => ({show: true, id: site.id, site, awayFor: away});
  const hidden = () => ({show: false, id: '', site: null, awayFor: 0});

  if (latched && playerOk) {
    const gap = siteGap(player, latched);
    if (gap <= far) {
      const nearer = nearestBillboard(player, list, near);
      if (nearer && nearer.id !== latched.id && siteGap(player, nearer) < gap) return offer(nearer, 0);
      return offer(latched, 0);
    }
    const nextAway = awayFor + step;
    if (awayFor === 0 || nextAway <= hold) return offer(latched, nextAway);
  } else if (latchedId && !playerOk) {
    const nextAway = awayFor + step;
    if (awayFor === 0 || nextAway <= hold) return {show: true, id: latchedId, site: latched, awayFor: nextAway};
  }

  if (!playerOk) return hidden();
  const site = nearestBillboard(player, list, near);
  return site ? offer(site, 0) : hidden();
}

const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2();

// Canvas clicks land on the poster, which is named with the site id, or on the shared metal frame.
export function billboardFromPointer(event, camera, group, sites) {
  const rect = event.target?.getBoundingClientRect?.();
  if (!camera || !group || !rect?.width || !rect?.height) return '';
  pointerNdc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointerNdc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointerNdc, camera);
  const hits = raycaster.intersectObject(group, true);
  if (!hits.length) return '';
  const named = boardId(hits[0].object?.name);
  if (named) return named;
  const point = hits[0].point;
  let best = '';
  let bestGap = 8;
  for (const site of sites || []) {
    const id = boardId(site?.id);
    if (!id || !Number.isFinite(site.x) || !Number.isFinite(site.z)) continue;
    const gap = Math.hypot(site.x - point.x, site.z - point.z);
    if (gap < bestGap) {
      bestGap = gap;
      best = id;
    }
  }
  return best;
}

function closestSite(pool, x, z, maxDistance) {
  let best = null;
  let distance = maxDistance;
  for (const site of pool) {
    const gap = Math.hypot(site.x - x, site.z - z);
    if (gap < distance) {
      distance = gap;
      best = site;
    }
  }
  return best;
}

function spreadSites(pool, count, minGap, seed, already = []) {
  const rand = mulberry32(seed);
  const shuffled = pool
    .map((item, index) => ({item, index, n: rand()}))
    .sort((a, b) => a.n - b.n || a.index - b.index)
    .map((row) => row.item);
  const picked = [...already];
  for (const site of shuffled) {
    if (picked.some((other) => Math.hypot(other.x - site.x, other.z - site.z) < minGap)) continue;
    picked.push(site);
    if (picked.length >= count) break;
  }
  return picked;
}

// Ten boards in each named Prague district. One sits near every start. The same city data keeps the same sites.
export function placePragueBillboards(data, {count = BOARDS_PER_DISTRICT, step = 16, minGap = 48, seed = 0x5e1f0ad, radius, areas = PRAGUE_AREAS, nearStarts = 200} = {}) {
  const roads = new SpatialIndex((data.roads || []).filter(driveable));
  const pavement = new SpatialIndex(data.pavement || []);
  const buildings = new SpatialIndex(data.buildings || []);
  const water = new SpatialIndex(data.water || []);
  const limit = radius || data.radius || 2400;
  const edge = Math.min(80, limit * 0.05);
  const clear = (x, z) => pavement.at(x, z) && !buildings.at(x, z) && !water.at(x, z) && !roads.at(x, z);
  const candidates = [];
  for (let x = -limit; x <= limit; x += step) {
    for (let z = -limit; z <= limit; z += step) {
      if (Math.hypot(x, z) > limit - edge) continue;
      if (!clear(x, z)) continue;
      let yaw = null;
      for (let turn = 0; turn < 8; turn++) {
        const face = turn * Math.PI / 4;
        if (roads.at(x + Math.sin(face) * 8, z + Math.cos(face) * 8)) {
          yaw = face;
          break;
        }
      }
      if (yaw === null) continue;
      const along = BOARD_WIDTH * 0.38;
      const posts = [1, -1].map((side) => [x + Math.cos(yaw) * along * side, z - Math.sin(yaw) * along * side]);
      if (posts.some(([px, pz]) => !clear(px, pz))) continue;
      const area = nearestArea(x, z, areas);
      candidates.push({x, z, yaw, district: area.district});
    }
  }
  const byDistrict = new Map(areas.map((area) => [area.district, []]));
  for (const site of candidates) {
    const list = byDistrict.get(site.district);
    if (list) list.push(site);
  }
  for (const start of data.landmarks || []) {
    let best = null;
    let distance = Infinity;
    for (let x = start.x - 220; x <= start.x + 220; x += 8) {
      for (let z = start.z - 220; z <= start.z + 220; z += 8) {
        if (!clear(x, z)) continue;
        let yaw = null;
        for (let turn = 0; turn < 8; turn++) {
          const face = turn * Math.PI / 4;
          if (roads.at(x + Math.sin(face) * 8, z + Math.cos(face) * 8)) {
            yaw = face;
            break;
          }
        }
        if (yaw === null) continue;
        const along = BOARD_WIDTH * 0.38;
        const posts = [1, -1].map((side) => [x + Math.cos(yaw) * along * side, z - Math.sin(yaw) * along * side]);
        if (posts.some(([px, pz]) => !clear(px, pz))) continue;
        const gap = Math.hypot(x - start.x, z - start.z);
        if (gap < distance) {
          distance = gap;
          best = {x, z, yaw};
        }
      }
    }
    if (!best) continue;
    const area = nearestArea(best.x, best.z, areas);
    const list = byDistrict.get(area.district);
    if (list) list.push({...best, district: area.district});
  }
  const reserved = new Map(areas.map((area) => [area.district, []]));
  const taken = new Set();
  for (const start of data.landmarks || []) {
    const area = nearestArea(start.x, start.z, areas);
    const pool = byDistrict.get(area.district) || [];
    const site = closestSite(pool.filter((item) => !taken.has(item)), start.x, start.z, nearStarts);
    if (!site) continue;
    taken.add(site);
    reserved.get(area.district).push(site);
  }
  const picked = [];
  for (const area of areas) {
    const held = reserved.get(area.district) || [];
    const room = Math.max(count, held.length);
    const slug = districtSlug(area.district);
    const sites = spreadSites(byDistrict.get(area.district) || [], room, minGap, seed + slug.length * 97, held);
    sites.forEach((site, index) => {
      picked.push({
        id: `${slug}-${String(index + 1).padStart(2, '0')}`,
        district: area.district,
        x: Math.round(site.x * 100) / 100,
        z: Math.round(site.z * 100) / 100,
        yaw: Math.round(site.yaw * 10000) / 10000,
      });
    });
  }
  return picked;
}

function placeholderTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  paintPlaceholder(canvas.getContext('2d'), canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function boardFrame(site) {
  const frames = [];
  const box = (w, h, d, x, y, z) => {
    const geometry = new THREE.BoxGeometry(w, h, d);
    geometry.rotateY(site.yaw);
    geometry.translate(x, y, z);
    frames.push(geometry);
  };
  const centerY = BOARD_BOTTOM + BOARD_HEIGHT / 2;
  box(BOARD_WIDTH + 0.18, BOARD_HEIGHT + 0.18, 0.16, site.x, centerY, site.z);
  const along = BOARD_WIDTH * 0.38;
  for (const side of [1, -1]) {
    const x = site.x + Math.cos(site.yaw) * along * side;
    const z = site.z - Math.sin(site.yaw) * along * side;
    box(0.22, BOARD_BOTTOM, 0.22, x, BOARD_BOTTOM / 2, z);
  }
  return frames;
}

function supportObstacles(site) {
  const along = BOARD_WIDTH * 0.38;
  return [1, -1].map((side) => {
    const x = site.x + Math.cos(site.yaw) * along * side;
    const z = site.z - Math.sin(site.yaw) * along * side;
    return solidBox({id: `${site.id}-post-${side}`, name: 'Billboard post', x, z, yaw: site.yaw, width: 0.4, depth: 0.4});
  });
}

// Stored sites stay put between visits. Helsinki's Bind boards are a different module.
export function createPragueBillboards(sites = storedSites) {
  const group = new THREE.Group();
  group.name = 'Prague billboards';
  const placeholder = placeholderTexture();
  const frameMat = new THREE.MeshStandardMaterial({color: '#283533', roughness: 0.55, metalness: 0.5});
  const frames = [];
  const obstacles = [];
  const faces = new Map();
  for (const site of sites) {
    frames.push(...boardFrame(site));
    obstacles.push(...supportObstacles(site));
    const materials = [];
    for (const back of [0, Math.PI]) {
      const yaw = site.yaw + back;
      const geometry = new THREE.PlaneGeometry(BOARD_WIDTH, BOARD_HEIGHT);
      geometry.rotateY(yaw);
      // The frame is a thin box on the site. The poster has to sit on the outside, or the metal hides the words.
      geometry.translate(site.x + Math.sin(yaw) * 0.12, BOARD_BOTTOM + BOARD_HEIGHT / 2, site.z + Math.cos(yaw) * 0.12);
      const material = new THREE.MeshBasicMaterial({map: placeholder, toneMapped: false, side: THREE.FrontSide});
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = site.id;
      group.add(mesh);
      materials.push(material);
    }
    faces.set(site.id, materials);
  }
  if (frames.length) {
    const frame = new THREE.Mesh(mergeGeometries(frames), frameMat);
    frame.castShadow = true;
    group.add(frame);
    frames.forEach((geometry) => geometry.dispose());
  }
  group.userData = {placeholder: true, sites};
  group.obstacles = obstacles;

  async function setCreatives(creatives, date = new Date()) {
    const day = pragueDayKey(date);
    const plan = facesForDay(sites, creatives, day);
    await Promise.all(plan.map(async (face) => {
      const materials = faces.get(face.id);
      if (!materials) return;
      let map = placeholder;
      if (face.imageUrl) {
        try {
          map = await new THREE.TextureLoader().loadAsync(face.imageUrl);
          map.colorSpace = THREE.SRGBColorSpace;
          map.anisotropy = 4;
        } catch {
          map = placeholder;
        }
      }
      for (const material of materials) {
        if (material.map && material.map !== placeholder && material.map !== map) material.map.dispose();
        material.map = map;
        material.needsUpdate = true;
      }
    }));
  }

  return {group, obstacles, sites, setCreatives};
}
