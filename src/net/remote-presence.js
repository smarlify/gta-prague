/**
 * Other players: cars, peds, chase police, foot officers and a sleepy label.
 * Meshes lerp toward the latest pose. Car-to-car hits are a published impulse
 * (see carBodies); this module does not run Mobility.knock.
 */
import * as THREE from 'three';
import { createVehicle, animateVehicle } from '../vehicles.js';
import { createPersonBatch, personLook, advanceGait } from '../person-model.js';
import { createRideVehicle, PLAYER_BIKE, PLAYER_SCOOTER } from '../player-ride-models.js';
import { createPoliceBody, unitNumber, unitVariant, policeAgencyFor } from '../police-model.js';
import { attachPursuitLights, flashPursuitLights } from '../police-renderer.js';
import { createSiren } from '../police-siren.js';
import { officerLook } from '../roadblock.js';
import { groundAt, groundPose } from '../terrain.js';
import { unregisterEnvMaterial } from '../environment.js';

const slope = { y: 0, pitch: 0, roll: 0 };

function lerpAngle(from, to, t) {
  return from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * t;
}

function disposeObject(root) {
  root.removeFromParent();
  root.traverse((o) => {
    if (o.isSprite) {
      const mat = o.material;
      if (mat && !mat.userData?.shared) {
        if (mat.map && !mat.map.userData?.shared) mat.map.dispose?.();
        mat.dispose?.();
      }
      return;
    }
    if (!o.isMesh) return;
    if (o.geometry && !o.geometry.userData?.shared) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m || m.userData?.shared) continue;
      if (m.name === 'paint') {
        try { unregisterEnvMaterial(m); } catch { /* ignore */ }
      }
      m.dispose?.();
    }
  });
}

function makeNameLabel(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 256, 64);
  ctx.font = '600 28px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(16, 12, 224, 40);
  ctx.fillStyle = '#f4f6f8';
  ctx.fillText(String(text || 'Driver').slice(0, 22), 128, 34);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthTest: true,
    depthWrite: false,
  }));
  sprite.scale.set(4.2, 1.05, 1);
  sprite.position.y = 2.4;
  sprite.userData.labelTex = tex;
  return sprite;
}

function vehicleKey(vehicle) {
  if (!vehicle) return 'none';
  if (vehicle.police || vehicle.type === 'police') {
    return `police|${vehicle.variant || 'estate'}|${vehicle.livery || ''}`;
  }
  return `${vehicle.type || 'sedan'}|${vehicle.colour || vehicle.color || ''}`;
}

function labelFor(net) {
  const name = String(net?.name || 'Driver').slice(0, 18);
  return net?.afk ? `😴 ${name}` : name;
}

function arrestStandins(net) {
  if (!net?.arrest?.active) return [];
  const heading = net.heading || 0;
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  const at = (x, z) => ({ x: net.x + c * x + s * z, z: net.z - s * x + c * z });
  const pose = net.arrest.phase === 'cuff' || net.arrest.phase === 'bust' ? 'cuffing' : 'grab';
  const door = at(-1.9, 0.4);
  const second = at(-1.9, 1.6);
  return [
    { id: 'arrest-lead', ...door, heading, pose },
    { id: 'arrest-second', ...second, heading, pose: 'escort' },
  ];
}

function createCarMesh(vehicle) {
  if (vehicle?.police || vehicle?.type === 'police') {
    const model = createPoliceBody(vehicle.variant || 'estate', vehicle.livery || 'praha');
    attachPursuitLights(model, 0.17);
    model.name = 'Remote player car';
    return model;
  }
  const type = vehicle?.type && ['crossover', 'hatchback', 'sedan', 'estate', 'suv', 'van', 'taxi', 'offroad'].includes(vehicle.type)
    ? vehicle.type
    : 'crossover';
  const model = createVehicle(0, false, type);
  const colour = vehicle?.colour || vehicle?.color;
  if (colour) {
    model.traverse((m) => {
      if (m.isMesh && m.material?.name === 'paint') m.material.color.set(colour);
    });
  }
  model.name = 'Remote player car';
  return model;
}

