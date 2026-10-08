import test from 'node:test';
import assert from 'node:assert/strict';
import { getUnit } from '../../../public/games/pvz-quest/classroom/catalog.js';
import {
  createMatch, grantResources, beginPlanning, addOrder, removeOrder, commitPlan,
  continuePlanning, resolveRound, resolveCleanup, publicSnapshot, availableUnits, orderLimit,
} from '../../../public/games/pvz-quest/classroom/engine.js';

const clone = value => structuredClone(value);
function ready(original = createMatch()) {
  let state = beginPlanning(original);
  state = commitPlan(state);
  if (state.phase === 'handover') state = commitPlan(continuePlanning(state));
  return state;
}
function fixture(typeId, row, col, options = {}) {
  const def = getUnit(typeId);
  return { id: `${typeId}-${row}-${col}`, typeId, side: def.side, row, col, hp: def.hp, maxHp: def.hp, damage: def.damage, move: def.move, ability: def.ability, placedRound: 1, lastChompRound: -2, lastSpikeRound: -1, ...options };
}

test('initial match is finite, has 200 per side and five one-use mowers', () => {
  const state = createMatch();
  assert.equal(state.phase, 'resources');
  assert.equal(state.round, 1);
  assert.equal(state.maxRounds, 10);
  assert.deepEqual(state.resources, { plants: 200, zombies: 200 });
  assert.deepEqual(state.mowers, [true, true, true, true, true]);
  assert.equal(state.units.length, 0);
  assert.throws(() => createMatch({ rounds: 0 }), /1 y 30/);
  assert.throws(() => createMatch({ rounds: Infinity }), /1 y 30/);
  assert.throws(() => createMatch({ mode: 'online' }), /cooperativos/);
});

test('resource grants are pure, bounded and restricted to the trivia phase', () => {
  const initial = createMatch();
  const saved = clone(initial);
  let state = grantResources(initial, 'plants', 100);
  state = grantResources(state, 'plants', 100);
  state = grantResources(state, 'plants', 100);
  assert.deepEqual(initial, saved);
  assert.equal(state.resources.plants, 500);
  assert.throws(() => grantResources(state, 'plants', 25), /300 recursos/);
  assert.throws(() => grantResources(initial, 'plants', -100), /premios disponibles/);
  assert.throws(() => grantResources(beginPlanning(initial), 'plants', 25), /antes/);
  const capped = createMatch(); capped.resources.plants = 1490;
  assert.equal(grantResources(capped, 'plants', 100).resources.plants, 1500);
});

test('buying and removing orders refund exactly and never mutate the input', () => {
  const before = beginPlanning(createMatch());
  const saved = clone(before);
  const bought = addOrder(before, 'plants', 'sunflower', 2, 2);
  const order = bought.plans.plants[0];
  assert.deepEqual(before, saved);
  assert.equal(bought.resources.plants, 200 - getUnit('sunflower').cost);
  const removed = removeOrder(bought, 'plants', order.id);
  assert.equal(removed.resources.plants, 200);
  assert.equal(removed.stats.resourcesSpent.plants, 0);
  assert.equal(removed.plans.plants.length, 0);
  assert.equal(bought.plans.plants.length, 1);
  assert.throws(() => removeOrder(removed, 'plants', order.id), /no está/);
});

test('ownership, occupancy, boundaries, budgets and five-order limit are checked', () => {
  let state = beginPlanning(createMatch());
  assert.throws(() => addOrder(state, 'zombies', 'common', 0, 7), /turno/);
  assert.throws(() => addOrder(state, 'plants', 'common', 0, 7), /otro equipo/);
  assert.throws(() => addOrder(state, 'plants', 'wallnut', 0, 0), /columnas 1 a 6/);
  assert.throws(() => addOrder(state, 'plants', 'wallnut', 5, 2), /casilla válida/);
  assert.throws(() => addOrder(state, 'plants', 'unknown', 0, 1), /no existe/);
  state = addOrder(state, 'plants', 'potato-mine', 0, 2);
  assert.throws(() => addOrder(state, 'plants', 'wallnut', 0, 2), /ocupada/);
  for (let row = 1; row < 5; row += 1) state = addOrder(state, 'plants', 'potato-mine', row, 2);
  assert.throws(() => addOrder(state, 'plants', 'potato-mine', 0, 3), /máximo 5/);
  let broke = beginPlanning(createMatch()); broke.resources.plants = 0;
  assert.throws(() => addOrder(broke, 'plants', 'wallnut', 0, 1), /suficientes/);
});

