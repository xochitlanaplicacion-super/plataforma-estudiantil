import test from 'node:test';
import assert from 'node:assert/strict';
import { getUnit } from '../../../public/games/pvz-quest/classroom/catalog.js';
import { profileRules } from '../../../public/games/pvz-quest/classroom/balance-profiles.js';
import { zombieEntryQueueCounts } from '../../../public/games/pvz-quest/classroom/entry-queue.js';
import {
  LIVE_RULES, createLiveMatch, buyLiveUnit, pauseLive, stepLive, liveSnapshot,
  beginLiveInitialCoin, beginLiveTacticalShopping, confirmLiveTacticalTurn,
  resumeLiveTacticalWave,
} from '../../../public/games/pvz-quest/classroom/live-engine.js';

function match(profile = 'aula', overrides = {}) {
  const state = createLiveMatch({ mode: 'duel', balanceProfile: profile,
    zombieSpeed: 1, tacticalPauses: false, waves: 1, waveSeconds: 600, ...overrides });
  state.cpuNextActionAt = Infinity;
  state.assistantNextActionAt = Infinity;
  return state;
}

function unit(typeId, row, col, profile = 'aula', overrides = {}) {
  const type = getUnit(typeId, profile), rules = profileRules(profile);
  return {
    id: `${profile}-${typeId}-${row}-${col}`, typeId, side: type.side, row, col,
    hp: type.hp, maxHp: type.hp, damage: type.damage, move: type.move,
    ability: type.ability, placedRound: 1, placedAt: 0,
    readyAt: typeId === 'potato-mine' ? rules.mineArmSeconds : 0,
    shootCooldown: rules.shotSeconds, biteCooldown: rules.biteSeconds,
    chompCooldown: 0, groundHits: {}, ...overrides,
  };
}

function advance(original, seconds, dt = 0.25) {
  let state = original;
  const events = [];
  for (let remaining = seconds; remaining > 1e-8; remaining -= dt) {
    const result = stepLive(state, Math.min(dt, remaining));
    state = result.state;
    events.push(...result.events);
  }
  return { state, events };
}

function fundedQueue(profile, types, row = 0) {
  let state = pauseLive(match(profile), true);
  state.resources.zombies = 1500;
  for (const typeId of types) state = buyLiveUnit(state, 'zombies', typeId, row, 7);
  return state;
}

