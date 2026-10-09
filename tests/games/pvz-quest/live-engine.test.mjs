import test from 'node:test';
import assert from 'node:assert/strict';
import { getUnit } from '../../../public/games/pvz-quest/classroom/catalog.js';
import {
  LIVE_RULES, LIVE_ZOMBIE_SPEED_PRESETS, createLiveMatch as createCurrentLiveMatch, awardLiveResources, buyLiveUnit,
  pauseLive, stepLive, liveSnapshot, availableLiveUnits, selectLiveSide, setLiveZombieSpeed,
} from '../../../public/games/pvz-quest/classroom/live-engine.js';

// Keep this suite's original pure continuous combat fixtures at normal speed.
// New defaults and mandatory tactical sequencing have their own test suite.
const createLiveMatch = (config = {}) => createCurrentLiveMatch(config === null || Array.isArray(config) ? config : { tacticalPauses: false, zombieSpeed: 1, ...config });

function advance(original, seconds, dt = 0.25) {
  let state = original;
  const events = [];
  for (let remaining = seconds; remaining > 1e-8; remaining -= dt) {
    const next = stepLive(state, Math.min(dt, remaining));
    state = next.state; events.push(...next.events);
  }
  return { state, events };
}

const withoutCPU = state => ({ ...state, cpuNextActionAt: Infinity, assistantNextActionAt: Infinity });

function injectedUnit(typeId, row, col, overrides = {}) {
  const type = getUnit(typeId);
  return {
    id: `test-${typeId}-${row}-${col}`, typeId, side: type.side, row, col,
    hp: type.hp, maxHp: type.hp, damage: type.damage, move: type.move,
    ability: type.ability, placedRound: 1, placedAt: 0, readyAt: 0,
    shootCooldown: 2.4, biteCooldown: 1.5, chompCooldown: 0,
    groundHits: {}, ...overrides,
  };
}

test('after eating a plant the zombie keeps advancing without another purchasing round', () => {
  let state = withoutCPU(createLiveMatch({ waves: 2, waveSeconds: 30 }));
  state.units = [
    injectedUnit('sunflower',2,3,{ hp:1 }),
    injectedUnit('common',2,3.42,{ biteCooldown:0 }),
  ];
  const bite = advance(state,0.25);
  assert(bite.events.some(event => event.type === 'bite'));
  assert(bite.events.some(event => event.type === 'defeat' && event.side === 'plants'));
  assert.equal(bite.state.units.some(unit => unit.side === 'plants'),false);
  const result = advance(bite.state,1);
  assert(result.state.units[0].col < bite.state.units[0].col);
  assert.equal(result.state.round,1);
  assert.throws(() => buyLiveUnit(result.state,'plants','wallnut',2,3),/ocupada/);
});

test('continuous configuration is validated and never includes teacher-only data', () => {
  for (const config of [null, [], { mode: 'unknown' }, { waves: 0 }, { waves: 31 }, { waves: 1.5 },
    { waveSeconds: 29 }, { waveSeconds: 601 }, { waveSeconds: '45' }, { seed: {} }, { startPaused: 'true' }, { zombieSpeed: 0 }]) {
    assert.throws(() => createLiveMatch(config));
  }
  const state = createLiveMatch({ mode: 'coop-plants', waves: 3, waveSeconds: 30, seed: 7, questions: ['secret'], token: 'secret' });
  assert.equal(state.phase, 'live');
  assert.equal(state.config.tempo, 'continuous');
  assert.equal(state.maxRounds, 3);
  assert.equal(state.config.questions, undefined);
  assert.equal(state.resources.plants, 200);
  assert.equal(state.resources.zombies, 200);
  assert.equal(state.stats.resourcesIncome.zombies, 0);
});

test('the continuous simulation and purchases are immutable', () => {
  const original = createLiveMatch();
  const before = structuredClone(original);
  const bought = buyLiveUnit(original, 'plants', 'peashooter', 1, 2);
  assert.deepEqual(original, before);
  const buyBefore = structuredClone(bought);
  stepLive(bought, 0.25);
  assert.deepEqual(bought, buyBefore);
  assert.equal(bought.units.length, 1);
  assert.equal(bought.resources.plants, 100);
  assert.equal(bought.stats.resourcesSpent.plants, 100);
});

test('pausing freezes the battle, but not resources or valid purchases', () => {
  let state = pauseLive(createLiveMatch(), true);
  state = awardLiveResources(state, 'plants', 100);
  state = buyLiveUnit(state, 'plants', 'peashooter', 0, 2);
  const before = structuredClone(state);
  const result = advance(state, 4);
  assert.deepEqual(result.state, before);
  assert.deepEqual(result.events, []);
  assert.equal(state.resources.plants, 200);
  assert.equal(state.elapsed, 0);
  assert.equal(advance(pauseLive(state, false), 0.5).state.elapsed, 0.5);
  assert.throws(() => pauseLive(state, 'true'));
});

test('external time steps reject malformed, negative or oversized values', () => {
  const state = createLiveMatch();
  for (const dt of [undefined, null, NaN, Infinity, -0.1, 0.251, '0.1']) assert.throws(() => stepLive(state, dt));
  assert.deepEqual(stepLive(state, 0), { state, events: [] });
});

