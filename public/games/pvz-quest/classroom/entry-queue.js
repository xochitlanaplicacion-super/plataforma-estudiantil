/** One FIFO entrance per lane; waiting zombies are outside the battlefield.
 * Engines own their copied state before calling these small mutating helpers.
 * Array order is purchase/arrival order, independent of type, speed or id.
 */
export const ZOMBIE_ENTRY_COLUMN = 7;
export const ZOMBIE_ENTRY_GAP = 1;
const epsilon = 1e-8;
const livingZombie = unit => unit.side === 'zombies' && unit.hp > 0;
export const isWaitingZombie = unit => unit.side === 'zombies' && unit.entryPending === true;
export const isCombatUnit = unit => !isWaitingZombie(unit);

function entranceOccupied(units, row) {
  return units.some(unit => livingZombie(unit) && isCombatUnit(unit) && unit.row === row
    && unit.col > ZOMBIE_ENTRY_COLUMN - ZOMBIE_ENTRY_GAP + epsilon);
}

/** Call before appending a new unit. Older waiting arrivals always go first. */
export function queueZombieEntry(units, unit) {
  if (unit.side !== 'zombies') return unit;
  unit.entryPending = entranceOccupied(units, unit.row)
    || units.some(previous => livingZombie(previous) && isWaitingZombie(previous) && previous.row === unit.row);
  return unit;
}

/** Release at most one zombie per lane after the previous entrance is clear. */
export function releaseZombieEntries(units, onRelease = () => {}) {
  const released = [];
  for (let row = 0; row < 5; row += 1) {
    if (entranceOccupied(units, row)) continue;
    const next = units.find(unit => livingZombie(unit) && isWaitingZombie(unit) && unit.row === row);
    if (!next) continue;
    next.entryPending = false;
    next.col = ZOMBIE_ENTRY_COLUMN;
    next.movementCredit = 0;
    onRelease(next);
    released.push(next);
  }
  return released;
}

export function zombieEntryQueueCounts(units) {
  const counts = Array(5).fill(0);
  for (const unit of units) {
    if (livingZombie(unit) && isWaitingZombie(unit) && Number.isInteger(unit.row) && unit.row >= 0 && unit.row < 5) counts[unit.row] += 1;
  }
  return counts;
}
