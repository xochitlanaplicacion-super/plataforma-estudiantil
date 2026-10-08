import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { BoardRenderer } from '../../../public/games/pvz-quest/classroom/renderer.js';

const globals = new Map();
const timers = new Map();
let clock = 0;
let timerId = 0;
before(() => {
  for (const name of ['requestAnimationFrame', 'cancelAnimationFrame', 'matchMedia', 'performance', 'setTimeout', 'clearTimeout']) globals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
  globalThis.matchMedia = () => ({ matches: false });
  Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => clock } });
  globalThis.setTimeout = (callback, delay) => {
    const id = ++timerId;
    timers.set(id, { callback, at: clock + delay });
    return id;
  };
  globalThis.clearTimeout = id => timers.delete(id);
});
beforeEach(() => {
  clock = 0;
  timers.clear();
});
after(() => {
  for (const [name, descriptor] of globals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  }
});

function advanceClock(milliseconds) {
  clock += milliseconds;
  for (const [id, timer] of timers) {
    if (timer.at > clock) continue;
    timers.delete(id);
    timer.callback();
  }
}

function board({ reduced = false, sunAsset = true } = {}) {
  const calls = [];
  const context = new Proxy({}, { get: (target, key) => key in target ? target[key] : (...args) => calls.push({ operation: key, args, alpha: target.globalAlpha ?? 1 }) });
  const canvas = {
    style: {}, getContext: () => context, setAttribute() {}, addEventListener() {}, removeEventListener() {},
    getBoundingClientRect: () => ({ left: 200, top: 120, width: 960, height: 540 }),
    ownerDocument: { querySelector: () => ({ getBoundingClientRect: () => ({ left: 250, top: 40, width: 140, height: 40 }) }) },
  };
  const renderer = new BoardRenderer(canvas);
  renderer.reducedMotion = reduced;
  if (sunAsset) renderer.images.set('/assets/images/Interface/SunSprite_79x79.png', { naturalWidth: 2291, naturalHeight: 79 });
  const mower = {};
  renderer.images.set('/assets/images/Interface/Lawn_mower.png', mower);
  return { renderer, calls, mower };
}
const flower = { id: 'flower-1', typeId: 'sunflower', row: 2, col: 2, side: 'plants', hp: 2, maxHp: 2 };
const event = { type: 'sun', unitId: flower.id, row: flower.row, col: flower.col, side: 'plants', amount: 25 };
const snapshot = () => ({ config: { tempo: 'continuous' }, resources: { plants: 225, zombies: 200 }, units: [{ ...flower }], mowers: Array(5).fill(true) });

test('automatic sun survives frequent live snapshots and expires without changing resources', () => {
  const { renderer } = board();
  const state = snapshot();
  renderer.setLiveView(state);
  renderer.showLiveEvents([event]);
  assert.equal(renderer.liveEffects.length, 1);
  const effect = renderer.liveEffects[0];
  assert.equal(effect.duration, 800);
  for (let step = 1; step <= 6; step += 1) {
    renderer.setLiveView({ ...state, elapsed: step / 10 });
    renderer.draw(effect.started + step * 100);
    assert.equal(renderer.liveEffects[0], effect);
  }
  assert.deepEqual(state.resources, { plants: 225, zombies: 200 });
  renderer.draw(effect.started + 801);
  assert.equal(renderer.liveEffects.length, 0);
  renderer.destroy();
});

test('sun sprite pops at its producer, then flies upward beyond lawn clipping', () => {
  const { renderer, calls } = board();
  renderer.drawSun(event, 0.25);
  const pop = calls.find(call => call.operation === 'drawImage').args;
  assert.equal(pop[2], 0);
  assert.equal(pop[3], 79);
  assert.equal(pop[4], 79);
  assert.equal(pop[7], 38);
  assert.equal(pop[5] + pop[7] / 2, 332);
  assert.equal(pop[6] + pop[8] / 2, 221);
  calls.length = 0;
  renderer.drawSun(event, 0.9);
  const flight = calls.find(call => call.operation === 'drawImage').args;
  assert(flight[5] + flight[7] / 2 < 332, 'The orb approaches the plant resource chip horizontally');
  assert(flight[6] + flight[8] / 2 < 0, 'The orb leaves through the upper edge toward the resource bar');
  assert.equal(calls.some(call => call.operation === 'clip'), false);
  renderer.destroy();
});

