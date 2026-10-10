import test from 'node:test';
import assert from 'node:assert/strict';
import { getUnit } from '../../../public/games/pvz-quest/classroom/catalog.js';
import {
  LIVE_RULES, createLiveMatch, stepLive, pauseLive, buyLiveUnit, awardLiveResources,
  beginLiveInitialCoin, beginLiveTacticalShopping, confirmLiveTacticalTurn,
  resumeLiveTacticalWave,
} from '../../../public/games/pvz-quest/classroom/live-engine.js';

function advance(state, seconds) {
  const events = [];
  for (let left = seconds; left > 1e-8; left -= 0.25) {
    const result = stepLive(state, Math.min(left, 0.25));
    state = result.state; events.push(...result.events);
  }
  return { state, events };
}

function producer(state, readyAt = state.elapsed + LIVE_RULES.sunflowerSeconds) {
  const type = getUnit('sunflower', state.config.balanceProfile);
  return {
    id: 'pause-income-flower', typeId: type.id, side: type.side, row: 1, col: 1,
    hp: type.hp, maxHp: type.hp, ability: type.ability, damage: type.damage,
    move: type.move, placedAt: state.elapsed, placedRound: state.round,
    readyAt: state.elapsed, shootCooldown: Infinity, biteCooldown: Infinity,
    chompCooldown: 0, sunReadyAt: readyAt, groundHits: {},
  };
}

function quiet(state) {
  return { ...state, assistantNextActionAt: Infinity, cpuNextActionAt: Infinity };
}

function frozen(state, seconds = 45) {
  const before = structuredClone(state);
  const result = advance(state, seconds);
  assert.deepEqual(result.state, before);
  assert.deepEqual(result.events, []);
  return result.state;
}

for (const balanceProfile of ['aula', 'classic']) {
  for (const mode of ['duel', 'coop-plants', 'coop-zombies']) {
    test(`${balanceProfile}/${mode}: a manual pause freezes sun clocks and earns no delayed catch-up`, () => {
      let state = quiet(createLiveMatch({ mode, balanceProfile, waves: 2, waveSeconds: 60 }));
      state.units = [producer(state)];
      state = advance(state, 11.5).state;
      const money = state.resources.plants;
      state = frozen(pauseLive(state, true), 60);
      const played = advance(pauseLive(state, false), 0.5);
      assert.equal(played.state.elapsed, 12);
      assert.equal(played.state.resources.plants, money + 25);
      assert.equal(played.events.filter(event => event.type === 'sun').length, 1);
      assert.equal(played.state.units[0].sunReadyAt, 24);
    });

    test(`${balanceProfile}/${mode}: sunflower production freezes throughout coin, both shops and ready`, () => {
      let state = quiet(createLiveMatch({ mode, balanceProfile, waves: 3, waveSeconds: 30 }));
      state.units = [producer(state)];
      state = advance(state, 29.75).state;
      const money = state.resources.plants;
      const boundary = stepLive(state, 0.25);
      state = boundary.state;
      assert.equal(state.tacticalPhase, 'coin');
      assert.equal(state.elapsed, 30);
      assert.equal(state.resources.plants, money + 25 + (mode === 'coop-zombies' ? 100 : 0));
      assert.equal(boundary.events.filter(event => event.type === 'sun').length, 0);
      const due = state.units.find(unit => unit.typeId === 'sunflower').sunReadyAt;
      const flowerIncome = state.stats.resourcesIncome.plants;
      state = frozen(state);
      const rewardedSide = mode === 'coop-zombies' ? 'zombies' : 'plants';
      state = awardLiveResources(state, rewardedSide, 100);
      assert.equal(state.stats.resourcesAwarded[rewardedSide], 100);
      assert.equal(state.stats.resourcesIncome.plants, flowerIncome);
      state = beginLiveTacticalShopping(state);
      state = frozen(state);
      state = confirmLiveTacticalTurn(state, state.activeSide);
      state = frozen(state);
      state = confirmLiveTacticalTurn(state, state.activeSide);
      assert.equal(state.tacticalPhase, 'ready');
      state = frozen(state);
      assert.equal(state.units.find(unit => unit.typeId === 'sunflower').sunReadyAt, due);
      assert.equal(state.stats.resourcesIncome.plants, flowerIncome);
      state = quiet(resumeLiveTacticalWave(state));
      const resumed = advance(state, 6);
      assert.equal(resumed.state.elapsed, 36);
      assert.equal(resumed.events.filter(event => event.type === 'sun').length, 1);
      assert.equal(resumed.state.stats.resourcesIncome.plants, flowerIncome + 25);
    });
  }

  test(`${balanceProfile}: initial shopping cannot farm even if a restored paused flag is false`, () => {
    let state = beginLiveTacticalShopping(beginLiveInitialCoin(createLiveMatch({
      mode: 'duel', balanceProfile, startPaused: true,
    })));
    if (state.activeSide !== 'plants') state = confirmLiveTacticalTurn(state, state.activeSide);
    state = buyLiveUnit(state, 'plants', 'sunflower', 1, 1);
    state = frozen(state, 60);
    state = { ...state, paused: false };
    state = frozen(state, 60);
    assert.equal(state.elapsed, 0);
    assert.equal(state.resources.plants, 150);
  });

  for (const tacticalPhase of ['briefing', 'coin', 'shopping', 'ready']) {
    test(`${balanceProfile}: ${tacticalPhase} intrinsically freezes overdue producers even with paused=false`, () => {
      let state = quiet(createLiveMatch({ mode: 'duel', balanceProfile }));
      state.units = [producer(state, -1)];
      state.tacticalPhase = tacticalPhase;
      state.paused = false;
      frozen(state);
    });
  }
}
