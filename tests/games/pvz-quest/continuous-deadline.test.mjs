import test from 'node:test';
import assert from 'node:assert/strict';
import { getUnit } from '../../../public/games/pvz-quest/classroom/catalog.js';
import {
  createLiveMatch, stepLive, awardLiveResources, beginLiveInitialCoin,
  beginLiveTacticalShopping, confirmLiveTacticalTurn, resumeLiveTacticalWave,
} from '../../../public/games/pvz-quest/classroom/live-engine.js';

function finalTick(zombieCol, mowerAvailable = true) {
  const state = createLiveMatch({ mode: 'duel', waves: 3, waveSeconds: 30, tacticalPauses: false });
  const common = getUnit('common');
  state.round = 3;
  state.tickCount = 3 * 30 * 60 - 1;
  state.elapsed = state.tickCount / 60;
  state.waveElapsed = 30 - 1 / 60;
  state.assistantNextActionAt = Infinity;
  state.cpuNextActionAt = Infinity;
  state.mowers[0] = mowerAvailable;
  state.units = [{ id: 'last-zombie', typeId: 'common', side: 'zombies', row: 0,
    col: zombieCol, hp: common.hp, maxHp: common.hp, damage: common.damage,
    move: common.move, ability: common.ability, placedRound: 3, placedAt: 0,
    readyAt: 0, shootCooldown: 100, biteCooldown: 100, groundHits: {} }];
  return state;
}

test('three-wave time limit immediately freezes zombies and declares Plants winner', () => {
  const atDeadline = stepLive(finalTick(4), 1 / 60);
  assert.equal(atDeadline.state.elapsed, 90);
  assert.equal(atDeadline.state.phase, 'finished');
  assert.equal(atDeadline.state.winner, 'plants');
  assert.equal(atDeadline.state.stats.wavesCompleted, 3);
  assert.equal(atDeadline.state.waveElapsed, 30);
  assert.deepEqual(atDeadline.events.filter(event => event.type === 'finished'), [{ type: 'finished', winner: 'plants' }]);
  const frozen = stepLive(atDeadline.state, .25);
  assert.deepEqual(frozen.state, atDeadline.state);
  assert.deepEqual(frozen.events, []);
});

test('a house invasion on the exact final tick beats the time-limit survival result', () => {
  const atDeadline = stepLive(finalTick(.3, false), 1 / 60);
  assert.equal(atDeadline.state.phase, 'finished');
  assert.equal(atDeadline.state.winner, 'zombies');
  assert(atDeadline.events.some(event => event.type === 'invasion'));
  assert.deepEqual(atDeadline.events.filter(event => event.type === 'finished'), [{ type: 'finished', winner: 'zombies' }]);
});

test('duel opening question, coin and shops also precede the no-between-wave-break mode', () => {
  let state = createLiveMatch({ mode: 'duel', waves: 2, waveSeconds: 30,
    startPaused: true, tacticalPauses: false });
  assert.equal(state.tacticalPhase, 'briefing');
  state = awardLiveResources(state, 'plants', 100);
  state = beginLiveTacticalShopping(beginLiveInitialCoin(state));
  state = confirmLiveTacticalTurn(state, state.activeSide);
  state = confirmLiveTacticalTurn(state, state.activeSide);
  state = resumeLiveTacticalWave(state);
  assert.equal(state.tacticalPhase, null);
  assert.equal(state.initialStaging, false);
  assert.equal(state.paused, false);
  state.assistantNextActionAt = Infinity;
  for (let i = 0; i < 120; i += 1) state = stepLive(state, .25).state;
  assert.equal(state.round, 2);
  assert.equal(state.tacticalPhase, null);
  assert.equal(state.paused, false);
});