function createPedMesh(uid) {
  const batch = createPersonBatch(1, { name: `Remote ${uid}` });
  const look = personLook(hashSeed(uid), {
    height: 1.75,
    coat: 0,
    skirt: false,
    shirt: '#3a5a6a',
    trousers: '#273b4a',
    age: 'adult',
    accessory: null,
    phoneWalk: false,
    stoop: 0,
    outer: 'jacket',
    scarf: null,
    hairStyle: 'short',
    bagType: null,
  });
  return { batch, look, gait: {} };
}

function hashSeed(uid) {
  let h = 2166136261;
  for (let i = 0; i < uid.length; i++) {
    h ^= uid.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) || 1;
}

function createPoliceMesh(unit, cityId, level) {
  const index = Number(String(unit.id).replace(/\D/g, '')) || hashSeed(unit.id) % 90;
  const agency = cityId ? policeAgencyFor(cityId, level || 1) : { livery: 'praha' };
  const model = createPoliceBody(unitVariant(index), agency.livery);
  attachPursuitLights(model, (index % 7) * 0.09);
  model.name = 'Remote police';
  model.userData.remotePolice = true;
  model.userData.unitNumber = unitNumber(index);
  return model;
}

class RemoteActor {
  constructor(uid, scene) {
    this.uid = uid;
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.name = `remote-player-${uid}`;
    this.scene.add(this.root);
    this.car = null;
    this.ped = null;
    this.ride = null;
    this.label = null;
    this.mode = null;
    this.vehicleKey = '';
    this.target = { x: 0, z: 0, heading: 0, speed: 0 };
    this.hasPose = false;
    this.police = new Map();
    this.officers = null;
    this.edge = { remote: true };
    this.clock = 0;
    this.sirenOn = false;
  }

  ensureLabel(name) {
    if (this.label) {
      if (this.label.userData.name === name) return;
      disposeObject(this.label);
      this.label = null;
    }
    this.label = makeNameLabel(name);
    this.label.userData.name = name;
    this.root.add(this.label);
  }

  ensureBody(net) {
    const mode = net.mode === 'car' ? 'car' : net.mode === 'bike' || net.mode === 'scooter' ? net.mode : 'walk';
    const vKey = mode === 'car' ? vehicleKey(net.vehicle) : mode;
    if (this.mode === mode && this.vehicleKey === vKey) return;
    this.clearBody();
    this.mode = mode;
    this.vehicleKey = vKey;
    if (mode === 'car') {
      this.car = createCarMesh(net.vehicle);
      this.root.add(this.car);
    } else if (mode === 'bike' || mode === 'scooter') {
      this.ride = createRideVehicle(
        { kind: mode === 'scooter' ? 'scooter' : 'bicycle', color: '#6f9cc4' },
        mode,
      );
      this.root.add(this.ride.root);
      this.ped = createPedMesh(this.uid);
      this.root.add(this.ped.batch.group);
    } else {
      this.ped = createPedMesh(this.uid);
      this.root.add(this.ped.batch.group);
    }
  }

  clearBody() {
    if (this.car) { disposeObject(this.car); this.car = null; }
    if (this.ride) {
      if (typeof this.ride.dispose === 'function') this.ride.dispose();
      else disposeObject(this.ride.root);
      this.ride = null;
    }
    if (this.ped) { disposeObject(this.ped.batch.group); this.ped = null; }
    this.mode = null;
    this.vehicleKey = '';
  }

