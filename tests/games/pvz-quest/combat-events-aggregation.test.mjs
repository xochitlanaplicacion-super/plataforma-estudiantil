import test from 'node:test';
import assert from 'node:assert/strict';
import { compactCombatEvents } from '../../../public/games/pvz-quest/classroom/combat-events.js';

const compact = (events, limit = 200) => compactCombatEvents(events, limit, { aggregateDamage: true });

test('aggregation is opt-in and retains the existing second-argument numerical limit', () => {
  const small = [{ type: 'damage', unitId: 'nut', amount: 4 }, { type: 'damage', unitId: 'nut', amount: 4 }];
  assert.equal(compactCombatEvents(small), small);
  assert.equal(compactCombatEvents(small, 200, { aggregateDamage: false }), small);
  assert.equal(compactCombatEvents(small, 1).length, 1);
  assert.equal(compact(small, 1).length, 1);
  assert.equal(compact(small, 1)[0].amount, 8);
});

test('damage pulses sum exactly by target, keep the latest location and preserve a single attacker identity', () => {
  const events = [
    { type: 'damage', unitId: 'nut', side: 'plants', row: 0, col: 4, amount: 4, sourceId: 'common' },
    { type: 'damage', unitId: 'pea', side: 'plants', row: 1, col: 2, amount: 4, sourceId: 'cone' },
    { type: 'damage', unitId: 'nut', side: 'plants', row: 0, col: 3.9, amount: 3, sourceId: 'common' },
  ];
  const original = structuredClone(events), result = compact(events);
  assert.deepEqual(result.map(event => [event.unitId, event.amount]), [['nut', 7], ['pea', 4]]);
  assert.equal(result[0].row, 0);
  assert.equal(result[0].col, 3.9);
  assert.equal(result[0].sourceId, 'common');
  assert.deepEqual(events, original);
});

test('merged damage and bites from multiple attackers never retain a misleading last source', () => {
  const result = compact([
    { type: 'bite', targetId: 'nut', sourceId: 'zombie-a', row: 2, col: 4 },
    { type: 'damage', unitId: 'nut', sourceId: 'zombie-a', amount: 4, row: 2, col: 4 },
    { type: 'bite', targetId: 'nut', sourceId: 'zombie-b', row: 2, col: 3.8 },
    { type: 'damage', unitId: 'nut', sourceId: 'zombie-b', amount: 4, row: 2, col: 3.8 },
  ]);
  assert.equal(result.length, 2);
  assert.equal(result[0].type, 'bite');
  assert.equal(result[0].sourceId, null);
  assert.equal(result[0].targetId, 'nut');
  assert.equal(result[0].col, 3.8);
  assert.equal(result[1].amount, 8);
  assert.equal(result[1].sourceId, null);
});

test('repeated compaction includes new damage exactly once and does not mutate earlier batches', () => {
  const first = compact([
    { type: 'damage', unitId: 'nut', amount: 4, sourceId: 'a' },
    { type: 'damage', unitId: 'nut', amount: 4, sourceId: 'a' },
  ]);
  const before = structuredClone(first);
  const next = compact([...first, { type: 'damage', unitId: 'nut', amount: 4, sourceId: 'b' }]);
  assert.equal(next[0].amount, 12);
  assert.equal(next[0].sourceId, null);
  assert.deepEqual(first, before);
});

test('death, redeployment and wave transitions separate damage and bites from different visual spans', () => {
  for (const barrier of ['defeat', 'death', 'deployment', 'deploy', 'wave', 'wave-start', 'wave-ending', 'tactical', 'closing', 'finished', 'mower', 'invasion']) {
    const marker = { type: barrier, unitId: 'nut', row: 0 };
    const events = [
      { type: 'bite', targetId: 'nut', sourceId: 'a', row: 0 },
      { type: 'damage', unitId: 'nut', amount: 4, sourceId: 'a', row: 0 },
      marker,
      { type: 'bite', targetId: 'nut', sourceId: 'b', row: 0 },
      { type: 'damage', unitId: 'nut', amount: 7, sourceId: 'b', row: 0 },
    ];
    assert.deepEqual(compact(events), events, barrier);
    assert.equal(compact(events)[2], marker);
  }
});

test('shots, freezes, sun rewards and deaths remain distinct and ordered', () => {
  const events = [
    { type: 'shot', sourceId: 'pea', row: 0 }, { type: 'shot', sourceId: 'pea', row: 0 },
    { type: 'freeze', targetId: 'zombie', row: 0 }, { type: 'freeze', targetId: 'zombie', row: 0 },
    { type: 'sun', unitId: 'flower', amount: 25, row: 0 }, { type: 'sun', unitId: 'flower', amount: 25, row: 0 },
    { type: 'defeat', unitId: 'a', row: 0 }, { type: 'defeat', unitId: 'b', row: 0 },
  ];
  assert.deepEqual(compact(events), events);
  for (const [index, event] of compact(events).entries()) assert.equal(event, events[index]);
});

test('unknown targets and malformed damage amounts are never accidentally combined', () => {
  const events = [
    { type: 'damage', amount: 4 }, { type: 'damage', amount: 4 },
    { type: 'damage', unitId: 'nut' }, { type: 'damage', unitId: 'nut', amount: NaN },
    { type: 'bite', sourceId: 'a' }, { type: 'bite', sourceId: 'b' },
  ];
  assert.deepEqual(compact(events), events);
});

test('an extreme horde becomes one bite and one exact damage total per affected plant', () => {
  const events = [];
  for (let pulse = 0; pulse < 6; pulse += 1) {
    for (let zombie = 0; zombie < 200; zombie += 1) {
      const target = `plant-${zombie % 5}`;
      events.push({ type: 'bite', sourceId: `zombie-${zombie}`, targetId: target, row: zombie % 5, col: 4 });
      events.push({ type: 'damage', sourceId: `zombie-${zombie}`, unitId: target, amount: 4, row: zombie % 5, col: 4 });
    }
  }
  const result = compact(events);
  assert.equal(events.length, 2400);
  assert.equal(result.length, 10);
  assert.equal(result.filter(event => event.type === 'bite').length, 5);
  assert.equal(result.filter(event => event.type === 'damage').length, 5);
  assert.equal(result.filter(event => event.type === 'damage').reduce((total, event) => total + event.amount, 0), 4800);
  assert(result.filter(event => event.type === 'damage').every(event => event.amount === 960 && event.sourceId === null));
});

test('the event limit preserves mowers, wave boundaries and lifecycle transitions in original order', () => {
  const important = [
    { type: 'mower', row: 2 }, { type: 'sun', row: 0, amount: 25 },
    { type: 'wave-start', round: 6 }, { type: 'defeat', unitId: 'old' },
    { type: 'deployment', unitId: 'new' },
  ];
  const events = [...important, ...Array.from({ length: 400 }, (_, index) => ({ type: 'shot', sourceId: `pea-${index}` }))];
  const result = compact(events);
  assert.equal(result.length, 200);
  assert.deepEqual(result.slice(0, important.length), important);
  assert.equal(result.at(-1), events.at(-1));
  assert.deepEqual(compact(result), result);
});

test('vital transitions are retained even when they alone exceed the soft visual limit', () => {
  const events = [{ type: 'mower', row: 0 }, { type: 'defeat', unitId: 'a' }, { type: 'deployment', unitId: 'b' }, { type: 'finished' }];
  assert.deepEqual(compact(events, 2), events);
});
