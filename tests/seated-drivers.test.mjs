import test from 'node:test';
import assert from 'node:assert/strict';
import {Group, Scene} from 'three';
import {createJoints, posePerson, personLook, JOINT} from '../src/person-model.js';
import {
  SEATED_DRIVE_POSE,
  ambulanceVehicle,
  createPlayerTravelRenderer,
  seatedCabDriver,
  travelActorAppearance,
} from '../src/player-travel-renderer.js';
import {createPlayerCarRenderer} from '../src/player-car-renderer.js';
import {createVehicle, revealCabinGlass} from '../src/vehicles.js';
import {createAmbulanceMesh} from '../src/pavlova-scene.js';
import {createRemotePresence} from '../src/net/remote-presence.js';
import {OFFICER_LOOK} from '../src/roadblock.js';

const ctx = new Proxy({}, {
  get: (target, key) => {
    if (key === 'createRadialGradient') return () => ({addColorStop() {}});
    if (key === 'measureText') return () => ({width: 40});
    return () => {};
  },
  set: () => true,
});
function withDocument(run) {
  const original = globalThis.document;
  globalThis.document = {createElement: () => ({getContext: () => ctx, width: 256, height: 64})};
  try { return run(); } finally {
    if (original === undefined) delete globalThis.document;
    else globalThis.document = original;
  }
}

const look = personLook(2026, {height: 1.75, coat: 0, skirt: false, phoneWalk: false, stoop: 0, accessory: null, bagType: null});
const gait = {gaitWalk: 0, gaitRun: 0, gaitPhase: 0, gaitClock: 0};
const WINDOWS = {
  gwagen: [1.3, 1.9],
  roadster: [0.62, 1.04],
  scala: [0.96, 1.4],
  x5: [1.12, 1.68],
  police: [0.96, 1.4],
};

function poseAt(pose, seatY) {
  const joints = createJoints();
  posePerson({pose, seated: true, seatY, speed: 0, heading: 0}, look, gait, joints);
  return joints;
}

function carTravel(visual, actor = {x: 4, z: 8, heading: 0.4, speed: 7, distance: 2}) {
  return {mode: 'car', rides: [], car: {visual}, viewActor: () => actor};
}

test('a seated driver keeps both arms down, and hail is not that pose', () => {
  const seat = seatedCabDriver({type: 'gwagen'});
  assert.equal(seat.pose, SEATED_DRIVE_POSE);
  assert.equal(SEATED_DRIVE_POSE, 'drive');
  assert.notEqual(seat.pose, 'hail');
  const joints = poseAt(seat.pose, seat.seatY);
  const hail = poseAt('hail', seat.seatY);
  for (const side of [0, 1]) {
    const hand = joints[JOINT.handL + side * 3 + 1];
    const elbow = joints[JOINT.elbowL + side * 3 + 1];
    const shoulder = joints[JOINT.shoulderL + side * 3 + 1];
    const head = joints[JOINT.head + 1];
    assert.ok(hand <= shoulder + 0.02, 'hand stays down');
    assert.ok(elbow <= shoulder + 0.02, 'elbow stays down');
    assert.ok(hand < head - 0.25, 'hand stays below the head');
    assert.ok(hand < hail[JOINT.handL + 1] - 0.35, 'neither hand uses the hail');
  }
});

test('every player car shows a seated driver, and the ambulance cab stays empty', () => {
  for (const [type, police] of [['gwagen', false], ['roadster', false], ['scala', false], ['x5', false], ['police', true]]) {
    const appearance = travelActorAppearance(
      {mode: 'car', car: {visual: {type, police}}},
      {x: 2, z: 3, heading: 1.2, speed: 9},
    );
    assert.equal(appearance.pose, 'drive', type);
    assert.notEqual(appearance.pose, 'hail', type);
    assert.equal(appearance.seated, true, type);
    const [belt, roof] = WINDOWS[type];
    const joints = poseAt(appearance.pose, appearance.seatY);
    const head = appearance.groundY + joints[JOINT.head + 1];
    assert.ok(head > 0.12 + belt + 0.04, `${type} head clears the belt`);
    assert.ok(head < 0.12 + roof - 0.02, `${type} head stays under the roof`);
  }
  assert.equal(ambulanceVehicle({type: 'ambulance'}), true);
  assert.equal(ambulanceVehicle({ambulance: true, type: 'van'}), true);
  assert.equal(seatedCabDriver({type: 'ambulance', ambulance: true}), null);
  assert.equal(travelActorAppearance({mode: 'car', car: {visual: {type: 'ambulance', ambulance: true}}}, {heading: 0, speed: 4}), null);
  assert.equal(travelActorAppearance({mode: 'car', car: {visual: {ambulance: true, type: 'van'}}}, {heading: 0}), null);
  assert.equal(travelActorAppearance({mode: 'bike'}, {heading: 0, speed: 3}).pose, 'cycle');
  assert.equal(travelActorAppearance({mode: 'motorbike'}, {heading: 0, speed: 3}).pose, 'cycle');
  assert.equal(travelActorAppearance({mode: 'scooter'}, {heading: 0, speed: 2}).pose, 'scooter');
  assert.equal(travelActorAppearance({mode: 'challenger'}, {heading: 0}), null);
  assert.equal(travelActorAppearance({mode: 'walk'}, {heading: 0, speed: 1}).pose, 'walk');

  const renderer = createPlayerTravelRenderer(new Group());
  const heads = () => renderer.group.getObjectByName('Person heads').count;
  const jackets = () => renderer.group.getObjectByName('Police patrol jackets').count;
  for (const type of ['gwagen', 'roadster', 'scala', 'x5']) {
    renderer.update(carTravel({type}), 1 / 60, {uniform: false});
    assert.equal(heads(), 1, `${type} driver is drawn`);
    assert.equal(jackets(), 0, `${type} stays civilian`);
    assert.notEqual(renderer.look.hairStyle, 'police');
  }
  renderer.update(carTravel({type: 'police', police: true, livery: 'praha', variant: 'estate'}), 1 / 60, {uniform: true});
  assert.equal(heads(), 1, 'Šlachta is drawn in the cruiser');
  assert.equal(jackets(), 1);
  assert.equal(renderer.look.uniform, 'jacket');
  assert.equal(renderer.look.hairStyle, OFFICER_LOOK.hairStyle);
  assert.equal(renderer.look.shirt, OFFICER_LOOK.shirt);
  renderer.update(carTravel({type: 'ambulance', ambulance: true}), 1 / 60, {uniform: false});
  assert.equal(heads(), 0, 'Filip in an ambulance leaves the cab empty');
  assert.equal(jackets(), 0);
  renderer.update(carTravel({type: 'gwagen'}), 1 / 60, {uniform: false});
  assert.equal(heads(), 1, 'Filip is visible again in the G-Wagen');
  assert.equal(travelActorAppearance(carTravel({type: 'gwagen'}), {x: 4, z: 8, heading: 0.4, speed: 7}).pose, 'drive');
});

