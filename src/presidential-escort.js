// Visual escort for Petr Pavel. Two police motorbikes flank him and a police
// helicopter holds above and behind. Positions ease toward the formation each
// frame. They are not physics bodies: they do not block, chase, or arrest.
import * as THREE from 'three';
import {createMotorbike} from './player-ride-models.js';
import {POLICE_BLUE, POLICE_WHITE} from './police-model.js';
import {groundAt, groundPose} from './terrain.js';

export const PRESIDENTIAL_ESCORT_ID = 'pavel';

// lateral: metres to the rider's right. behind: metres opposite the facing direction.
// altitude: metres above the ground under the slot (helicopter only).
export const ESCORT_SLOTS = Object.freeze([
  Object.freeze({id: 'bike-left', kind: 'motorbike', lateral: -1.35, behind: 0.85, altitude: 0}),
  Object.freeze({id: 'bike-right', kind: 'motorbike', lateral: 1.35, behind: 1.55, altitude: 0}),
  // Above and behind, low enough that the Follow camera still has the fuselage in frame.
  Object.freeze({id: 'helicopter', kind: 'helicopter', lateral: 3.6, behind: 4.2, altitude: 6.2}),
]);

const BIKE_LIFT = 0.12;
const ground = {y: 0, pitch: 0, roll: 0};

export function escortServes(character) {
  const id = typeof character === 'string' ? character : character?.id;
  return id === PRESIDENTIAL_ESCORT_ID;
}

/** World point of a formation slot. Forward is (-sin heading, -cos heading). */
export function formationPoint(leader, slot) {
  const heading = leader?.heading || 0;
  const s = Math.sin(heading);
  const c = Math.cos(heading);
  const lateral = slot?.lateral || 0;
  const behind = slot?.behind || 0;
  return {
    x: leader.x + lateral * c + behind * s,
    z: leader.z - lateral * s + behind * c,
    heading,
  };
}

const wrap = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));

/**
 * Move one escort body toward its slot. A fresh escort, a paused clock, or a
 * jump longer than `snapDistance` (a new street) lands on the slot immediately.
 */
export function stepEscortUnit(unit, target, dt, {catchRate = 8, snapDistance = 40, turnRate = 9, roll = 0, pitch = 0} = {}) {
  const dx = target.x - unit.x;
  const dz = target.z - unit.z;
  const dist = Math.hypot(dx, dz);
  if (!unit.placed || !(dt > 0) || dist > snapDistance) {
    unit.x = target.x;
    unit.z = target.z;
    unit.y = target.y;
    unit.heading = target.heading;
    unit.roll = 0;
    unit.pitch = 0;
    unit.placed = true;
    return unit;
  }
  const blend = 1 - Math.exp(-catchRate * dt);
  const stepX = dx * blend;
  const stepZ = dz * blend;
  unit.x += stepX;
  unit.z += stepZ;
  unit.y += (target.y - unit.y) * blend;
  unit.distance = (unit.distance || 0) + Math.hypot(stepX, stepZ);
  const moved = Math.hypot(stepX, stepZ);
  const chase = moved > 0.05 ? Math.atan2(-dx, -dz) : target.heading;
  const face = dist < 1.4 ? target.heading : chase;
  const turn = 1 - Math.exp(-turnRate * dt);
  unit.heading = wrap(unit.heading + wrap(face - unit.heading) * turn);
  unit.roll = (unit.roll || 0) + (roll - (unit.roll || 0)) * turn;
  unit.pitch = (unit.pitch || 0) + (pitch - (unit.pitch || 0)) * (1 - Math.exp(-4 * dt));
  return unit;
}

function slotTarget(leader, slot) {
  const point = formationPoint(leader, slot);
  const floor = groundAt(point.x, point.z);
  const y = slot.kind === 'helicopter' ? Math.max(groundAt(leader.x, leader.z), floor) + slot.altitude : floor;
  return {...point, y};
}

const wordMaterials = new Map();
function wordMaterial(text) {
  const cached = wordMaterials.get(text);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = POLICE_BLUE;
  ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = POLICE_WHITE;
  ctx.font = '700 78px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 68);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({map: texture});
  wordMaterials.set(text, material);
  return material;
}

function lampOn(time, side) {
  const phase = ((time % 0.62) + 0.62) % 0.62;
  return (phase < 0.31 ? 0 : 1) === side;
}

function flashLamps(lights, time) {
  if (!lights) return;
  for (let i = 0; i < lights.length; i++) lights[i].material.emissiveIntensity = lampOn(time, i % 2) ? 2.6 : 0.12;
}