test('combat is deterministic and independent of 4, 10 and 60 FPS calls', () => {
  const start = buyLiveUnit(createLiveMatch({ seed: 'same-questions', waves: 2, waveSeconds: 30 }), 'plants', 'peashooter', 3, 2);
  const slow = advance(start, 35, 0.25).state;
  for (const dt of [0.1, 1 / 60]) {
    const other = advance(start, 35, dt).state;
    const canonical = ({ accumulator, ...state }) => state;
    assert.deepEqual(canonical(other), canonical(slow));
    assert(Math.abs(other.accumulator - slow.accumulator) < 1e-7);
  }
});

test('double purchases are guarded and separate later purchases are allowed', () => {
  let state = createLiveMatch({ mode: 'coop-zombies' });
  state = buyLiveUnit(state, 'zombies', 'common', 1, 7);
  assert.throws(() => buyLiveUnit(state, 'zombies', 'common', 1, 7), /recargando/);
  assert.equal(availableLiveUnits(state).find(unit => unit.id === 'common').affordable, false);
  state = advance(state, 1).state;
  state = buyLiveUnit(state, 'zombies', 'common', 1, 7);
  assert.equal(state.units.filter(unit => unit.typeId === 'common').length, 2);
  assert.throws(() => buyLiveUnit(state, 'plants', 'peashooter', 2, 2), /salón/);
});

test('plants cannot overwrite units, place outside garden or plant under a zombie', () => {
  const state = buyLiveUnit(createLiveMatch(), 'plants', 'wallnut', 1, 2);
  assert.throws(() => buyLiveUnit(state, 'plants', 'peashooter', 1, 2), /ocupada/);
  for (const [row, col] of [[-1, 2], [5, 2], [1, 0], [1, 7], [1.2, 2]]) assert.throws(() => buyLiveUnit(state, 'plants', 'peashooter', row, col));
  const under = { ...state, units: [...state.units, injectedUnit('common', 0, 3.2)] };
  assert.throws(() => buyLiveUnit(under, 'plants', 'peashooter', 0, 3), /ocupada/);
  assert.throws(() => buyLiveUnit(state, 'plants', 'missing', 0, 2));
});

test('resource and simultaneous-entity safety caps remain explicit, without a purchase-per-wave cap', () => {
  let state = createLiveMatch({ mode: 'coop-zombies', waves: 2, waveSeconds: 30 });
  for (let i = 0; i < 3; i += 1) state = awardLiveResources(state, 'zombies', 100);
  state = awardLiveResources(state, 'zombies', 25);
  assert.equal(state.bonusThisWave.zombies, 325);
  assert.throws(() => awardLiveResources(state, 'plants', 25), /salón/);
  assert.throws(() => awardLiveResources(state, 'zombies', 101));
  const capped = { ...state, resources: { ...state.resources, zombies: 1490 }, bonusThisWave: { plants: 0, zombies: 0 } };
  assert.equal(awardLiveResources(capped, 'zombies', 100).resources.zombies, 1500);
  const crowded = { ...state, units: [...state.units, ...Array.from({ length: LIVE_RULES.maxZombies }, (_, i) => injectedUnit('common', i % 5, 7, { id: `crowd-${i}` }))] };
  assert.throws(() => buyLiveUnit(crowded, 'zombies', 'bucket', 0, 7), /200 zombis/);
  const cappedOrders = { ...state, humanPurchasesThisWave: 10, purchasesBySideThisWave: { plants: 0, zombies: 10 } };
  assert.equal(buyLiveUnit(cappedOrders, 'zombies', 'common', 0, 7).purchasesBySideThisWave.zombies, 11);
});

test('new waves reset purchase counters and only pay base income once', () => {
  let state = withoutCPU(createLiveMatch({ waves: 2, waveSeconds: 30 }));
  state = awardLiveResources(state, 'plants', 100);
  state = buyLiveUnit(state, 'plants', 'sunflower', 0, 1);
  const result = advance(state, 30);
  assert.equal(result.state.round, 2);
  assert.equal(result.state.bonusThisWave.plants, 0);
  assert.equal(result.state.humanPurchasesThisWave, 0);
  assert.equal(result.state.resources.plants, 325); // 200 +100 -50 +25base +2×25 timed sun
  assert.equal(result.state.resources.zombies, 225);
  assert(result.events.some(event => event.type === 'income' && event.plants === 25 && event.zombies === 25));
  assert.equal(result.events.filter(event => event.type === 'sun').length, 2);
});

test('sunflower income counts no more than four living producers', () => {
  const start = withoutCPU(createLiveMatch({ waves: 2, waveSeconds: 30 }));
  start.units = Array.from({ length: 5 }, (_, row) => injectedUnit('sunflower', row, 1));
  const result = advance(start, 30).state;
  assert.equal(result.resources.plants, 425); // four producers × two timed suns, plus base income
});