test('the first planning side alternates by round and confirmed plans lock', () => {
  let state = beginPlanning(createMatch());
  assert.equal(state.activeSide, 'plants');
  state = commitPlan(state);
  assert.equal(state.phase, 'handover');
  assert.throws(() => commitPlan(state), /confirmado/);
  state = continuePlanning(state);
  assert.equal(state.activeSide, 'zombies');
  assert.throws(() => addOrder(state, 'zombies', 'common', 0, 6), /columna 7/);
  state = commitPlan(state);
  assert.equal(state.phase, 'ready');
  const resolved = resolveRound(state);
  assert.equal(resolved.state.round, 2);
  assert.equal(beginPlanning(resolved.state).activeSide, 'zombies');
  assert.throws(() => resolveRound(resolved.state), /dos veces/);
  assert.throws(() => continuePlanning(resolved.state), /cambio/);
});

test('secret public snapshot reveals neither pending orders nor resource spending', () => {
  let state = beginPlanning(createMatch({ planning: 'secret' }));
  const initialSnapshot = publicSnapshot(state);
  state = addOrder(state, 'plants', 'sunflower', 1, 2);
  const snapshot = publicSnapshot(state);
  assert.deepEqual(snapshot.resources, initialSnapshot.resources);
  assert.deepEqual(snapshot.plans, { plants: [], zombies: [] });
  assert.equal(snapshot.stats.resourcesSpent, undefined);
  assert.equal(snapshot.nextId, undefined);
  assert.equal(snapshot.units.length, 0);
  state = commitPlan(state);
  assert.equal(publicSnapshot(state).resources.plants, 200);
  state = commitPlan(continuePlanning(state));
  assert.equal(publicSnapshot(state).plans.plants.length, 0);
  const result = resolveRound(state).state;
  assert.equal(publicSnapshot(result).units.length, 1);
  assert.equal(publicSnapshot(result).resources.plants, 200 - getUnit('sunflower').cost + 50);
});

test('open planning publishes pending placements without sharing mutable references', () => {
  const state = addOrder(beginPlanning(createMatch()), 'plants', 'wallnut', 1, 2);
  const snapshot = publicSnapshot(state);
  assert.equal(snapshot.plans.plants.length, 1);
  snapshot.plans.plants[0].row = 4;
  assert.equal(state.plans.plants[0].row, 1);
  snapshot.resources.plants = 0;
  assert.notEqual(state.resources.plants, 0);
});

test('one resolution has six snapshots, does not mutate input and stops after one round', () => {
  const input = ready(); const saved = clone(input);
  const output = resolveRound(input);
  assert.deepEqual(input, saved);
  assert.equal(output.state.round, 2);
  assert.equal(output.state.stats.roundsResolved, 1);
  assert.deepEqual(output.stages.map(stage => stage.name), ['deployment', 'shots', 'advance', 'bites', 'mowers', 'result']);
  assert.deepEqual(output.state.resources, { plants: 225, zombies: 225 });
});

test('fast football zombie cannot jump through a blocking wallnut', () => {
  const state = createMatch();
  state.units = [fixture('wallnut', 1, 5), fixture('football', 1, 7, { move: 2 })];
  const result = resolveRound(ready(state));
  assert.equal(result.state.units.find(unit => unit.typeId === 'football').col, 6);
  assert.equal(result.state.units.find(unit => unit.typeId === 'wallnut').hp, getUnit('wallnut').hp - getUnit('football').damage);
  assert.ok(result.events.some(event => event.type === 'blocked'));
});

