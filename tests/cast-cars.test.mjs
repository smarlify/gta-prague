import test from 'node:test';
import assert from 'node:assert/strict';
import {Box3, Vector3} from 'three';
import {createVehicle, animateVehicle} from '../src/vehicles.js';
import {CAR_TYPES, VEHICLE_TYPES, TRANSPORTER_PAINT, PANAMERA_PAINT, ES_PAINT, TUKTUK_PAINT, GWAGEN_PAINT, SCALA_PAINT, X5_PAINT, RAM_PAINT, ROADSTER_PAINT} from '../src/vehicle-models.js';
import {TRANSPORTER_LABEL, TRANSPORTER_LABEL_GREEN, TRANSPORTER_LABEL_PURPLE} from '../src/cast-cars.js';
import {CHARACTERS, characterById, resolveDriver} from '../src/character-select.js';
import {resolveDriverStart} from '../src/pavlova.js';
import {STRAKOVA_AKADEMIE, URAD_VLADY, VELVYSLANECTVI_JAPONSKA, XTV, VLTAVA_PRIVOZ, VLTAVA_START, waterStart} from '../src/driver-starts.js';
import {TRAVEL_MODES, isBoat, travelCollision, PlayerTravel, HIT_KIND} from '../src/player-travel.js';
import {createRideVehicle} from '../src/player-ride-models.js';
import {seatedCabDriver} from '../src/player-travel-renderer.js';
import {characterLook} from '../src/character-looks.js';
import {SpatialIndex} from '../src/geo.js';
import {makeCar} from '../src/physics.js';
import {TRAVEL_MODES_NET} from '../src/net/protocol.js';

const CAST = ['gwagen', 'scala', 'x5', 'ram', 'transporter', 'panamera', 'es', 'tuktuk'];
const stats = (model) => {
  let triangles = 0, meshes = 0;
  model.traverse((o) => {
    if (!o.isMesh) return;
    meshes += 1;
    triangles += o.geometry.index ? o.geometry.index.count / 3 : o.geometry.attributes.position.count / 3;
  });
  return {triangles, meshes};
};
const ctx = new Proxy({}, {get: () => () => {}, set: () => true});
function withDocument(run) {
  const original = globalThis.document;
  globalThis.document = {createElement: () => ({getContext: () => ctx, width: 256, height: 64})};
  try { return run(); } finally {
    if (original === undefined) delete globalThis.document;
    else globalThis.document = original;
  }
}

test('every named driver has a car type the game can build, or a ride', () => {
  for (const driver of CHARACTERS) {
    if (driver.ride || driver.police) continue;
    assert.ok(CAR_TYPES.includes(driver.type), `${driver.id} drives a known body`);
    assert.equal(VEHICLE_TYPES.includes(driver.type), false, `${driver.type} stays out of traffic`);
  }
  assert.equal(CAR_TYPES.length, new Set(CAR_TYPES).size);
});

test('each cast car is one mesh per finish plus its wheels, inside the triangle budget', () => {
  for (const type of CAST) {
    const model = createVehicle(0, true, type);
    const {triangles, meshes} = stats(model);
    assert.ok(triangles < 9000, `${type} is ${triangles} triangles`);
    assert.ok(meshes <= 20, `${type} is ${meshes} meshes`);
    assert.equal(model.userData.wheels.length, 4, type);
    assert.equal(model.children[4].name, 'body', `${type}: body follows the four wheel pivots`);
    for (const name of ['paint', 'glass', 'head', 'tail']) assert.ok(model.getObjectByName(name), `${type} has a ${name} mesh`);
    assert.ok(model.getObjectByName('head-beams'), `${type} keeps headlights`);
    assert.ok(model.userData.head && model.userData.tail, type);
    const size = new Box3().setFromObject(model).getSize(new Vector3());
    const spec = model.userData.spec;
    assert.ok(Math.abs(size.z - spec.l) < 0.45, `${type} length ${size.z} vs ${spec.l}`);
    assert.ok(size.y > spec.h - 0.12 && size.y < spec.h + 0.2, `${type} height ${size.y} vs ${spec.h}`);
    animateVehicle(model, 8, 0.4, 1 / 60, false);
    assert.ok(model.userData.wheels[0].pivot.rotation.y > 0, `${type} steers its front wheel`);
    assert.equal(model.userData.wheels[1].pivot.rotation.y, 0, `${type} rear wheel does not steer`);
  }
});

