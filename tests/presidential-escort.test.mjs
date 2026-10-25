import test from 'node:test';
import assert from 'node:assert/strict';
import {ESCORT_SLOTS, escortServes, formationPoint, stepEscortUnit} from '../src/presidential-escort.js';

const rightOf = (leader, point) => {
  const s = Math.sin(leader.heading || 0);
  const c = Math.cos(leader.heading || 0);
  return (point.x - leader.x) * c - (point.z - leader.z) * s;
};
const behindOf = (leader, point) => {
  const s = Math.sin(leader.heading || 0);
  const c = Math.cos(leader.heading || 0);
  return (point.x - leader.x) * s + (point.z - leader.z) * c;
};

test('the escort is two police motorbikes and one helicopter, and only Petr Pavel gets it', () => {
  assert.equal(ESCORT_SLOTS.filter((slot) => slot.kind === 'motorbike').length, 2);
  assert.equal(ESCORT_SLOTS.filter((slot) => slot.kind === 'helicopter').length, 1);
  assert.equal(escortServes({id: 'pavel'}), true);
  assert.equal(escortServes('pavel'), true);
  for (const id of ['elon', 'filip', 'dave', 'hrib', 'slachta', 'zeman', 'kraus']) assert.equal(escortServes({id}), false);
  assert.equal(escortServes(null), false);
  assert.equal(escortServes({id: 'pavlova'}), false);
});

test('bikes flank behind the leader and the helicopter holds above that trail', () => {
  const leader = {x: 12, z: -6, heading: 0.8};
  const [left, right, heli] = ESCORT_SLOTS.map((slot) => formationPoint(leader, slot));
  assert.ok(behindOf(leader, left) > 0.6);
  assert.ok(behindOf(leader, right) > 1);
  assert.ok(rightOf(leader, left) < -1);
  assert.ok(rightOf(leader, right) > 1);
  assert.ok(behindOf(leader, heli) > behindOf(leader, right));
  assert.equal(heli.heading, leader.heading);
  assert.ok(ESCORT_SLOTS[2].altitude > 5);
  const gap = Math.hypot(left.x - right.x, left.z - right.z);
  assert.ok(gap > 2.5 && gap < 6, `bikes stay apart (${gap})`);
});

test('units catch a moving leader and snap when the street changes under them', () => {
  const slot = ESCORT_SLOTS[0];
  const leader = {x: 0, z: 0, heading: 0.4};
  const start = formationPoint(leader, slot);
  const unit = {x: start.x, z: start.z, y: 0, heading: leader.heading, placed: true, distance: 0, roll: 0, pitch: 0};
  for (let i = 0; i < 50; i++) {
    leader.x -= Math.sin(leader.heading) * 0.5;
    leader.z -= Math.cos(leader.heading) * 0.5;
    leader.heading += 0.02;
    stepEscortUnit(unit, {...formationPoint(leader, slot), y: 0}, 0.05, {catchRate: 8, snapDistance: 42});
  }
  const tracked = formationPoint(leader, slot);
  const gap = Math.hypot(unit.x - tracked.x, unit.z - tracked.z);
  assert.ok(gap < 2.5, `still with the leader (${gap})`);
  leader.x += 200;
  const jumped = formationPoint(leader, slot);
  stepEscortUnit(unit, {...jumped, y: 4}, 0.016, {snapDistance: 42});
  assert.equal(unit.x, jumped.x);
  assert.equal(unit.z, jumped.z);
  assert.equal(unit.y, 4);
});

test('a hidden escort appears on the slot instead of easing in from the origin', () => {
  const slot = ESCORT_SLOTS[2];
  const leader = {x: -1705, z: -154, heading: -0.42};
  const unit = {x: 0, z: 0, y: 0, heading: 0, placed: false, distance: 0, roll: 1, pitch: 1};
  const target = {...formationPoint(leader, slot), y: 12};
  stepEscortUnit(unit, target, 0.016);
  assert.equal(unit.x, target.x);
  assert.equal(unit.z, target.z);
  assert.equal(unit.roll, 0);
  assert.equal(unit.placed, true);
});