for (const profile of ['aula', 'classic']) {
  test(`${profile}: purchases wait FIFO by lane and pay exactly once before deployment`, () => {
    let state = fundedQueue(profile, ['common', 'football', 'bucket']);
    const ids = state.units.map(item => item.id);
    assert.deepEqual(state.units.map(item => item.entryPending), [false, true, true]);
    assert.equal(state.stats.unitsPlaced.zombies, 3);
    assert.equal(state.purchasesBySideThisWave.zombies, 3);
    assert.equal(state.stats.resourcesSpent.zombies, 300);
    assert.equal(state.resources.zombies, 1200);
    const untouched = structuredClone(state);
    const first = advance(pauseLive(state, false), 5);
    assert.deepEqual(state, untouched);
    assert.deepEqual(first.events.filter(event => event.type === 'deployment').map(event => event.unitId), [ids[1]]);
    assert.equal(first.state.units.find(item => item.id === ids[1]).col, 7);
    assert.equal(first.state.units.find(item => item.id === ids[2]).entryPending, true);
    const second = advance(first.state, 2.5);
    assert.deepEqual(second.events.filter(event => event.type === 'deployment').map(event => event.unitId), [ids[2]]);
    assert.equal(second.state.units.find(item => item.id === ids[2]).col, 7);
    assert.equal(second.state.resources.zombies, 1200);
    assert.equal(second.state.stats.resourcesSpent.zombies, 300);
    assert.equal(second.state.stats.unitsPlaced.zombies, 3);
  });

  test(`${profile}: FIFO follows array order, not lexical IDs or faster zombie types`, () => {
    const state = match(profile);
    state.units = [
      unit('common', 0, 6, profile, { id: 'live-unit-1', move: 0 }),
      unit('bucket', 0, 7, profile, { id: 'live-unit-2', entryPending: true }),
      unit('football', 0, 7, profile, { id: 'live-unit-10', entryPending: true }),
    ];
    const result = stepLive(state, LIVE_RULES.fixedStep);
    const deployed = result.events.filter(event => event.type === 'deployment');
    assert.deepEqual(deployed.map(event => event.unitId), ['live-unit-2']);
    assert.equal(result.state.units.find(item => item.id === 'live-unit-2').col, 7);
    assert.equal(result.state.units.find(item => item.id === 'live-unit-10').entryPending, true);
  });

  test(`${profile}: lanes release independently and a fast first zombie clears its own entrance sooner`, () => {
    let state = fundedQueue(profile, ['football', 'common'], 0);
    for (const typeId of ['common', 'bucket']) state = buyLiveUnit(state, 'zombies', typeId, 1, 7);
    const ids = state.units.map(item => item.id);
    const first = advance(pauseLive(state, false), 2.5);
    assert.equal(first.state.units.find(item => item.id === ids[1]).entryPending, false);
    assert.equal(first.state.units.find(item => item.id === ids[3]).entryPending, true);
    assert.deepEqual(first.events.filter(event => event.type === 'deployment').map(event => event.row), [0]);
    const second = advance(first.state, 2.5);
    assert.equal(second.state.units.find(item => item.id === ids[3]).entryPending, false);
    assert(second.events.some(event => event.type === 'deployment' && event.unitId === ids[3] && event.row === 1));
  });

  test(`${profile}: ice delays the actual entrance clearance without freezing the waiting zombie`, () => {
    const state = match(profile);
    state.units = [
      unit('snow-pea', 0, 1, profile),
      unit('bucket', 0, 7, profile, { id: 'front', hp: 10000, maxHp: 10000 }),
      unit('common', 0, 7, profile, { id: 'waiting', entryPending: true }),
    ];
    const first = advance(state, 5);
    const waiting = first.state.units.find(item => item.id === 'waiting');
    assert.equal(waiting.entryPending, true);
    assert.equal(waiting.hp, getUnit('common', profile).hp);
    assert.equal(waiting.freezeUntil, undefined);
    assert(first.events.some(event => event.type === 'freeze' && event.targetId === 'front'));
    assert.equal(first.events.some(event => event.targetId === 'waiting' || event.unitId === 'waiting'), false);
    const next = advance(first.state, 3);
    assert.equal(next.state.units.find(item => item.id === 'waiting').entryPending, false);
    assert.equal(next.events.filter(event => event.type === 'deployment' && event.unitId === 'waiting').length, 1);
  });

  test(`${profile}: 40% ground slowing governs clearance while flying zombies ignore spikes`, () => {
    const state = match(profile);
    state.units = [
      unit('spikeweed', 0, 6, profile),
      unit('bucket', 0, 6.45, profile, { id: 'ground', freezeUntil: 100 }),
      unit('common', 0, 7, profile, { id: 'ground-wait', entryPending: true }),
      unit('spikeweed', 1, 6, profile),
      unit('balloon', 1, 6.45, profile, { id: 'flying' }),
      unit('common', 1, 7, profile, { id: 'air-wait', entryPending: true }),
    ];
    const first = advance(state, 1);
    assert(Math.abs(first.state.units.find(item => item.id === 'ground').col - 6.33) < 1e-8);
    assert.equal(first.state.units.find(item => item.id === 'ground-wait').entryPending, true);
    const next = advance(first.state, 2);
    assert.equal(next.state.units.find(item => item.id === 'ground-wait').entryPending, true);
    assert.equal(next.state.units.find(item => item.id === 'air-wait').entryPending, false);
    assert.equal(next.state.units.find(item => item.id === 'flying').hp, getUnit('balloon', profile).hp);
    const last = advance(next.state, 1);
    assert.equal(last.state.units.find(item => item.id === 'ground-wait').entryPending, false);
  });

  for (const mode of ['duel', 'coop-plants', 'coop-zombies']) {
    test(`${profile}/${mode}: automatic assistance joins the same queue and deploys only when released`, () => {
      const state = match(profile, { mode });
      state.units = [
        unit('bucket', 1, 7, profile, { id: 'front' }),
        unit('football', 1, 7, profile, { id: 'reserved', entryPending: true }),
      ];
      state.assistantWavePlan = [{ typeId: 'common', row: 1, at: 0 }];
      state.assistantNextActionAt = 0;
      state.assistantNextIndex = 0;
      const first = stepLive(state, LIVE_RULES.fixedStep);
      const assisted = first.state.units.find(item => item.entrySource === 'assistant-wave');
      assert(assisted);
      assert.equal(assisted.entryPending, true);
      assert.equal(first.events.some(event => event.type === 'deployment'), false);
      assert.equal(first.state.stats.assistantUnitsSpawned, 1);
      assert.equal(first.state.stats.unitsPlaced.zombies, 1);
      assert.equal(first.state.stats.resourcesSpent.zombies, 0);
      const result = advance(first.state, 8);
      assert.deepEqual(result.events.filter(event => event.type === 'deployment').map(event => event.unitId), ['reserved', assisted.id]);
      const entry = result.events.find(event => event.type === 'deployment' && event.unitId === assisted.id);
      assert.equal(entry.source, 'assistant-wave');
      assert.equal(entry.row, 1);
      assert.equal(entry.col, 7);
      assert.equal(result.state.stats.assistantUnitsSpawned, 1);
    });
  }

  test(`${profile}: pending zombies are immune to shooters, ice, bites, mines, spikes and chomping`, () => {
    const state = match(profile);
    const plants = ['snow-pea', 'chomper', 'potato-mine', 'spikeweed', 'wallnut'];
    state.units = plants.flatMap((typeId, row) => [
      unit(typeId, row, typeId === 'snow-pea' ? 1 : 4, profile, { readyAt: 0 }),
      unit('bucket', row, 7, profile, { id: `front-${row}`, move: 0, hp: 10000, maxHp: 10000 }),
      // Adversarial saved positions: the pending flag, not its coordinates,
      // decides whether an off-field unit can participate in combat.
      unit('common', row, row === 0 ? 7 : 4.42, profile, {
        id: `waiting-${row}`, entryPending: true, biteCooldown: 0,
      }),
    ]);
    const result = advance(state, 3);
    for (let row = 0; row < 5; row += 1) {
      const waiting = result.state.units.find(item => item.id === `waiting-${row}`);
      assert.equal(waiting.hp, getUnit('common', profile).hp);
      assert.equal(waiting.col, row === 0 ? 7 : 4.42);
      assert.equal(waiting.entryPending, true);
      assert.equal(waiting.freezeUntil, undefined);
      assert.equal(result.events.some(event => event.targetId === waiting.id || event.sourceId === waiting.id || event.unitId === waiting.id), false);
    }
    for (const typeId of plants) {
      assert.equal(result.state.units.find(item => item.typeId === typeId).hp, getUnit(typeId, profile).hp);
    }
  });

  test(`${profile}: a mower clears all active zombies but releases waiting ones only after its sweep`, () => {
    const state = match(profile);
    state.units = [
      unit('common', 0, 0.3, profile, { id: 'trigger', move: 0 }),
      unit('bucket', 0, 7, profile, { id: 'road', move: 0 }),
      unit('football', 0, 7, profile, { id: 'waiting-first', entryPending: true }),
      unit('common', 0, 7, profile, { id: 'waiting-second', entryPending: true }),
    ];
    const result = stepLive(state, LIVE_RULES.fixedStep);
    assert.equal(result.state.mowers[0], false);
    assert.equal(result.state.stats.unitsDefeated.zombies, 2);
    assert.deepEqual(result.events.filter(event => event.type === 'defeat').map(event => event.unitId), ['trigger', 'road']);
    assert.equal(result.state.units.find(item => item.id === 'waiting-first').hp, getUnit('football', profile).hp);
    assert.equal(result.state.units.find(item => item.id === 'waiting-first').entryPending, false);
    assert.equal(result.state.units.find(item => item.id === 'waiting-first').col, 7);
    assert.equal(result.state.units.find(item => item.id === 'waiting-second').entryPending, true);
    const releaseIndex = result.events.findIndex(event => event.type === 'deployment');
    assert(releaseIndex > result.events.findLastIndex(event => event.type === 'defeat'));
    assert.equal(result.events.slice(releaseIndex + 1).some(event => ['damage', 'bite', 'shot', 'move'].includes(event.type)), false);
    const next = stepLive(result.state, LIVE_RULES.fixedStep);
    assert.equal(next.state.stats.unitsDefeated.zombies, 2);
    assert.equal(next.state.units.find(item => item.id === 'waiting-first').hp, getUnit('football', profile).hp);
  });

  test(`${profile}: an invasion finishes without deploying the remaining queue`, () => {
    const state = match(profile);
    state.mowers[0] = false;
    state.units = [
      unit('common', 0, 0.3, profile, { id: 'invader', move: 0 }),
      unit('common', 0, 7, profile, { id: 'waiting', entryPending: true }),
    ];
    const result = stepLive(state, LIVE_RULES.fixedStep);
    assert.equal(result.state.phase, 'finished');
    assert.equal(result.state.winner, 'zombies');
    assert.equal(result.state.units.find(item => item.id === 'waiting').entryPending, true);
    assert.equal(result.events.some(event => event.type === 'deployment'), false);
  });

  test(`${profile}: a shooter defeats the front zombie before the next entrant becomes targetable`, () => {
    const state = match(profile);
    state.units = [
      unit('snow-pea', 0, 1, profile, { shootCooldown: 0 }),
      unit('common', 0, 7, profile, { id: 'front', hp: 1, move: 0 }),
      unit('common', 0, 7, profile, { id: 'waiting', move: 0, entryPending: true }),
    ];
    const first = stepLive(state, LIVE_RULES.fixedStep);
    const waiting = first.state.units.find(item => item.id === 'waiting');
    assert.equal(first.state.stats.unitsDefeated.zombies, 1);
    assert.equal(waiting.entryPending, false);
    assert.equal(waiting.hp, getUnit('common', profile).hp);
    assert.equal(waiting.freezeUntil, undefined);
    assert.deepEqual(first.events.filter(event => event.type === 'shot').map(event => event.targetId), ['front']);
    assert(first.events.findIndex(event => event.type === 'deployment') > first.events.findIndex(event => event.type === 'defeat'));
    const next = advance(first.state, profileRules(profile).shotSeconds);
    assert(next.events.some(event => event.type === 'shot' && event.targetId === 'waiting'));
    assert(next.events.some(event => event.type === 'freeze' && event.targetId === 'waiting'));
    assert.equal(next.state.units.find(item => item.id === 'waiting').hp,
      getUnit('common', profile).hp - getUnit('snow-pea', profile).damage);
  });

  test(`${profile}: a wave boundary and both tactical shops preserve the queue until combat resumes`, () => {
    const state = match(profile, { waves: 2, waveSeconds: 30, tacticalPauses: true });
    state.tickCount = 30 * 60 - 1;
    state.elapsed = state.tickCount / 60;
    state.units = [
      unit('common', 0, 6.001, profile, { id: 'front' }),
      unit('bucket', 0, 7, profile, { id: 'old-waiting', entryPending: true }),
    ];
    const boundary = stepLive(state, LIVE_RULES.fixedStep);
    assert.equal(boundary.state.tacticalPhase, 'coin');
    assert.equal(boundary.state.units.find(item => item.id === 'old-waiting').entryPending, true);
    assert.equal(boundary.events.some(event => event.type === 'deployment'), false);
    let shopping = beginLiveTacticalShopping(boundary.state);
    for (let index = 0; index < 2; index += 1) {
      if (shopping.activeSide === 'zombies') shopping = buyLiveUnit(shopping, 'zombies', 'common', 0, 7);
      assert.deepEqual(stepLive(shopping, 0.25), { state: shopping, events: [] });
      shopping = confirmLiveTacticalTurn(shopping);
    }
    const pending = shopping.units.filter(item => item.entryPending);
    assert.equal(pending.length, 2);
    const snapshot = liveSnapshot(shopping);
    assert.equal(snapshot.units.length, 2);
    assert.equal(snapshot.units.filter(item => item.entryPending).length, 1);
    const resumed = resumeLiveTacticalWave(shopping);
    assert.equal(resumed.round, 2);
    assert.equal(resumed.zombieSpeed, 0.55);
    assert.equal(resumed.zombieSpeedMode, 'auto');
    assert.equal(resumed.units.filter(item => item.entryPending).length, 2);
    const first = stepLive(resumed, LIVE_RULES.fixedStep);
    assert.deepEqual(first.events.filter(event => event.type === 'deployment').map(event => event.unitId), ['old-waiting']);
    assert.equal(first.state.units.find(item => item.id === pending[1].id).entryPending, true);
  });

  test(`${profile}: releases restart combat clocks instead of banking damage while off-field`, () => {
    const state = match(profile);
    state.tickCount = 600;
    state.elapsed = 10;
    state.units = [
      unit('common', 0, 6, profile, { id: 'front', move: 0 }),
      unit('common', 0, 7, profile, { id: 'waiting', entryPending: true,
        biteCooldown: 0, biteTargetId: 'old-target', placedAt: 0,
        shootCooldown: 0, groundHits: { 'old-spike': 999 }, movementCredit: 100 }),
    ];
    const result = stepLive(state, LIVE_RULES.fixedStep);
    const waiting = result.state.units.find(item => item.id === 'waiting');
    assert.equal(waiting.entryPending, false);
    assert.equal(waiting.placedAt, result.state.elapsed);
    assert.equal(waiting.biteCooldown, result.state.elapsed + profileRules(profile).biteSeconds);
    assert.equal(waiting.biteTargetId, null);
    assert.equal(waiting.shootCooldown, result.state.elapsed + profileRules(profile).shotSeconds);
    assert.equal(waiting.readyAt, result.state.elapsed);
    assert.equal(waiting.chompCooldown, result.state.elapsed);
    assert.deepEqual(waiting.groundHits, {});
    assert.equal(waiting.movementCredit, 0);
    assert.equal(result.events.some(event => event.type === 'bite' && event.sourceId === waiting.id), false);
  });

  test(`${profile}: pending zombies count toward the 200-unit safety limit, including scheduled assistance`, () => {
    const state = match(profile);
    state.units = Array.from({ length: LIVE_RULES.maxZombies }, (_, index) => unit('common', 0, 7, profile,
      { id: `crowd-${index}`, move: 0, entryPending: index !== 0 }));
    state.assistantWavePlan = [{ typeId: 'common', row: 0, at: 0 }];
    state.assistantNextActionAt = 0;
    const result = stepLive(state, LIVE_RULES.fixedStep);
    assert.equal(result.state.units.length, LIVE_RULES.maxZombies);
    assert.equal(result.state.stats.assistantUnitsSpawned, 0);
    assert.equal(result.state.assistantNextIndex, 1);
    assert.equal(result.events.some(event => event.type === 'deployment'), false);
    assert.throws(() => buyLiveUnit(result.state, 'zombies', 'common', 0, 7), /200 zombis en campo o en fila/);
  });

  test(`${profile}: 1500 brains can reserve sixty commons in a lane without a per-wave purchase cap`, () => {
    const state = fundedQueue(profile, Array(60).fill('common'));
    assert.equal(state.units.length, 60);
    assert.equal(state.units.filter(item => !item.entryPending).length, 1);
    assert.deepEqual(zombieEntryQueueCounts(state.units), [59, 0, 0, 0, 0]);
    assert.equal(state.resources.zombies, 0);
    assert.equal(state.stats.resourcesSpent.zombies, 1500);
    assert.equal(state.purchasesBySideThisWave.zombies, 60);
    assert.equal(state.stats.unitsPlaced.zombies, 60);
    assert.throws(() => buyLiveUnit(state, 'zombies', 'common', 0, 7), /recursos/);
  });

  test(`${profile}: the final horde includes waiting zombies and does not declare a premature plant victory`, () => {
    const state = match(profile);
    state.closing = true;
    state.closingAt = 0;
    state.units = [unit('common', 0, 7, profile, { id: 'last-waiting', entryPending: true })];
    const result = stepLive(state, LIVE_RULES.fixedStep);
    assert.equal(result.state.phase, 'live');
    assert.equal(result.state.winner, null);
    assert.equal(result.state.units[0].entryPending, false);
    assert.equal(result.events.filter(event => event.type === 'deployment').length, 1);
    assert.throws(() => buyLiveUnit(result.state, 'zombies', 'common', 0, 7), /última oleada/);
  });

  test(`${profile}: queue state and combat remain deterministic at 4, 10 and 60 FPS`, () => {
    const start = pauseLive(fundedQueue(profile, ['common', 'football', 'bucket', 'balloon', 'dragon']), false);
    const baseline = advance(start, 18, 0.25);
    const canonical = ({ accumulator, ...state }) => state;
    for (const dt of [0.1, 1 / 60]) {
      const other = advance(start, 18, dt);
      assert.deepEqual(canonical(other.state), canonical(baseline.state));
      assert.deepEqual(other.events.filter(event => event.type !== 'move'), baseline.events.filter(event => event.type !== 'move'));
      assert(Math.abs(other.state.accumulator - baseline.state.accumulator) < 1e-7);
    }
  });
}