test('zombies move fractionally between questions without triggering round resolution', () => {
  let state = withoutCPU(createLiveMatch({ mode: 'coop-zombies' }));
  state.units = [injectedUnit('common', 1, 7)];
  const result = advance(state, 5);
  assert(Math.abs(result.state.units[0].col - 6) < 1e-8);
  assert.equal(result.state.round, 1);
  assert.equal(result.state.stats.roundsResolved, 0);
  assert(result.events.some(event => event.type === 'move'));
});

test('shooters fire over time and damage the first target in front', () => {
  const state = withoutCPU(createLiveMatch());
  state.units = [injectedUnit('peashooter', 0, 2), injectedUnit('bucket', 0, 6), injectedUnit('cone', 0, 7)];
  const result = advance(state, 4.8);
  assert.equal(result.state.units.find(unit => unit.typeId === 'bucket').hp, getUnit('bucket').hp - 2);
  assert.equal(result.state.units.find(unit => unit.typeId === 'cone').hp, getUnit('cone').hp);
  assert.equal(result.events.filter(event => event.type === 'shot').length, 2);
});

test('a fast zombie stops at a wall and bites it rather than teleporting through', () => {
  const state = withoutCPU(createLiveMatch());
  state.units = [injectedUnit('football', 2, 5), injectedUnit('wallnut', 2, 4)];
  const result = advance(state, 4);
  const wall = result.state.units.find(unit => unit.typeId === 'wallnut');
  const zombie = result.state.units.find(unit => unit.typeId === 'football');
  assert.equal(zombie.col, 4.42);
  assert(wall.hp < getUnit('wallnut').hp && wall.hp > 0);
});

test('an armed mine detonates once; an unarmed mine and a balloon are ignored', () => {
  const state = withoutCPU(createLiveMatch());
  state.units = [injectedUnit('potato-mine', 0, 4, { readyAt: 5 }), injectedUnit('common', 0, 4.6)];
  const passed = advance(state, 1).state;
  assert.equal(passed.units.filter(unit => unit.side === 'zombies').length, 1);
  const armed = { ...state, units: state.units.map(unit => ({ ...unit, readyAt: 0 })) };
  const detonated = advance(armed, 1);
  assert.equal(detonated.state.units.length, 0);
  assert.equal(detonated.events.filter(event => event.type === 'mine').length, 1);
  const air = { ...armed, units: [injectedUnit('potato-mine', 0, 4), injectedUnit('balloon', 0, 4.6)] };
  assert.equal(advance(air, 1).state.units.length, 2);
});

test('chompers rest after eating and cannot consume balloon zombies', () => {
  const state = withoutCPU(createLiveMatch());
  state.units = [injectedUnit('chomper', 0, 4), injectedUnit('common', 0, 4.6), injectedUnit('bucket', 0, 5.0), injectedUnit('balloon', 0, 4.5)];
  const result = advance(state, 1);
  assert.equal(result.events.filter(event => event.type === 'chomp').length, 1);
  assert(result.state.units.some(unit => unit.typeId === 'bucket'));
  assert(result.state.units.some(unit => unit.typeId === 'balloon'));
  assert.equal(result.state.units.find(unit => unit.typeId === 'chomper').chompCooldown, LIVE_RULES.fixedStep + 20);
});

test('spikes damage ground units periodically but do not block movement', () => {
  const state = withoutCPU(createLiveMatch());
  state.units = [injectedUnit('spikeweed', 0, 4), injectedUnit('bucket', 0, 4.4), injectedUnit('balloon', 0, 4.4)];
  const result = advance(state, 2.1).state;
  assert.equal(result.units.find(unit => unit.typeId === 'bucket').hp, getUnit('bucket').hp - 2);
  assert.equal(result.units.find(unit => unit.typeId === 'balloon').hp, getUnit('balloon').hp);
  assert(result.units.find(unit => unit.typeId === 'bucket').col < 4.4);
});

test('a mower sweeps its whole lane once, including simultaneous arrivals, armor and flyers', () => {
  const state = withoutCPU(createLiveMatch());
  state.units = [
    injectedUnit('common', 1, 0.3), injectedUnit('cone', 1, 0.3),
    injectedUnit('bucket', 1, 7), injectedUnit('football', 1, 6), injectedUnit('balloon', 1, 7),
    injectedUnit('sunflower', 1, 2), injectedUnit('cone', 2, 7), injectedUnit('wallnut', 2, 2),
  ];
  const sweptIds = state.units.filter(unit => unit.side === 'zombies' && unit.row === 1).map(unit => unit.id).sort();
  const first = stepLive(state, 1 / 60);
  assert.deepEqual(first.state.mowers, [true, false, true, true, true]);
  assert.equal(first.state.units.some(unit => unit.side === 'zombies' && unit.row === 1), false);
  assert.deepEqual(first.events.filter(event => event.type === 'mower'), [{ type: 'mower', row: 1, col: 0 }]);
  assert.deepEqual(first.events.filter(event => event.type === 'damage' && event.sourceId === 'mower').map(event => event.unitId).sort(), sweptIds);
  assert.deepEqual(first.events.filter(event => event.type === 'defeat').map(event => event.unitId).sort(), sweptIds);
  assert.equal(first.state.stats.unitsDefeated.zombies, sweptIds.length);
  assert.equal(first.state.stats.unitsDefeated.plants, 0);
  assert.equal(first.events.some(event => event.type === 'invasion'), false);
  assert.equal(first.state.winner, null);
  const otherLane = first.state.units.find(unit => unit.side === 'zombies');
  assert.equal(otherLane.row, 2);
  assert(otherLane.col < 7);
  assert.equal(otherLane.hp, getUnit('cone').hp);
  for (const typeId of ['sunflower', 'wallnut']) assert.equal(first.state.units.find(unit => unit.typeId === typeId).hp, getUnit(typeId).hp);
  const next = advance(first.state, 0.5);
  assert.equal(next.events.some(event => event.type === 'mower'), false);
  assert.equal(next.state.mowers[1], false);
});

