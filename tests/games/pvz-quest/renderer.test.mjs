import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { BoardRenderer, UNIT_VISUAL_STATES, unitVisualState } from '../../../public/games/pvz-quest/classroom/renderer.js';
import { getUnit } from '../../../public/games/pvz-quest/classroom/catalog.js';

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
  const context = new Proxy({ filter: 'none' }, { get: (target, key) => key in target ? target[key] : (...args) => calls.push({ operation: key, args, alpha: target.globalAlpha ?? 1, fillStyle: target.fillStyle, strokeStyle: target.strokeStyle, filter: target.filter }) });
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

function spriteFixture(typeId, extras = {}) {
  const definition = getUnit(typeId);
  const fixture = board();
  const image = {};
  fixture.renderer.images.set(definition.sprite.src, image);
  const unit = { id: `${typeId}-visual`, typeId, side: definition.side, row: 2, col: 3, hp: definition.hp, maxHp: definition.hp, ...extras };
  return { ...fixture, unit, image, definition };
}

function spriteDraw(fixture, timestamp = clock) {
  fixture.calls.length = 0;
  fixture.renderer.drawUnit(fixture.unit, timestamp);
  return fixture.calls.find(call => call.operation === 'drawImage' && call.args[0] === fixture.image);
}

test('Classic chomper closes only at the start, chews during the longer cooldown and swallows at the end', () => {
  const fixture = spriteFixture('chomper', { hp:300, maxHp:300, chompDuration:42, chompCooldown:52 });
  fixture.renderer.view.config = { balanceProfile:'classic' };
  fixture.renderer.view.elapsed = 10;
  assert.equal(unitVisualState(fixture.unit,fixture.renderer.view).range, UNIT_VISUAL_STATES.chomper.bite);
  fixture.renderer.view.elapsed = 12;
  assert.equal(unitVisualState(fixture.unit,fixture.renderer.view).range, UNIT_VISUAL_STATES.chomper.chew);
  const drawing = spriteDraw(fixture,1000);
  const index = drawing.args[2] / 114 * 11 + drawing.args[1] / 130;
  assert(index >= 44 && index <= 54, 'Forty remaining seconds is chewing, not a frozen bite');
  assert(fixture.calls.some(call => call.operation === 'fillText' && call.args[0] === 'Masticando · 40 s'));
  fixture.renderer.view.elapsed = 51;
  assert.equal(unitVisualState(fixture.unit,fixture.renderer.view).range, UNIT_VISUAL_STATES.chomper.swallow);
  fixture.renderer.view.elapsed = 52;
  assert.equal(unitVisualState(fixture.unit,fixture.renderer.view).range, undefined);
  fixture.renderer.destroy();
});

test('profile fallback and large Classic HP retain correct damaged shells and readable health labels', () => {
  const fixture = spriteFixture('wallnut', { hp:2000 });
  delete fixture.unit.maxHp;
  fixture.renderer.view.config = { balanceProfile:'classic' };
  assert.equal(unitVisualState(fixture.unit,fixture.renderer.view).range, UNIT_VISUAL_STATES.wallnut.damaged);
  spriteDraw(fixture,1000);
  assert(fixture.calls.some(call => call.operation === 'fillText' && call.args[0] === '2000/4000'));
  const chomper = { typeId:'chomper',side:'plants',chompCooldown:42 };
  assert.equal(unitVisualState(chomper,{elapsed:0,config:{balanceProfile:'classic'}}).chompDuration,42);
  assert.equal(unitVisualState(chomper,{elapsed:2,config:{balanceProfile:'classic'}}).range,UNIT_VISUAL_STATES.chomper.chew);
  fixture.renderer.destroy();
});

