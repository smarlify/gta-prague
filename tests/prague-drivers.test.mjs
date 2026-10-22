import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {SpatialIndex, pointInPolygon} from '../src/geo.js';
import {carSamples, makeCar} from '../src/physics.js';
import {characterById, resolveDriver} from '../src/character-select.js';
import {startCycleKey} from '../src/cities.js';
import {resolveDriverStart} from '../src/pavlova.js';
import {PlayerTravel, TRAVEL_MODES, travelCollision} from '../src/player-travel.js';
import {createMotorbike, createChallenger} from '../src/player-ride-models.js';
import {createVehicle, VEHICLE_TYPES} from '../src/vehicles.js';
import {
  ARREST_RANGE,
  CHASE_BEHIND,
  DIVADLO_BEZ_ZABRADLI,
  PRAZSKY_HRAD,
  VLTAVA_START,
  chaseBody,
  chasePlacement,
  slachtaArrest,
} from '../src/driver-starts.js';

const city = JSON.parse(gunzipSync(readFileSync('public/cities/prague/city.pack')));
const def = JSON.parse(readFileSync('cities/prague/city.json', 'utf8'));
const buildings = new SpatialIndex(city.buildings);
const roads = new SpatialIndex(city.roads);
const pavement = new SpatialIndex(city.pavement);
const byName = (name) => city.landmarks.find((l) => l.name === name);

function memoryStorage() {
  const data = new Map();
  return {
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(key, String(value)); },
  };
}

test('Pražský hrad is on U Prašného mostu, not the Hradčanská stop', () => {
  const stop = byName('Hradčanská');
  const road = roads.at(PRAZSKY_HRAD.x, PRAZSKY_HRAD.z);
  assert.equal(PRAZSKY_HRAD.district, 'Praha 1 - Hradčany');
  assert.equal(road?.name, 'U Prašného mostu');
  assert.equal(road?.kind, 'Ajorata');
  assert.equal(buildings.at(PRAZSKY_HRAD.x, PRAZSKY_HRAD.z), undefined);
  assert.ok(Math.hypot(PRAZSKY_HRAD.x - stop.x, PRAZSKY_HRAD.z - stop.z) > 400);
  assert.ok(carSamples(makeCar(PRAZSKY_HRAD.x, PRAZSKY_HRAD.z, PRAZSKY_HRAD.heading)).every(([x, z]) => roads.at(x, z)?.name === 'U Prašného mostu'));
});

test('the Vltava start is open water between Karlův most and Most Legií', () => {
  const karl = byName('Karlův most');
  const legii = byName('Most Legií');
  assert.equal(city.water.some((w) => pointInPolygon(VLTAVA_START.x, VLTAVA_START.z, w.rings)), true);
  assert.equal(roads.at(VLTAVA_START.x, VLTAVA_START.z), undefined);
  assert.equal(pavement.at(VLTAVA_START.x, VLTAVA_START.z), undefined);
  const span = Math.hypot(legii.x - karl.x, legii.z - karl.z);
  const along = ((VLTAVA_START.x - karl.x) * (legii.x - karl.x) + (VLTAVA_START.z - karl.z) * (legii.z - karl.z)) / (span * span);
  assert.ok(along > 0.25 && along < 0.75, `along the bridges at ${along}`);
  assert.ok(Math.hypot(VLTAVA_START.x - karl.x, VLTAVA_START.z - karl.z) > 40);
  assert.ok(Math.hypot(VLTAVA_START.x - legii.x, VLTAVA_START.z - legii.z) > 40);
});

test('Divadlo Bez zábradlí is on Jungmannova in front of Palác Adria', () => {
  const authored = def.starts.find((s) => s.name === 'Divadlo Bez zábradlí');
  const theatre = byName('Národní divadlo');
  const road = roads.at(DIVADLO_BEZ_ZABRADLI.x, DIVADLO_BEZ_ZABRADLI.z);
  assert.equal(authored.district, 'Praha 1 - Nové Město');
  assert.equal(authored.street, 'Jungmannova');
  assert.equal(DIVADLO_BEZ_ZABRADLI.name, 'Divadlo Bez zábradlí');
  assert.equal(road?.name, 'Jungmannova');
  assert.equal(road?.kind, 'Ajorata');
  assert.ok(DIVADLO_BEZ_ZABRADLI.x > theatre.x, 'east of Národní divadlo');
  assert.equal(buildings.at(DIVADLO_BEZ_ZABRADLI.x, DIVADLO_BEZ_ZABRADLI.z), undefined);
  assert.ok(carSamples(makeCar(DIVADLO_BEZ_ZABRADLI.x, DIVADLO_BEZ_ZABRADLI.z, DIVADLO_BEZ_ZABRADLI.heading)).every(([x, z]) => roads.at(x, z)?.name === 'Jungmannova'));
  const passage = city.pavement.find((p) => p.name === 'pasáž Adria');
  const [px, pz] = [(passage.bbox[0] + passage.bbox[2]) / 2, (passage.bbox[1] + passage.bbox[3]) / 2];
  assert.ok(Math.hypot(DIVADLO_BEZ_ZABRADLI.x - px, DIVADLO_BEZ_ZABRADLI.z - pz) < 40, 'on the street in front of the passage');
});

