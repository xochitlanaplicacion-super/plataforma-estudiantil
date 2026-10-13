import test from 'node:test';
import assert from 'node:assert/strict';
import * as engine from '../../../public/games/pvz-quest/classroom/live-engine.js';
const { createLiveMatch, stepLive, buyLiveUnit, awardLiveResources, beginLiveInitialCoin, beginLiveTacticalShopping, confirmLiveTacticalTurn, resumeLiveTacticalWave, pauseLive, selectLiveSide, liveSnapshot } = engine;
function advance(state, seconds) {
  const events = [];
  for (let left = seconds; left > 1e-7; left -= .25) { const next = stepLive(state, Math.min(left,.25)); state = next.state; events.push(...next.events); }
  return { state, events };
}
function resume(state) {
  assert.equal(state.tacticalPhase, 'briefing');
  state = beginLiveInitialCoin(state);
  state = beginLiveTacticalShopping(state);
  for (let turn = 0; turn < 2; turn++) state = confirmLiveTacticalTurn(state,state.activeSide);
  return resumeLiveTacticalWave(state);
}

test('all three continuous modes start Muy lenta automatically; durations extend to ten minutes', () => {
  for (const mode of ['duel','coop-plants','coop-zombies']) {
    const state = createLiveMatch({mode,waveSeconds:600,startPaused: mode === 'duel'});
    assert.equal(state.zombieSpeed,.35); assert.equal(state.zombieSpeedMode,'auto'); assert.equal(state.config.tacticalPauses,true); assert.equal(state.config.waveSeconds,600);
  }
  for (const waveSeconds of [29,601,600.5,'600']) assert.throws(() => createLiveMatch({waveSeconds}));
});
test('initial duel briefing forbids purchases until first questions and coin; no pause bypass', () => {
  let state = createLiveMatch({mode:'duel',startPaused:true});
  assert.equal(state.tacticalPhase,'briefing'); assert.equal(state.elapsed,0);
  state = awardLiveResources(state,'plants',100); state = awardLiveResources(state,'zombies',100);
  assert.throws(() => buyLiveUnit(state,'plants','sunflower',0,1),/moneda/);
  assert.throws(() => pauseLive(state,false),/moneda/);
  state = beginLiveInitialCoin(state); assert.equal(state.tacticalPhase,'coin');
  assert.throws(() => awardLiveResources(state,'plants',25),/antes de lanzar la moneda/);
  assert.throws(() => beginLiveInitialCoin(state));
  assert.deepEqual(advance(state,10).state,state);
});
test('Fisher–Yates can start either bando and never repeats a side within a shopping pause', () => {
  const counts = {plants:0,zombies:0};
  for (let seed = 0; seed < 200; seed++) {
    const state = beginLiveInitialCoin(createLiveMatch({mode:'duel',startPaused:true,seed:`coin-${seed}`}));
    assert.equal(new Set(state.tacticalOrder).size,2); counts[state.tacticalOrder[0]]++;
  }
  assert(counts.plants > 50 && counts.zombies > 50, JSON.stringify(counts));
});
test('both initial shops spend real prices; confirm and reveal never charge twice or heal', () => {
  let state = beginLiveTacticalShopping(beginLiveInitialCoin(createLiveMatch({mode:'duel',startPaused:true})));
  const first = state.activeSide; const second = first === 'plants' ? 'zombies' : 'plants';
  state = buyLiveUnit(state,first,first === 'plants' ? 'peashooter' : 'common',0,first === 'plants' ? 1 : 7);
  assert.equal(state.resources[first],first === 'plants' ? 100 : 175);
  const money = structuredClone(state.resources); const firstUnit = structuredClone(state.units[0]);
  assert.throws(() => selectLiveSide(state,second),/moneda/);
  assert.throws(() => confirmLiveTacticalTurn(state,second));
  state = confirmLiveTacticalTurn(state,first); assert.deepEqual(state.resources,money);
  assert.throws(() => confirmLiveTacticalTurn(state,first));
  state = buyLiveUnit(state,second,second === 'plants' ? 'sunflower' : 'common',1,second === 'plants' ? 2 : 7);
  const paid = structuredClone(state.resources); state = confirmLiveTacticalTurn(state,second);
  assert.throws(() => confirmLiveTacticalTurn(state,second));
  state = resumeLiveTacticalWave(state); assert.deepEqual(state.resources,paid);
  assert.deepEqual(state.units[0],firstUnit); assert.equal(state.paused,false); assert.equal(state.initialStaging,false);
  assert.throws(() => resumeLiveTacticalWave(state));
});
test('wave warning does not pause combat; boundary freezes before next wave', () => {
  let state = createLiveMatch({mode:'coop-plants',waves:3,waveSeconds:30});
  let next = advance(state,25); state = next.state;
  assert.equal(next.events.filter(event => event.type === 'wave-ending').length,1);
  assert.equal(state.paused,false);
  next = advance(state,5); state = next.state;
  assert.equal(state.paused,true); assert.equal(state.elapsed,30); assert.equal(state.round,1); assert.equal(state.pendingWave,2);
  assert.equal(state.tacticalPhase,'briefing'); assert.equal(state.stats.wavesCompleted,1);
  assert.deepEqual(state.tacticalOrder,[]);
  assert.throws(() => buyLiveUnit(state,'plants','sunflower',0,1),/moneda/);
  assert.deepEqual(advance(state,30).state,state);
});
test('teacher rewards belong to briefing, never coin or shops; frozen combat and no duplicate income', () => {
  let state = advance(createLiveMatch({mode:'duel',waves:3,waveSeconds:30}),30).state;
  assert.equal(state.tacticalPhase,'briefing');
  const units = structuredClone(state.units); const clock = state.elapsed; const income = structuredClone(state.stats.resourcesIncome);
  state = awardLiveResources(state,'plants',100); state = awardLiveResources(state,'zombies',100);
  state = beginLiveInitialCoin(state);
  assert.throws(() => awardLiveResources(state,'plants',100),/antes de lanzar la moneda/);
  state = beginLiveTacticalShopping(state); state = confirmLiveTacticalTurn(state,state.activeSide);
  assert.throws(() => awardLiveResources(state,'plants',100),/antes de lanzar la moneda/);
  state = confirmLiveTacticalTurn(state,state.activeSide);
  assert.throws(() => awardLiveResources(state,'zombies',100),/antes de lanzar la moneda/);
  state = resumeLiveTacticalWave(state);
  assert.equal(state.elapsed,clock); assert.deepEqual(state.units,units); assert.deepEqual(state.stats.resourcesIncome,income);
  assert.equal(state.round,2); assert.equal(state.waveElapsed,0); assert.equal(state.stats.resourcesAwarded.plants,100);
  assert.equal(state.stats.resourcesAwarded.zombies,100);
  state = awardLiveResources(state,'plants',25);
  assert.equal(state.stats.resourcesAwarded.plants,125,'teacher may still award during active combat');
  assert.equal(advance(state,1).state.elapsed,31);
});
test('secret projection conceals tactical spending, new units and clipped prizes until reveal', () => {
  let state = createLiveMatch({mode:'duel',startPaused:true});
  const side = 'plants';
  for (let index=0; index<13; index++) state = awardLiveResources(state,side,100);
  state = beginLiveTacticalShopping(beginLiveInitialCoin(state));
  if (state.activeSide !== side) state = confirmLiveTacticalTurn(state,state.activeSide);
  state = buyLiveUnit(state,side,side === 'plants' ? 'sunflower' : 'common',0,side === 'plants' ? 1 : 7);
  const secret = liveSnapshot(state);
  assert.deepEqual(secret.units,[]); assert.equal(secret.resources[side],1500);
  assert.equal(secret.stats.resourcesSpent[side],0); assert.equal(secret.stats.unitsPlaced[side],0);
  assert.equal('randomState' in secret,false); assert.equal('tacticalPublicBaseline' in secret,false);
  state = confirmLiveTacticalTurn(state,state.activeSide);
  if (state.tacticalPhase === 'shopping') state = confirmLiveTacticalTurn(state,state.activeSide);
  state = resumeLiveTacticalWave(state); assert.equal(liveSnapshot(state).units.length,1);
  assert.equal(liveSnapshot(state).resources[side],side === 'plants' ? 1450 : 1475);
});
test('cooperative tactical CPU plants pay for up to two units, zombie CPU never duplicates free assistant', () => {
  for (const mode of ['coop-plants','coop-zombies']) {
    let state = advance(createLiveMatch({mode,waves:2,waveSeconds:30}),30).state;
    const spent = state.stats.resourcesSpent.plants; const assistant = state.stats.assistantUnitsSpawned;
    state = resume(state);
    assert.equal(state.activeSide,mode === 'coop-plants' ? 'plants' : 'zombies');
    assert.equal(state.stats.assistantUnitsSpawned,assistant);
    if (mode === 'coop-zombies') { assert(state.stats.resourcesSpent.plants > spent); assert(state.cpuPurchasesThisWave <= 2); }
    else assert.equal(state.stats.resourcesSpent.zombies,0);
  }
});
test('occupied plants cannot be replaced by another purchase', () => {
  let state = beginLiveTacticalShopping(beginLiveInitialCoin(createLiveMatch({mode:'duel',startPaused:true})));
  if (state.activeSide !== 'plants') state = confirmLiveTacticalTurn(state,state.activeSide);
  state = buyLiveUnit(state,'plants','sunflower',0,1);
  assert.throws(() => buyLiveUnit(state,'plants','sunflower',0,1),/ocupada/);
});
test('final wave ends at its selected deadline without a new coin or extra teacher awards', () => {
  const state = advance(createLiveMatch({mode:'duel',waves:1,waveSeconds:30}),30).state;
  assert.equal(state.phase,'finished'); assert.equal(state.winner,'plants');
  assert.equal(state.tacticalPhase,null); assert.equal(state.stats.wavesCompleted,1);
  assert.throws(() => awardLiveResources(state,'plants',100),/terminó/);
  assert.deepEqual(advance(state,30).state,state);
});

test('automatic acceleration waits for the tactical reveal, not the paused shopping boundary', () => {
  for (const mode of ['duel','coop-plants','coop-zombies']) {
    let state = createLiveMatch({ mode, waves: 3, waveSeconds: 30 });
    state = engine.setLiveZombieSpeed(state, 1.3);
    state = advance(state,30).state;
    assert.equal(state.round,1); assert.equal(state.pendingWave,2);
    assert.equal(state.zombieSpeed,1.3); assert.equal(state.zombieSpeedMode,'manual');
    const unchanged = advance(state,5).state;
    assert.equal(unchanged.zombieSpeed,1.3);
    state = resume(unchanged);
    assert.equal(state.round,2); assert.equal(state.zombieSpeed,.55); assert.equal(state.zombieSpeedMode,'auto');
  }
});
