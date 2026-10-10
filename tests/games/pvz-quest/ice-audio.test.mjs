import test from 'node:test';
import assert from 'node:assert/strict';
import { createIceSound } from '../../../public/games/pvz-quest/classroom/ice-audio.js';

function audioHarness() {
  const contexts = [];
  class Context {
    constructor() { this.state = 'suspended'; this.currentTime = 10; this.destination = {}; this.tones = []; this.gains = []; contexts.push(this); }
    resume() { this.state = 'running'; return Promise.resolve(); }
    suspend() { this.state = 'suspended'; return Promise.resolve(); }
    close() { this.state = 'closed'; return Promise.resolve(); }
    createGain() {
      const node = { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect(destination) { this.destination = destination; }, disconnect() {} };
      this.gains.push(node); return node;
    }
    createOscillator() {
      const tone = { frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {},
        start(at) { this.started = at; }, stop(at) { if (at == null) this.stopped = true; else this.endAt = at; } };
      this.tones.push(tone); return tone;
    }
  }
  return { Context, contexts };
}

test('ice audio is created only by enabling sound and never plays while muted', () => {
  const { Context, contexts } = audioHarness();
  const sound = createIceSound({ AudioContext: Context });
  assert.equal(sound.play(), false);
  assert.equal(contexts.length, 0);
  assert.equal(sound.enable(), true);
  assert.equal(sound.play(), true);
  assert.equal(contexts[0].tones.length, 3);
  assert(contexts[0].tones.every(tone => tone.started === 10 && tone.endAt === 10.4));
  sound.disable();
  assert(contexts[0].tones.every(tone => tone.stopped));
  assert.equal(sound.play(), false);
  assert.equal(contexts[0].state, 'suspended');
  sound.enable();
  assert.equal(contexts.length, 1);
  assert.equal(sound.play(), true);
  sound.destroy();
  assert.equal(contexts[0].state, 'closed');
  assert.equal(sound.play(), false);
});

test('ice audio bounds simultaneous voices and releases completed or stopped effects', () => {
  const { Context, contexts } = audioHarness();
  const sound = createIceSound({ AudioContext: Context });
  sound.enable();
  for (let index = 0; index < 5; index += 1) sound.play();
  const tones = contexts[0].tones;
  assert(tones.slice(0, 3).every(tone => tone.stopped));
  assert(tones.slice(3).every(tone => !tone.stopped));
  for (const tone of tones.slice(3, 6)) tone.onended();
  assert(tones.slice(3, 6).every(tone => tone.stopped));
  sound.stop();
  assert(tones.every(tone => tone.stopped));
  assert.equal(sound.play(), true, 'Stopping feedback does not mute future effects');
  sound.destroy();
});

test('missing or rejected Web Audio never throws into combat', () => {
  const unsupported = createIceSound({ AudioContext: null });
  assert.equal(unsupported.enable(), false);
  assert.equal(unsupported.play(), false);
  unsupported.destroy();
  let errors = 0;
  const broken = createIceSound({ AudioContext: class { constructor() { throw new Error('unavailable'); } }, onError: () => errors++ });
  assert.equal(broken.enable(), false);
  assert.equal(errors, 1);
  assert.equal(broken.play(), false);
  broken.destroy();
});

test('shared ice audio uses the mixer output without owning its context lifecycle', () => {
  const { Context, contexts } = audioHarness();
  const context = new Context();
  const destination = {};
  const sound = createIceSound({ AudioContext: null, getContext: () => context, getOutput: () => destination });
  assert.equal(sound.enable(), true);
  assert.equal(context.state, 'suspended', 'Only the mixer may resume the shared context');
  assert.equal(sound.play(), false);
  context.state = 'running';
  assert.equal(sound.play(), true);
  assert.equal(context.gains[0].destination, destination);
  assert.equal(contexts.length, 1, 'Ice must not create another AudioContext');
  sound.disable();
  assert(context.tones.every(tone => tone.stopped));
  assert.equal(context.state, 'running', 'Muting ice must not suspend music or other mixer sounds');
  assert.equal(sound.play(), false);
  assert.equal(sound.enable(), true);
  assert.equal(sound.play(), true);
  sound.destroy();
  assert.equal(context.state, 'running', 'Destroying ice must not close the mixer');
  assert.equal(sound.play(), false);
});

test('shared ice audio reacquires a recreated context and falls back to its destination', () => {
  const { Context } = audioHarness();
  const previousContext = new Context();
  previousContext.state = 'running';
  let currentContext = previousContext;
  const sound = createIceSound({ getContext: () => currentContext, getOutput: () => null });
  sound.enable();
  sound.play();
  assert.equal(previousContext.gains[0].destination, previousContext.destination);
  currentContext = new Context();
  currentContext.state = 'running';
  assert.equal(sound.enable(), true);
  assert(previousContext.tones.every(tone => tone.stopped), 'Old voices are discarded when the mixer context changes');
  assert.equal(sound.play(), true);
  assert.equal(currentContext.gains[0].destination, currentContext.destination);
  currentContext = null;
  assert.equal(sound.enable(), false);
  assert.equal(sound.play(), false);
  sound.destroy();
  assert.equal(previousContext.state, 'running');
});

test('shared ice audio caps simultaneous freeze effects at two voices', () => {
  const { Context } = audioHarness();
  const context = new Context();
  context.state = 'running';
  const sound = createIceSound({ getContext: () => context });
  sound.enable();
  for (let index = 0; index < 3; index += 1) sound.play();
  assert(context.tones.slice(0, 3).every(tone => tone.stopped));
  assert(context.tones.slice(3).every(tone => !tone.stopped));
  sound.destroy();
  assert(context.tones.every(tone => tone.stopped));
  assert.equal(context.state, 'running');
});