test('pinned drivers do not advance the start cycle, and start= still wins', () => {
  const landmarks = [
    {name: 'Národní muzeum', id: 'narodni-muzeum', heading: 1, x: 1, z: 1},
    {name: 'Petřín', heading: 2, x: 2, z: 2},
    {name: 'Letenské náměstí', heading: -1.3, x: 3, z: 3},
    {...PRAZSKY_HRAD},
    {...DIVADLO_BEZ_ZABRADLI},
  ];
  const storage = memoryStorage();
  storage.setItem(startCycleKey('prague'), '0');
  const expectName = {
    hrib: 'Letenské náměstí',
    pavel: 'Pražský hrad',
    slachta: 'Letenské náměstí',
    zeman: 'Vltava',
    kraus: 'Divadlo Bez zábradlí',
  };
  for (const [id, name] of Object.entries(expectName)) {
    const opened = resolveDriverStart(landmarks, null, storage, 'prague', characterById(id), null);
    assert.equal(opened.start.name, name, id);
    assert.equal(opened.pinned, false);
    assert.equal(storage.getItem(startCycleKey('prague')), '0', `${id} does not take a cycle step`);
  }
  const pinned = resolveDriverStart(landmarks, 'Petřín', storage, 'prague', characterById('kraus'), null);
  assert.equal(pinned.start.name, 'Petřín');
  assert.equal(pinned.pinned, true);
  assert.equal(storage.getItem(startCycleKey('prague')), '0');
  assert.equal(resolveDriverStart(landmarks, null, storage, 'prague', characterById('zeman'), null).start.water, true);
});

test('Pavel mounts the motorbike at the castle and Zeman mounts the boat on the Vltava', () => {
  const world = {buildings, roads, pavement, water: city.water};
  const castle = new PlayerTravel(makeCar(PRAZSKY_HRAD.x, PRAZSKY_HRAD.z, PRAZSKY_HRAD.heading), world, {ride: characterById('pavel').ride});
  assert.equal(castle.mode, 'motorbike');
  assert.equal(castle.riding.visual.kind, 'motorbike');
  assert.equal(roads.at(castle.actor.x, castle.actor.z)?.name, 'U Prašného mostu');
  assert.ok(Math.hypot(castle.car.x - castle.actor.x, castle.car.z - castle.actor.z) > 1);
  const river = new PlayerTravel(makeCar(VLTAVA_START.x, VLTAVA_START.z, VLTAVA_START.heading), world, {ride: characterById('zeman').ride});
  assert.equal(river.mode, 'challenger');
  assert.equal(river.riding.visual.kind, 'challenger');
  assert.equal(city.water.some((w) => pointInPolygon(river.actor.x, river.actor.z, w.rings)), true);
  assert.equal(city.water.some((w) => pointInPolygon(river.car.x, river.car.z, w.rings)), false);
  river.reset(makeCar(PRAZSKY_HRAD.x, PRAZSKY_HRAD.z, PRAZSKY_HRAD.heading), world, {ride: null});
  assert.equal(river.mode, 'car');
  assert.equal(river.riding, null);
  assert.equal(roads.at(river.actor.x, river.actor.z)?.name, 'U Prašného mostu');
});

test('the motorbike is its own ride, faster than the bicycle, with two wheels and no pedals', () => {
  assert.ok(TRAVEL_MODES.motorbike.speed > TRAVEL_MODES.bike.speed);
  const mesh = createMotorbike();
  const wheels = [];
  mesh.root.traverse((o) => { if (o.name === 'wheel') wheels.push(o); });
  assert.equal(mesh.root.userData.kind, 'motorbike');
  assert.equal(mesh.root.name, 'Player motorbike');
  assert.equal(wheels.length, 2);
  assert.equal(mesh.motion.pedals, undefined);
  mesh.dispose();
});

