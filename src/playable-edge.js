import * as THREE from 'three';

// A closed ring at the playable disk, like a race-area barrier: visible before
// the car hits the invisible boundary stop.
const CONCRETE = '#c8c2b4';
const STRIPE = '#c4522a';

function pushQuad(target, ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz) {
  target.push(ax, ay, az, bx, by, bz, cx, cy, cz, ax, ay, az, cx, cy, cz, dx, dy, dz);
}

function meshFrom(verts, color, name) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0.02 }));
  mesh.name = name;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

export function createPlayableEdge(radius, groundAt = () => 0) {
  const group = new THREE.Group();
  group.name = 'Playable edge';
  const r = Math.max(80, Number(radius) || 0);
  const span = 28;
  const n = Math.max(64, Math.ceil((2 * Math.PI * r) / span));
  const wall = [];
  const stripe = [];
  const thick = 0.55;
  const height = 2.8;
  const at = r - 1.2;
  for (let i = 0; i < n; i++) {
    const t0 = (i / n) * Math.PI * 2;
    const t1 = ((i + 1) / n) * Math.PI * 2;
    const x0 = Math.sin(t0) * at;
    const z0 = Math.cos(t0) * at;
    const x1 = Math.sin(t1) * at;
    const z1 = Math.cos(t1) * at;
    const y0 = groundAt(x0, z0);
    const y1 = groundAt(x1, z1);
    const ox0 = Math.sin(t0) * (at + thick);
    const oz0 = Math.cos(t0) * (at + thick);
    const ox1 = Math.sin(t1) * (at + thick);
    const oz1 = Math.cos(t1) * (at + thick);
    pushQuad(wall, x0, y0, z0, ox0, y0, oz0, ox1, y1, oz1, x1, y1, z1);
    pushQuad(wall, x0, y0, z0, x1, y1, z1, x1, y1 + height, z1, x0, y0 + height, z0);
    pushQuad(wall, ox0, y0, oz0, ox0, y0 + height, oz0, ox1, y1 + height, oz1, ox1, y1, oz1);
    const band = 0.28;
    pushQuad(
      stripe,
      x0, y0 + height - band, z0,
      x1, y1 + height - band, z1,
      x1, y1 + height, z1,
      x0, y0 + height, z0,
    );
  }
  group.add(meshFrom(wall, CONCRETE, 'Playable edge wall'));
  group.add(meshFrom(stripe, STRIPE, 'Playable edge stripe'));
  group.userData = { radius: r, panels: n };
  return group;
}
