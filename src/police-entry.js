import { trafficFootprintsOverlap } from './contact-geometry.js';

// A stopped patrol can be taken with F / Enter, the same way as traffic.
// Claiming it pulls the unit out of the chase so the police renderer drops the
// mesh; the player car is then drawn with createPoliceBody.

const FOOT = { halfWidth: 0.98, halfLength: 2.36 };

function poseAt(unit, x, z) {
  return { x, z, heading: unit.heading || 0, ...FOOT };
}

/**
 * Spawn the stolen car on the patrol, or one car-width aside when that spot
 * still overlaps the arrest cluster (the other player's car and the remaining
 * cruisers). Driving then starts in the clear instead of inside those bodies.
 */
export function clearStolenSpawn(unit, blockers = []) {
  const heading = unit.heading || 0;
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  const spots = [{ x: unit.x, z: unit.z }];
  for (const dist of [3.6, 5.2, 7]) {
    spots.push(
      { x: unit.x + c * dist, z: unit.z - s * dist },
      { x: unit.x - c * dist, z: unit.z + s * dist },
      { x: unit.x - s * dist, z: unit.z - c * dist },
      { x: unit.x + s * dist, z: unit.z + c * dist },
    );
  }
  const blocked = (spot) => blockers.some((body) => body && trafficFootprintsOverlap(poseAt(unit, spot.x, spot.z), body));
  return spots.find((spot) => !blocked(spot)) || spots[1];
}

export function createPoliceCarSource(unit, { visual, claimUnit = () => {}, blockers = () => [] } = {}) {
  return {
    id: `police-${unit.id}`,
    label: 'Police car',
    actor: unit,
    visual,
    allowStopped: true,
    blockers,
    canClaim() {
      return !unit.playerTaken && Math.abs(unit.speed || 0) <= 1.2 && (unit.edge != null || !!unit.parked);
    },
    claim() {
      if (!this.canClaim()) return false;
      const spot = clearStolenSpawn(unit, this.blockers?.() || []);
      unit.x = spot.x;
      unit.z = spot.z;
      unit.playerTaken = true;
      unit.speed = 0;
      unit.steer = 0;
      unit.edge = null;
      claimUnit(unit);
      return true;
    },
    release() {
      delete unit.playerTaken;
      return true;
    },
  };
}
