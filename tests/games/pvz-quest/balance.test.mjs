import test from 'node:test';
import assert from 'node:assert/strict';
import { getUnit } from '../../../public/games/pvz-quest/classroom/catalog.js';
import {
  createMatch, grantResources, beginPlanning, addOrder, removeOrder, commitPlan,
  continuePlanning, resolveRound, resolveCleanup, availableUnits, orderLimit,
  MAX_CLEANUP_STEPS,
} from '../../../public/games/pvz-quest/classroom/engine.js';

function ready(state) {
  state = commitPlan(beginPlanning(state));
  if (state.phase === 'handover') state = commitPlan(continuePlanning(state));
  return state;
}

function unit(typeId, row, col, extras = {}) {
  const definition = getUnit(typeId);
  return { ...definition, id: `${typeId}-${row}-${col}`, typeId, row, col,
    maxHp: definition.hp, placedRound: 1, placedStep: 1,
    lastChompRound: -2, lastSpikeRound: -1, ...extras };
}

test('zombie economy supports larger hordes with explicit prices, not increased damage or hidden income', () => {
  assert.deepEqual(['common', 'cone', 'bucket', 'football', 'balloon', 'dragon'].map(id => getUnit(id).cost), [25, 50, 100, 125, 100, 175]);
  assert.deepEqual(['common', 'cone', 'bucket', 'football', 'balloon', 'dragon'].map(id => getUnit(id).hp), [3, 6, 10, 8, 4, 12]);
  assert.equal(orderLimit('plants'), 5);
  assert.equal(orderLimit('zombies'), 8);
  assert.throws(() => orderLimit('neither'), /equipo/);
  let state = continuePlanning(commitPlan(beginPlanning(createMatch())));
  for (let index = 0; index < 8; index += 1) state = addOrder(state, 'zombies', 'common', index % 5, 7);
  assert.equal(state.resources.zombies, 0);
  assert.equal(state.plans.zombies.length, 8);
  assert.ok(availableUnits(state, 'zombies').every(entry => entry.disabledReason.includes('8 compras')));
  assert.throws(() => addOrder(state, 'zombies', 'common', 0, 7), /máximo 8/);
  state = removeOrder(state, 'zombies', state.plans.zombies[0].id);
  assert.equal(state.resources.zombies, 25);
  assert.equal(availableUnits(state, 'zombies').find(entry => entry.id === 'common').affordable, true);
});

test('five purchasing waves cannot silently declare plants winners before a slow horde crosses the board', () => {
  let state = createMatch({ rounds: 5 });
  for (let round = 1; round <= 5; round += 1) {
    state = beginPlanning(state);
    if (state.activeSide === 'plants') state = continuePlanning(commitPlan(state));
    state = addOrder(state, 'zombies', 'common', 0, 7);
    state = commitPlan(state);
    if (state.phase === 'handover') state = commitPlan(continuePlanning(state));
    state = resolveRound(state).state;
  }
  assert.equal(state.phase, 'cleanup');
  assert.equal(state.winner, null);
  const budget = structuredClone(state.resources);
  const placed = structuredClone(state.stats.unitsPlaced);
  const rounds = state.stats.roundsResolved;
  while (state.phase === 'cleanup') state = resolveCleanup(state).state;
  assert.equal(state.winner, 'zombies');
  assert.equal(state.round, 5);
  assert.equal(state.stats.roundsResolved, rounds);
  assert.deepEqual(state.resources, budget);
  assert.deepEqual(state.stats.unitsPlaced, placed);
});

test('cleanup is pure, has no deployment, refunds or income, and cannot run after a result', () => {
  const match = createMatch({ rounds: 1 });
  match.units = [unit('bucket', 0, 7)];
  const original = resolveRound(ready(match)).state;
  const saved = structuredClone(original);
  const result = resolveCleanup(original);
  assert.deepEqual(original, saved);
  assert.deepEqual(result.state.resources, original.resources);
  assert.deepEqual(result.state.stats.resourcesAwarded, original.stats.resourcesAwarded);
  assert.equal(result.state.stats.cleanupSteps, 1);
  assert.equal(result.events.some(entry => ['deploy', 'income'].includes(entry.type)), false);
  assert.deepEqual(result.stages.map(stage => stage.name), ['shots', 'advance', 'bites', 'mowers', 'result']);
  assert.throws(() => grantResources(result.state, 'zombies', 100), /antes/);
  assert.throws(() => addOrder(result.state, 'zombies', 'common', 0, 7), /turno/);
  let state = result.state;
  while (state.phase === 'cleanup') state = resolveCleanup(state).state;
  assert.equal(state.winner, 'plants'); // Only this one wave, intercepted once.
  assert.throws(() => resolveCleanup(state), /última horda/);
});

