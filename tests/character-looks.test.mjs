import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {Box3, Group, Scene} from 'three';
import {createPersonBatch} from '../src/person-model.js';
import {
  GENERIC_JACKET,
  ZEMAN_BOAT,
  applyCharacterLook,
  characterLook,
  genericPlayerLook,
} from '../src/character-looks.js';
import {
  SEATED_DRIVE_POSE,
  createPlayerTravelRenderer,
  dressPlayerLook,
  seatedCabDriver,
} from '../src/player-travel-renderer.js';
import {
  CHALLENGER_HULL_BOTTOM,
  CHALLENGER_TUBE_BOTTOM,
  challengerWaterY,
  createChallenger,
  riverSurfaceY,
} from '../src/player-ride-models.js';
import {OFFICER_LOOK} from '../src/roadblock.js';
import {decodeTerrain, setTerrain, terrain} from '../src/terrain.js';
import {VLTAVA_START} from '../src/driver-starts.js';
import {buildPresence, parsePresence} from '../src/net/protocol.js';
import {createRemotePresence} from '../src/net/remote-presence.js';

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
  globalThis.document = {createElement: () => ({getContext: () => ctx, width: 512, height: 128})};
  try { return run(); } finally {
    if (original === undefined) delete globalThis.document;
    else globalThis.document = original;
  }
}

function gearCount(id) {
  const batch = createPersonBatch(1);
  const look = characterLook(id);
  batch.begin();
  batch.draw({x: 0, z: 0, heading: 0, speed: 0, pose: 'walk', groundY: 0.12}, look, {});
  batch.end();
  return batch.meshes.bag.count;
}

test('each listed driver has one build, hair, glasses, and jacket', () => {
  const filip = characterLook('filip');
  assert.equal(filip.body, 1.14);
  assert.equal(filip.hair, '#1d1a18');
  assert.equal(filip.hairStyle, 'short');
  assert.equal(filip.glasses, 'sun');
  assert.equal(filip.shirt, '#1c1d20');
  assert.equal(filip.beard, false);

  const elon = characterLook('elon');
  assert.equal(elon.body, 0.84);
  assert.equal(elon.hair, '#5a4030');
  assert.equal(elon.hairStyle, 'short');
  assert.equal(elon.glasses, null);
  assert.equal(elon.shirt, '#141518');
  assert.ok(elon.body < filip.body);

  const hrib = characterLook('hrib');
  assert.equal(hrib.body, 1);
  assert.equal(hrib.hair, '#5a4030');
  assert.equal(hrib.hairStyle, 'short');
  assert.equal(hrib.glasses, 'frame');
  assert.equal(hrib.shirt, '#1f2a3a');

  const pavel = characterLook('pavel');
  assert.equal(pavel.height, 1.92);
  assert.equal(pavel.body, 1.16);
  assert.equal(pavel.hair, '#9a958e');
  assert.equal(pavel.hairStyle, 'short');
  assert.equal(pavel.glasses, null);
  assert.equal(pavel.shirt, '#1c1d20');
  assert.ok(pavel.height > filip.height);

  const kraus = characterLook('kraus');
  assert.equal(kraus.body, 1);
  assert.equal(kraus.hair, '#9a958e');
  assert.equal(kraus.hairStyle, 'short');
  assert.equal(kraus.glasses, 'frame');
  assert.equal(kraus.shirt, '#243044');

  assert.ok(gearCount('filip') >= 3, 'sunglasses are thin pieces on the head');
  assert.equal(gearCount('elon'), 0, 'Elon has no glasses and no beard');
  assert.ok(gearCount('hrib') >= 5);
  assert.ok(gearCount('kraus') >= 5);
  assert.equal(gearCount('pavel'), 0);
});