test('reduced motion keeps the solar feedback at one position and on one sprite frame', () => {
  const { renderer, calls } = board({ reduced: true });
  renderer.setLiveView(snapshot());
  renderer.showLiveEvents([event]);
  assert.equal(renderer.liveEffects[0].duration, 400);
  renderer.drawSun(event, 0.1);
  renderer.drawSun(event, 0.8);
  const sprites = calls.filter(call => call.operation === 'drawImage' && call.args[0] === renderer.images.get('/assets/images/Interface/SunSprite_79x79.png'));
  assert.equal(sprites.length, 2);
  assert.deepEqual(sprites[0].args, sprites[1].args);
  renderer.destroy();
});

test('round playback renders sun events and completes the full solar effect', async () => {
  const { renderer, calls } = board({ reduced: true, sunAsset: false });
  const stage = { name: 'income', units: [{ ...flower }], mowers: Array(5).fill(true), events: [event] };
  const result = renderer.play([stage]);
  assert.equal(renderer.stage.duration, 400);
  assert(calls.some(call => call.operation === 'fillText' && call.args[0] === '+25'));
  advanceClock(400);
  assert.equal(await result, true);
  assert.equal(renderer.stage, null);
  renderer.destroy();
});

function mowerAt(fixture, row) {
  fixture.calls.length = 0;
  fixture.renderer.draw(clock);
  return fixture.calls.find(call => call.operation === 'drawImage' && call.args[0] === fixture.mower && call.args[2] + 28 === 89 + row * 90);
}

test('live mower crosses every lawn column and the road at full opacity before leaving the canvas', () => {
  const fixture = board();
  const { renderer } = fixture;
  const state = snapshot();
  state.mowers[2] = false;
  renderer.setLiveView(state);
  renderer.showLiveEvents([{ type: 'mower', row: 2, col: 0 }]);
  assert.equal(mowerAt(fixture, 2).args[1] + 27, 102, 'The mower starts at the house');
  advanceClock(700);
  const early = mowerAt(fixture, 2);
  assert(early.args[1] > 250, 'It keeps moving beyond the original 700 ms effect');
  assert.equal(early.alpha, 1);
  advanceClock(500);
  const halfway = mowerAt(fixture, 2);
  assert(halfway.args[1] + 27 > 480, 'The mower reaches the far half of the lawn');
  assert.equal(halfway.alpha, 1);
  advanceClock(1050);
  const road = mowerAt(fixture, 2);
  assert(road.args[1] + 27 > 912, 'It crosses the road at the lawn’s far right edge');
  assert.equal(road.alpha, 1, 'It never fades in the middle of the lane');
  advanceClock(150);
  assert.equal(mowerAt(fixture, 2), undefined);
  assert.equal(renderer.liveMowers.size, 0);
  assert.equal(state.mowers[2], false, 'Rendering does not mutate the game snapshot');
  renderer.destroy();
});