test('pause, initial briefing, coin, shopping and ready phases do not release or advance reserved zombies', () => {
  let state = match('classic', { startPaused: true, tacticalPauses: true });
  assert.deepEqual(stepLive(state, 0.25), { state, events: [] });
  state = beginLiveInitialCoin(state);
  assert.deepEqual(stepLive(state, 0.25), { state, events: [] });
  state = beginLiveTacticalShopping(state);
  for (let index = 0; index < 2; index += 1) {
    if (state.activeSide === 'zombies') {
      state = buyLiveUnit(state, 'zombies', 'common', 0, 7);
      state = buyLiveUnit(state, 'zombies', 'common', 0, 7);
      state.units.find(item => item.side === 'zombies' && !item.entryPending).col = 6;
    }
    assert.deepEqual(stepLive(state, 0.25), { state, events: [] });
    state = confirmLiveTacticalTurn(state);
  }
  assert.equal(state.tacticalPhase, 'ready');
  assert.equal(state.units.find(item => item.entryPending)?.typeId, 'common');
  assert.deepEqual(stepLive(state, 0.25), { state, events: [] });
  const resumed = resumeLiveTacticalWave(state);
  assert.equal(resumed.units.filter(item => item.entryPending).length, 1);
  assert.equal(resumed.elapsed, 0);
  const next = stepLive(resumed, LIVE_RULES.fixedStep);
  assert.equal(next.state.units.filter(item => item.entryPending).length, 0);
  assert.equal(next.events.filter(event => event.type === 'deployment').length, 1);
  const paused = pauseLive(next.state, true);
  assert.deepEqual(advance(paused, 1), { state: paused, events: [] });
});