test('an armed mine catches a fast zombie at the first traversed square', () => {
  const state = createMatch(); state.round = 2;
  state.units = [fixture('potato-mine', 1, 6), fixture('football', 1, 7, { move: 2 })];
  const result = resolveRound(ready(state));
  assert.equal(result.state.units.length, 0);
  assert.ok(result.events.some(event => event.type === 'mine'));
  assert.equal(result.events.filter(event => event.type === 'move').length, 1);
});

test('a mine planted this round is not yet armed', () => {
  let state = beginPlanning(createMatch());
  state = addOrder(state, 'plants', 'potato-mine', 1, 6);
  state = continuePlanning(commitPlan(state));
  state = addOrder(state, 'zombies', 'common', 1, 7);
  const result = resolveRound(commitPlan(state));
  assert.equal(result.events.some(event => event.type === 'mine'), false);
  assert.ok(result.state.units.some(unit => unit.typeId === 'common'));
});

test('balloon bypasses ground obstacles but is vulnerable to a shooter', () => {
  const state = createMatch(); state.round = 2;
  state.units = [fixture('potato-mine', 1, 6), fixture('wallnut', 1, 5), fixture('spikeweed', 1, 4), fixture('peashooter', 1, 1), fixture('balloon', 1, 7, { move: 3 })];
  const result = resolveRound(ready(state));
  const balloon = result.state.units.find(unit => unit.typeId === 'balloon');
  assert.equal(balloon.col, 4);
  assert.equal(balloon.hp, getUnit('balloon').hp - getUnit('peashooter').damage);
  assert.equal(result.events.some(event => event.type === 'mine'), false);
});

test('threepeater shoots its own lane and the two adjacent lanes', () => {
  const state = createMatch();
  state.units = [fixture('threepeater', 2, 2), fixture('common', 1, 7), fixture('common', 2, 7), fixture('common', 3, 7), fixture('common', 4, 7)];
  const result = resolveRound(ready(state));
  for (const row of [1, 2, 3]) assert.equal(result.state.units.find(unit => unit.side === 'zombies' && unit.row === row).hp, getUnit('common').hp - getUnit('threepeater').damage);
  assert.equal(result.state.units.find(unit => unit.side === 'zombies' && unit.row === 4).hp, getUnit('common').hp);
});

test('chomper consumes one enemy, rests one round, then can consume again', () => {
  const state = createMatch();
  state.units = [fixture('chomper', 1, 5), fixture('common', 1, 6), fixture('common', 1, 7)];
  const first = resolveRound(ready(state));
  assert.equal(first.events.filter(event => event.type === 'chomp').length, 1);
  const second = resolveRound(ready(first.state));
  assert.equal(second.events.some(event => event.type === 'chomp'), false);
  const third = resolveRound(ready(second.state));
  assert.equal(third.events.filter(event => event.type === 'chomp').length, 1);
});

test('a mower sweeps its whole lane once, including simultaneous arrivals, armor and flyers', () => {
  const state = createMatch();
  state.units = [
    fixture('common', 1, 1), fixture('cone', 1, 1),
    fixture('bucket', 1, 7), fixture('football', 1, 6), fixture('balloon', 1, 7),
    fixture('sunflower', 1, 2), fixture('cone', 2, 7), fixture('wallnut', 2, 2),
  ];
  const sweptIds = state.units.filter(unit => unit.side === 'zombies' && unit.row === 1).map(unit => unit.id).sort();
  const result = resolveRound(ready(state));
  assert.deepEqual(result.state.mowers, [true, false, true, true, true]);
  assert.equal(result.state.units.some(unit => unit.side === 'zombies' && unit.row === 1), false);
  assert.deepEqual(result.events.filter(event => event.type === 'mower'), [{ type: 'mower', row: 1, col: 0 }]);
  assert.deepEqual(result.events.filter(event => event.type === 'damage' && event.sourceId === 'mower').map(event => event.unitId).sort(), sweptIds);
  assert.deepEqual(result.events.filter(event => event.type === 'defeat').map(event => event.unitId).sort(), sweptIds);
  assert.equal(result.state.stats.unitsDefeated.zombies, sweptIds.length);
  assert.equal(result.state.stats.unitsDefeated.plants, 0);
  assert.equal(result.events.some(event => event.type === 'invasion'), false);
  assert.equal(result.state.winner, null);
  const otherLane = result.state.units.find(unit => unit.side === 'zombies');
  assert.equal(otherLane.row, 2);
  assert.equal(otherLane.col, 6);
  assert.equal(otherLane.hp, getUnit('cone').hp);
  for (const typeId of ['sunflower', 'wallnut']) assert.equal(result.state.units.find(unit => unit.typeId === typeId).hp, getUnit(typeId).hp);
});