test('mowers in separate rows keep their own path through frequent snapshots and combat bursts', () => {
  const fixture = board();
  const { renderer } = fixture;
  const state = snapshot();
  state.mowers[0] = false;
  state.mowers[3] = false;
  renderer.setLiveView(state);
  renderer.showLiveEvents([{ type: 'mower', row: 0, col: 0 }]);
  const first = renderer.liveMowers.get(0);
  advanceClock(400);
  renderer.setLiveView({ ...state, elapsed: 0.4 });
  renderer.showLiveEvents([{ type: 'mower', row: 3, col: 0 }]);
  const second = renderer.liveMowers.get(3);
  for (let step = 1; step <= 8; step += 1) {
    advanceClock(100);
    renderer.setLiveView({ ...state, elapsed: clock / 1000 });
    renderer.showLiveEvents(Array.from({ length: 150 }, () => ({ type: 'shot', row: 1, fromCol: 1, toCol: 7 })));
    assert.equal(renderer.liveMowers.get(0), first);
    assert.equal(renderer.liveMowers.get(3), second);
  }
  renderer.showLiveEvents([{ type: 'mower', row: 0, col: 0 }]);
  assert.equal(renderer.liveMowers.get(0), first, 'A repeated event cannot restart a one-use mower');
  assert.equal(renderer.liveEffects.length, 128, 'Combat effects still retain their existing limit');
  assert(mowerAt(fixture, 0).args[1] > mowerAt(fixture, 3).args[1], 'The earlier row has progressed farther');
  advanceClock(1200);
  assert.equal(mowerAt(fixture, 0), undefined);
  assert(mowerAt(fixture, 3), 'The later mower finishes on its own clock');
  advanceClock(400);
  assert.equal(mowerAt(fixture, 3), undefined);
  assert.equal(renderer.liveMowers.size, 0);
  renderer.destroy();
});

test('used mowers never reappear parked and paused or tactical snapshots do not cancel the sweep', () => {
  const fixture = board();
  const { renderer } = fixture;
  const state = snapshot();
  renderer.setLiveView(state);
  renderer.showLiveEvents([{ type: 'mower', row: 1, col: 0 }]);
  advanceClock(600);
  renderer.setLiveView({ ...state, paused: true, tacticalPhase: 'shopping' });
  assert(mowerAt(fixture, 1).args[1] > 102, 'Existing visual feedback survives a pause snapshot');
  advanceClock(1800);
  assert.equal(mowerAt(fixture, 1), undefined, 'Even a stale available flag cannot park an already used mower');
  renderer.showLiveEvents([{ type: 'mower', row: 1, col: 0 }]);
  assert.equal(mowerAt(fixture, 1), undefined, 'A replayed event cannot create a second mower');
  renderer.setView({ units: [], mowers: Array(5).fill(true) });
  assert(mowerAt(fixture, 1), 'A fresh board restores its available mower');
  assert.equal(renderer.liveMowers.size, 0);
  renderer.destroy();
});

test('round playback waits for the full mower path without extending simultaneous sun feedback', async () => {
  const fixture = board();
  const { renderer, calls } = fixture;
  const mowers = Array(5).fill(true);
  mowers[2] = false;
  const result = renderer.play([{ name: 'mowers', units: [], mowers, events: [{ type: 'mower', row: 2, col: 0 }, event] }]);
  assert.equal(renderer.stage.duration, 2400);
  advanceClock(800);
  assert(mowerAt(fixture, 2), 'The mower outlives the solar feedback');
  assert.equal(calls.some(call => call.operation === 'fillText' && call.args[0] === '+25'), false, 'The sun still completes after 800 ms');
  advanceClock(1450);
  assert(mowerAt(fixture, 2).args[1] + 27 > 912);
  advanceClock(150);
  assert.equal(await result, true);
  assert.equal(renderer.stage, null);
  assert.equal(mowerAt(fixture, 2), undefined);
  renderer.destroy();
});

test('reduced motion consumes the mower with short stationary feedback and cancels cleanly', async () => {
  const fixture = board({ reduced: true });
  const { renderer } = fixture;
  renderer.setLiveView(snapshot());
  renderer.showLiveEvents([{ type: 'mower', row: 4, col: 0 }]);
  const start = mowerAt(fixture, 4);
  advanceClock(200);
  const later = mowerAt(fixture, 4);
  assert.equal(later.args[1], start.args[1]);
  assert(later.alpha < start.alpha);
  advanceClock(200);
  assert.equal(mowerAt(fixture, 4), undefined);
  const result = renderer.play([{ name: 'mowers', units: [], mowers: Array(5).fill(false), events: [{ type: 'mower', row: 4, col: 0 }] }]);
  assert.equal(renderer.stage.duration, 400);
  renderer.destroy();
  assert.equal(await result, false);
  assert.equal(renderer.stage, null);
  assert.equal(renderer.liveMowers.size, 0);
  assert.equal(timers.size, 0);
});
