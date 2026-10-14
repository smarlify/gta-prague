// A stopped patrol can be taken with F / Enter, the same way as traffic.
// Claiming it pulls the unit out of the chase so the police renderer drops the
// mesh; the player car is then drawn with createPoliceBody.

export function createPoliceCarSource(unit, { visual, claimUnit = () => {} } = {}) {
  return {
    id: `police-${unit.id}`,
    label: 'Police car',
    actor: unit,
    visual,
    allowStopped: true,
    canClaim() {
      return !unit.playerTaken && Math.abs(unit.speed || 0) <= 1.2 && (unit.edge != null || !!unit.parked);
    },
    claim() {
      if (!this.canClaim()) return false;
      unit.playerTaken = true;
      unit.speed = 0;
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