test('a later arrival can invade a lane after its mower was consumed', () => {
  const state = withoutCPU(createLiveMatch());
  state.units = [injectedUnit('common', 1, 0.3), injectedUnit('bucket', 1, 7)];
  const first = stepLive(state, 1 / 60);
  assert.equal(first.state.units.length, 0);
  assert.equal(first.state.mowers[1], false);
  const reinforced = { ...first.state, units: [injectedUnit('bucket', 1, 1)] };
  const waiting = stepLive(reinforced, 1 / 60);
  assert.equal(waiting.state.units.length, 1);
  assert.equal(waiting.events.some(event => event.type === 'mower'), false);
  assert.equal(waiting.state.winner, null);
  const invasion = advance(waiting.state, 4);
  assert.equal(invasion.events.some(event => event.type === 'mower'), false);
  assert.deepEqual(invasion.events.filter(event => event.type === 'invasion'), [{ type: 'invasion', row: 1 }]);
  assert.equal(invasion.state.mowers[1], false);
  assert.equal(invasion.state.winner, 'zombies');
  assert.equal(invasion.state.phase, 'finished');
});

test('house invasion wins immediately even on the final wave boundary', () => {
  const state = withoutCPU(createLiveMatch({ waves: 1, waveSeconds: 30 }));
  state.elapsed = 30 - 1 / 60; state.tickCount = 1799;
  state.mowers[0] = false;
  state.units = [injectedUnit('common', 0, 0.3)];
  const result = stepLive(state, 1 / 60).state;
  assert.equal(result.winner, 'zombies');
  assert.equal(result.closing, true);
});

test('the final wave drains remaining zombies instead of declaring a false plant victory', () => {
  const state = withoutCPU(createLiveMatch({ waves: 1, waveSeconds: 30 }));
  state.units = [injectedUnit('bucket', 0, 7, { move: 0 })];
  const last = advance(state, 30).state;
  assert.equal(last.closing, true);
  assert.equal(last.phase, 'live');
  assert.equal(last.winner, null);
  assert.throws(() => buyLiveUnit(last, 'plants', 'wallnut', 0, 1), /última oleada/);
  assert.equal(awardLiveResources(pauseLive(last, true), 'plants', 100).resources.plants, 300);
  const draw = advance(last, 120).state;
  assert.equal(draw.phase, 'finished');
  assert.equal(draw.winner, 'draw');
  assert.deepEqual(stepLive(draw, 0.25).state, draw);
});

test('plants win at closing only after all existing zombies are defeated', () => {
  const state = withoutCPU(createLiveMatch({ waves: 1, waveSeconds: 30 }));
  const result = advance(state, 30).state;
  assert.equal(result.winner, 'plants');
  assert.equal(result.stats.wavesCompleted, 1);
  assert.throws(() => awardLiveResources(result, 'plants', 25), /terminó/);
});

test('assistant deployments are staggered and never spend student resources', () => {
  const start = createLiveMatch({ waves: 1, waveSeconds: 30, seed: 'cpu-bounded' });
  const early = advance(start, 4).state;
  assert.equal(early.units.length, 0);
  const spawn = advance(early, 2);
  assert.equal(spawn.state.units.filter(unit => unit.side === 'zombies').length, 1);
  const later = advance(spawn.state, 10).state;
  assert(later.units.filter(unit => unit.side === 'zombies').length <= 3);
  assert.equal(later.stats.resourcesSpent.zombies, 0);
  assert.equal(later.resources.zombies, 200);
  assert.equal(later.cpuPurchasesThisWave, 0);
  assert.equal(later.cpuNextActionAt, Infinity);
  assert(spawn.events.some(event => event.type === 'deployment' && event.source === 'assistant-wave'));
});

test('the first assistant zombie wave gives preparation time and covers every lane', () => {
  for (const seed of ['a', 'b', 'c', 'd']) {
    const start = createLiveMatch({ waves: 2, waveSeconds: 45, seed });
    const beforeFive = advance(start, 4.9);
    assert.equal(beforeFive.state.units.length, 0);
    const wave = advance(beforeFive.state, 30);
    const deployed = wave.events.filter(event => event.type === 'deployment' && event.side === 'zombies');
    assert.equal(deployed.length, 5);
    assert.equal(new Set(deployed.map(event => event.row)).size, 5);
    assert(deployed.every(event => event.typeId === 'common' && event.source === 'assistant-wave'));
    assert.equal(wave.state.stats.resourcesIncome.zombies, 0);
    assert.equal(wave.state.stats.resourcesSpent.zombies, 0);
  }
});