test('waiting units do not block plant placement, and plant CPU pressure considers only the field', () => {
  let state = pauseLive(match(), true);
  state.units = [unit('common', 3, 2, 'aula', { entryPending: true })];
  state = buyLiveUnit(state, 'plants', 'peashooter', 3, 2);
  assert.equal(state.units.find(item => item.side === 'plants').col, 2);

  const cpu = match('classic', { mode: 'coop-zombies' });
  cpu.cpuNextActionAt = 1;
  cpu.units.push(
    unit('bucket', 0, 7, 'classic', { id: 'row-zero-front', move: 0 }),
    ...Array.from({ length: 20 }, (_, index) => unit('bucket', 0, 7, 'classic',
      { id: `row-zero-waiting-${index}`, move: 0, entryPending: true })),
    unit('bucket', 3, 7, 'classic', { id: 'row-three-front', move: 0 }),
    unit('bucket', 3, 3.5, 'classic', { id: 'real-pressure', move: 0 }),
    unit('bucket', 3, 2, 'classic', { id: 'off-field-position', entryPending: true }),
  );
  const result = advance(cpu, 1);
  const placed = result.events.find(event => event.type === 'deployment' && event.source === 'cpu');
  assert(placed);
  assert.equal(placed.row, 3);
  assert.equal(placed.col, 2);
  assert.equal(placed.typeId, 'peashooter');
});