function addOfficer(root, owned) {
  const cloth = new THREE.MeshStandardMaterial({color: POLICE_BLUE, roughness: 0.72});
  const dark = new THREE.MeshStandardMaterial({color: '#14171a', roughness: 0.8});
  const helm = new THREE.MeshStandardMaterial({color: POLICE_WHITE, roughness: 0.4});
  const visor = new THREE.MeshStandardMaterial({color: '#1a2430', roughness: 0.2, metalness: 0.35});
  owned.add(cloth);
  owned.add(dark);
  owned.add(helm);
  owned.add(visor);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.42, 0.22), cloth);
  torso.position.set(0, 1.22, 0.22);
  torso.castShadow = true;
  root.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), helm);
  head.position.set(0, 1.52, 0.2);
  head.castShadow = true;
  root.add(head);
  const shade = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.08), visor);
  shade.position.set(0, 1.5, 0.08);
  root.add(shade);
  for (const x of [-0.18, 0.18]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.55), cloth);
    arm.position.set(x, 1.18, -0.15);
    root.add(arm);
  }
  for (const x of [-0.1, 0.1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.42), dark);
    leg.position.set(x, 0.95, 0.28);
    root.add(leg);
  }
}

function dressPoliceBike(ride, owned) {
  const root = ride.root;
  root.name = 'Police motorbike';
  const tank = root.getObjectByName('tank');
  if (tank?.material) {
    tank.material.color.set(POLICE_WHITE);
    tank.material.roughness = 0.42;
  }
  const blue = new THREE.MeshStandardMaterial({color: POLICE_BLUE, roughness: 0.45, metalness: 0.25});
  const dark = new THREE.MeshStandardMaterial({color: '#22262b', roughness: 0.55, metalness: 0.4});
  owned.add(blue);
  owned.add(dark);
  const fairing = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.18, 0.55), blue);
  fairing.position.set(0, 0.72, -0.48);
  fairing.castShadow = true;
  root.add(fairing);
  for (const x of [-0.22, 0.22]) {
    const pannier = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.36), blue);
    pannier.position.set(x, 0.62, 0.36);
    pannier.castShadow = true;
    root.add(pannier);
  }
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.1), wordMaterial('POLICIE'));
  plate.position.set(0, 0.96, -0.22);
  plate.rotation.x = -0.7;
  root.add(plate);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.05, 0.1), dark);
  bar.position.set(0, 1.18, -0.58);
  root.add(bar);
  const lights = [];
  for (const [x, color] of [[-0.1, '#ff2a2a'], [0.1, '#2f6bff']]) {
    const material = new THREE.MeshStandardMaterial({color, emissive: color, emissiveIntensity: 0.2, roughness: 0.35});
    owned.add(material);
    const lens = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.05, 0.08), material);
    lens.position.set(x, 1.22, -0.58);
    root.add(lens);
    lights.push(lens);
  }
  addOfficer(root, owned);
  return lights;
}

function createPoliceHelicopter(owned) {
  const root = new THREE.Group();
  root.name = 'Police helicopter';
  root.rotation.order = 'YXZ';
  const white = new THREE.MeshStandardMaterial({color: POLICE_WHITE, roughness: 0.42, metalness: 0.28});
  const blue = new THREE.MeshStandardMaterial({color: POLICE_BLUE, roughness: 0.4, metalness: 0.22});
  const dark = new THREE.MeshStandardMaterial({color: '#1a1d22', roughness: 0.55, metalness: 0.45});
  const glass = new THREE.MeshStandardMaterial({color: '#9ec9df', roughness: 0.15, metalness: 0.12, transparent: true, opacity: 0.72});
  owned.add(white);
  owned.add(blue);
  owned.add(dark);
  owned.add(glass);
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.55, 1.35, 4.4), white);
  body.position.set(0, 1.55, 0.15);
  body.castShadow = true;
  root.add(body);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.35, 1.05, 1.25), glass);
  nose.position.set(0, 1.6, -2.15);
  root.add(nose);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.58, 0.28, 3.5), blue);
  stripe.position.set(0, 1.15, 0.25);
  root.add(stripe);
  const boom = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.36, 3.3), white);
  boom.position.set(0, 1.75, 3.5);
  boom.castShadow = true;
  root.add(boom);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.15, 0.75), blue);
  fin.position.set(0, 2.25, 4.85);
  root.add(fin);
  const tailRotor = new THREE.Group();
  tailRotor.position.set(0.24, 2.2, 4.85);
  const tailBlade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.15, 0.12), dark);
  tailRotor.add(tailBlade);
  root.add(tailRotor);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.5, 8), dark);
  mast.position.set(0, 2.4, -0.15);
  root.add(mast);
  const rotor = new THREE.Group();
  rotor.position.set(0, 2.68, -0.15);
  for (const spin of [0, Math.PI / 2]) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(9.4, 0.05, 0.32), dark);
    blade.rotation.y = spin;
    rotor.add(blade);
  }
  root.add(rotor);
  for (const x of [-0.72, 0.72]) {
    const skid = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 2.5), dark);
    skid.position.set(x, 0.32, 0.1);
    root.add(skid);
    for (const z of [-0.65, 0.75]) {
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.95, 5), dark);
      strut.position.set(x, 0.78, z);
      root.add(strut);
    }
  }
  const label = wordMaterial('POLICIE');
  for (const side of [-1, 1]) {
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.38), label);
    plate.position.set(side * 0.8, 1.6, 0.2);
    plate.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    root.add(plate);
  }
  const lights = [];
  for (const [x, color] of [[-0.4, '#ff2a2a'], [0.4, '#2f6bff']]) {
    const material = new THREE.MeshStandardMaterial({color, emissive: color, emissiveIntensity: 0.2, roughness: 0.3});
    owned.add(material);
    const lens = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.22), material);
    lens.position.set(x, 2.28, -1.35);
    root.add(lens);
    lights.push(lens);
  }
  return {root, rotor, tailRotor, lights};
}