test('the CPU plant defense reacts early but keeps its same two paid purchases per wave', () => {
  let state = createLiveMatch({ mode: 'coop-zombies', waves: 2, waveSeconds: 30 });
  state = buyLiveUnit(state, 'zombies', 'football', 1, 7);
  const reacted = advance(state, 1);
  assert.equal(reacted.state.stats.unitsPlaced.plants, 4);
  assert(reacted.events.some(event => event.type === 'deployment' && event.side === 'plants' && event.row === 1));
  const later = advance(reacted.state, 10).state;
  assert.equal(later.stats.unitsPlaced.plants, 5);
  assert.equal(later.cpuPurchasesThisWave, 2);
  assert(later.stats.resourcesSpent.plants <= 300);
});

test('cooperative zombies has three visible starter defenses and progressive free assistance', () => {
  const state = createLiveMatch({ mode: 'coop-zombies', waves: 2, waveSeconds: 30 });
  assert.equal(state.units.filter(unit => unit.side === 'plants').length, 3);
  assert.equal(state.units.filter(unit => unit.side === 'zombies').length, 0);
  assert.equal(state.resources.plants, 300);
  assert.equal(state.stats.resourcesSpent.plants, 0);
  const later = advance(state, 30);
  assert.equal(later.events.filter(event => event.type === 'deployment' && event.source === 'assistant-wave').length, 5);
  assert.equal(later.state.assistantWavePlan.length, 6);
  assert(later.state.stats.resourcesSpent.plants <= 425);
});

test('public snapshots omit answers, RNG and mutable combat internals', () => {
  const state = createLiveMatch({ mode: 'coop-zombies' });
  state.questions = [{ answer: 'secret' }]; state.secretKey = 'secret';
  const snapshot = liveSnapshot(state);
  assert.equal(snapshot.questions, undefined);
  assert.equal(snapshot.secretKey, undefined);
  assert.equal(snapshot.randomState, undefined);
  assert.equal(snapshot.config.seed, undefined);
  assert.equal(snapshot.units[0].groundHits, undefined);
  assert.equal(snapshot.assistantWavePlan, undefined);
  assert.equal(snapshot.zombieSpeed, 1);
  snapshot.resources.plants = 0;
  snapshot.units[0].hp = 0;
  assert.equal(state.resources.plants, 300);
  assert(state.units[0].hp > 0);
});

test('duel preparation supports both human teams and combat starts only when resumed', () => {
  const original = createLiveMatch({ mode: 'duel', startPaused: true, waves: 2, waveSeconds: 30 });
  let state = buyLiveUnit(original, 'plants', 'sunflower', 0, 1);
  state = buyLiveUnit(state, 'plants', 'sunflower', 1, 1);
  state = awardLiveResources(state, 'plants', 25);
  state = selectLiveSide(state, 'zombies');
  state = awardLiveResources(state, 'zombies', 100);
  state = buyLiveUnit(state, 'zombies', 'common', 0, 7);
  state = buyLiveUnit(state, 'zombies', 'common', 1, 7);
  assert.equal(original.units.length, 0);
  assert.equal(state.activeSide, 'zombies');
  assert.equal(state.humanSide, 'zombies');
  assert.deepEqual(state.purchasesBySideThisWave, { plants: 2, zombies: 2 });
  assert.equal(state.humanPurchasesThisWave, 2);
  assert.equal(state.cpuNextActionAt, Infinity);
  assert.equal(state.cpuPurchasesThisWave, 0);
  assert.deepEqual(advance(state, 20), { state, events: [] });
  const started = advance(pauseLive(state, false), 1).state;
  assert.equal(started.elapsed, 1);
  assert.equal(started.initialStaging, false);
  assert(started.units.find(unit => unit.typeId === 'common').col < 7);
  assert.equal(started.stats.resourcesSpent.plants, 100);
  assert.equal(started.stats.resourcesSpent.zombies, 50);
  assert.equal(liveSnapshot(state).initialStaging, true);
  assert.throws(() => selectLiveSide(createLiveMatch(), 'zombies'), /salón/);
  assert.throws(() => selectLiveSide(state, 'missing'));
});

test('duel purchases are counted independently for both sides', () => {
  let state = createLiveMatch({ mode: 'duel', startPaused: true });
  state.purchasesBySideThisWave.plants = 10;
  state.humanPurchasesThisWave = 10;
  state = buyLiveUnit(state, 'plants', 'wallnut', 0, 1);
  assert.equal(state.purchasesBySideThisWave.plants, 11);
  state = buyLiveUnit(state, 'zombies', 'common', 0, 7);
  assert.equal(state.purchasesBySideThisWave.zombies, 1);
  assert.equal(state.purchasesBySideThisWave.plants, 11);
  state = selectLiveSide(state, 'zombies');
  assert.equal(state.humanPurchasesThisWave, 1);
});

