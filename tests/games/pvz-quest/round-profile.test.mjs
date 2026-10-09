import assert from 'node:assert/strict';
import test from 'node:test';
import { getUnit, zombieSpeedForWave } from '../../../public/games/pvz-quest/classroom/catalog.js';
import { createMatch, beginPlanning, addOrder, removeOrder, commitPlan, continuePlanning, resolveRound, publicSnapshot, availableUnits, ROUND_COMBAT_SECONDS } from '../../../public/games/pvz-quest/classroom/engine.js';

function ready(profile = 'classic') {
  const state = createMatch({ balanceProfile: profile, rounds: 30 });
  state.phase = 'ready'; state.planLocked = { plants: true, zombies: true };
  return state;
}
function unit(typeId, row, col, profile = 'classic', extras = {}) {
  const definition = getUnit(typeId, profile);
  return { id: `${typeId}-${row}-${col}`, typeId, side: definition.side, row, col,
    hp: definition.hp, maxHp: definition.hp, damage: definition.damage, move: definition.move,
    ability: definition.ability, placedAt: 0, placedRound: 1, placedStep: 0,
    movementCredit: 0, chompCooldown: 0, freezeUntil: 0, ...extras };
}
function nextRound(state) {
  state = beginPlanning(state); state = commitPlan(state); state = continuePlanning(state); state = commitPlan(state);
  return resolveRound(state).state;
}

test('legacy callers and old saved configs keep Aula; explicit Classic validates and exports its chosen profile', () => {
  const legacy = createMatch();
  assert.equal(legacy.config.balanceProfile, 'aula');
  assert.equal(availableUnits(legacy, 'zombies').find(item => item.id === 'common').hp, 5);
  delete legacy.config.balanceProfile;
  assert.equal(availableUnits(legacy, 'plants').find(item => item.id === 'wallnut').hp, 10);
  const classic = createMatch({ balanceProfile: 'classic' });
  assert.equal(publicSnapshot(classic).config.balanceProfile, 'classic');
  assert.equal(availableUnits(classic, 'plants').find(item => item.id === 'wallnut').hp, 4000);
  assert.throws(() => createMatch({ balanceProfile: 'inexistente' }), /perfil|Clásico|Aula/);
  assert.throws(() => createMatch({ balanceProfile: { toString: () => 'classic', privateKey: 'not-a-public-profile' } }), /perfil|Clásico|Aula/);
});

test('deploying Classic units uses large health and damage without changing purchase prices or confirmations', () => {
  let state = beginPlanning(createMatch({ balanceProfile: 'classic', rounds: 3 }));
  state = addOrder(state, 'plants', 'peashooter', 0, 1);
  state = commitPlan(state); state = continuePlanning(state);
  state = addOrder(state, 'zombies', 'cone', 0, 7);
  const paid = structuredClone(state.resources);
  state = commitPlan(state);
  const result = resolveRound(state);
  const deployment = result.stages.find(stage => stage.name === 'deployment');
  assert.equal(deployment.units.find(item => item.typeId === 'peashooter').hp, 300);
  assert.equal(deployment.units.find(item => item.typeId === 'peashooter').damage, 20);
  assert.equal(deployment.units.find(item => item.typeId === 'cone').hp, 640);
  assert.equal(deployment.units.find(item => item.typeId === 'cone').damage, 4);
  assert.equal(paid.plants, 100); assert.equal(paid.zombies, 150);
  assert.equal(result.state.stats.resourcesSpent.plants, 100);
  assert.equal(result.state.stats.resourcesSpent.zombies, 50);
});

test('Classic firing carries 1.5-second cadence across five-second rounds instead of one low-damage shot', () => {
  let state = ready();
  state.units = [unit('peashooter', 0, 1), unit('dragon', 0, 7)];
  let result = resolveRound(state);
  assert.equal(ROUND_COMBAT_SECONDS, 5);
  assert.equal(result.events.filter(item => item.type === 'shot').length, 4);
  assert.equal(result.state.units.find(item => item.typeId === 'dragon').hp, 1920);
  state = beginPlanning(result.state); state = commitPlan(state); state = continuePlanning(state); state = commitPlan(state);
  result = resolveRound(state);
  assert.equal(result.events.filter(item => item.type === 'shot').length, 3);
  assert.equal(result.state.units.find(item => item.typeId === 'dragon').hp, 1860);
  assert.equal(result.state.elapsed, 10);
});

