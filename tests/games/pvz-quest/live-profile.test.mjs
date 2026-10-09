import test from 'node:test';
import assert from 'node:assert/strict';
import { getUnit } from '../../../public/games/pvz-quest/classroom/catalog.js';
import { profileRules } from '../../../public/games/pvz-quest/classroom/balance-profiles.js';
import {
  LIVE_RULES, createLiveMatch, buyLiveUnit, availableLiveUnits, awardLiveResources,
  pauseLive, stepLive, liveSnapshot, beginLiveInitialCoin,
  beginLiveTacticalShopping, confirmLiveTacticalTurn, resumeLiveTacticalWave,
} from '../../../public/games/pvz-quest/classroom/live-engine.js';

function match(profile = 'classic', overrides = {}) {
  const state = createLiveMatch({ balanceProfile: profile, tacticalPauses: false,
    waves: 1, waveSeconds: 600, ...overrides });
  return { ...state, assistantNextActionAt: Infinity, cpuNextActionAt: Infinity };
}

function unit(typeId, row, col, profile = 'classic', overrides = {}) {
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
    state = result.state; events.push(...result.events);
  }
  return { state, events };
}

test('live API defaults to Aula for compatibility and explicitly selects validated classic rules', () => {
  assert.equal(createLiveMatch().config.balanceProfile, 'aula');
  assert.equal(createLiveMatch({ balanceProfile: 'classic' }).config.balanceProfile, 'classic');
  for (const balanceProfile of ['unknown', 'constructor', '__proto__', 1, {}, []]) {
    assert.throws(() => createLiveMatch({ balanceProfile }), /perfil/);
  }
  const old = match('aula');
  delete old.config.balanceProfile;
  assert.equal(liveSnapshot(old).config.balanceProfile, 'aula');
  assert.equal(buyLiveUnit(pauseLive(old, true), 'plants', 'peashooter', 0, 2).units[0].hp, 5);
});

test('classic purchases, starter CPU and shop cards share profile stats without changing prices', () => {
  let classic = pauseLive(match('classic', { mode: 'duel' }), true);
  const old = structuredClone(classic);
  classic = buyLiveUnit(classic, 'plants', 'peashooter', 0, 2);
  const plant = classic.units[0];
  assert.deepEqual(old.units, []);
  assert.equal(plant.hp, 300);
  assert.equal(plant.maxHp, 300);
  assert.equal(plant.damage, 20);
  assert.equal(plant.shootCooldown, 1.5);
  assert.equal(classic.resources.plants, 100);
  assert.equal(classic.stats.resourcesSpent.plants, 100);
  const card = availableLiveUnits(classic).find(item => item.id === 'wallnut');
  assert.equal(card.hp, 4000);
  assert.equal(card.cost, 50);
  const cpu = createLiveMatch({ mode: 'coop-zombies', balanceProfile: 'classic' });
  assert.equal(cpu.units.find(item => item.typeId === 'wallnut').hp, 4000);
  assert.equal(cpu.units.find(item => item.typeId === 'peashooter').damage, 20);
  const legacy = buyLiveUnit(pauseLive(match('aula'), true), 'plants', 'peashooter', 0, 2);
  assert.equal(legacy.units[0].hp, 5);
  assert.equal(legacy.units[0].damage, 1);
  assert.equal(legacy.units[0].shootCooldown, LIVE_RULES.shotSeconds);
});

test('the classic dragon has 2000 HP, costs 750 and keeps Aula dragon values unchanged', () => {
  const classic = getUnit('dragon', 'classic'), aula = getUnit('dragon', 'aula');
  assert.equal(classic.hp, 2000);
  assert.equal(classic.cost, 750);
  assert.equal(classic.move, 0.55);
  assert.equal(aula.hp, 19);
  assert.equal(aula.cost, 500);
  assert.equal(aula.move, 1);
  const card = availableLiveUnits(pauseLive(match('classic', { mode: 'duel' }), true), 'zombies')
    .find(item => item.id === 'dragon');
  assert.equal(card.hp, 2000);
  assert.equal(card.cost, 750);
  assert.equal(card.affordable, false);
});