test('continuous rewards have no per-wave answer limit, including paused and closing combat', () => {
  let state = withoutCPU(createLiveMatch({ mode: 'duel', startPaused: true, waves: 1, waveSeconds: 30 }));
  for (const side of ['plants', 'zombies']) {
    for (let index = 0; index < 9; index += 1) state = awardLiveResources(state, side, 100);
    assert.equal(state.resources[side], 1100);
    assert.equal(state.bonusThisWave[side], 900);
  }
  state.units = [injectedUnit('bucket', 0, 7, { move: 0 })];
  state = advance(pauseLive(state, false), 30).state;
  assert.equal(state.closing, true);
  for (const side of ['plants', 'zombies']) state = awardLiveResources(state, side, 100);
  assert.deepEqual(state.resources, { plants: 1200, zombies: 1200 });
  state.resources.plants = 1490;
  const awarded = awardLiveResources(state, 'plants', 100);
  assert.equal(awarded.resources.plants, 1500);
  assert.equal(awarded.stats.resourcesAwarded.plants - state.stats.resourcesAwarded.plants, 10);
  const finished = advance(state, 120).state;
  assert.equal(finished.phase, 'finished');
  assert.throws(() => awardLiveResources(finished, 'zombies', 25), /terminó/);
});

test('sunflowers automatically credit each producer and emit real sun amounts every twelve seconds', () => {
  let state = withoutCPU(createLiveMatch({ waves: 2, waveSeconds: 30 }));
  state = buyLiveUnit(state, 'plants', 'sunflower', 2, 1);
  const waiting = advance(state, 11.9);
  assert.equal(waiting.events.filter(event => event.type === 'sun').length, 0);
  assert.equal(waiting.state.resources.plants, 150);
  const first = advance(waiting.state, 0.1);
  assert.deepEqual(first.events.find(event => event.type === 'sun'), {
    type: 'sun', unitId: state.units[0].id, row: 2, col: 1, side: 'plants', amount: 25,
  });
  assert.equal(first.state.resources.plants, 175);
  assert.equal(first.state.stats.resourcesIncome.plants, 25);
  const capped = { ...first.state, resources: { plants: 1490, zombies: 200 } };
  const second = advance(capped, 12);
  assert.equal(second.events.find(event => event.type === 'sun').amount, 10);
  assert.equal(second.state.resources.plants, 1500);
  assert.equal(second.state.stats.resourcesIncome.plants, 35);
  const paused = advance(pauseLive(first.state, true), 12);
  assert.equal(paused.state.elapsed, 12);
  assert.equal(paused.events.length, 0);
});

test('extra sunflowers can be planted and a waiting producer takes over without stored income', () => {
  let state = createLiveMatch({ mode: 'duel', startPaused: true });
  state = awardLiveResources(state, 'plants', 100);
  for (let row = 0; row < 5; row += 1) state = buyLiveUnit(state, 'plants', 'sunflower', row, 1);
  assert.equal(state.units.length, 5);
  const fifthId = state.units[4].id;
  state = withoutCPU(pauseLive(state, false));
  const first = advance(state, 12);
  assert.equal(first.events.filter(event => event.type === 'sun').length, 4);
  assert(!first.events.some(event => event.type === 'sun' && event.unitId === fifthId));
  first.state.units[0].hp = 0;
  const takeover = advance(first.state, 12);
  assert.equal(takeover.events.filter(event => event.type === 'sun').length, 4);
  assert.equal(takeover.events.filter(event => event.type === 'sun' && event.unitId === fifthId).length, 1);
});

test('all continuous modes get the same free five-lane first assistant wave', () => {
  for (const mode of ['duel', 'coop-plants', 'coop-zombies']) {
    const state = createLiveMatch({ mode, waves: 2, waveSeconds: 30, seed: 'all-modes' });
    const result = advance(state, 25);
    const assistance = result.events.filter(event => event.type === 'deployment' && event.source === 'assistant-wave');
    assert.equal(assistance.length, 5);
    assert.equal(new Set(assistance.map(event => event.row)).size, 5);
    assert(assistance.every(event => event.typeId === 'common'));
    assert.equal(result.state.stats.resourcesSpent.zombies, 0);
    assert.equal(result.state.resources.zombies, 200);
    if (mode === 'duel') assert.equal(result.state.stats.resourcesSpent.plants, 0);
  }
});

test('assistant waves gain fixed counts and scheduled stronger types without adaptive difficulty', () => {
  let state = createLiveMatch({ mode: 'duel', waves: 6, waveSeconds: 30, seed: 'progression' });
  assert.equal(state.assistantWavePlan.length, 5);
  for (let round = 2; round <= 6; round += 1) {
    state.tickCount = (round - 1) * 30 * 60 - 1;
    state.elapsed = state.tickCount / 60;
    state.units = [];
    state = stepLive(state, 1 / 60).state;
    assert.equal(state.round, round);
    assert.equal(state.assistantWavePlan.length, 5 + round - 1);
    assert(state.assistantWavePlan.some(unit => unit.typeId === ['cone', 'bucket', 'football', 'balloon', 'dragon'][round - 2]));
    const schedule = structuredClone(state.assistantWavePlan);
    state = awardLiveResources(state, 'plants', 100);
    assert.deepEqual(state.assistantWavePlan, schedule);
    assert.equal(state.stats.resourcesSpent.zombies, 0);
  }
});