test('chronological Classic pulses retarget the next zombie after the front zombie is neutralized', () => {
  const state = ready();
  state.units = [unit('peashooter', 0, 1), unit('common', 0, 7, 'classic', { hp: 110, id: 'a-front' }), unit('cone', 0, 7, 'classic', { id: 'b-back' })];
  const result = resolveRound(state);
  assert.equal(result.state.units.some(item => item.id === 'a-front'), false);
  assert.equal(result.state.units.find(item => item.id === 'b-back').hp, 600);
  assert.deepEqual(result.events.filter(item => item.type === 'shot').map(item => item.targetId), ['a-front', 'a-front', 'b-back', 'b-back']);
});

for (const [typeId, hits] of [['common', 10], ['cone', 28], ['bucket', 65], ['football', 80]]) {
  test(`Classic ${typeId} is neutralized after ${hits} peas, not after losing only one small-scale HP point`, () => {
    for (const shouldRetire of [false, true]) {
      const definition = getUnit(typeId, 'classic');
      const priorHits = hits - (shouldRetire ? 1 : 2);
      const state = ready();
      state.units = [unit('peashooter', 0, 1, 'classic', { shotReadyAt: 4.9 }),
        unit(typeId, 0, 7, 'classic', { hp: definition.hp - priorHits * 20 })];
      const result = resolveRound(state);
      assert.equal(result.events.filter(item => item.type === 'shot').length, 1);
      assert.equal(result.state.units.some(item => item.typeId === typeId), !shouldRetire);
      assert.equal(result.events.some(item => item.type === 'defeat' && item.typeId === typeId), shouldRetire);
    }
  });
}

test('the floating dragon is not retired at ninety HP and requires its complete 2000 health to be removed', () => {
  assert.equal(getUnit('dragon', 'classic').hp, 2000);
  for (const [hp, survives] of [[40, true], [20, false]]) {
    const state = ready();
    state.units = [unit('peashooter', 0, 1, 'classic', { shotReadyAt: 4.9 }), unit('dragon', 0, 7, 'classic', { hp })];
    const result = resolveRound(state);
    assert.equal(result.state.units.some(item => item.typeId === 'dragon'), survives);
    if (survives) assert.equal(result.state.units.find(item => item.typeId === 'dragon').hp, 20);
  }
});

test('Classic bites accumulate 500 damage in five seconds, while the walnut survives forty seconds and protects its rear plant', () => {
  let state = ready();
  state.units = [unit('wallnut', 0, 2), unit('sunflower', 0, 1), unit('common', 0, 3)];
  let result = resolveRound(state);
  assert.equal(result.events.find(item => item.type === 'damage' && item.unitId === 'wallnut-0-2').amount, 500);
  assert.equal(result.state.units.find(item => item.typeId === 'wallnut').hp, 3500);
  assert.equal(result.state.units.find(item => item.typeId === 'sunflower').hp, 300);
  state = result.state;
  for (let step = 2; step <= 7; step += 1) state = nextRound(state);
  assert.equal(state.units.find(item => item.typeId === 'wallnut').hp, 500);
  state = nextRound(state);
  assert.equal(state.elapsed, 40);
  assert.equal(state.units.some(item => item.typeId === 'wallnut'), false);
  assert.equal(state.units.find(item => item.typeId === 'sunflower').hp, 300, 'Unused bite damage does not teleport to an unreachable rear plant');
});

test('Classic bites cap actual damage at the targeted plant life rather than emitting impossible overkill', () => {
  const state = ready();
  state.units = [unit('sunflower', 0, 2), unit('common', 0, 3)];
  const result = resolveRound(state);
  assert.equal(result.events.find(item => item.type === 'damage' && item.unitId === 'sunflower-0-2').amount, 300);
  assert.equal(result.state.units.some(item => item.typeId === 'sunflower'), false);
});

test('Classic mines take fifteen battle seconds to arm and spikes apply five contact pulses without hitting flyers', () => {
  for (const [step, detonates] of [[1, false], [2, true]]) {
    const state = ready(); state.battleStep = step; state.elapsed = step * 5;
    state.units = [unit('potato-mine', 0, 4), unit('common', 0, 4)];
    assert.equal(resolveRound(state).events.some(item => item.type === 'mine'), detonates);
  }
  const state = ready();
  state.units = [unit('spikeweed', 0, 4), unit('cone', 0, 4), unit('spikeweed', 1, 4), unit('balloon', 1, 4)];
  const result = resolveRound(state);
  assert.equal(result.events.find(item => item.type === 'damage' && item.sourceId === 'spikeweed-0-4').amount, 100);
  assert.equal(result.events.some(item => item.type === 'damage' && item.sourceId === 'spikeweed-1-4'), false);
});

