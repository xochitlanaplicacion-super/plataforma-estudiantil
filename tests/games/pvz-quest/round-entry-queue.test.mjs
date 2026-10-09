import assert from 'node:assert/strict';
import test from 'node:test';
import { getUnit } from '../../../public/games/pvz-quest/classroom/catalog.js';
import { zombieEntryQueueCounts } from '../../../public/games/pvz-quest/classroom/entry-queue.js';
import {
  createMatch, grantResources, beginPlanning, addOrder, removeOrder, commitPlan,
  continuePlanning, resolveRound, resolveCleanup, publicSnapshot, availableUnits, MAX_ZOMBIES,
} from '../../../public/games/pvz-quest/classroom/engine.js';

const profiles = ['aula', 'classic'];
const modes = ['duel', 'coop-plants', 'coop-zombies'];
function unit(typeId, row, col, profile, extras = {}) {
  const type = getUnit(typeId, profile);
  return { id: `${typeId}-${row}-${col}`, typeId, side: type.side, row, col,
    hp: type.hp, maxHp: type.hp, damage: type.damage, move: type.move, ability: type.ability,
    placedAt: 0, placedRound: 1, placedStep: 0, movementCredit: 0, freezeUntil: 0,
    chompCooldown: 0, lastSpikeRound: -1, ...extras };
}
function ready(profile, mode = 'duel', options = {}) {
  const state = createMatch({ balanceProfile: profile, mode, ...options });
  state.phase = 'ready'; state.activeSide = null;
  state.planLocked = { plants: true, zombies: true };
  return state;
}
function zombiePlanning(profile, options = {}) {
  const state = createMatch({ balanceProfile: profile, ...options });
  state.resources.zombies = 1500;
  let planning = beginPlanning(state);
  if (planning.activeSide !== 'zombies') planning = continuePlanning(commitPlan(planning));
  return planning;
}

for (const profile of profiles) for (const mode of modes) {
  test(`${profile}/${mode}: deployment shows only the first purchased zombie per lane, preserves types and waiting flags in every snapshot`, () => {
    const state = ready(profile, mode);
    const types = ['common', 'cone', 'bucket', 'football', 'balloon', 'dragon'];
    state.plans.zombies = types.map((typeId, index) => ({ id: `order-${index}`, typeId, side: 'zombies', row: 1, col: 7 }));
    const original = structuredClone(state);
    const result = resolveRound(state);
    assert.deepEqual(state, original);
    const stage = result.stages.find(item => item.name === 'deployment');
    const zombies = stage.units.filter(item => item.side === 'zombies');
    assert.deepEqual(zombies.map(item => item.typeId), types);
    assert.deepEqual(zombies.map(item => item.entryPending), [false, true, true, true, true, true]);
    assert.deepEqual(stage.events.filter(item => item.type === 'deploy' && item.side === 'zombies').map(item => item.typeId), ['common']);
    assert.deepEqual(zombieEntryQueueCounts(result.state.units), [0, 5, 0, 0, 0]);
    for (const snapshot of [...result.stages, publicSnapshot(result.state)]) {
      for (const waiting of snapshot.units.filter(item => item.entryPending)) {
        assert.equal(waiting.col, 7); assert.equal(waiting.movementCredit, 0);
        assert.equal(waiting.hp, getUnit(waiting.typeId, profile).hp);
      }
    }
  });
}