test('Dave has a beard, a light blue shirt, a beige jacket, and is not the orange rider', () => {
  const dave = characterLook('dave');
  const generic = genericPlayerLook();
  assert.equal(dave.beard, true);
  assert.equal(dave.glasses, null);
  assert.equal(dave.shirt, '#8eb6d9');
  assert.equal(dave.jacket, '#c4a574');
  assert.equal(dave.hair, '#3b2a20');
  assert.equal(dave.hairStyle, 'fade');
  assert.equal(dave.skin, '#e8bf9e');
  assert.equal(dave.height, 1.75);
  assert.equal(dave.body, 1.06);
  assert.ok(dave.body > characterLook('elon').body);
  assert.equal(dave.bagType, null);
  assert.notEqual(dave.shirt, GENERIC_JACKET);
  assert.notEqual(dave.shirt, generic.shirt);
  assert.equal(generic.shirt, GENERIC_JACKET);
  assert.equal(generic.hairStyle, 'short');
  assert.equal(generic.bagType, 'backpack');
  assert.equal(generic.beard, false);
  assert.ok(gearCount('dave') >= 3, 'beard flag and open shirt are drawn');
});

test('Zeman on foot stays generic, and the boat figure has grey hair, glasses, and a dark jacket', () => withDocument(() => {
  const standing = characterLook('zeman');
  const generic = characterLook('nobody');
  assert.equal(standing.shirt, GENERIC_JACKET);
  assert.equal(standing.hairStyle, 'short');
  assert.equal(standing.bagType, 'backpack');
  assert.equal(standing.beard, false);
  assert.equal(standing.glasses, null);
  assert.equal(standing.height, generic.height);
  assert.equal(standing.body, generic.body);

  const boat = createChallenger();
  boat.root.updateMatrixWorld(true);
  const hull = new Box3().setFromObject(boat.root.getObjectByName('hull'));
  const head = new Box3().setFromObject(boat.root.getObjectByName('head'));
  assert.ok(head.min.y > hull.max.y + 0.2, 'the head is above the hull, not a speck inside it');
  assert.equal(boat.root.getObjectByName('hair').material.color.getHexString(), ZEMAN_BOAT.hair.slice(1));
  assert.ok(boat.root.getObjectByName('glasses'));
  assert.equal(boat.root.getObjectByName('torso').material.color.getHexString(), ZEMAN_BOAT.jacket.slice(1));
  assert.ok(boat.root.getObjectByName('belly'));
  assert.ok(boat.root.getObjectByName('torso').rotation.x < -0.8, 'he stays reclined');
  assert.ok(boat.root.getObjectByName('paddle'));
  boat.dispose();
}));

test('the Challenger hull meets the Vltava and the ring stays above it', () => {
  const previous = terrain();
  let surface;
  let y;
  try {
    setTerrain(decodeTerrain(gunzipSync(readFileSync('public/cities/prague/terrain.pack'))));
    surface = riverSurfaceY(VLTAVA_START.x, VLTAVA_START.z);
    y = challengerWaterY(VLTAVA_START.x, VLTAVA_START.z);
  } finally {
    setTerrain(previous);
  }
  assert.ok(surface < -4, 'the Vltava mesh is the dropped river, not the harbour line');
  assert.ok(Math.abs(y + CHALLENGER_HULL_BOTTOM - surface) < 1e-6, 'no air gap under the hull');
  assert.ok(y + CHALLENGER_TUBE_BOTTOM > surface + 0.15, 'the ring is not sunk');
});

test('Šlachta keeps the police uniform on, with his build and dark hair underneath', () => {
  const look = characterLook('slachta');
  const saved = Object.fromEntries(Object.keys(OFFICER_LOOK).map((key) => [key, look[key]]));
  assert.equal(look.body, 1.14);
  assert.equal(look.hair, '#1d1a18');
  assert.equal(look.hairStyle, 'short');
  assert.equal(look.glasses, null);
  dressPlayerLook(look, saved, true);
  for (const key of Object.keys(OFFICER_LOOK)) assert.equal(look[key], OFFICER_LOOK[key], key);
  assert.equal(look.body, 1.14);
  assert.equal(look.hair, '#1d1a18');
  assert.equal(look.hairPeek, true);
  assert.equal(look.shirt, OFFICER_LOOK.shirt);
  assert.equal(look.hairStyle, 'police');
});

test('a seated driver still uses drive, and an ambulance cab stays empty', () => {
  for (const type of ['gwagen', 'roadster', 'scala', 'x5', 'police']) {
    const seat = seatedCabDriver({type, police: type === 'police'});
    assert.equal(seat.pose, SEATED_DRIVE_POSE);
    assert.equal(seat.pose, 'drive');
    assert.notEqual(seat.pose, 'hail');
  }
  assert.equal(seatedCabDriver({type: 'ambulance', ambulance: true}), null);
});

