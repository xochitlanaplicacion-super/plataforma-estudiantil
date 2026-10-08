import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { BoardRenderer } from '../../../public/games/pvz-quest/classroom/renderer.js';

const globals = new Map();
before(() => {
  for (const name of ['requestAnimationFrame', 'cancelAnimationFrame', 'matchMedia']) globals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
  globalThis.matchMedia = () => ({ matches: false });
});
after(() => {
  for (const [name, descriptor] of globals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  }
});

function board({ reduced = false, sunAsset = true } = {}) {
  const calls = [];
  const context = new Proxy({}, { get: (target, key) => key in target ? target[key] : (...args) => calls.push({ operation: key, args }) });
  const canvas = {
    style: {}, getContext: () => context, setAttribute() {}, addEventListener() {}, removeEventListener() {},
    getBoundingClientRect: () => ({ left: 200, top: 120, width: 960, height: 540 }),
    ownerDocument: { querySelector: () => ({ getBoundingClientRect: () => ({ left: 250, top: 40, width: 140, height: 40 }) }) },
  };
  const renderer = new BoardRenderer(canvas);
  renderer.reducedMotion = reduced;
  if (sunAsset) renderer.images.set('/assets/images/Interface/SunSprite_79x79.png', { naturalWidth: 2291, naturalHeight: 79 });
  return { renderer, calls };
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
  const sprites = calls.filter(call => call.operation === 'drawImage');
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
  assert.equal(await result, true);
  assert.equal(renderer.stage, null);
  renderer.destroy();
});