  apply(net, dt) {
    this.clock += dt;
    this.sirenOn = !!net.siren;
    this.ensureLabel(labelFor(net));
    this.ensureBody(net);
    this.target.x = net.x;
    this.target.z = net.z;
    this.target.heading = net.heading;
    this.target.speed = net.speed;
    const t = Math.min(1, dt * 8);
    if (!this.hasPose) {
      this.root.position.set(net.x, 0, net.z);
      this.root.rotation.y = net.heading;
      this.hasPose = true;
    } else {
      this.root.position.x += (this.target.x - this.root.position.x) * t;
      this.root.position.z += (this.target.z - this.root.position.z) * t;
      this.root.rotation.y = lerpAngle(this.root.rotation.y, this.target.heading, t);
    }
    const x = this.root.position.x;
    const z = this.root.position.z;
    const heading = this.root.rotation.y;
    const speed = this.target.speed;
    groundPose(x, z, heading, 1.4, 0.8, slope);
    this.root.position.y = 0.12 + slope.y;

    if (this.car) {
      this.car.rotation.set(slope.pitch, 0, slope.roll, 'YXZ');
      animateVehicle(this.car, speed, 0, dt, false);
      if (this.car.userData.policeLights) flashPursuitLights(this.car, this.clock, this.sirenOn);
      if (this.ped) this.ped.batch.group.visible = false;
      if (this.ride) this.ride.root.visible = false;
      this.car.visible = true;
    } else if (this.ride) {
      this.ride.root.visible = true;
      this.ride.root.position.set(0, (this.ride.lift || 0.12), 0);
      this.ride.root.rotation.set(0, 0, 0);
      this.ride.motion?.update((this.ride._dist = (this.ride._dist || 0) + Math.abs(speed) * dt));
      if (this.ped) {
        const pose = this.mode === 'bike' ? 'cycle' : 'scooter';
        const bike = this.ride.anchors || PLAYER_BIKE;
        const actor = {
          x: 0, z: 0, heading: 0, speed: Math.abs(speed), pose,
          groundY: pose === 'scooter' ? PLAYER_SCOOTER.groundY + (this.ride.lift || 0.12) - 0.12 : (this.ride.lift || 0.12),
          running: false, grip: true, seated: false,
          bike: { ...bike, crank: (this.ride._dist || 0) * bike.crankPerMetre },
          scooter: PLAYER_SCOOTER,
        };
        this.ped.batch.begin();
        advanceGait(actor, this.ped.gait, dt, this.ped.look);
        this.ped.batch.draw(actor, this.ped.look, this.ped.gait);
        this.ped.batch.end();
        this.ped.batch.group.visible = true;
      }
    } else if (this.ped) {
      const actor = {
        x: 0, z: 0, heading: 0, speed: Math.abs(speed), pose: 'walk',
        groundY: 0.12, running: Math.abs(speed) > 2.5, grip: false, seated: false,
      };
      this.ped.batch.begin();
      advanceGait(actor, this.ped.gait, dt, this.ped.look);
      this.ped.batch.draw(actor, this.ped.look, this.ped.gait);
      this.ped.batch.end();
      this.ped.batch.group.visible = true;
      this.ped.batch.group.position.y = groundAt(x, z) - this.root.position.y + 0.12;
    }

    if (this.label) this.label.position.y = this.mode === 'car' ? 2.2 : 2.5;
    this.syncPolice(net);
    this.syncOfficers(net, dt);
  }

  syncPolice(net) {
    const list = net.police || [];
    const live = new Set();
    for (const unit of list) {
      live.add(unit.id);
      let entry = this.police.get(unit.id);
      if (!entry) {
        const mesh = createPoliceMesh(unit, 'prague', net.wanted?.level || 1);
        this.scene.add(mesh);
        entry = { mesh, x: unit.x, z: unit.z, heading: unit.heading };
        this.police.set(unit.id, entry);
      }
      const t = 0.35;
      entry.x += (unit.x - entry.x) * t;
      entry.z += (unit.z - entry.z) * t;
      entry.heading = lerpAngle(entry.heading, unit.heading, t);
      groundPose(entry.x, entry.z, entry.heading, 2.2, 0.85, slope);
      entry.mesh.position.set(entry.x, 0.12 + slope.y, entry.z);
      entry.mesh.rotation.set(slope.pitch, entry.heading, slope.roll, 'YXZ');
      animateVehicle(entry.mesh, unit.speed || 0, 0, 1 / 30, false);
      flashPursuitLights(entry.mesh, this.clock, true);
    }
    for (const [id, entry] of this.police) {
      if (live.has(id)) continue;
      disposeObject(entry.mesh);
      this.police.delete(id);
    }
  }