test('a later arrival can invade a lane after its mower was consumed', () => {
  const state = createMatch();
  state.units = [fixture('common', 1, 1), fixture('bucket', 1, 7)];
  const first = resolveRound(ready(state));
  assert.equal(first.state.units.length, 0);
  const reinforced = { ...first.state, units: [fixture('common', 1, 1)] };
  const next = resolveRound(ready(reinforced));
  assert.equal(next.state.mowers[1], false);
  assert.equal(next.events.some(event => event.type === 'mower'), false);
  assert.deepEqual(next.events.filter(event => event.type === 'invasion'), [{ type: 'invasion', row: 1 }]);
  assert.equal(next.state.units.length, 1);
  assert.equal(next.state.winner, 'zombies');
  assert.equal(next.state.phase, 'finished');
});

test('a final-round breach wins for zombies before a survival victory', () => {
  const state = createMatch({ rounds: 1 }); state.mowers[1] = false;
  state.units = [fixture('common', 1, 1)];
  const result = resolveRound(ready(state));
  assert.equal(result.state.phase, 'finished'); assert.equal(result.state.winner, 'zombies');
  assert.equal(result.state.round, 1);
  assert.throws(() => beginPlanning(result.state), /ya comenzó/);
  assert.throws(() => resolveRound(result.state), /dos veces/);
});

test('the finite last wave continues combat rather than declaring plants winners with zombies alive', () => {
  const state = createMatch({ rounds: 1 }); state.units = [fixture('bucket', 1, 7)];
  const result = resolveRound(ready(state));
  assert.equal(result.state.winner, null);
  assert.equal(result.state.phase, 'cleanup');
  assert.equal(result.state.units.length, 1);
  assert.equal(result.state.round, 1);
  assert.equal(result.events.some(event => event.type === 'income'), false);
  assert.throws(() => beginPlanning(result.state), /ya comenzó/);
  assert.throws(() => grantResources(result.state, 'plants', 100), /antes/);
  const next = resolveCleanup(result.state);
  assert.equal(next.state.stats.cleanupSteps, 1);
  assert.deepEqual(next.state.resources, result.state.resources);
});

test('passive sunflower income has a four-flower cap and total resources stay bounded', () => {
  const state = createMatch(); state.resources.plants = 1450;
  state.units = Array.from({ length: 5 }, (_, row) => fixture('sunflower', row, 2));
  const result = resolveRound(ready(state));
  assert.equal(result.state.resources.plants, 1500);
  assert.deepEqual(result.events.find(event => event.type === 'income'), { type: 'income', plants: 125, zombies: 25 });
});

test('cooperative CPU has a real bounded budget and deterministic seed', () => {
  function simulate() {
    let state = createMatch({ mode: 'coop-plants', seed: 'same-class', rounds: 30 });
    for (let round = 0; round < 8 && state.phase !== 'finished'; round += 1) {
      const before = state.resources.zombies;
      state = commitPlan(beginPlanning(state));
      assert.equal(state.phase, 'ready');
      const spent = state.plans.zombies.reduce((sum, order) => sum + getUnit(order.typeId).cost, 0);
      assert.ok(spent <= before && spent <= 300);
      assert.equal(state.resources.zombies, before - spent);
      assert.ok(state.plans.zombies.length <= 5);
      state = resolveRound(state).state;
      assert.ok(state.units.filter(unit => unit.side === 'zombies').length <= 30);
    }
    return state;
  }
  assert.deepEqual(simulate(), simulate());
});