test('wheels are single meshes, also on the traffic bodies', () => {
  for (const type of ['sedan', 'van', 'roadster', 'ram', 'scala']) {
    const model = createVehicle(0, false, type);
    for (const wheel of model.userData.wheels) {
      const meshes = wheel.spin.children.filter((o) => o.isMesh && o.name === 'wheel');
      assert.equal(meshes.length, 1, `${type} wheel is one mesh`);
      assert.ok(meshes[0].geometry.attributes.color, 'tyre and rim colours are baked into vertices');
    }
  }
  const a = createVehicle(0, false, 'sedan'), b = createVehicle(1, false, 'sedan');
  assert.equal(a.userData.wheels[0].spin.children[0].geometry, b.userData.wheels[0].spin.children[0].geometry, 'wheel geometry is shared');
});

test('the new cars carry their names, finishes and the Transporter slogan', () => {
  const expected = {
    transporter: ['Volkswagen Transporter', TRANSPORTER_PAINT],
    panamera: ['Porsche Panamera', PANAMERA_PAINT],
    es: ['Lexus ES 300h', ES_PAINT],
    tuktuk: ['Tuktuk', TUKTUK_PAINT],
  };
  for (const [type, [name, paint]] of Object.entries(expected)) {
    const model = createVehicle(0, true, type);
    assert.equal(model.name, name);
    assert.equal(model.userData.type, type);
    assert.equal(`#${model.getObjectByName('paint').material.color.getHexString()}`, paint);
    model.traverse((o) => assert.equal(/badge|logo|roundel/i.test(o.name), false, `${type} has no badge artwork`));
  }
  assert.equal(new Set([TRANSPORTER_PAINT, PANAMERA_PAINT, ES_PAINT, TUKTUK_PAINT, GWAGEN_PAINT, SCALA_PAINT, X5_PAINT, RAM_PAINT, ROADSTER_PAINT]).size, 9, 'every cast car has its own colour');
  assert.deepEqual(TRANSPORTER_LABEL, ['JEZDÍM NA NAFTU', 'NEPATŘÍM DO ŠROTU']);
  assert.equal(TRANSPORTER_LABEL_GREEN, '#39A935', 'Svobodní green');
  assert.equal(TRANSPORTER_LABEL_PURPLE, '#6B2D7B', 'Svobodní purple');
  const van = createVehicle(0, true, 'transporter');
  const labels = [];
  van.traverse((o) => { if (o.name === 'label') labels.push(o); });
  assert.equal(labels.length, 3, 'both flanks and the rear doors');
  assert.equal(van.getObjectByName('body').userData.label, 'JEZDÍM NA NAFTU – NEPATŘÍM DO ŠROTU');
  // Without a real canvas the texture is null and the label material falls back to green.
  assert.equal(`#${labels[0].material.color.getHexString().toUpperCase()}`, TRANSPORTER_LABEL_GREEN);
  const panamera = createVehicle(0, true, 'panamera').userData.spec, es = createVehicle(0, true, 'es').userData.spec;
  assert.ok(panamera.h < 1.45 && panamera.l > 5, 'long and low');
  assert.ok(es.l > 4.9 && es.h < 1.5);
});

test('the tuktuk has three wheels on four pivots', () => {
  const model = createVehicle(0, true, 'tuktuk');
  const real = model.userData.wheels.map((w) => w.spin.children.length);
  assert.deepEqual(real, [1, 1, 0, 1], 'front, left rear, empty slot, right rear');
  assert.equal(model.userData.wheels[0].pivot.position.x, 0, 'the front wheel is on the centre line');
  assert.ok(model.userData.wheels[1].pivot.position.x < 0 && model.userData.wheels[3].pivot.position.x > 0);
  assert.ok(model.getObjectByName('canopy'), 'canvas canopy');
  assert.equal(seatedCabDriver({type: 'tuktuk'}).x, 0, 'the driver sits in the middle');
  assert.ok(seatedCabDriver({type: 'transporter'}).z < -0.8, 'the van driver sits in the cab, not the load bay');
});