test('cleanup cannot stall forever or award an artificial plant victory at the safety limit', () => {
  const match = createMatch({ rounds: 1 });
  match.units = [unit('wallnut', 0, 1, { hp: 1000 }), unit('common', 0, 2)];
  let state = resolveRound(ready(match)).state;
  while (state.phase === 'cleanup') state = resolveCleanup(state).state;
  assert.equal(state.stats.cleanupSteps, MAX_CLEANUP_STEPS);
  assert.equal(state.winner, 'draw');
  assert.equal(state.phase, 'finished');
});

test('cleanup advances mine arming, spike contact and chomper recovery without purchasing another round', () => {
  const initial = createMatch({ rounds: 1 });
  initial.phase = 'cleanup'; initial.battleStep = 1;
  initial.units = [unit('potato-mine', 0, 5), unit('common', 0, 6)];
  const mined = resolveCleanup(initial);
  assert.ok(mined.events.some(entry => entry.type === 'mine'));
  assert.equal(mined.state.winner, 'plants');

  const pinched = structuredClone(initial);
  pinched.units = [unit('spikeweed', 0, 6, { hp: 100 }), unit('wallnut', 0, 5, { hp: 100 }), unit('bucket', 0, 6)];
  const first = resolveCleanup(pinched);
  const second = resolveCleanup(first.state);
  assert.equal(second.state.units.find(entry => entry.typeId === 'bucket').hp, getUnit('bucket').hp - 2);

  const chomping = structuredClone(initial);
  chomping.units = [unit('chomper', 0, 4, { hp: 100 }), unit('common', 0, 5), unit('common', 0, 6), unit('common', 0, 7)];
  const eat = resolveCleanup(chomping);
  const rest = resolveCleanup(eat.state);
  const eatAgain = resolveCleanup(rest.state);
  assert.equal(eat.events.filter(entry => entry.type === 'chomp').length, 1);
  assert.equal(rest.events.some(entry => entry.type === 'chomp'), false);
  assert.equal(eatAgain.events.filter(entry => entry.type === 'chomp').length, 1);
  assert.equal(eatAgain.state.round, 1);
});

function buyIfPossible(state, id, row, col) {
  try { return addOrder(state, state.activeSide, id, row, col); } catch { return state; }
}

function focusedDefense(state) {
  for (const [id, col] of [['wallnut', 5], ['peashooter', 1], ['corn-pult', 2], ['corn-pult', 3], ['spikeweed', 6], ['peashooter', 4]]) {
    if (!state.units.some(item => item.row === 0 && item.col === col) && !state.plans.plants.some(item => item.row === 0 && item.col === col)) state = buyIfPossible(state, id, 0, col);
  }
  return state;
}

function distributedDefense(state) {
  for (let row = 0; row < 5; row += 1) for (const [id, col] of [['peashooter', 1], ['wallnut', 2]]) {
    if (!state.units.some(item => item.row === row && item.col === col) && !state.plans.plants.some(item => item.row === row && item.col === col)) state = buyIfPossible(state, id, row, col);
  }
  return state;
}

function equalRewardSimulation(plantStrategy) {
  let state = createMatch({ rounds: 5, seed: 'equal-100-each-team' });
  for (let round = 0; round < 5 && state.phase !== 'finished'; round += 1) {
    state = grantResources(grantResources(state, 'plants', 100), 'zombies', 100);
    state = beginPlanning(state);
    for (let turn = 0; turn < 2; turn += 1) {
      if (state.activeSide === 'plants') state = plantStrategy(state);
      else for (let index = 0; index < 8; index += 1) state = buyIfPossible(state, 'common', 0, 7);
      state = commitPlan(state);
      if (state.phase === 'handover') state = continuePlanning(state);
    }
    state = resolveRound(state).state;
  }
  while (state.phase === 'cleanup') state = resolveCleanup(state).state;
  return state;
}

test('equal +100 prizes allow either side to win depending on defense and horde strategy, not an automatic horizon winner', () => {
  const defended = equalRewardSimulation(focusedDefense);
  const breached = equalRewardSimulation(distributedDefense);
  assert.equal(defended.winner, 'plants');
  assert.equal(breached.winner, 'zombies');
  for (const result of [defended, breached]) {
    assert.deepEqual(result.stats.resourcesAwarded, { plants: 500, zombies: 500 });
    assert.equal(result.stats.roundsResolved, 5);
    assert.ok(result.stats.cleanupSteps <= MAX_CLEANUP_STEPS);
    assert.ok(result.stats.unitsPlaced.zombies >= 25);
  }
  // This is a reproducible sanity check, not a claim of a 50/50 global win rate.
});