test('cooperative zombie mode has starter defenses and one explicitly free common', () => {
  let state = createMatch({ mode: 'coop-zombies' });
  assert.equal(state.units.filter(unit => unit.side === 'plants').length, 3);
  assert.throws(() => grantResources(state, 'plants', 25), /equipo del salón/);
  state = commitPlan(beginPlanning(state));
  assert.equal(state.plans.zombies.length, 1);
  assert.equal(state.plans.zombies[0].typeId, 'common');
  assert.equal(state.plans.zombies[0].free, true);
  assert.equal(state.resources.zombies, 200);
  assert.ok(state.resources.plants >= 0);
});

test('unit availability reports affordability and returns isolated catalog entries', () => {
  const state = createMatch(); state.resources.plants = 0;
  const units = availableUnits(state, 'plants');
  assert.equal(units.length, 9);
  assert.ok(units.every(unit => !unit.affordable && unit.disabledReason));
  units[0].cost = 0;
  assert.notEqual(getUnit(units[0].id).cost, 0);
  assert.throws(() => availableUnits(state, 'unknown'), /equipo/);
});

test('the thirty-zombie limit includes orders and blocks both human and CPU excess', () => {
  let state = createMatch();
  state.units = Array.from({ length: 29 }, (_, index) => fixture('bucket', index % 5, 7, { id: `crowd-${index}` }));
  state = continuePlanning(commitPlan(beginPlanning(state)));
  state = addOrder(state, 'zombies', 'common', 0, 7);
  assert.throws(() => addOrder(state, 'zombies', 'common', 1, 7), /30 zombis/);
  assert.ok(availableUnits(state, 'zombies').every(unit => !unit.affordable));
  const coop = createMatch({ mode: 'coop-plants' });
  coop.units = Array.from({ length: 30 }, (_, index) => fixture('bucket', index % 5, 7, { id: `full-${index}` }));
  const cpuReady = commitPlan(beginPlanning(coop));
  assert.equal(cpuReady.plans.zombies.length, 0);
});

test('straight shots hit the closest zombie rather than the back row of a horde', () => {
  const state = createMatch();
  state.units = [fixture('peashooter', 1, 2), fixture('cone', 1, 5), fixture('common', 1, 7)];
  const result = resolveRound(ready(state));
  assert.equal(result.state.units.find(unit => unit.typeId === 'cone').hp, getUnit('cone').hp - 1);
  assert.equal(result.state.units.find(unit => unit.typeId === 'common').hp, getUnit('common').hp);
});

test('shooting occurs before movement and can prevent an otherwise fatal breach', () => {
  const state = createMatch({ rounds: 1 }); state.mowers[1] = false;
  state.units = [fixture('peashooter', 1, 1), fixture('balloon', 1, 2, { hp: 1, move: 2 })];
  const result = resolveRound(ready(state));
  assert.equal(result.state.winner, 'plants');
  assert.equal(result.events.some(event => event.type === 'invasion'), false);
  assert.equal(result.events.some(event => event.type === 'move'), false);
});

test('spikeweed hurts a traversing ground zombie once per round, never teleports it', () => {
  const state = createMatch();
  state.units = [fixture('spikeweed', 1, 6), fixture('bucket', 1, 7, { move: 2 })];
  const result = resolveRound(ready(state));
  const zombie = result.state.units.find(unit => unit.typeId === 'bucket');
  assert.equal(zombie.col, 5);
  assert.equal(zombie.hp, getUnit('bucket').hp - getUnit('spikeweed').damage);
  assert.equal(result.events.filter(event => event.type === 'damage' && event.unitId === zombie.id).length, 1);
});

test('CPU cooperation never grants a free ninth order or a thirty-first zombie', () => {
  let state = createMatch({ mode: 'coop-zombies' });
  state.resources.zombies = 1000;
  state = beginPlanning(state);
  for (let index = 0; index < orderLimit('zombies'); index += 1) state = addOrder(state, 'zombies', 'common', index % 5, 7);
  const confirmed = commitPlan(state);
  assert.equal(confirmed.plans.zombies.length, 8);
  assert.equal(confirmed.plans.zombies.some(order => order.free), false);
});