test('1500 brains pay for two classic dragons or one dragon and thirty commons without a purchase-count cap', () => {
  let funded = pauseLive(match('classic', { mode: 'duel' }), true);
  for (let index = 0; index < 13; index += 1) funded = awardLiveResources(funded, 'zombies', 100);
  assert.equal(funded.resources.zombies, 1500);
  const first = buyLiveUnit(funded, 'zombies', 'dragon', 0, 7);
  assert.equal(first.resources.zombies, 750);
  assert.equal(first.stats.resourcesSpent.zombies, 750);
  assert.equal(first.units[0].hp, 2000);
  assert.equal(first.units[0].maxHp, 2000);
  assert.equal(first.units[0].move, 0.55);
  const pair = buyLiveUnit(first, 'zombies', 'dragon', 1, 7);
  assert.equal(pair.resources.zombies, 0);
  assert.equal(pair.stats.resourcesSpent.zombies, 1500);
  assert.equal(pair.units.length, 2);
  assert.throws(() => buyLiveUnit(pair, 'zombies', 'common', 0, 7), /recursos/);
  let mixed = first;
  for (let index = 0; index < 30; index += 1) mixed = buyLiveUnit(mixed, 'zombies', 'common', index % 5, 7);
  assert.equal(mixed.resources.zombies, 0);
  assert.equal(mixed.stats.resourcesSpent.zombies, 1500);
  assert.equal(mixed.purchasesBySideThisWave.zombies, 31);
  assert.equal(mixed.units.length, 31);
  assert.equal(liveSnapshot(mixed).units.find(item => item.typeId === 'dragon').hp, 2000);
});

for (const round of [1, 6]) {
  test(`classic dragon advances at 55% of a common zombie's actual wave-${round} speed`, () => {
    let state = match('classic', { waves: 7, waveSeconds: 30 });
    state.units = [unit('common', 0, 7), unit('dragon', 1, 7)];
    if (round === 6) {
      state.round = 5;
      state.tickCount = 30 * 5 * 60 - 1;
      state.elapsed = state.tickCount / 60;
      state.waveElapsed = 30 - 1 / 60;
      state = stepLive(state, 1 / 60).state;
    }
    assert.equal(state.round, round);
    assert.equal(state.zombieSpeedMode, 'auto');
    assert.equal(state.zombieSpeed, round === 1 ? 0.35 : 1.7);
    const before = new Map(state.units.map(item => [item.id, item.col]));
    const result = advance(state, 1).state;
    const common = result.units.find(item => item.typeId === 'common');
    const dragon = result.units.find(item => item.typeId === 'dragon');
    const commonDistance = before.get(common.id) - common.col;
    const dragonDistance = before.get(dragon.id) - dragon.col;
    assert(Math.abs(commonDistance - state.zombieSpeed / LIVE_RULES.secondsPerCell) < 1e-8);
    assert(Math.abs(dragonDistance / commonDistance - 0.55) < 1e-8);
    assert.equal(dragon.move, 0.55);
    assert.equal(dragon.hp, 2000);
  });
}

test('automatic zombie arrivals and paid plant CPU deployments honor the selected profile', () => {
  const classRoom = createLiveMatch({ balanceProfile: 'classic', tacticalPauses: false });
  const arrivals = advance(classRoom, 5);
  const zombie = arrivals.state.units.find(item => item.side === 'zombies');
  assert.equal(zombie.hp, 270);
  assert.equal(zombie.damage, 4);
  assert(arrivals.events.some(event => event.type === 'deployment' && event.source === 'assistant-wave'));
  const cpuRoom = createLiveMatch({ mode: 'coop-zombies', balanceProfile: 'classic', tacticalPauses: false });
  const cpu = advance(cpuRoom, 1);
  const deployment = cpu.events.find(event => event.type === 'deployment' && event.source === 'cpu');
  assert(deployment);
  const bought = cpu.state.units.find(item => item.id === deployment.unitId);
  assert.equal(bought.hp, getUnit(deployment.typeId, 'classic').hp);
  assert.equal(cpu.state.stats.resourcesSpent.plants, getUnit(deployment.typeId, 'classic').cost);
});

for (const [typeId, impacts] of [['common', 10], ['cone', 28], ['bucket', 65], ['football', 80], ['balloon', 11]]) {
  test(`classic ${typeId} retires exactly after ${impacts} ordinary 20-damage impacts`, () => {
    const state = match();
    state.units = [unit('peashooter', 0, 1), unit(typeId, 0, 7, 'classic', { move: 0 })];
    const before = advance(state, (impacts - 1) * 1.5);
    assert.equal(before.events.filter(event => event.type === 'shot').length, impacts - 1);
    assert(before.state.units.some(item => item.typeId === typeId));
    const last = advance(before.state, 1.5);
    assert.equal(last.events.filter(event => event.type === 'shot').length, 1);
    assert.equal(last.state.units.some(item => item.typeId === typeId), false);
    assert.equal(last.state.stats.unitsDefeated.zombies, 1);
    const defeat = last.events.filter(event => event.type === 'defeat');
    assert.equal(defeat.length, 1);
    assert.equal(defeat[0].reason, 'decapitated');
    assert.equal(advance(last.state, 3).events.filter(event => event.type === 'defeat').length, 0);
  });
}