test('walnut selects original chipped and severely damaged animation frames from remaining health', () => {
  const fixture = spriteFixture('wallnut', { hp: 10, maxHp: 10 });
  assert.equal(unitVisualState(fixture.unit).range, null);
  fixture.unit.hp = 6;
  assert.equal(unitVisualState(fixture.unit).range, UNIT_VISUAL_STATES.wallnut.damaged);
  for (const timestamp of [0, 130, 1000, 3000]) {
    const drawing = spriteDraw(fixture, timestamp);
    const index = drawing.args[2] / 73 * 11 + drawing.args[1] / 65;
    assert(index >= 17 && index <= 32, 'Damaged shells use frames 17–32, not an intact portrait');
  }
  fixture.unit.hp = 3;
  assert.equal(unitVisualState(fixture.unit).range, UNIT_VISUAL_STATES.wallnut.critical);
  for (const timestamp of [0, 130, 1000, 3000, 10000]) {
    const drawing = spriteDraw(fixture, timestamp);
    const index = drawing.args[2] / 73 * 11 + drawing.args[1] / 65;
    assert(index >= 33 && index <= 50, 'Critical shells never enter the transparent last four frames');
  }
  fixture.renderer.view.units = [fixture.unit];
  fixture.calls.length = 0;
  fixture.renderer.drawEffects([{ type: 'damage', unitId: fixture.unit.id, row: 2, col: 3, amount: 1 }], 0.7);
  assert(fixture.calls.some(call => call.operation === 'fillRect' && call.fillStyle === '#d7a044'), 'Being bitten drops visible shell crumbs');
  fixture.renderer.destroy();
});

test('chomper closes its jaws, visibly chews for the cooldown, swallows and becomes ready again', () => {
  const fixture = spriteFixture('chomper', { chompCooldown: 30 });
  fixture.renderer.view.elapsed = 10;
  assert.equal(unitVisualState(fixture.unit, fixture.renderer.view).range, UNIT_VISUAL_STATES.chomper.bite);
  fixture.renderer.view.elapsed = 12;
  assert.equal(unitVisualState(fixture.unit, fixture.renderer.view).range, UNIT_VISUAL_STATES.chomper.chew);
  let drawing = spriteDraw(fixture, 1000);
  let index = drawing.args[2] / 114 * 11 + drawing.args[1] / 130;
  assert(index >= 44 && index <= 54);
  assert(fixture.calls.some(call => call.operation === 'fillText' && call.args[0] === 'Masticando · 18 s'));
  fixture.renderer.view.elapsed = 29;
  assert.equal(unitVisualState(fixture.unit, fixture.renderer.view).range, UNIT_VISUAL_STATES.chomper.swallow);
  drawing = spriteDraw(fixture, 1500);
  index = drawing.args[2] / 114 * 11 + drawing.args[1] / 130;
  assert(index >= 55 && index <= 65);
  fixture.renderer.view.elapsed = 30;
  assert.equal(unitVisualState(fixture.unit, fixture.renderer.view).range, undefined);
  spriteDraw(fixture, 2000);
  assert(!fixture.calls.some(call => call.operation === 'fillText' && call.args[0].startsWith('Masticando')));
  fixture.renderer.destroy();
});

test('chomper animation and cooldown freeze with battle time while paused and reduced motion is static', () => {
  const fixture = spriteFixture('chomper', { chompCooldown: 30 });
  fixture.renderer.view.elapsed = 15;
  fixture.renderer.view.paused = true;
  const first = spriteDraw(fixture, 1000);
  const later = spriteDraw(fixture, 25000);
  assert.deepEqual(first.args.slice(1, 5), later.args.slice(1, 5));
  assert(fixture.calls.some(call => call.operation === 'fillText' && call.args[0] === 'Masticando · 15 s'));
  fixture.renderer.reducedMotion = true;
  fixture.renderer.view.elapsed = 16;
  const reducedFirst = spriteDraw(fixture, 30000);
  fixture.renderer.view.elapsed = 17;
  const reducedLater = spriteDraw(fixture, 35000);
  assert.deepEqual(reducedFirst.args.slice(1, 5), reducedLater.args.slice(1, 5));
  assert.equal(reducedFirst.args[2], 4 * 114, 'The chewing pose is retained without animated jaw motion');
  fixture.renderer.destroy();
});