test('question-bank extras cannot leak through the projected configuration', () => {
  const config = { planning: 'secret', teacherQuestions: [{ answer: 'teacher-only-answer' }], secretToken: 'never-project-this' };
  const before = clone(config);
  const state = beginPlanning(createMatch(config));
  assert.deepEqual(config, before);
  assert.deepEqual(Object.keys(state.config).sort(), ['mode', 'planning', 'rounds', 'seed']);
  const projected = JSON.stringify(publicSnapshot(state));
  assert.equal(projected.includes('teacher-only-answer'), false);
  assert.equal(projected.includes('never-project-this'), false);
  assert.throws(() => createMatch(null), /configuración/);
});

test('both secret teams keep public resources constant through purchases, refunds and handover', () => {
  let state = grantResources(createMatch({ planning: 'secret' }), 'zombies', 100);
  state = grantResources(state, 'plants', 50);
  state = beginPlanning(state);
  const visible = clone(publicSnapshot(state).resources);
  state = addOrder(state, 'plants', 'sunflower', 1, 2);
  state = addOrder(state, 'plants', 'peashooter', 2, 2);
  state = removeOrder(state, 'plants', state.plans.plants[0].id);
  assert.deepEqual(publicSnapshot(state).resources, visible);
  state = commitPlan(state);
  assert.deepEqual(publicSnapshot(state).resources, visible);
  state = continuePlanning(state);
  state = addOrder(state, 'zombies', 'bucket', 3, 7);
  state = commitPlan(state);
  const snapshot = publicSnapshot(state);
  assert.deepEqual(snapshot.resources, visible);
  assert.deepEqual(snapshot.plans, { plants: [], zombies: [] });
  assert.equal(snapshot.stats.resourcesSpent, undefined);
  const resolved = resolveRound(state);
  assert.ok(resolved.stages[0].events.some(event => event.typeId === 'peashooter'));
  assert.ok(resolved.stages[0].events.some(event => event.typeId === 'bucket'));
  assert.notDeepEqual(publicSnapshot(resolved.state).resources, visible);
});

test('CPU waves progressively unlock balloons and dragons without exceeding their real budget or army cap', () => {
  function choices(round, money, crowd = 0) {
    const seen = new Set();
    for (let index = 0; index < 128; index += 1) {
      const state = createMatch({ mode: 'coop-plants', rounds: 30, seed: `wave-check-${index}` });
      state.round = round;
      state.resources.zombies = money;
      state.units = Array.from({ length: crowd }, (_, unitIndex) => fixture('bucket', unitIndex % 5, 7, { id: `existing-${unitIndex}` }));
      const saved = clone(state);
      const planned = commitPlan(beginPlanning(state));
      const spent = planned.plans.zombies.reduce((sum, order) => sum + getUnit(order.typeId).cost, 0);
      assert.ok(spent <= Math.min(money, 125 + round * 25, 300));
      assert.equal(planned.resources.zombies, money - spent);
      assert.ok(planned.plans.zombies.length <= orderLimit('zombies'));
      assert.ok(crowd + planned.plans.zombies.length <= 30);
      assert.deepEqual(state, saved);
      for (const order of planned.plans.zombies) seen.add(order.typeId);
    }
    return seen;
  }
  const early = choices(5, 1500);
  assert.equal(early.has('balloon'), false);
  assert.equal(early.has('dragon'), false);
  const middle = choices(6, 1500);
  assert.equal(middle.has('balloon'), true);
  assert.equal(middle.has('dragon'), false);
  const late = choices(8, 1500);
  assert.equal(late.has('balloon'), true);
  assert.equal(late.has('dragon'), true);
  assert.equal(choices(8, getUnit('balloon').cost - 1).has('balloon'), false);
  assert.equal(choices(8, getUnit('dragon').cost - 1).has('dragon'), false);
  const nearlyFull = choices(8, 1500, 29);
  assert.equal(nearlyFull.has('balloon'), true);
  assert.equal(nearlyFull.has('dragon'), true);
});