test('occupied glass is see-through and traffic glass stays closed', () => withDocument(() => {
  const traffic = createVehicle(0, false, 'sedan');
  const player = createVehicle(0, true, 'sedan');
  revealCabinGlass(player);
  assert.equal(player.getObjectByName('glass').material.transparent, true);
  assert.ok(player.getObjectByName('glass').material.opacity < 0.4);
  assert.equal(player.getObjectByName('glass').material.depthWrite, false);
  assert.equal(traffic.getObjectByName('glass').material.transparent, false);
  assert.notEqual(player.getObjectByName('glass').material, traffic.getObjectByName('glass').material);
  const cars = createPlayerCarRenderer(new Scene());
  const scala = {x: 0, z: 0, heading: 0, speed: 0, steer: 0, visual: {type: 'scala'}};
  cars.sync({mode: 'car', homeCar: scala, car: scala, cars: [scala], actor: scala});
  cars.setLook('scala', '');
  const glass = cars.group.getObjectByName('glass');
  assert.equal(glass.material.transparent, true);
  const ambulance = createAmbulanceMesh();
  assert.equal(ambulance.getObjectByName('glass').material.transparent, false);
  let people = 0;
  ambulance.traverse((node) => { if (/person|driver|ped/i.test(node.name || '')) people += 1; });
  assert.equal(people, 0);
}));

test('remote drivers sit the same way, and a remote ambulance cab stays empty', () => withDocument(() => {
  const scene = new Scene();
  const remotes = createRemotePresence(scene);
  const base = {x: 12, z: -4, heading: 0.6, speed: 5, police: [], officers: [], arrest: null, siren: false, ambulances: []};
  remotes.update([
    {...base, uid: 'filip', name: 'Filip Turek', mode: 'car', vehicle: {type: 'gwagen', colour: '#111111'}},
  ], 1 / 30);
  const filip = scene.getObjectByName('remote-player-filip');
  assert.equal(filip.getObjectByName('Person heads').count, 1);
  assert.equal(filip.getObjectByName('Police patrol jackets').count, 0);
  assert.equal(filip.getObjectByName('glass').material.transparent, true);

  remotes.update([
    {...base, uid: 'slachta', name: 'Robert Šlachta', mode: 'car', vehicle: {type: 'police', police: true, livery: 'praha', variant: 'estate'}},
  ], 1 / 30);
  const slachta = scene.getObjectByName('remote-player-slachta');
  assert.equal(slachta.getObjectByName('Person heads').count, 1);
  assert.equal(slachta.getObjectByName('Police patrol jackets').count, 1);

  remotes.update([
    {...base, uid: 'dave', name: 'Dave N.', mode: 'car', vehicle: {type: 'police', police: true, livery: 'praha', variant: 'estate'}},
  ], 1 / 30);
  const dave = scene.getObjectByName('remote-player-dave');
  assert.equal(dave.getObjectByName('Person heads').count, 1);
  assert.equal(dave.getObjectByName('Police patrol jackets').count, 0);

  remotes.update([
    {...base, uid: 'filip-van', name: 'Filip Turek', mode: 'car', vehicle: {type: 'ambulance', ambulance: true}, ambulances: [{x: 30, z: 40, heading: 1}]},
  ], 1 / 30);
  const van = scene.getObjectByName('remote-player-filip-van');
  assert.equal(van.getObjectByName('Person heads'), undefined, 'Filip is not drawn in the ambulance');
  const ambulances = scene.children.filter((node) => node.name === 'van vehicle' && node.visible);
  assert.ok(ambulances.length >= 1);
  for (const mesh of ambulances) {
    assert.equal(mesh.getObjectByName('Person heads'), undefined);
    assert.equal(mesh.getObjectByName('glass').material.transparent, false);
  }
}));
