import * as THREE from 'three';

// Short staff on the back of the saddle. The cloth is a canvas Jolly Roger,
// waved by moving the free edge. No cloth simulation.
export const PIRATE_FLAG = Object.freeze({
  width: 0.42,
  height: 0.26,
  pole: 0.68,
  // bicycleGeometry saddle is a 0.29 m box centred at z=0.24, y=0.89.
  // The staff starts on the rear of that saddle and rises behind the rider.
  seat: Object.freeze({x: 0, y: 0.94, z: 0.40}),
});

const CLOTH = '#0c0c0c';
const INK = '#f4f0e6';

function bone(x, y, angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  const lx = x * c + y * s, ly = -x * s + y * c;
  if (Math.abs(lx) < 0.40 && Math.abs(ly) < 0.032) return true;
  for (const ex of [-0.36, 0.36]) for (const ey of [-0.045, 0.045]) {
    const dx = lx - ex, dy = ly - ey;
    if (dx * dx + dy * dy < 0.055 * 0.055) return true;
  }
  return false;
}

/** White pixel of a skull and crossbones. u, v are 0..1, v down. Aspect matches the cloth. */
export function jollyRoger(u, v, aspect = PIRATE_FLAG.width / PIRATE_FLAG.height) {
  const x = (u - 0.5) * aspect;
  const y = 0.5 - v;
  const hem = (u < 0.045 || u > 0.955 || v < 0.055 || v > 0.945) && u > 0.02 && u < 0.98 && v > 0.025 && v < 0.975;
  if (u <= 0.02 || u >= 0.98 || v <= 0.025 || v >= 0.975) return false;
  if (hem) return true;

  const sx = x;
  const sy = y + 0.06;
  const head = (sx * sx) / (0.18 * 0.18) + ((sy - 0.16) * (sy - 0.16)) / (0.16 * 0.16) <= 1;
  const jaw = sy < 0.08 && (sx * sx) / (0.13 * 0.13) + ((sy + 0.02) * (sy + 0.02)) / (0.11 * 0.11) <= 1;
  const skull = head || jaw;
  if (skull) {
    const eye = (dx, dy) => (dx * dx) / (0.055 * 0.055) + (dy * dy) / (0.068 * 0.068) <= 1;
    if (eye(sx - 0.065, sy - 0.18) || eye(sx + 0.065, sy - 0.18)) return false;
    const noseY = sy - 0.08;
    if (noseY < 0.04 && noseY > -0.015 && Math.abs(sx) < 0.01 + (0.04 - noseY) * 0.32) return false;
    if (sy < 0.02 && sy > -0.07 && Math.abs(sx) < 0.085) {
      const col = Math.floor((sx + 0.085) / 0.034);
      const frac = (sx + 0.085) / 0.034 - col;
      if (frac > 0.62) return false;
      return sy > -0.06;
    }
    return true;
  }
  return bone(x, y + 0.16, 0.58) || bone(x, y + 0.16, -0.58);
}

export function drawJollyRoger(ctx, width, height) {
  const aspect = width / height;
  for (let y = 0; y < height; y++) {
    let run = 0;
    let on = jollyRoger(0.5 / width, (y + 0.5) / height, aspect);
    for (let x = 1; x <= width; x++) {
      const next = x < width && jollyRoger((x + 0.5) / width, (y + 0.5) / height, aspect);
      if (x === width || next !== on) {
        ctx.fillStyle = on ? INK : CLOTH;
        ctx.fillRect(run, y, x - run, 1);
        run = x;
        on = next;
      }
    }
  }
}

function flagTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 160;
  drawJollyRoger(canvas.getContext('2d'), canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

export function createPirateFlag() {
  const {width, height, pole, seat} = PIRATE_FLAG;
  const group = new THREE.Group();
  group.name = 'Pirate flag';
  group.position.set(seat.x, seat.y, seat.z);
  const metal = new THREE.MeshStandardMaterial({color: '#2a2e30', roughness: 0.5, metalness: 0.45});
  const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.014, pole, 6), metal);
  staff.name = 'Pirate pole';
  staff.position.y = pole / 2;
  staff.castShadow = true;
  group.add(staff);
  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), metal);
  finial.position.y = pole;
  group.add(finial);
  const geometry = new THREE.PlaneGeometry(width, height, 8, 3);
  geometry.translate(width / 2, 0, 0);
  const rest = geometry.attributes.position.array.slice();
  const material = new THREE.MeshBasicMaterial({map: flagTexture(), side: THREE.DoubleSide, toneMapped: false});
  const cloth = new THREE.Mesh(geometry, material);
  cloth.name = 'Pirate cloth';
  cloth.position.set(0.012, pole - height / 2, 0.01);
  cloth.rotation.y = -0.42;
  group.add(cloth);
  let time = 0;
  let disposed = false;
  return {
    group,
    cloth,
    update(dt = 0, speed = 0) {
      if (disposed) return;
      time += Number.isFinite(dt) ? dt : 0;
      const amp = 0.012 + Math.min(0.04, Math.abs(speed) * 0.005);
      const pos = geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = rest[i * 3];
        const y = rest[i * 3 + 1];
        const along = Math.min(1, Math.max(0, x / width));
        const envelope = along * along;
        pos.setXYZ(i, x, y - envelope * 0.025, envelope * amp * Math.sin(along * 7 - time * 3.4 + y * 3));
      }
      pos.needsUpdate = true;
      group.rotation.z = Math.sin(time * 1.5) * 0.03;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      geometry.dispose();
      material.map?.dispose();
      material.dispose();
      staff.geometry.dispose();
      finial.geometry.dispose();
      metal.dispose();
    },
  };
}

/** Attach or remove the flag on a ride vehicle returned by createRideVehicle. */
export function syncPirateFlag(vehicle, wanted) {
  if (!vehicle?.root) return null;
  if (wanted && !vehicle.flag) {
    vehicle.flag = createPirateFlag();
    vehicle.root.add(vehicle.flag.group);
  } else if (!wanted && vehicle.flag) {
    vehicle.flag.dispose();
    vehicle.flag = null;
  }
  return vehicle.flag || null;
}

export function hribBicycle(characterId, ride) {
  return characterId === 'hrib' && ride?.id === 'bike' && ride?.mode === 'bike';
}