test('classic retirement is strictly below 90 HP; dragons still need all of their health exhausted', () => {
  const state = match();
  state.units = [unit('peashooter', 0, 1), unit('common', 0, 7, 'classic', { move: 0 })];
  const nine = advance(state, 13.5);
  assert.equal(nine.state.units.find(item => item.typeId === 'common').hp, 90);
  assert.equal(nine.events.some(event => event.type === 'defeat'), false);
  const dragon = match();
  dragon.units = [unit('peashooter', 0, 1), unit('dragon', 0, 7, 'classic', { move: 0, hp: 100 })];
  const low = advance(dragon, 6);
  assert.equal(low.state.units.find(item => item.typeId === 'dragon').hp, 20);
  assert.equal(low.events.some(event => event.type === 'defeat'), false);
  const killed = advance(low.state, 1.5);
  assert.equal(killed.state.units.some(item => item.typeId === 'dragon'), false);
  assert.equal(killed.events.find(event => event.type === 'defeat').reason, undefined);
});

test('an already defeated classic target is not counted again when other simultaneous shots resolve', () => {
  const state = match();
  state.units = [
    unit('peashooter', 0, 1), unit('peashooter', 0, 2),
    unit('common', 0, 7, 'classic', { move: 0, hp: 10 }),
  ];
  const result = advance(state, 1.5);
  assert.equal(result.events.filter(event => event.type === 'damage').length, 1);
  assert.equal(result.events.filter(event => event.type === 'defeat').length, 1);
  assert.equal(result.events.find(event => event.type === 'defeat').reason, undefined);
  assert.equal(result.state.stats.unitsDefeated.zombies, 1);
});

test('classic cadence is 1.5 combat seconds, while Aula retains 2.4 seconds', () => {
  for (const [profile, interval, damage] of [['classic', 1.5, 20], ['aula', 2.4, 1]]) {
    const state = match(profile);
    state.units = [unit('peashooter', 0, 1, profile), unit('dragon', 0, 7, profile, { move: 0 })];
    const justBefore = advance(state, interval - 1 / 60);
    assert.equal(justBefore.events.filter(event => event.type === 'shot').length, 0);
    const first = advance(justBefore.state, 1 / 60);
    assert.equal(first.events.filter(event => event.type === 'shot').length, 1);
    assert.equal(first.state.units.find(item => item.typeId === 'dragon').hp, getUnit('dragon', profile).hp - damage);
    const second = advance(first.state, interval);
    assert.equal(second.events.filter(event => event.type === 'shot').length, 1);
  }
});

test('classic biting accumulates 4-damage pulses every 40 ms, rather than rounding to a 50 ms rhythm', () => {
  const state = match();
  state.units = [unit('wallnut', 0, 4), unit('common', 0, 4.42)];
  const result = advance(state, 1);
  assert.equal(result.events.filter(event => event.type === 'bite').length, 25);
  assert.equal(result.state.units.find(item => item.typeId === 'wallnut').hp, 3900);
  assert(Math.abs(result.state.units.find(item => item.typeId === 'common').biteCooldown - 1.04) < 1e-8);
});

for (const [plantId, seconds] of [['sunflower', 3], ['wallnut', 40]]) {
  test(`one classic zombie eats a ${plantId} in ${seconds} seconds`, () => {
    const state = match();
    state.units = [unit(plantId, 0, 4), unit('common', 0, 4.42)];
    const before = advance(state, seconds - 1 / 60);
    assert(before.state.units.some(item => item.typeId === plantId));
    const after = advance(before.state, 1 / 60);
    assert.equal(after.state.units.some(item => item.typeId === plantId), false);
    assert.equal(after.events.filter(event => event.type === 'defeat' && event.side === 'plants').length, 1);
  });
}

test('walking time and a changed target never bank retroactive classic bites', () => {
  const state = match();
  state.tickCount = 600; state.elapsed = 10;
  state.units = [unit('wallnut', 0, 4), unit('common', 0, 4.42, 'classic', { biteCooldown: 0.04 })];
  const first = stepLive(state, 1 / 60);
  assert.equal(first.events.filter(event => event.type === 'bite').length, 1);
  assert.equal(first.state.units.find(item => item.typeId === 'wallnut').hp, 3996);
  const changed = structuredClone(first.state);
  changed.units[0].id = 'replacement-wall';
  changed.units[1].biteCooldown = 0.04;
  const next = stepLive(changed, 1 / 60);
  assert.equal(next.events.filter(event => event.type === 'bite').length, 1);
});