function bankTargets(unit, target) {
  const heading = target.heading || 0;
  const dx = target.x - unit.x;
  const dz = target.z - unit.z;
  const lateral = dx * Math.cos(heading) - dz * Math.sin(heading);
  const ahead = -(dx * Math.sin(heading) + dz * Math.cos(heading));
  return {
    roll: Math.max(-0.38, Math.min(0.38, -lateral * 0.06)),
    pitch: Math.max(-0.22, Math.min(0.16, -ahead * 0.035)),
  };
}

function blankUnit(slot) {
  return {id: slot.id, kind: slot.kind, slot, x: 0, z: 0, y: 0, heading: 0, roll: 0, pitch: 0, distance: 0, placed: false};
}

export function createPresidentialEscort(parent) {
  const root = new THREE.Group();
  root.name = 'Presidential escort';
  root.visible = false;
  parent.add(root);
  const owned = new Set();
  const units = ESCORT_SLOTS.map((slot) => {
    const unit = blankUnit(slot);
    if (slot.kind === 'motorbike') {
      const ride = createMotorbike();
      unit.mesh = ride.root;
      unit.motion = ride.motion;
      unit.lights = dressPoliceBike(ride, owned);
    } else if (slot.kind === 'helicopter') {
      const heli = createPoliceHelicopter(owned);
      unit.mesh = heli.root;
      unit.rotor = heli.rotor;
      unit.tailRotor = heli.tailRotor;
      unit.lights = heli.lights;
    } else {
      const kind = slot.kind;
      throw new Error(`Unknown escort slot: ${kind}`);
    }
    root.add(unit.mesh);
    return unit;
  });
  let active = false;
  let clock = 0;

  function hide() {
    active = false;
    root.visible = false;
    for (const unit of units) unit.placed = false;
  }

  function update(dt, leader, character) {
    const live = escortServes(character) && leader && Number.isFinite(leader.x) && Number.isFinite(leader.z);
    if (!live) {
      if (active || root.visible) hide();
      return snapshot();
    }
    const step = Number.isFinite(dt) ? Math.min(Math.max(dt, 0), 0.25) : 0;
    const waking = !active;
    active = true;
    clock += step;
    for (const unit of units) {
      const target = slotTarget(leader, unit.slot);
      const heli = unit.kind === 'helicopter';
      const attitude = heli ? bankTargets(unit, target) : {roll: 0, pitch: 0};
      stepEscortUnit(unit, target, waking ? 0 : step, {
        catchRate: heli ? 3.4 : 8,
        snapDistance: heli ? 90 : 42,
        roll: attitude.roll,
        pitch: attitude.pitch,
      });
      if (heli) {
        const bob = Math.sin(clock * 2.1 + (unit.slot.lateral || 0)) * 0.35;
        unit.mesh.position.set(unit.x, unit.y + bob, unit.z);
        unit.mesh.rotation.y = unit.heading;
        unit.mesh.rotation.x = unit.pitch;
        unit.mesh.rotation.z = unit.roll;
        unit.rotor.rotation.y = clock * 14;
        unit.tailRotor.rotation.x = clock * 34;
      } else {
        groundPose(unit.x, unit.z, unit.heading, 0.8, 0.28, ground);
        unit.mesh.position.set(unit.x, ground.y + BIKE_LIFT, unit.z);
        unit.mesh.rotation.y = unit.heading;
        unit.mesh.rotation.x = ground.pitch;
        unit.mesh.rotation.z = ground.roll;
        unit.motion?.update(unit.distance || 0);
      }
      flashLamps(unit.lights, clock + (unit.slot.lateral > 0 ? 0.15 : 0));
    }
    root.visible = true;
    return snapshot();
  }

  function snapshot() {
    return {
      active,
      units: units.map((unit) => ({
        id: unit.id,
        kind: unit.kind,
        x: unit.x,
        y: unit.mesh?.position.y ?? unit.y,
        z: unit.z,
        heading: unit.heading,
      })),
    };
  }

  function dispose() {
    hide();
    const geometries = new Set();
    const materials = new Set(owned);
    root.traverse((obj) => {
      if (obj.geometry) geometries.add(obj.geometry);
      if (obj.material) materials.add(obj.material);
    });
    root.removeFromParent();
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    for (const material of wordMaterials.values()) {
      material.map?.dispose();
      material.dispose();
    }
    wordMaterials.clear();
  }

  return {update, snapshot, dispose, root};
}