test('the Challenger stays in mapped water and stops at a bank', () => {
  if (!globalThis.document) {
    globalThis.document = {createElement: () => ({width: 512, height: 128, style: {}, getContext: () => new Proxy({}, {get: () => () => {}})})};
  }
  const ring = [[[-30, -30], [30, -30], [30, 30], [-30, 30], [-30, -30]]];
  const water = [{rings: ring, bbox: [-30, -30, 30, 30]}];
  const empty = new SpatialIndex([]);
  const open = {buildings: empty, roads: empty, pavement: empty, water};
  assert.equal(travelCollision({x: 0, z: 0, heading: 0}, 'challenger', open), null);
  const deck = {buildings: empty, roads: new SpatialIndex([{rings: ring, kind: 'Ajorata', bbox: [-30, -30, 30, 30]}]), pavement: empty, water};
  assert.equal(travelCollision({x: 0, z: 0, heading: 0}, 'challenger', deck), 'bank');
  assert.equal(travelCollision({x: 0, z: 0, heading: 0}, 'challenger', {...open, water: []}), 'bank');
  const boat = createChallenger();
  assert.equal(boat.root.userData.word, 'CHALLENGER');
  assert.equal(boat.root.getObjectByName('hull').material.color.getHexString(), '1a4f86');
  assert.equal(boat.root.getObjectByName('tube').material.color.getHexString(), 'f5c400');
  assert.ok(boat.root.getObjectByName('torso').rotation.x < -0.8);
  assert.ok(boat.root.getObjectByName('paddle'));
  boat.dispose();
});

test('Šlachta stays at Letná when no remote and no traffic exist yet', () => {
  const origin = {x: 10, z: 10};
  assert.equal(chaseBody(origin, {}), null);
  assert.equal(chaseBody(origin, {players: null, traffic: undefined}), null);
  assert.equal(chaseBody(origin, {players: {}, traffic: {cars: []}}), null);
  assert.equal(chaseBody(origin, {players: [{x: NaN, z: 1}], traffic: [{actor: null}, {actor: {x: NaN, z: 0}}]}), null);
  const remote = chaseBody(origin, {players: [{uid: 'ada', x: 40, z: 0}], traffic: [{actor: {x: 12, z: 10}}]});
  assert.equal(remote.kind, 'player');
  assert.equal(remote.body.uid, 'ada');
  const traffic = chaseBody(origin, {players: [], traffic: [{actor: {x: 80, z: 10}}, {actor: {x: 14, z: 12}}]});
  assert.equal(traffic.kind, 'traffic');
  assert.equal(traffic.body.x, 14);
  const opened = resolveDriverStart(
    [{name: 'Letenské náměstí', heading: -1.3, x: 3, z: 3}, {name: 'Petřín', heading: 2, x: 2, z: 2}],
    null,
    memoryStorage(),
    'prague',
    characterById('slachta'),
    null,
  );
  assert.equal(opened.start.name, 'Letenské náměstí');
});

test('Šlachta is placed behind a body, and only he arrests with the siren on', () => {
  const road = {
    name: 'Test',
    kind: 'Ajorata',
    bbox: [-20, -80, 60, 80],
    rings: [[[-20, -80], [60, -80], [60, 80], [-20, 80], [-20, -80]]],
  };
  const spot = chasePlacement({x: 20, z: 0, heading: 0, uid: 'ada'}, [road], new SpatialIndex([]));
  assert.ok(spot);
  assert.ok(Math.hypot(spot.x - 20, spot.z - 0) > CHASE_BEHIND * 0.4);
  assert.ok(spot.z > 10, 'the spot is behind a north-facing car');
  const actor = {x: 0, z: 0};
  const near = {uid: 'ada', x: 4, z: 3};
  const far = {uid: 'bo', x: 40, z: 0};
  const home = {characterId: 'slachta', siren: true, drivingHomePolice: true, actor, others: [near, far]};
  assert.equal(slachtaArrest(home).target, 'ada');
  assert.equal(slachtaArrest({...home, siren: false}), null);
  assert.equal(slachtaArrest({...home, characterId: 'filip'}), null);
  assert.equal(slachtaArrest({...home, drivingHomePolice: false}), null);
  assert.equal(slachtaArrest({...home, others: [far]}), null);
  assert.equal(ARREST_RANGE, 8);
});

test('the X5 is a dark rounded SUV kept out of traffic', () => {
  assert.equal(VEHICLE_TYPES.includes('x5'), false);
  const model = createVehicle(0, true, 'x5');
  const g = createVehicle(0, true, 'gwagen');
  assert.equal(model.name, 'BMW X5');
  assert.equal(model.userData.type, 'x5');
  assert.notEqual(model.userData.spec.boxy, true);
  assert.equal(g.userData.spec.boxy, true);
  assert.ok(model.userData.spec.h > 1.6 && model.userData.spec.h < g.userData.spec.h);
  assert.ok(model.userData.spec.l > 4.7);
  const kidneys = [];
  model.traverse((o) => {
    if (o.name === 'kidney') kidneys.push(o);
    assert.notEqual(o.name, 'bmw-badge');
    assert.notEqual(o.name, 'roundel');
  });
  assert.ok(kidneys.length >= 2);
  const paint = Number.parseInt(model.getObjectByName('paint').material.color.getHexString(), 16);
  assert.ok(paint < 0x333333, 'dark paint');
  assert.equal(resolveDriver('?driver=kraus', memoryStorage()).type, 'x5');
});
