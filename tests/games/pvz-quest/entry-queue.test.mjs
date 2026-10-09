import assert from 'node:assert/strict';
import test from 'node:test';
import { queueZombieEntry, releaseZombieEntries, isWaitingZombie, isCombatUnit, zombieEntryQueueCounts } from '../../../public/games/pvz-quest/classroom/entry-queue.js';

const zombie = (id, row = 0, col = 7, extra = {}) => ({ id, row, col, hp: 270, side: 'zombies', ...extra });
function append(units, unit) { queueZombieEntry(units, unit); units.push(unit); return unit; }

test('only the first zombie in each lane enters, and later purchases remain FIFO regardless of id or speed', () => {
  const units = [];
  const first = append(units, zombie('unit-9', 0, 7, { move: .55 }));
  const second = append(units, zombie('unit-10', 0, 7, { move: 2 }));
  const third = append(units, zombie('unit-2'));
  assert.equal(isWaitingZombie(first), false);
  assert.equal(isWaitingZombie(second), true);
  assert.equal(isCombatUnit(third), false);
  assert.deepEqual(zombieEntryQueueCounts(units), [2, 0, 0, 0, 0]);
  first.col = 6.001;
  assert.equal(releaseZombieEntries(units).length, 0);
  first.col = 6;
  assert.deepEqual(releaseZombieEntries(units).map(unit => unit.id), ['unit-10']);
  assert.equal(isWaitingZombie(third), true);
  assert.equal(releaseZombieEntries(units).length, 0, 'Cannot release the whole queue in one call');
  second.col = 6;
  assert.deepEqual(releaseZombieEntries(units).map(unit => unit.id), ['unit-2']);
});

test('lane entrances are independent; only the waiting counts are exposed by the counter helper', () => {
  const units = [];
  for (let row = 0; row < 5; row += 1) {
    append(units, zombie(`first-${row}`, row)); append(units, zombie(`next-${row}`, row));
  }
  units.find(unit => unit.id === 'first-2').col = 6;
  assert.deepEqual(releaseZombieEntries(units).map(unit => unit.id), ['next-2']);
  assert.deepEqual(zombieEntryQueueCounts(units), [1, 1, 0, 1, 1]);
});

test('a defeated entrance zombie cannot hold up purchases, but a fresh purchase cannot jump an older queue', () => {
  const units = [];
  const first = append(units, zombie('first'));
  const older = append(units, zombie('older'));
  first.hp = 0;
  const fresh = append(units, zombie('fresh'));
  assert.equal(fresh.entryPending, true);
  const notified = [];
  releaseZombieEntries(units, unit => notified.push(unit.id));
  assert.deepEqual(notified, ['older']);
  assert.equal(older.entryPending, false);
  assert.equal(fresh.entryPending, true);
});

test('release resets the entrance position/credit, ignores dead waiters and leaves plants unchanged', () => {
  const plant = { side: 'plants', typeId: 'wallnut', row: 0, col: 6, hp: 4000 };
  const before = structuredClone(plant);
  queueZombieEntry([], plant);
  assert.deepEqual(plant, before);
  const dead = zombie('dead', 0, 7, { hp: 0, entryPending: true });
  const next = zombie('next', 0, 9, { entryPending: true, movementCredit: .8 });
  assert.deepEqual(releaseZombieEntries([plant, dead, next]).map(unit => unit.id), ['next']);
  assert.equal(next.col, 7);
  assert.equal(next.movementCredit, 0);
  assert.equal(isCombatUnit(plant), true);
  assert.deepEqual(zombieEntryQueueCounts([plant, dead, next]), [0, 0, 0, 0, 0]);
});