test('snapshots preserve all waiting entries with a boolean while hiding private entry metadata', () => {
  const state = fundedQueue('classic', ['common', 'football', 'bucket']);
  const snapshot = liveSnapshot(state);
  assert.equal(snapshot.units.length, 3);
  assert.deepEqual(snapshot.units.map(item => item.entryPending), [false, true, true]);
  assert.deepEqual(zombieEntryQueueCounts(snapshot.units), [2, 0, 0, 0, 0]);
  assert.equal(snapshot.units.some(item => 'entrySource' in item || 'movementCredit' in item || 'groundHits' in item), false);
  snapshot.units[1].entryPending = false;
  snapshot.units[1].hp = 0;
  assert.equal(state.units[1].entryPending, true);
  assert.equal(state.units[1].hp, getUnit('football', 'classic').hp);
});

test('legacy combat fixtures without an entry flag remain active and are not retroactively queued', () => {
  const state = match();
  state.units = Array.from({ length: 6 }, (_, index) => unit('common', 0, 7, 'aula',
    { id: `legacy-${index}`, move: 0 }));
  const result = stepLive(state, LIVE_RULES.fixedStep);
  assert.equal(result.state.units.every(item => item.entryPending === undefined), true);
  assert.equal(liveSnapshot(result.state).units.every(item => item.entryPending === false), true);
  assert.equal(result.events.some(event => event.type === 'deployment'), false);
});
