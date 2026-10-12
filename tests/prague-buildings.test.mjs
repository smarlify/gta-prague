import test from 'node:test';
import assert from 'node:assert/strict';
import {buildingsFromNode, decodeI3sGeometry, lonLatFromMercator} from '../scripts/prague-buildings.mjs';

function pack(positions, features) {
  const vertexCount = positions.length / 3;
  const buf = Buffer.alloc(8 + vertexCount * 36 + features.length * 16);
  buf.writeUInt32LE(vertexCount, 0);
  buf.writeUInt32LE(features.length, 4);
  positions.forEach((value, i) => buf.writeFloatLE(value, 8 + i * 4));
  const featuresAt = 8 + vertexCount * 36;
  const rangesAt = featuresAt + features.length * 8;
  features.forEach((feature, i) => {
    buf.writeBigUInt64LE(BigInt(feature.id), featuresAt + i * 8);
    buf.writeUInt32LE(feature.first, rangesAt + i * 8);
    buf.writeUInt32LE(feature.last, rangesAt + i * 8 + 4);
  });
  return buf;
}

test('Web Mercator round-trips the Prague origin', () => {
  const [lon, lat] = [14.42125, 50.08747];
  const x = lon * Math.PI / 180 * 6378137;
  const y = Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) * 6378137;
  const [backLon, backLat] = lonLatFromMercator(x, y);
  assert.ok(Math.abs(backLon - lon) < 1e-9);
  assert.ok(Math.abs(backLat - lat) < 1e-9);
});

test('an I3S node becomes building shells sitting on the supplied ground', () => {
  const center = [1_605_000, 6_461_000, 190];
  const geometry = decodeI3sGeometry(pack(
    [0, 0, 10, 4, 0, 10, 0, 3, 18, 10, 0, 5, 14, 0, 5, 10, 2, 9],
    [{id: 7, first: 0, last: 0}, {id: 8, first: 1, last: 1}]
  ));
  assert.equal(geometry.features.length, 2);
  assert.deepEqual(geometry.features.map(feature => [feature.start, feature.count]), [[0, 3], [3, 3]]);
  const buildings = buildingsFromNode({
    geometry,
    center,
    project: (mx, my) => [mx - center[0], -(my - center[1])],
    extent: 100,
    elevationAt: () => 200
  });
  assert.equal(buildings.length, 2);
  assert.equal(buildings[0].id, 'ipr-7');
  assert.equal(buildings[0].height, 8);
  assert.equal(buildings[0].verts[1], 0);
  assert.equal(buildings[0].verts[6], 0);
  assert.equal(buildings[0].verts[11], 8);
  assert.equal(buildings[1].height, 4);
});

test('buildings outside the playable square are dropped', () => {
  const geometry = decodeI3sGeometry(pack([0, 0, 10, 1, 0, 10, 0, 1, 12], [{id: 1, first: 0, last: 0}]));
  const buildings = buildingsFromNode({
    geometry,
    center: [0, 0, 0],
    project: () => [5000, 5000],
    extent: 100,
    elevationAt: () => 0
  });
  assert.deepEqual(buildings, []);
});

test('a compressed mesh is refused instead of being read as floats', () => {
  assert.throws(() => decodeI3sGeometry(Buffer.from([1, 0, 0, 0, 1, 0, 0, 0, 9])), /uncompressed/);
});