test('the same character id paints the local ped and the remote copy', () => withDocument(() => {
  const renderer = createPlayerTravelRenderer(new Group());
  renderer.setCharacter('dave');
  assert.equal(renderer.look.beard, true);
  assert.equal(renderer.look.shirt, '#8eb6d9');
  assert.equal(renderer.look.jacket, '#c4a574');
  renderer.setCharacter('zeman');
  assert.equal(renderer.look.shirt, GENERIC_JACKET);
  assert.equal(renderer.look.beard, false);
  renderer.setCharacter('filip');
  const travel = {mode: 'car', rides: [], car: {visual: {type: 'gwagen'}}, viewActor: () => ({x: 1, z: 2, heading: 0.2, speed: 4, distance: 1})};
  renderer.update(travel, 1 / 60, {uniform: false});
  assert.equal(renderer.look.glasses, 'sun');
  assert.notEqual(renderer.look.hairStyle, 'police');
  assert.equal(renderer.group.getObjectByName('Person heads').count, 1);

  const row = buildPresence({uid: 'tab-dave', name: 'Dave N.', character: 'dave', mode: 'walk', x: 1, z: 2});
  assert.equal(row.character, 'dave');
  assert.equal(parsePresence(row).character, 'dave');
  assert.equal(buildPresence({uid: 'tab', name: 'Dave N.', character: 'not-a-secret', mode: 'walk', x: 0, z: 0}).character, '');

  const scene = new Scene();
  const remotes = createRemotePresence(scene);
  const base = {x: 3, z: 4, heading: 0, speed: 0, police: [], officers: [], arrest: null, siren: false, ambulances: []};
  remotes.update([
    {...base, uid: 'a', name: 'Dave N.', character: 'dave', mode: 'walk'},
    {...base, uid: 'b', name: 'Someone', character: 'dave', mode: 'walk', x: 8},
  ], 1 / 30);
  const colorOf = (uid) => {
    const mesh = scene.getObjectByName(`remote-player-${uid}`).getObjectByName('Person torsos and jackets');
    return [mesh.instanceColor.getX(0), mesh.instanceColor.getY(0), mesh.instanceColor.getZ(0)];
  };
  const daveColor = colorOf('a');
  assert.deepEqual(daveColor, colorOf('b'));
  remotes.update([{...base, uid: 'plain', name: 'Walker', mode: 'walk', x: 20}], 1 / 30);
  assert.notDeepEqual(colorOf('plain'), daveColor);

  remotes.update([{...base, uid: 'officer', name: 'Robert Šlachta', character: 'slachta', mode: 'walk', x: 30}], 1 / 30);
  const officer = scene.getObjectByName('remote-player-officer');
  assert.equal(officer.getObjectByName('Police patrol jackets').count, 1);
  assert.equal(officer.getObjectByName('Person heads').count, 1);

  remotes.update([{
    ...base,
    uid: 'boat',
    name: 'Miloš Zeman',
    character: 'zeman',
    mode: 'challenger',
    x: 40,
  }], 1 / 30);
  const boat = scene.getObjectByName('remote-player-boat');
  assert.equal(boat.getObjectByName('Person heads'), undefined);
  assert.ok(boat.getObjectByName('hair'));
  assert.ok(boat.getObjectByName('glasses'));
}));

test('boot creates the travel renderer before the welcome picker paints it', () => {
  const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const renderer = source.indexOf('const travelRenderer=createPlayerTravelRenderer(scene);');
  const picker = source.indexOf('bindCharacterPicker({initial:chosenCharacter.id,onChange:rememberCharacter});');
  assert.notEqual(renderer, -1);
  assert.notEqual(picker, -1);
  // bindCharacterPicker calls onChange before it returns. That calls
  // travelRenderer.setCharacter, which throws if the const is still in the temporal dead zone.
  assert.ok(renderer < picker);
});

test('applyCharacterLook does not keep the previous beard or glasses', () => {
  const look = characterLook('dave');
  applyCharacterLook(look, 'elon');
  assert.equal(look.beard, false);
  assert.equal(look.glasses, null);
  assert.equal(look.jacket, null);
  assert.equal(look.shirt, '#141518');
  applyCharacterLook(look, 'hrib');
  assert.equal(look.glasses, 'frame');
  assert.equal(look.beard, false);
});