test('a full board skips assisted arrivals and closing never schedules another zombie', () => {
  const state = createLiveMatch({ mode: 'duel', waves: 1, waveSeconds: 30 });
  state.units = Array.from({ length: LIVE_RULES.maxZombies }, (_, index) => injectedUnit('common', index % 5, 7, { id: `limit-${index}`, move: 0 }));
  const crowded = advance(state, 25);
  assert.equal(crowded.state.units.length, LIVE_RULES.maxZombies);
  assert.equal(crowded.state.stats.assistantUnitsSpawned, 0);
  assert(!crowded.events.some(event => event.source === 'assistant-wave'));
  crowded.state.units.pop();
  const closing = advance(crowded.state, 6);
  assert.equal(closing.state.closing, true);
  assert.equal(closing.state.units.length, LIVE_RULES.maxZombies - 1);
  assert(!closing.events.some(event => event.source === 'assistant-wave'));
});

test('six speed presets change only zombie movement and publish their chosen speed', () => {
  assert.deepEqual(LIVE_ZOMBIE_SPEED_PRESETS, [0.35, 0.55, 0.8, 1, 1.3, 1.7]);
  const state = withoutCPU(createLiveMatch());
  state.units = [injectedUnit('common', 0, 7)];
  for (const speed of LIVE_ZOMBIE_SPEED_PRESETS) {
    const chosen = setLiveZombieSpeed(state, speed);
    const result = advance(chosen, 5).state;
    assert(Math.abs(result.units[0].col - (7 - speed)) < 1e-8);
    assert.equal(result.elapsed, 5);
    assert.equal(result.round, 1);
    assert.equal(liveSnapshot(result).zombieSpeed, speed);
  }
  assert.equal(state.zombieSpeed, 1);
  for (const speed of [undefined, null, NaN, Infinity, '1', 0.24, 2.01]) assert.throws(() => setLiveZombieSpeed(state, speed));
  assert.throws(() => setLiveZombieSpeed(state, 0.25));
  assert.throws(() => setLiveZombieSpeed(state, 2));
  const blocked = { ...state, units: [injectedUnit('common', 0, 2.42), injectedUnit('wallnut', 0, 2, { hp: 50, maxHp: 50 })] };
  for (const speed of [0.35, 1.7]) {
    const result = advance(setLiveZombieSpeed(blocked, speed), 4.5);
    assert.equal(result.events.filter(event => event.type === 'bite').length, 3);
    assert.equal(result.state.units.find(unit => unit.typeId === 'wallnut').hp, 47);
    assert.equal(result.state.units.find(unit => unit.typeId === 'common').col, 2.42);
  }
});

test('all continuous modes automatically accelerate by wave and cap at the sixth preset', () => {
  for (const mode of ['duel', 'coop-plants', 'coop-zombies']) {
    let state = createCurrentLiveMatch({ mode, waves: 8, waveSeconds: 30, tacticalPauses: false });
    assert.equal(state.zombieSpeed, .35);
    assert.equal(state.zombieSpeedMode, 'auto');
    for (let round = 2; round <= 8; round += 1) {
      state.tickCount = (round - 1) * 30 * 60 - 1;
      state.elapsed = state.tickCount / 60;
      state.units = [];
      state = stepLive(state, 1 / 60).state;
      assert.equal(state.round, round);
      assert.equal(state.zombieSpeed, LIVE_ZOMBIE_SPEED_PRESETS[Math.min(round - 1, 5)]);
      assert.equal(liveSnapshot(state).zombieSpeedMode, 'auto');
    }
  }
});

test('a manual speed change survives ticks, but the next wave returns to automatic progression', () => {
  let state = withoutCPU(createCurrentLiveMatch({ mode: 'duel', waves: 2, waveSeconds: 30, tacticalPauses: false }));
  state = setLiveZombieSpeed(state, 1.3);
  assert.equal(state.zombieSpeedMode, 'manual');
  state = advance(state, 1).state;
  assert.equal(state.zombieSpeed, 1.3);
  state.tickCount = 1799; state.elapsed = state.tickCount / 60; state.units = [];
  const next = stepLive(state, 1 / 60).state;
  assert.equal(next.round, 2);
  assert.equal(next.zombieSpeed, .55);
  assert.equal(next.zombieSpeedMode, 'auto');
});

test('paused shoppers can use all 1500 resources without a ten-purchase or same-unit recharge lock', () => {
  let state = pauseLive(createLiveMatch({ mode: 'duel' }), true);
  state.resources.zombies = 1500;
  for (let index = 0; index < 60; index += 1) state = buyLiveUnit(state, 'zombies', 'common', index % 5, 7);
  assert.equal(state.resources.zombies, 0);
  assert.equal(state.purchasesBySideThisWave.zombies, 60);
  assert.equal(state.units.length, 60);
  state.resources.plants = 1500;
  for (let row = 0; row < 5; row += 1) for (let col = 1; col <= 6; col += 1) {
    // Move entry zombies away only for the independent plant-space fixture.
    state.units = state.units.filter(unit => unit.side === 'plants');
    state = buyLiveUnit(state, 'plants', 'sunflower', row, col);
  }
  assert.equal(state.resources.plants, 0);
  assert.equal(state.units.length, 30);
  assert.equal(state.purchasesBySideThisWave.plants, 30);
});