  syncOfficers(net, dt) {
    const published = net.officers?.length ? net.officers : arrestStandins(net);
    if (!published.length) {
      if (this.officers) {
        disposeObject(this.officers.batch.group);
        this.officers = null;
      }
      return;
    }
    if (!this.officers) {
      const batch = createPersonBatch(8, { name: `Remote officers ${this.uid}`, police: { word: 'POLICIE' } });
      this.scene.add(batch.group);
      this.officers = { batch, actors: new Map() };
    }
    const live = new Set();
    for (const row of published) {
      live.add(row.id);
      let actor = this.officers.actors.get(row.id);
      if (!actor) {
        const seed = hashSeed(String(row.id));
        actor = {
          id: row.id,
          x: row.x,
          z: row.z,
          heading: row.heading || 0,
          speed: 0,
          pose: row.pose || 'belt',
          groundY: 0.13,
          look: officerLook(seed % 20, seed % 2 === 0),
          gait: {},
        };
        this.officers.actors.set(row.id, actor);
      }
      const dx = row.x - actor.x;
      const dz = row.z - actor.z;
      actor.speed = dt > 0 ? Math.min(7, Math.hypot(dx, dz) / dt) : 0;
      actor.running = actor.speed > 2;
      actor.x += dx * Math.min(1, dt * 8);
      actor.z += dz * Math.min(1, dt * 8);
      actor.heading = row.heading || actor.heading;
      actor.pose = row.pose || 'belt';
    }
    for (const id of this.officers.actors.keys()) {
      if (!live.has(id)) this.officers.actors.delete(id);
    }
    const batch = this.officers.batch;
    batch.begin();
    for (const actor of this.officers.actors.values()) {
      advanceGait(actor, actor.gait, dt, actor.look);
      batch.draw(actor, actor.look, actor.gait);
    }
    batch.end();
  }

  sirenUnits() {
    const units = [];
    if (this.sirenOn) units.push({ x: this.root.position.x, z: this.root.position.z });
    for (const entry of this.police.values()) units.push({ x: entry.x, z: entry.z });
    return units;
  }

  dispose() {
    this.clearBody();
    if (this.officers) { disposeObject(this.officers.batch.group); this.officers = null; }
    if (this.label) { disposeObject(this.label); this.label = null; }
    for (const entry of this.police.values()) disposeObject(entry.mesh);
    this.police.clear();
    this.root.removeFromParent();
  }
}

export function createRemotePresence(scene) {
  const remotes = new Map();
  const siren = createSiren();
  let sirenUnits = [];
  return {
    update(netPlayers, dt) {
      const live = new Set();
      for (const net of netPlayers || []) {
        live.add(net.uid);
        let remote = remotes.get(net.uid);
        if (!remote) {
          remote = new RemoteActor(net.uid, scene);
          remotes.set(net.uid, remote);
        }
        remote.apply(net, dt);
      }
      for (const [uid, remote] of remotes) {
        if (live.has(uid)) continue;
        remote.dispose();
        remotes.delete(uid);
      }
      sirenUnits = [];
      for (const remote of remotes.values()) sirenUnits.push(...remote.sirenUnits());
    },
    /** Car-mode remotes as impact bodies. Visual pose, not a physics authority. */
    carBodies() {
      const bodies = [];
      for (const remote of remotes.values()) {
        if (remote.mode !== 'car' || !remote.hasPose) continue;
        bodies.push({
          id: `remote-${remote.uid}`,
          uid: remote.uid,
          remote: true,
          edge: remote.edge,
          x: remote.root.position.x,
          z: remote.root.position.z,
          heading: remote.root.rotation.y,
          speed: remote.target.speed || 0,
        });
      }
      return bodies;
    },
    /** Remote chase cars and stolen-police sirens. Caller passes enabled=false while the local tab is AFK. */
    audio(ctx, enabled, listener, time) {
      siren.update(ctx, !!enabled && sirenUnits.length > 0, sirenUnits, listener, time, 1);
    },
    clear() {
      for (const remote of remotes.values()) remote.dispose();
      remotes.clear();
      sirenUnits = [];
    },
    count() {
      return remotes.size;
    },
  };
}
