import test from 'node:test';
import assert from 'node:assert/strict';
import {Group} from 'three';
import {PlayerTravel} from '../src/player-travel.js';
import {makeCar} from '../src/physics.js';
import {SpatialIndex} from '../src/geo.js';
import {createRideVehicle} from '../src/player-ride-models.js';
import {createPlayerTravelRenderer} from '../src/player-travel-renderer.js';
import {PIRATE_FLAG, createPirateFlag, hribBicycle, jollyRoger, syncPirateFlag} from '../src/pirate-flag.js';

function stubCanvas() {
  const ctx = new Proxy({}, {
    get(_target, key) {
      if (key === 'measureText') return () => ({width: 40});
      if (key === 'createRadialGradient') return () => ({addColorStop() {}});
      return () => {};
    },
    set: () => true,
  });
  globalThis.document = {
    createElement() {
      return {width: 256, height: 160, style: {}, getContext: () => ctx};
    },
  };
}

function world() {
  const pad = {rings: [[[-200, -200], [200, -200], [200, 200], [-200, 200]]]};
  return {buildings: new SpatialIndex([]), roads: new SpatialIndex([pad]), pavement: new SpatialIndex([pad]), water: []};
}

function flags(root) {
  const found = [];
  root.traverse((obj) => { if (obj.name === 'Pirate flag') found.push(obj); });
  return found;
}

test('the pirate mark is a white skull and crossbones on black', () => {
  assert.equal(jollyRoger(0, 0), false);
  assert.equal(jollyRoger(0.5, 0.04), true);
  assert.equal(jollyRoger(0.5, 0.30), true, 'cranium');
  assert.equal(jollyRoger(0.45, 0.34), false, 'left eye');
  assert.equal(jollyRoger(0.55, 0.34), false, 'right eye');
  assert.equal(jollyRoger(0.5, 0.34), true, 'bridge of the nose');
  assert.equal(jollyRoger(0.5, 0.62), false, 'black cloth under the skull');
  assert.equal(jollyRoger(0.30, 0.78), true, 'left crossbone');
  assert.equal(jollyRoger(0.70, 0.78), true, 'right crossbone');
});

test('the flag stands on the saddle and only the fly edge waves', () => {
  stubCanvas();
  const flag = createPirateFlag();
  assert.equal(flag.group.position.y, PIRATE_FLAG.seat.y);
  assert.ok(flag.group.position.y > 0.9);
  assert.ok(flag.group.position.z > 0.3);
  const pole = flag.group.getObjectByName('Pirate pole');
  assert.ok(pole.position.y > 0.2);
  const pos = flag.cloth.geometry.attributes.position;
  const hoist = [];
  const fly = [];
  for (let i = 0; i < pos.count; i++) {
    if (pos.getX(i) < 0.02) hoist.push(i);
    if (pos.getX(i) > PIRATE_FLAG.width * 0.8) fly.push(i);
  }
  assert.ok(hoist.length > 0 && fly.length > 0);
  const hoistZ = hoist.map((i) => pos.getZ(i));
  flag.update(0.4, 6);
  hoist.forEach((i, n) => assert.ok(Math.abs(pos.getZ(i) - hoistZ[n]) < 1e-4));
  assert.ok(fly.some((i) => Math.abs(pos.getZ(i)) > 0.004));
  flag.dispose();
  flag.dispose();
  assert.equal(flag.group.parent, null);
});

test('only Hřib’s bicycle receives the flag, and it follows that bike', () => {
  stubCanvas();
  assert.equal(hribBicycle('hrib', {id: 'bike', mode: 'bike'}), true);
  assert.equal(hribBicycle('elon', {id: 'bike', mode: 'bike'}), false);
  assert.equal(hribBicycle('hrib', {id: 'scooter', mode: 'scooter'}), false);
  assert.equal(hribBicycle('hrib', {id: 'borrowed', mode: 'bike'}), false);

  const plain = createRideVehicle({kind: 'bicycle'}, 'bike');
  assert.equal(flags(plain.root).length, 0);
  plain.dispose();
  const scooter = createRideVehicle({kind: 'scooter', flag: 'pirate'}, 'scooter');
  assert.equal(flags(scooter.root).length, 0);
  scooter.dispose();

  const travel = new PlayerTravel(makeCar(0, 0), world(), {ride: 'bike'});
  const renderer = createPlayerTravelRenderer(new Group());
  renderer.setCharacter('elon');
  renderer.update(travel, 1 / 60);
  assert.equal(flags(renderer.group).length, 0);

  renderer.setCharacter('hrib');
  renderer.update(travel, 1 / 60);
  assert.equal(flags(renderer.group).length, 1);
  const flag = flags(renderer.group)[0];
  const root = flag.parent;
  assert.equal(root.position.x, travel.actor.x);
  assert.equal(root.rotation.y, travel.actor.heading);
  travel.actor.x += 6;
  travel.actor.z -= 3;
  travel.actor.heading = 1.1;
  renderer.update(travel, 1 / 60);
  assert.ok(Math.abs(root.position.x - travel.actor.x) < 1e-6);
  assert.ok(Math.abs(root.position.z - travel.actor.z) < 1e-6);
  assert.ok(Math.abs(root.rotation.y - travel.actor.heading) < 1e-6);

  renderer.setCharacter('pavel');
  renderer.update(travel, 1 / 60);
  assert.equal(flags(renderer.group).length, 0);
  renderer.setCharacter('hrib');
  renderer.update(travel, 1 / 60);
  assert.equal(flags(renderer.group).length, 1);

  const parked = createRideVehicle({kind: 'bicycle'}, 'bike');
  syncPirateFlag(parked, false);
  assert.equal(flags(parked.root).length, 0);
  syncPirateFlag(parked, true);
  assert.equal(flags(parked.root).length, 1);
  syncPirateFlag(parked, true);
  assert.equal(flags(parked.root).length, 1);
  parked.dispose();
  assert.equal(flags(parked.root).length, 0);
});