test('Classic ground zombies cross spikes and unarmed mines without biting either floor plant', () => {
  for (const typeId of ['spikeweed', 'potato-mine']) {
    const state = ready(); state.zombieSpeed = 1.7;
    state.units = [unit(typeId, 0, 4), unit('bucket', 0, 5)];
    const result = resolveRound(state);
    assert.equal(result.state.units.find(item => item.typeId === typeId).hp, 300, typeId);
    assert.equal(result.state.units.find(item => item.typeId === 'bucket').col, 4, typeId);
    assert.equal(result.events.some(item => item.type === 'bite'), false, typeId);
    assert.equal(result.events.some(item => item.type === 'mine'), false, typeId);
    const after = nextRound(result.state);
    const crossed = typeId === 'spikeweed' ? nextRound(after) : after;
    assert.equal(crossed.units.find(item => item.typeId === typeId).hp, 300, typeId);
    assert.equal(crossed.units.find(item => item.typeId === 'bucket').col, 3, typeId);
  }
});

test('Classic floor plants cannot damage, slow or bite-provoke balloon and dragon flyers', () => {
  for (const typeId of ['spikeweed', 'potato-mine']) {
    for (const flyer of ['balloon', 'dragon']) {
      const state = ready(); state.zombieSpeed = 1.7;
      state.units = [unit(typeId, 0, 4, 'classic', { placedAt: -20 }), unit(flyer, 0, 4)];
      const result = resolveRound(state);
      const flyingUnit = result.state.units.find(item => item.typeId === flyer);
      const distance = 4 - flyingUnit.col + flyingUnit.movementCredit;
      assert.equal(flyingUnit.hp, getUnit(flyer, 'classic').hp, `${typeId}/${flyer}`);
      assert.equal(result.state.units.find(item => item.typeId === typeId).hp, 300, `${typeId}/${flyer}`);
      assert(Math.abs(distance - getUnit(flyer, 'classic').move * 1.7) < 1e-8, `${typeId}/${flyer}`);
      assert.equal(result.events.some(item => ['mine', 'bite', 'damage'].includes(item.type)), false, `${typeId}/${flyer}`);
    }
  }
});

test('Aula preserves its legacy tactical bites on spikes and newly deployed unarmed mines', () => {
  for (const [typeId, remainingHp] of [['spikeweed', 3], ['potato-mine', 0]]) {
    const state = ready('aula');
    state.units = [unit(typeId, 0, 4, 'aula', { placedStep: 1 }), unit('cone', 0, 4, 'aula')];
    const result = resolveRound(state);
    assert.equal(result.events.filter(item => item.type === 'bite').length, 1, typeId);
    assert.equal(result.events.some(item => item.type === 'mine'), false, typeId);
    assert.equal(result.state.units.find(item => item.typeId === typeId)?.hp ?? 0, remainingHp, typeId);
  }
});

test('Classic chomper publishes its forty-two-second digestion, retains cooldown until ready and does not use Aula twenty seconds', () => {
  const state = ready(); state.units = [unit('chomper', 0, 3), unit('common', 0, 4)];
  const result = resolveRound(state);
  assert.equal(result.events.find(item => item.type === 'chomp').duration, 42);
  const chomper = publicSnapshot(result.state).units.find(item => item.typeId === 'chomper');
  assert.equal(chomper.cooldownSeconds, 42); assert.equal(chomper.chompDuration, 42); assert.equal(chomper.digesting, true);
  for (const [step, eats] of [[8, false], [9, true]]) {
    const later = ready(); later.battleStep = step; later.elapsed = step * 5;
    later.units = [unit('chomper', 0, 3, 'classic', { chompCooldown: 50 }), unit('common', 0, 4)];
    assert.equal(resolveRound(later).events.some(item => item.type === 'chomp'), eats);
  }
});

test('Aula keeps one shot, one bite and twenty-second digestion with its published small-scale health', () => {
  const state = ready('aula');
  state.units = [unit('peashooter', 0, 1, 'aula'), unit('bucket', 0, 7, 'aula'),
    unit('wallnut', 1, 2, 'aula'), unit('common', 1, 3, 'aula'), unit('chomper', 2, 3, 'aula'), unit('common', 2, 4, 'aula')];
  const result = resolveRound(state);
  assert.equal(result.events.filter(item => item.type === 'shot').length, 1);
  assert.equal(result.state.units.find(item => item.typeId === 'bucket').hp, 11);
  assert.equal(result.state.units.find(item => item.typeId === 'wallnut').hp, 9);
  assert.equal(result.events.find(item => item.type === 'chomp').duration, 20);
});

