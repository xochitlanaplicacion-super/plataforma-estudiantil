import test from 'node:test';
import assert from 'node:assert/strict';
import { compactCombatEvents } from '../../../public/games/pvz-quest/classroom/combat-events.js';

test('large lane sweeps retain the mower, sun and wave events through damage bursts', () => {
  const mower = { type: 'mower', row: 2 };
  const sun = { type: 'sun', row: 1, amount: 25 };
  const wave = { type: 'wave-start', round: 6 };
  const events = [mower, sun, wave, ...Array.from({ length: 400 }, (_, index) => ({ type: index % 2 ? 'defeat' : 'damage', unitId: index }))];
  const original = structuredClone(events);
  const compacted = compactCombatEvents(events);
  assert.equal(compacted.length, 200);
  assert.deepEqual(compacted.slice(0, 3), [mower, sun, wave]);
  assert.deepEqual(compacted.at(-1), events.at(-1));
  assert.deepEqual(events, original);
});

test('ordinary combat events are unchanged and repeated compaction preserves transitions', () => {
  const small = [{ type: 'freeze', row: 2 }, { type: 'chomp', row: 1 }];
  assert.equal(compactCombatEvents(small), small);
  const events = [{ type: 'mower', row: 4 }, ...Array.from({ length: 300 }, () => ({ type: 'shot' }))];
  const next = compactCombatEvents([...compactCombatEvents(events), ...Array.from({ length: 300 }, () => ({ type: 'defeat' }))]);
  assert.equal(next.length, 200);
  assert.deepEqual(next[0], events[0]);
});