test('the five new drivers resolve to their vehicles, places and looks', () => {
  const cases = [
    ['vondracek', 'Libor Vondráček', 'transporter', 'Strakova akademie'],
    ['okamura', 'Tomio Okamura', 'tuktuk', 'Velvyslanectví Japonska'],
    ['xaver', 'Luboš Xaver Veselý', 'es', 'XTV'],
  ];
  const landmarks = [{name: 'Petřín', x: 0, z: 0}, {...URAD_VLADY}, {...STRAKOVA_AKADEMIE}, {...VELVYSLANECTVI_JAPONSKA}, {...XTV}];
  for (const [id, name, type, place] of cases) {
    const driver = resolveDriver(`?driver=${id}`);
    assert.equal(driver.name, name);
    assert.equal(driver.type, type);
    assert.equal(resolveDriverStart(landmarks, null, null, 'prague', driver, null).start.name, place);
    assert.ok(characterLook(id), `${id} has a likeness`);
  }
  const rajchl = characterById('rajchl');
  assert.equal(rajchl.type, 'panamera');
  assert.ok(characterLook('rajchl'));
  // Vondráček stands one van length behind Macinka, on the same quay and heading.
  const gap = Math.hypot(STRAKOVA_AKADEMIE.x - URAD_VLADY.x, STRAKOVA_AKADEMIE.z - URAD_VLADY.z);
  assert.ok(gap > 6.5 && gap < 9, `gap ${gap}`);
  assert.equal(STRAKOVA_AKADEMIE.heading, URAD_VLADY.heading);
  for (const place of [STRAKOVA_AKADEMIE, VELVYSLANECTVI_JAPONSKA, XTV, VLTAVA_PRIVOZ]) assert.ok(Math.hypot(place.x, place.z) < 2400, `${place.name} is inside the playable circle`);
});

test('Bartoš sails his own boat on his own reach of the Vltava', () => {
  const bartos = characterById('bartos'), zeman = characterById('zeman');
  assert.equal(bartos.ride, 'ferry');
  assert.equal(bartos.water, true);
  assert.equal(waterStart(bartos), VLTAVA_PRIVOZ);
  assert.equal(waterStart(zeman), VLTAVA_START);
  assert.equal(resolveDriverStart([], 'petrin', null, 'prague', bartos, null).start.name, 'Vltava – přívoz');
  assert.ok(Math.hypot(VLTAVA_PRIVOZ.x - VLTAVA_START.x, VLTAVA_PRIVOZ.z - VLTAVA_START.z) > 200, 'the two boats do not start on top of each other');
  assert.equal(isBoat('ferry'), true);
  assert.equal(isBoat('challenger'), true);
  assert.equal(isBoat('motorbike'), false);
  assert.ok(TRAVEL_MODES.ferry.halfLength > TRAVEL_MODES.challenger.halfLength);
  assert.ok(TRAVEL_MODES.ferry.speed < TRAVEL_MODES.challenger.speed);
  assert.equal(HIT_KIND.ferry, 'walker');
  assert.ok(TRAVEL_MODES_NET.includes('ferry'));

  const empty = new SpatialIndex([]);
  const river = {buildings: empty, roads: empty, pavement: empty, water: [{rings: [[[-40, -40], [40, -40], [40, 40], [-40, 40], [-40, -40]]]}]};
  const travel = new PlayerTravel(makeCar(0, 0), river, {ride: 'ferry'});
  assert.equal(travel.mode, 'ferry');
  assert.equal(travel.riding.visual.kind, 'ferry');
  assert.equal(travelCollision(travel.actor, 'ferry', river), null);
  assert.equal(travelCollision({x: 39.5, z: 0, heading: 0}, 'ferry', river), 'bank', 'the ferry stops at the bank');

  withDocument(() => {
    const boat = createRideVehicle({kind: 'ferry'}, 'ferry');
    assert.equal(boat.root.name, 'Přívoz');
    assert.equal(boat.root.userData.kind, 'ferry');
    assert.ok(boat.banner, 'the Jolly Roger flies from the mast');
    assert.ok(boat.root.getObjectByName('figure'), 'Bartoš is at the wheel');
    let locks = 0;
    boat.root.traverse((o) => { if (o.name === 'dreadlock') locks += 1; });
    assert.ok(locks >= 10, 'with his dreadlocks');
    assert.ok(stats(boat.root).triangles < 9000);
    const size = new Box3().setFromObject(boat.root).getSize(new Vector3());
    assert.ok(size.z > 6 && size.z < 7.2, `ferry length ${size.z}`);
    boat.banner.update(1 / 60, 3);
    boat.dispose();
    assert.equal(boat.root.parent, null);
  });
});