test('chomper chewing lasts twenty combat seconds, freezes during pause and then permits another bite', () => {
  const state = withoutCPU(createLiveMatch());
  state.units = [injectedUnit('chomper', 0, 4), injectedUnit('common', 0, 4.6, { move: 0, damage: 0 }),
    injectedUnit('bucket', 0, 4.6, { move: 0, damage: 0 })];
  const first = stepLive(state, 1 / 60);
  assert.equal(first.events.filter(event => event.type === 'chomp').length, 1);
  const projected = liveSnapshot(first.state).units.find(unit => unit.typeId === 'chomper');
  assert.equal(projected.cooldownSeconds, 20);
  assert.equal(projected.digesting, true);
  const paused = advance(pauseLive(first.state, true), 30);
  assert.equal(liveSnapshot(paused.state).units.find(unit => unit.typeId === 'chomper').cooldownSeconds, 20);
  const waiting = advance(first.state, 19.9);
  assert.equal(waiting.events.filter(event => event.type === 'chomp').length, 0);
  assert(waiting.state.units.some(unit => unit.typeId === 'bucket'));
  const ready = advance(waiting.state, .1);
  assert.equal(ready.events.filter(event => event.type === 'chomp').length, 1);
});

test('spikes slow ground zombies forty percent only on contact and never affect floating units', () => {
  for (const typeId of ['bucket', 'balloon', 'dragon']) {
    const state = withoutCPU(createLiveMatch());
    state.units = [injectedUnit('spikeweed', 0, 4), injectedUnit(typeId, 0, 4.4)];
    const result = advance(state, 1).state.units.find(unit => unit.typeId === typeId);
    assert(Math.abs(result.col - (4.4 - .2 * (typeId === 'bucket' ? .6 : 1))) < 1e-8);
    assert.equal(result.hp, getUnit(typeId).hp - (typeId === 'bucket' ? 1 : 0));
    // Away from the tile, ground speed is restored without lingering slow.
    const outside = { ...state, units: state.units.map(unit => unit.typeId === typeId ? { ...unit, col: 3.5 } : unit) };
    assert(Math.abs(advance(outside, 1).state.units.find(unit => unit.typeId === typeId).col - 3.3) < 1e-8);
  }
});

test('ice impacts slow thirty percent for four seconds; renewed ice never multiplies spike slowing', () => {
  let state = withoutCPU(createLiveMatch());
  state.units = [injectedUnit('snow-pea', 0, 1, { shootCooldown: 0 }), injectedUnit('bucket', 0, 6)];
  const hit = stepLive(state, 1 / 60);
  const shot = hit.events.find(event => event.type === 'shot');
  assert.equal(shot.typeId, 'snow-pea'); assert.equal(shot.ice, true);
  assert(hit.events.some(event => event.type === 'freeze'));
  assert.equal(hit.state.units.find(unit => unit.typeId === 'bucket').hp, 11);
  assert.equal(liveSnapshot(hit.state).units.find(unit => unit.typeId === 'bucket').freezeUntil, 4 + 1 / 60);
  state = { ...hit.state, units: hit.state.units.map(unit => unit.typeId === 'snow-pea' ? { ...unit, shootCooldown: 1000 } : unit) };
  const ice = advance(state, 1);
  const before = state.units.find(unit => unit.typeId === 'bucket').col;
  assert(Math.abs(ice.state.units.find(unit => unit.typeId === 'bucket').col - (before - .2 * .7)) < 1e-8);
  const expired = advance(state, 4.1).state;
  const unfrozen = advance(expired, 1).state;
  assert(Math.abs(expired.units.find(unit => unit.typeId === 'bucket').col - unfrozen.units.find(unit => unit.typeId === 'bucket').col - .2) < 1e-8);
  const combined = withoutCPU(createLiveMatch());
  combined.units = [injectedUnit('spikeweed', 0, 4), injectedUnit('bucket', 0, 4.4, { freezeUntil: 4 })];
  assert(Math.abs(advance(combined, 1).state.units.find(unit => unit.typeId === 'bucket').col - 4.28) < 1e-8);
  const renewed = advance(hit.state, 2.4).state;
  assert(renewed.units.find(unit => unit.typeId === 'bucket').freezeUntil > 6.4);
});

test('dragons float over mines and chewing plants without either terrestrial effect', () => {
  const state = withoutCPU(createLiveMatch());
  state.units = [injectedUnit('potato-mine', 0, 4), injectedUnit('chomper', 0, 3), injectedUnit('dragon', 0, 4.4)];
  const result = advance(state, 8);
  assert.equal(result.state.units.find(unit => unit.typeId === 'dragon').hp, 19);
  assert(!result.events.some(event => ['chomp', 'mine', 'bite'].includes(event.type)));
});
