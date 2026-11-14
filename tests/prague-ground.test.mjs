import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {SpatialIndex} from '../src/geo.js';
import {decodeTerrain, setTerrain, driveAt, groundAt, setDriveHeight} from '../src/terrain.js';
import {setGroundCeiling} from '../src/terrain-mesh.js';
import {blocksDriveSample, carSamples} from '../src/physics.js';
import {createBridgeDecks, createCorridors, openWays, isDeckSurface, setupPragueWorld} from '../src/prague-ground.js';

const rect = (x0, z0, x1, z1, extra = {}) => ({rings: [[[x0, z0], [x1, z0], [x1, z1], [x0, z1], [x0, z0]]], bbox: [x0, z0, x1, z1], ...extra});

test('only a mapped bridge is a deck; a street called "… most" keeps its ground', () => {
  assert.equal(isDeckSurface({kind: 'Ajorata (Silta)', name: 'most Legií'}), true);
  assert.equal(isDeckSurface({kind: 'Jalkakäytävä (Silta)'}), true);
  assert.equal(isDeckSurface({kind: 'junction', name: 'Prašný most'}), false);
  assert.equal(isDeckSurface({kind: 'Ajorata'}), false);
});

test('a bridge deck is flat across its width at the height of its centre line', () => {
  // A ridge along z = 0, 2 m high in the middle and falling to the river bed 6 m either side.
  const ridge = (x, z) => 2 - Math.min(1, Math.abs(z) / 6) * 7 + x * 0.01;
  const decks = createBridgeDecks([rect(0, -8, 100, 8, {kind: 'Ajorata (Silta)'})], {height: ridge});
  assert.equal(decks.heightAt(50, 20), null, 'off the bridge');
  for (const z of [-7, -4, 0, 3, 7]) {
    assert.ok(Math.abs(decks.heightAt(50, z) - ridge(50, 0)) < 0.12, `z ${z}: ${decks.heightAt(50, z)}`);
  }
  // Measured away from the end caps: within a deck's width of an end the cross-section may cut the
  // corner, which is harmless on a real bridge because its ends stand on level banks.
  assert.ok(Math.abs(decks.heightAt(80, 5) - decks.heightAt(25, 5) - 0.55) < 0.1, 'it still follows the ridge along its length');
  // The footway beside the carriageway shares the same deck.
  const joined = createBridgeDecks([rect(0, -5, 100, 5, {kind: 'Ajorata (Silta)'}), rect(0, 5, 100, 8, {kind: 'Jalkakäytävä (Silta)'})], {height: ridge});
  assert.ok(Math.abs(joined.heightAt(50, 7) - joined.heightAt(50, 0)) < 0.25, 'footway and road are level');
});

test('a footbridge the terrain never raised gets a straight deck between its ends', () => {
  const valley = (x) => (x < 10 || x > 90 ? 5 : -4);
  const decks = createBridgeDecks([rect(0, -2, 100, 2, {kind: 'Jalkakäytävä (Silta)'})], {height: valley});
  assert.ok(decks.heightAt(50, 0) > 4.5, `mid-span stands at bank height (${decks.heightAt(50, 0)})`);
});

test('where an unbaked overpass crosses a street, the street keeps its ground and the bridge ramps down', () => {
  const ground = () => 0;
  const high = (x, z) => (Math.abs(z) < 3 ? 6 : 0); // the bridge's own baked ridge, 6 m up
  const street = rect(40, -30, 60, 30, {kind: 'Ajorata'});
  const decks = createBridgeDecks([rect(0, -3, 100, 3, {kind: 'Erotettu pyörätie (Silta)'})], {height: (x, z) => (x > 40 && x < 60 ? ground() : high(x, z)), under: new SpatialIndex([street])});
  assert.ok(decks.heightAt(50, 0) < 0.5, 'on the street: ground');
  assert.ok(decks.heightAt(10, 0) > 5.5, 'away from it: the deck');
  const near = decks.heightAt(34, 0);
  assert.ok(near > 0.5 && near < 5.5, `ramping down beside the street (${near})`);
});

test('lanes keep a way open through a building footprint; posts stay solid', () => {
  const corridors = createCorridors([{edges: [{points: [[0, 0], [40, 0]]}], half: 2.3}]);
  assert.equal(corridors.at(20, 2), true);
  assert.equal(corridors.at(20, 3), false);
  assert.equal(corridors.at(43, 0), false);
  const building = rect(10, -10, 30, 10, {id: 'osm-way-1', height: 12});
  const post = rect(19, -0.2, 19.4, 0.2, {id: 'board-post-1'});
  const index = openWays(new SpatialIndex([building, post]), (x, z) => corridors.at(x, z));
  assert.equal(index.at(20, 1.5), undefined, 'the lane runs through the footprint');
  assert.equal(index.at(20, 6), building, 'beside the lane the wall is still there');
  assert.equal(index.at(19.2, 0), post, 'a post on the lane is still solid');
});

test('Prague: no walls or drops in the road, and no building across a lane', () => {
  const dir = 'public/cities/prague';
  setTerrain(decodeTerrain(gunzipSync(readFileSync(`${dir}/terrain.pack`))));
  try {
    const setup = setupPragueWorld(JSON.parse(gunzipSync(readFileSync(`${dir}/city.pack`))), JSON.parse(readFileSync(`${dir}/mobility.json`, 'utf8')));
    const world = setup.world();
    let steps = 0, worst = 0, blocked = 0, metres = 0;
    for (const edge of setup.mobility.roads.edges) {
      let previous = null;
      for (let i = 0; i < edge.points.length - 1; i++) {
        const [ax, az] = edge.points[i], [bx, bz] = edge.points[i + 1], length = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(length)), heading = Math.atan2(-(bx - ax), -(bz - az));
        for (let s = 0; s < n; s++) {
          const x = ax + (bx - ax) * s / n, z = az + (bz - az) * s / n;
          if (Math.hypot(x, z) > 2390) { previous = null; continue; }
          metres += length / n;
          const h = driveAt(x, z);
          if (previous !== null && Math.abs(h - previous) > 1) { steps++; worst = Math.max(worst, Math.abs(h - previous)); }
          previous = h;
          // Centre and the two front corners: a building across the lane, not a wall brushed at a dead end.
          if (blocksDriveSample(x, z, world)) blocked++;
        }
      }
    }
    assert.ok(metres > 300000, `walked ${Math.round(metres)} m of lane`);
    assert.ok(steps <= 3, `${steps} height steps over 1 m (worst ${worst.toFixed(2)} m); there were 269 before the decks`);
    assert.ok(worst < 1.5, `worst step ${worst.toFixed(2)} m`);
    assert.equal(blocked, 0, 'no lane centre line is inside a solid building');
    // The Vltava bridges stand at bank height, not lifted towards the nearest hill.
    for (const [name, x, z, low, high] of [['Čechův most', -300, -640, 0, 2.2], ['Štefánikův most', 405, -760, -1, 5], ['most Legií', -770, 683, 0.8, 2.2], ['Mánesův most', -600, -230, -0.5, 1.5]]) {
      const h = driveAt(x, z);
      assert.ok(h > low && h < high, `${name} deck at ${h.toFixed(2)} m`);
      assert.ok(Math.abs(h - groundAt(x, z)) < 1.2, `${name} follows the baked deck`);
    }
  } finally {
    setTerrain(null); setDriveHeight(null); setGroundCeiling(null);
  }
});