test('classic mine arming, spike damage and carnívora recovery use the profile rules', () => {
  const classic = buyLiveUnit(pauseLive(match(), true), 'plants', 'potato-mine', 0, 4);
  const aula = buyLiveUnit(pauseLive(match('aula'), true), 'plants', 'potato-mine', 0, 4);
  assert.equal(classic.units[0].readyAt, 15);
  assert.equal(aula.units[0].readyAt, 5);
  const spikes = match();
  spikes.units = [unit('spikeweed', 0, 4), unit('bucket', 0, 4.2, 'classic', { move: 0 })];
  const contact = advance(spikes, 1.1);
  assert.equal(contact.state.units.find(item => item.typeId === 'bucket').hp, 1370 - 40);
  const chomper = match();
  chomper.units = [unit('chomper', 0, 4), unit('common', 0, 4.5, 'classic', { damage: 0 }),
    unit('bucket', 0, 4.6, 'classic', { damage: 0, move: 0 })];
  const eaten = stepLive(chomper, 1 / 60);
  const event = eaten.events.find(item => item.type === 'chomp');
  assert.equal(event.duration, 42);
  const view = liveSnapshot(eaten.state).units.find(item => item.typeId === 'chomper');
  assert.equal(view.chompDuration, 42);
  assert.equal(view.cooldownSeconds, 42);
  assert.equal(view.digesting, true);
  const twenty = advance(eaten.state, 20);
  assert.equal(twenty.events.filter(item => item.type === 'chomp').length, 0);
  assert.equal(liveSnapshot(twenty.state).units.find(item => item.typeId === 'chomper').cooldownSeconds, 22);
  const again = advance(twenty.state, 22);
  assert.equal(again.events.filter(item => item.type === 'chomp').length, 1);
});

test('classic pause freezes combat cooldowns, keeps resources editable and preserves the profile', () => {
  const state = match();
  state.units = [unit('wallnut', 0, 4), unit('common', 0, 4.42)];
  const started = advance(state, 0.5).state;
  let paused = pauseLive(started, true);
  paused = awardLiveResources(paused, 'plants', 100);
  const before = structuredClone(paused);
  const held = advance(paused, 5);
  assert.deepEqual(held.state, before);
  assert.deepEqual(held.events, []);
  assert.equal(held.state.config.balanceProfile, 'classic');
  assert.equal(held.state.resources.plants, 300);
  const resumed = advance(pauseLive(held.state, false), 0.5);
  assert.equal(resumed.state.elapsed, 1);
  assert.equal(resumed.state.units.find(item => item.typeId === 'wallnut').hp, 3900);
});

test('classic combat is deterministic at 4, 10 and 60 FPS external calls', () => {
  const state = match();
  state.units = [unit('snow-pea', 0, 1), unit('wallnut', 0, 4), unit('bucket', 0, 4.42),
    unit('peashooter', 2, 1), unit('dragon', 2, 7, 'classic', { move: 0 })];
  const baseline = advance(state, 7, 0.25);
  const canonical = ({ accumulator, ...value }) => value;
  const combatEvents = events => events.filter(event => event.type !== 'move');
  for (const dt of [0.1, 1 / 60]) {
    const other = advance(state, 7, dt);
    assert.deepEqual(canonical(other.state), canonical(baseline.state));
    assert.deepEqual(combatEvents(other.events), combatEvents(baseline.events));
    assert(Math.abs(other.state.accumulator - baseline.state.accumulator) < 1e-7);
  }
});

test('classic public snapshots whitelist the profile and hide tactical purchases and private configuration', () => {
  let state = createLiveMatch({ mode: 'duel', balanceProfile: 'classic', startPaused: true,
    token: 'secret', questions: ['teacher-only'], waveSeconds: 600 });
  state = beginLiveTacticalShopping(beginLiveInitialCoin(state));
  const side = state.activeSide;
  state = buyLiveUnit(state, side, side === 'plants' ? 'peashooter' : 'common', 0, side === 'plants' ? 2 : 7);
  const hidden = liveSnapshot(state);
  assert.equal(hidden.config.balanceProfile, 'classic');
  assert.equal(hidden.config.token, undefined);
  assert.equal(hidden.config.questions, undefined);
  assert.equal(hidden.randomState, undefined);
  assert.deepEqual(hidden.units, []);
  state = confirmLiveTacticalTurn(state);
  state = confirmLiveTacticalTurn(state);
  state = resumeLiveTacticalWave(state);
  const shown = liveSnapshot(state);
  assert.equal(shown.units[0].hp, side === 'plants' ? 300 : 270);
  assert.equal(shown.config.balanceProfile, 'classic');
  shown.units[0].hp = 0;
  assert(state.units[0].hp > 0);
});

test('Aula states, including a missing legacy profile, retain old health, damage and bite cadence', () => {
  const state = match('aula');
  delete state.config.balanceProfile;
  state.units = [unit('wallnut', 0, 4, 'aula'), unit('common', 0, 4.42, 'aula')];
  const result = advance(state, 3);
  assert.equal(result.events.filter(event => event.type === 'bite').length, 2);
  assert.equal(result.state.units.find(item => item.typeId === 'wallnut').hp, 8);
  assert.equal(result.state.units.find(item => item.typeId === 'common').hp, 5);
  assert.equal(liveSnapshot(result.state).config.balanceProfile, 'aula');
});