for (const profile of profiles) {
  test(`${profile}: purchases, confirmation, queue release and undo charge each price exactly once`, () => {
    let state = zombiePlanning(profile, { rounds: 1 });
    const initial = structuredClone(state);
    for (const typeId of ['common', 'cone', 'dragon']) state = addOrder(state, 'zombies', typeId, 0, 7);
    assert.deepEqual(initial.resources, { plants: 200, zombies: 1500 });
    const prices = ['common', 'cone', 'dragon'].reduce((sum, id) => sum + getUnit(id, profile).cost, 0);
    assert.equal(state.resources.zombies, 1500 - prices);
    const paid = state.resources.zombies;
    const removed = removeOrder(state, 'zombies', state.plans.zombies[2].id);
    assert.equal(removed.resources.zombies, paid + getUnit('dragon', profile).cost);
    assert.equal(state.resources.zombies, paid);
    state = commitPlan(state);
    const result = resolveRound(state);
    assert.equal(result.state.resources.zombies, paid);
    assert.equal(result.state.stats.resourcesSpent.zombies, prices);
    assert.equal(result.state.stats.unitsPlaced.zombies, 3);
    const cleanup = resolveCleanup(result.state);
    assert.equal(cleanup.state.resources.zombies, paid);
    assert.equal(cleanup.state.stats.resourcesSpent.zombies, prices);
    assert.equal(cleanup.state.stats.unitsPlaced.zombies, 3);
  });

  test(`${profile}: FIFO is array purchase order, not type, speed or lexical ID, and releases at most one per lane after movement`, () => {
    const state = ready(profile, 'duel', { rounds: 1 });
    state.units = [
      unit('common', 0, 7, profile, { id: 'first-active', movementCredit: .9 }),
      unit('dragon', 0, 7, profile, { id: 'z-earlier', entryPending: true, movementCredit: .7, freezeUntil: 999, placedAt: -100 }),
      unit('football', 0, 7, profile, { id: 'a-later', entryPending: true }),
      unit('common', 1, 7, profile, { id: 'other-lane-active', movementCredit: .9 }),
      unit('cone', 1, 7, profile, { id: 'other-lane-waiting', entryPending: true }),
    ];
    const result = resolveRound(state);
    assert.equal(result.state.units.find(item => item.id === 'first-active').col, 6);
    const released = result.state.units.find(item => item.id === 'z-earlier');
    assert.equal(released.entryPending, false); assert.equal(released.col, 7);
    assert.equal(released.movementCredit, 0); assert.equal(released.freezeUntil, 0);
    assert.equal(released.placedAt, 5); assert.equal(released.placedStep, 1);
    assert.equal(result.state.units.find(item => item.id === 'a-later').entryPending, true);
    assert.deepEqual(result.events.filter(item => item.type === 'deploy').map(item => item.unitId), ['z-earlier', 'other-lane-waiting']);
    for (const name of ['deployment', 'shots', 'advance', 'bites']) {
      assert.equal(result.stages.find(item => item.name === name).units.find(item => item.id === 'z-earlier').entryPending, true);
    }
    assert.equal(result.stages.find(item => item.name === 'mowers').units.find(item => item.id === 'z-earlier').entryPending, false);
  });

  test(`${profile}: waiting zombies cannot be shot, slowed, moved, bitten, swallowed, mined or hurt by spikes`, () => {
    const state = ready(profile);
    state.units = [unit('snow-pea', 0, 1, profile), unit('spikeweed', 1, 4, profile),
      unit('potato-mine', 2, 4, profile, { placedAt: -20, placedStep: -20 }),
      unit('chomper', 3, 3, profile), unit('wallnut', 4, 2, profile)];
    for (let row = 0; row < 5; row += 1) {
      state.units.push(unit('bucket', row, 7, profile, { id: `gate-${row}`, hp: 10000, maxHp: 10000, move: 0 }));
      // Artificial stale positions make the combat guard explicit: waiting
      // means outside, regardless of the coordinate stored in an old state.
      state.units.push(unit('common', row, row === 4 ? 3 : 4, profile,
        { id: `waiting-${row}`, entryPending: true, movementCredit: .24 }));
    }
    const result = resolveRound(state);
    for (let row = 0; row < 5; row += 1) {
      const waiting = result.state.units.find(item => item.id === `waiting-${row}`);
      assert.equal(waiting.hp, getUnit('common', profile).hp);
      assert.equal(waiting.entryPending, true); assert.equal(waiting.movementCredit, .24);
      assert.equal(waiting.freezeUntil, 0);
    }
    assert.equal(result.events.some(item => /^waiting-/.test(item.unitId || item.targetId || item.sourceId || '')), false);
    assert.equal(result.state.units.find(item => item.typeId === 'wallnut').hp, getUnit('wallnut', profile).hp);
    assert.equal(result.state.units.find(item => item.typeId === 'chomper').chompCooldown, 0);
  });

  test(`${profile}: a waiting zombie's stale coordinate never blocks a valid new plant placement`, () => {
    const state = beginPlanning(createMatch({ balanceProfile: profile }));
    state.units.push(unit('common', 0, 2, profile, { entryPending: true }));
    const before = structuredClone(state);
    const bought = addOrder(state, 'plants', 'wallnut', 0, 2);
    assert.deepEqual(state, before);
    assert.equal(bought.plans.plants.length, 1);
    assert.equal(bought.resources.plants, 150);
    assert.equal(bought.units[0].entryPending, true);
  });

  test(`${profile}: a mower clears only zombies already on the battlefield, then a waiting survivor enters with full health`, () => {
    const state = ready(profile, 'duel', { rounds: 1 });
    state.units = [unit('common', 0, 0, profile), unit('bucket', 0, 5, profile),
      unit('dragon', 0, 7, profile, { id: 'outside-first', entryPending: true }),
      unit('football', 0, 7, profile, { id: 'outside-second', entryPending: true })];
    const result = resolveRound(state);
    assert.equal(result.state.winner, null); assert.equal(result.state.phase, 'cleanup');
    assert.equal(result.state.mowers[0], false); assert.equal(result.state.stats.unitsDefeated.zombies, 2);
    assert.equal(result.events.some(item => item.type === 'damage' && /^outside-/.test(item.unitId)), false);
    const survivor = result.state.units.find(item => item.id === 'outside-first');
    assert.equal(survivor.hp, getUnit('dragon', profile).hp); assert.equal(survivor.entryPending, false);
    assert.equal(survivor.col, 7); assert.equal(survivor.movementCredit, 0);
    assert.equal(result.state.units.find(item => item.id === 'outside-second').entryPending, true);
    assert(result.events.findIndex(item => item.type === 'deploy') > result.events.findIndex(item => item.type === 'mower'));
    assert.equal(result.events.find(item => item.type === 'cleanup').remainingZombies, 2);
  });

  test(`${profile}: queued zombies prevent a false cleanup victory and are released without new purchases, income or deployment charges`, () => {
    let state = ready(profile, 'duel', { rounds: 1 });
    state.phase = 'cleanup'; state.units = [
      unit('football', 0, 7, profile, { id: 'q-first', entryPending: true }),
      unit('common', 0, 7, profile, { id: 'q-second', entryPending: true }),
    ];
    const original = structuredClone(state);
    let result = resolveCleanup(state); state = result.state;
    assert.deepEqual(original.units.map(item => item.entryPending), [true, true]);
    assert.equal(state.winner, null); assert.equal(state.phase, 'cleanup');
    assert.equal(state.units.find(item => item.id === 'q-first').entryPending, false);
    assert.equal(state.units.find(item => item.id === 'q-second').entryPending, true);
    assert.equal(result.events.some(item => item.type === 'income'), false);
    for (let index = 0; index < 3 && state.units.find(item => item.id === 'q-second').entryPending; index += 1) {
      result = resolveCleanup(state); state = result.state;
    }
    assert.equal(state.units.find(item => item.id === 'q-second').entryPending, false);
    assert.deepEqual(state.resources, original.resources);
    assert.deepEqual(state.stats.resourcesSpent, original.stats.resourcesSpent);
    assert.deepEqual(state.stats.unitsPlaced, original.stats.unitsPlaced);
    assert.equal(state.stats.roundsResolved, 0);
  });

  test(`${profile}: an invasion ends combat without releasing waiting reinforcements`, () => {
    const state = ready(profile, 'duel', { rounds: 1 }); state.mowers[0] = false;
    state.units = [unit('common', 0, 0, profile), unit('dragon', 0, 7, profile, { entryPending: true })];
    const result = resolveRound(state);
    assert.equal(result.state.winner, 'zombies'); assert.equal(result.state.phase, 'finished');
    assert.equal(result.state.units.find(item => item.typeId === 'dragon').entryPending, true);
    assert.equal(result.events.some(item => item.type === 'deploy'), false);
  });

  test(`${profile}: the 200-zombie cap includes all waiting purchases, blocks CPU/free reinforcements and does not permit a hidden extra`, () => {
    let state = zombiePlanning(profile);
    state.units = Array.from({ length: MAX_ZOMBIES }, (_, index) => unit('common', 0, 7, profile,
      { id: `crowd-${index}`, entryPending: index > 0 }));
    assert(availableUnits(state, 'zombies').every(item => !item.affordable && /200/.test(item.disabledReason)));
    assert.throws(() => addOrder(state, 'zombies', 'common', 0, 7), /200/);
    const cooperative = createMatch({ balanceProfile: profile, mode: 'coop-zombies' });
    cooperative.units.push(...structuredClone(state.units));
    const confirmed = commitPlan(beginPlanning(cooperative));
    assert.equal(confirmed.plans.zombies.length, 0);
    const result = resolveRound(confirmed);
    assert.equal(result.state.units.filter(item => item.side === 'zombies').length, MAX_ZOMBIES);
  });

  test(`${profile}: cooperative CPU purchases and the classroom zombie copilot join the same per-lane queue`, () => {
    let plants = createMatch({ balanceProfile: profile, mode: 'coop-plants', seed: 'queue-cpu' });
    plants.units = Array.from({ length: 5 }, (_, row) => unit('bucket', row, 7, profile));
    plants = commitPlan(beginPlanning(plants));
    const planned = plants.plans.zombies.length;
    const before = plants.resources.zombies;
    const zombieCPU = resolveRound(plants);
    assert.equal(zombieEntryQueueCounts(zombieCPU.state.units).reduce((sum, count) => sum + count, 0), planned);
    assert.equal(zombieCPU.stages[0].events.some(item => item.type === 'deploy' && item.side === 'zombies'), false);
    assert.equal(zombieCPU.state.resources.zombies, before + 25);

    let zombies = grantResources(createMatch({ balanceProfile: profile, mode: 'coop-zombies', seed: 'queue-assist' }), 'zombies', 100);
    zombies = beginPlanning(zombies);
    for (let row = 0; row < 5; row += 1) for (let count = 0; count < 2; count += 1) zombies = addOrder(zombies, 'zombies', 'common', row, 7);
    zombies = commitPlan(zombies);
    const assisted = resolveRound(zombies);
    assert.equal(assisted.state.stats.unitsPlaced.zombies, 11);
    assert.equal(assisted.state.stats.resourcesSpent.zombies, 250);
    assert.deepEqual(zombieEntryQueueCounts(assisted.state.units).reduce((sum, count) => sum + count, 0), 6);
    assert.equal(assisted.stages[0].events.filter(item => item.type === 'deploy' && item.side === 'zombies').length, 5);
    assert.equal(assisted.state.units.filter(item => item.side === 'zombies' && item.entryFree).length, 1);
  });

  test(`${profile}: secret planning conceals queued orders, types, order IDs and paid spending until the joint reveal`, () => {
    let state = zombiePlanning(profile, { planning: 'secret' });
    const visible = publicSnapshot(state);
    for (const typeId of ['common', 'dragon', 'football']) state = addOrder(state, 'zombies', typeId, 1, 7);
    const privateView = publicSnapshot(state);
    assert.deepEqual(privateView.resources, visible.resources); assert.deepEqual(privateView.units, visible.units);
    assert.deepEqual(privateView.plans, { plants: [], zombies: [] });
    assert.equal(privateView.stats.resourcesSpent, undefined);
    for (const order of state.plans.zombies) assert.equal(JSON.stringify(privateView).includes(order.id), false);
    const revealed = resolveRound(commitPlan(state));
    assert.deepEqual(revealed.stages[0].units.filter(item => item.side === 'zombies').map(item => item.entryPending), [false, true, true]);
    const snapshot = publicSnapshot(revealed.state);
    snapshot.units[1].entryPending = false;
    assert.equal(revealed.state.units[1].entryPending, true);
  });
}
