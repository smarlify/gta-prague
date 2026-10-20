import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {SpatialIndex} from './geo.js';
import {solidBox} from './world-objects.js';
import {paintPlaceholder, facesForDay, pragueDayKey} from '../firebase/functions/ad-credits.js';
import storedSites from './prague-billboard-sites.json' with {type: 'json'};

export const BILLBOARD_COUNT = 16;
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

// Stable roadside sites. The same city data and seed always return the same boards.
export function placePragueBillboards(data, {count = BILLBOARD_COUNT, step = 48, minGap = 320, seed = 0x5e1f0ad, radius} = {}) {
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
      candidates.push({x, z, yaw});
    }
  }
  const rand = mulberry32(seed);
  const shuffled = candidates
    .map((item, index) => ({item, index, n: rand()}))
    .sort((a, b) => a.n - b.n || a.index - b.index)
    .map((row) => row.item);
  const picked = [];
  for (const site of shuffled) {
    if (picked.some((other) => Math.hypot(other.x - site.x, other.z - site.z) < minGap)) continue;
    picked.push(site);
    if (picked.length >= count) break;
  }
  return picked.map((site, index) => ({
    id: `board-${String(index + 1).padStart(2, '0')}`,
    x: Math.round(site.x * 100) / 100,
    z: Math.round(site.z * 100) / 100,
    yaw: Math.round(site.yaw * 10000) / 10000,
  }));
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