test('Classic cooperative CPU starter defenses use the profile, and private plans still conceal types and paid spending', () => {
  const cooperative = createMatch({ balanceProfile: 'classic', mode: 'coop-zombies' });
  assert.equal(cooperative.units.find(item => item.typeId === 'peashooter').hp, 300);
  assert.equal(cooperative.units.find(item => item.typeId === 'wallnut').hp, 4000);
  let state = beginPlanning(createMatch({ balanceProfile: 'classic', planning: 'secret' }));
  state = addOrder(state, 'plants', 'peashooter', 0, 1);
  const projected = publicSnapshot(state);
  assert.deepEqual(projected.plans, { plants: [], zombies: [] });
  assert.equal(projected.resources.plants, 200); assert.equal(projected.stats.resourcesSpent, undefined);
  assert.equal(projected.config.balanceProfile, 'classic');
});

test('Classic mower still clears the complete lane, including armored zombies and the 2000-HP dragon, without changing its input', () => {
  const state = ready();
  state.units = [unit('common', 0, 0), unit('bucket', 0, 5), unit('dragon', 0, 7), unit('cone', 1, 7), unit('wallnut', 0, 3)];
  const before = structuredClone(state);
  const result = resolveRound(state);
  assert.deepEqual(state, before);
  assert.equal(result.events.filter(item => item.type === 'mower').length, 1);
  assert.equal(result.state.mowers[0], false);
  assert.equal(result.state.units.filter(item => item.side === 'zombies' && item.row === 0).length, 0);
  assert.equal(result.state.units.find(item => item.typeId === 'cone').hp, 640);
  assert.equal(result.state.units.find(item => item.typeId === 'wallnut').hp, 4000);
  assert.equal(result.state.stats.unitsDefeated.zombies, 3);
});

test('Classic dragon remains at fifty-five percent of common travel on every wave, and ice never turns into a speed boost', () => {
  for (const wave of [1, 2, 3, 6, 12]) {
    const travel = ice => {
      const state = ready(); state.round = wave; state.battleStep = wave - 1; state.elapsed = (wave - 1) * 5;
      state.zombieSpeed = zombieSpeedForWave(wave);
      state.units = [unit('common', 0, 7, 'classic', { freezeUntil: ice ? 999 : 0 }), unit('dragon', 1, 7, 'classic', { freezeUntil: ice ? 999 : 0 })];
      const result = resolveRound(state);
      const distance = typeId => {
        const moved = result.state.units.find(item => item.typeId === typeId);
        return 7 - moved.col + moved.movementCredit;
      };
      return { common: distance('common'), dragon: distance('dragon') };
    };
    const normal = travel(false), frozen = travel(true);
    assert(Math.abs(normal.dragon / normal.common - .55) < 1e-8, `Wave ${wave}: dragon must retain its fractional base movement`);
    assert(Math.abs(frozen.dragon / frozen.common - .55) < 1e-8);
    assert(Math.abs(frozen.dragon / normal.dragon - .7) < 1e-8);
    assert(frozen.dragon < normal.dragon, 'Ice cannot erase the slow base movement or accelerate the dragon');
  }
  const aula = ready('aula'); aula.units = [unit('dragon', 0, 7, 'aula')];
  assert.equal(resolveRound(aula).state.units[0].movementCredit, .35, 'Aula retains its published full-speed dragon');
});

test('Classic dragon purchases cost exactly 750 and undo refunds 750 without mutating either input', () => {
  let state = createMatch({ balanceProfile: 'classic' }); state.resources.zombies = 1500;
  state = beginPlanning(state); state = commitPlan(state); state = continuePlanning(state);
  const before = structuredClone(state);
  const purchased = addOrder(state, 'zombies', 'dragon', 0, 7);
  assert.deepEqual(state, before);
  assert.equal(purchased.resources.zombies, 750);
  assert.equal(purchased.stats.resourcesSpent.zombies, 750);
  const paid = structuredClone(purchased);
  const refunded = removeOrder(purchased, 'zombies', purchased.plans.zombies[0].id);
  assert.deepEqual(purchased, paid);
  assert.equal(refunded.resources.zombies, 1500);
  assert.equal(refunded.stats.resourcesSpent.zombies, 0);
  assert.equal(getUnit('dragon', 'aula').cost, 500, 'Classic does not silently change the Aula catalog');
});