test('frozen zombies turn blue only until the engine freeze time expires', () => {
  const fixture = spriteFixture('common', { freezeUntil: 14 });
  fixture.renderer.view.elapsed = 10;
  const frozen = spriteDraw(fixture, 500);
  assert.match(frozen.filter, /hue-rotate\(155deg\)/);
  assert(fixture.calls.some(call => call.operation === 'stroke' && call.strokeStyle === '#a5ebff'), 'The blue body carries a visible frost symbol');
  assert.equal(fixture.renderer.context.filter, 'none', 'HP bars and the lawn cannot inherit the sprite tint');
  fixture.renderer.view.elapsed = 14;
  const thawed = spriteDraw(fixture, 4500);
  assert.equal(thawed.filter, 'none');
  fixture.renderer.destroy();
});

test('snow pea portraits on the board and projectiles are blue rather than green', () => {
  const fixture = spriteFixture('snow-pea');
  const drawing = spriteDraw(fixture, 500);
  assert.match(drawing.filter, /hue-rotate\(155deg\)/);
  fixture.calls.length = 0;
  fixture.renderer.drawEffects([{ type: 'shot', ice: true, typeId: 'snow-pea', row: 2, fromCol: 3, toCol: 6 }], 0.3);
  assert(fixture.calls.some(call => call.operation === 'fill' && call.fillStyle === '#86ddff'));
  assert(fixture.calls.some(call => call.operation === 'stroke' && call.strokeStyle === '#e5faff'));
  fixture.renderer.setLiveView({ ...snapshot(), elapsed: 1 });
  fixture.renderer.showLiveEvents([{ type: 'freeze', row: 2, col: 6, unitId: 'common-ice', until: 5 }]);
  assert.equal(fixture.renderer.liveEffects.at(-1).event.type, 'freeze');
  fixture.renderer.destroy();
});

test('round playback adopts stage battle time for freezing and chomper cooldowns', async () => {
  const fixture = spriteFixture('chomper', { chompCooldown: 25 });
  fixture.renderer.view.elapsed = 0;
  const result = fixture.renderer.play([{ name: 'bites', elapsed: 10, units: [fixture.unit], events: [], mowers: Array(5).fill(true) }]);
  assert.equal(fixture.renderer.view.elapsed, 10);
  assert(fixture.calls.some(call => call.operation === 'fillText' && call.args[0] === 'Masticando · 15 s'));
  advanceClock(650);
  assert.equal(await result, true);
  fixture.renderer.destroy();
});

test('round-mode chomper animates the actual jaw-closing stage before staying in a chewing pose', async () => {
  const fixture = spriteFixture('chomper', { chompCooldown: 25 });
  fixture.renderer.view.config = { mode: 'duel' };
  const result = fixture.renderer.play([{ name: 'bites', elapsed: 5, units: [fixture.unit],
    events: [{ type: 'chomp', sourceId: fixture.unit.id, row: 2, col: 4 }], mowers: Array(5).fill(true) }]);
  const first = spriteDraw(fixture, 0).args;
  const later = spriteDraw(fixture, 600).args;
  assert.notDeepEqual(first.slice(1, 3), later.slice(1, 3), 'The bite closes even while round battle time is fixed');
  assert(first[2] / 114 * 11 + first[1] / 130 >= 25);
  advanceClock(650);
  assert.equal(await result, true);
  const chewing = spriteDraw(fixture, 650).args;
  const index = chewing[2] / 114 * 11 + chewing[1] / 130;
  assert(index >= 44 && index <= 54, 'After the bite, the mouth stays chewing instead of reopening at frame 25');
  fixture.renderer.destroy();
});
