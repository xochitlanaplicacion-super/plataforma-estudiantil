import test from 'node:test';
import assert from 'node:assert/strict';
import { createIceSound } from '../../../public/games/pvz-quest/classroom/ice-audio.js';

function audioHarness() {
  const contexts = [];
  class Context {
    constructor() { this.state = 'suspended'; this.currentTime = 10; this.destination = {}; this.tones = []; contexts.push(this); }
    resume() { this.state = 'running'; return Promise.resolve(); }
    suspend() { this.state = 'suspended'; return Promise.resolve(); }
    close() { this.state = 'closed'; return Promise.resolve(); }
    createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
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
