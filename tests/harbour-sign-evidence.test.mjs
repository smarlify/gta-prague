import test from 'node:test';
import assert from 'node:assert/strict';
import {createHarbourSigns, OVERHEAD_TURN_SIGNS, SIGN_SUPPORTS} from '../src/harbour-signs.js';

test('Eteläranta photographed signs remain three left/right/right circles, not invented text boards', {skip:'Finland city is not part of this build'}, () => {
  assert.deepEqual(OVERHEAD_TURN_SIGNS.map(sign => sign.turn), ['left', 'right', 'right']);
  assert.ok(OVERHEAD_TURN_SIGNS.every(sign => !('text' in sign) && !('destination' in sign)));
  assert.ok(OVERHEAD_TURN_SIGNS.every((sign, i, signs) => i === 0 || sign.x > signs[i - 1].x));
  assert.ok(SIGN_SUPPORTS[0].x < OVERHEAD_TURN_SIGNS[0].x);
  assert.ok(SIGN_SUPPORTS.at(-1).x > OVERHEAD_TURN_SIGNS.at(-1).x);
});

test('observed suspended-sign geometry is finite, merged, and retains uncertainty metadata', {skip:'Finland city is not part of this build'}, () => {
  const signs = createHarbourSigns();
  assert.equal(signs.userData.count, 3);
  assert.equal(signs.userData.capture, '2024-08');
  assert.match(signs.userData.accuracy, /estimated/);
  assert.ok(signs.children.length <= 4, 'merge by material, not one draw per wire segment');
  for (const child of signs.children) {
    assert.ok(child.isMesh);
    assert.ok(Array.from(child.geometry.attributes.position.array).every(Number.isFinite));
    child.geometry.dispose();
    child.material.dispose();
  }
});
