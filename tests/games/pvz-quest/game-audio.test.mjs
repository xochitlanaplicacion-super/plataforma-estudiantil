import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameAudio } from '../../../public/games/pvz-quest/classroom/game-audio.js';
import { EFFECT_NAMES } from '../../../public/games/pvz-quest/classroom/sound-events.js';

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function audioHarness({ fetchGate = null, failedFetch = null, failedDecode = null, rejectedResume = false } = {}) {
  const contexts = [], fetches = [], decodes = [], errors = [];
  let clock = 1_000, decoding = 0, maxDecoding = 0;
  const parameter = value => ({ value, setValueAtTime(next) { this.value = next; },
    exponentialRampToValueAtTime(next) { this.value = next; }, linearRampToValueAtTime(next) { this.value = next; },
    setTargetAtTime(next) { this.value = next; }, cancelScheduledValues() {} });
  const node = () => ({ connections: [], disconnected: false,
    connect(destination) { this.connections.push(destination); return destination; },
    disconnect() { this.disconnected = true; } });
  class Context {
    constructor(options) {
      this.options = options; this.state = 'suspended'; this.currentTime = 10; this.sampleRate = 48_000;
      this.destination = node(); this.sources = []; this.oscillators = []; this.gains = []; this.compressors = [];
      this.resumeCalls = 0; this.suspendCalls = 0; this.closeCalls = 0;
      contexts.push(this);
    }
    resume() {
      this.resumeCalls++;
      if (rejectedResume) return Promise.reject(new Error('gesture required'));
      this.state = 'running'; this.onstatechange?.();
      return Promise.resolve();
    }
    suspend() { this.suspendCalls++; this.state = 'suspended'; this.onstatechange?.(); return Promise.resolve(); }
    close() { this.closeCalls++; this.state = 'closed'; this.onstatechange?.(); return Promise.resolve(); }
    createGain() { const result = { ...node(), gain: parameter(1) }; this.gains.push(result); return result; }
    createDynamicsCompressor() {
      const result = { ...node(), threshold: parameter(0), knee: parameter(0), ratio: parameter(1),
        attack: parameter(0), release: parameter(0) };
      this.compressors.push(result); return result;
    }
    createBuffer(channels, length, sampleRate) {
      return { channels, length, sampleRate, duration: length / sampleRate,
        getChannelData: () => new Float32Array(length) };
    }
    createBufferSource() {
      const source = { ...node(), playbackRate: parameter(1), detune: parameter(0), loop: false,
        starts: [], stops: [],
        start(at = 0, offset = 0) { this.starts.push({ at, offset }); },
        stop(at) { this.stops.push(at); },
        finish() { this.onended?.(); } };
      this.sources.push(source); return source;
    }
    createOscillator() {
      const tone = { ...node(), frequency: parameter(440), starts: [], stops: [],
        start(at) { this.starts.push(at); }, stop(at) { this.stops.push(at); }, finish() { this.onended?.(); } };
      this.oscillators.push(tone); return tone;
    }
    async decodeAudioData(bytes) {
      const name = new TextDecoder().decode(bytes);
      decoding++; maxDecoding = Math.max(maxDecoding, decoding); decodes.push(name);
      try {
        await Promise.resolve();
        if (name === failedDecode) throw new Error(`invalid ${name}`);
        return { name, sampleRate: this.sampleRate, duration: name === 'theme' ? 28 : 1.2 };
      } finally { decoding--; }
    }
  }
  async function fetch(url, options) {
    const name = /\/([^/]+)\.mp3$/.exec(url)?.[1];
    fetches.push({ name, url, signal: options?.signal });
    if (fetchGate && name === 'theme') await fetchGate.promise;
    return { ok: name !== failedFetch, status: name === failedFetch ? 404 : 200,
      arrayBuffer: async () => new TextEncoder().encode(name).buffer };
  }
  const audio = createGameAudio({ AudioContext: Context, fetch,
    assetURL: path => `/games/pvz-quest${path}`, onError: error => errors.push(error), now: () => clock });
  return { audio, contexts, fetches, decodes, errors,
    get maxDecoding() { return maxDecoding; },
    setFailedFetch(name) { failedFetch = name; },
    advance(seconds) { clock += seconds * 1_000; if (contexts[0]) contexts[0].currentTime += seconds; },
    tick(milliseconds) { clock += milliseconds; },
    musicSources: () => contexts.flatMap(context => context.sources.filter(source => source.buffer?.name === 'theme')),
    effectSources: name => contexts.flatMap(context => context.sources.filter(source => source.buffer?.name === name)),
  };
}

test('Start enables one native-rate mixer immediately; queued music starts after decoding without a test-button gesture', async () => {
  const gate = deferred();
  const harness = audioHarness({ fetchGate: gate });
  const { audio, contexts } = harness;
  assert.equal(audio.inspect().contextState, 'uninitialized');
  assert.equal(audio.play('points'), false);
  assert.equal(audio.enable(), true);
  assert.equal(contexts.length, 1);
  assert.deepEqual(contexts[0].options, { latencyHint: 'playback' });
  assert.equal(contexts[0].sampleRate, 48_000, 'The device chooses its native sample rate');
  assert.equal(contexts[0].resumeCalls, 1, 'Resume is requested inside the initial gesture');
  assert.equal(contexts[0].sources[0].buffer.length, 1, 'The one-sample unlock needs no file or second gesture');
  assert.equal(audio.play('points'), false, 'Undecoded feedback is skipped, not queued against music');
  await audio.playMusic();
  assert.equal(audio.inspect().musicPlaying, false);
  gate.resolve();
  await audio.ready();
  assert.equal(audio.inspect().musicPlaying, true);
  const music = harness.musicSources()[0];
  assert.equal(music.loop, true);
  assert.equal(music.playbackRate.value, 1);
  assert.equal(music.detune.value, 0);
  assert.equal(music.starts.length, 1);
  assert.equal(audio.inspect().decodedBuffers, EFFECT_NAMES.length + 1);
  await audio.playMusic();
  audio.enable();
  await audio.playMusic();
  assert.equal(contexts.length, 1);
  assert.equal(harness.musicSources().length, 1, 'Repeated starts do not double the soundtrack');
  audio.destroy();
});

test('MP3 buffers are cached, music is prioritized, and decoding never runs in parallel', async () => {
  const harness = audioHarness();
  harness.audio.enable();
  await Promise.all([harness.audio.ready(), harness.audio.ready()]);
  assert.equal(harness.maxDecoding, 1);
  assert.deepEqual(harness.decodes.slice(0, 2), ['theme', 'points']);
  assert.equal(harness.fetches.length, EFFECT_NAMES.length + 1);
  assert.equal(new Set(harness.decodes).size, EFFECT_NAMES.length + 1);
  assert(harness.fetches.every(request => request.url.startsWith('/games/pvz-quest/assets/audio/')));
  harness.audio.disable();
  harness.audio.enable();
  await harness.audio.ready();
  assert.equal(harness.fetches.length, EFFECT_NAMES.length + 1, 'Mute/re-enable must not reload or re-decode music');
  harness.audio.destroy();
});

test('a transient music download failure recovers on the next enable gesture without reloading successful effects', async () => {
  const harness = audioHarness({ failedFetch: 'theme' });
  const { audio } = harness;
  audio.enable();
  // Request music once. Recovery must remember this request, not require a
  // second playMusic call or another test-button gesture after the retry.
  await audio.playMusic(); await audio.ready();
  assert.equal(audio.inspect().decodedBuffers, EFFECT_NAMES.length);
  assert.equal(audio.inspect().musicPlaying, false);
  assert.equal(harness.errors.length, 1);
  assert.equal(harness.fetches.filter(request => request.name === 'theme').length, 1);
  harness.setFailedFetch(null);
  assert.equal(audio.enable(), true);
  await audio.ready();
  assert.equal(audio.inspect().musicPlaying, true);
  assert.equal(audio.inspect().decodedBuffers, EFFECT_NAMES.length + 1);
  assert.equal(harness.musicSources().length, 1);
  assert.equal(harness.contexts.length, 1);
  assert.equal(harness.fetches.length, EFFECT_NAMES.length + 2, 'Only the failed music download is retried');
  assert.equal(harness.decodes.length, EFFECT_NAMES.length + 1, 'Successful decoded effects remain cached');
  assert.equal(harness.maxDecoding, 1);
  audio.enable(); await audio.ready();
  assert.equal(harness.fetches.length, EFFECT_NAMES.length + 2, 'Further enable gestures do not re-fetch the recovered music');
  assert.equal(harness.musicSources().length, 1, 'Retry does not duplicate an already running soundtrack');
  audio.destroy();
});

test('combat sound requests cannot repeatedly rewind a bite, impact, or shot already playing', async () => {
  const harness = audioHarness();
  const { audio } = harness;
  audio.enable(); await audio.ready();
  await audio.playMusic();
  for (const name of ['chomp', 'pea_hit', 'pea_shoot']) {
    assert.equal(audio.play(name), true);
    for (let index = 0; index < 12; index++) {
      harness.tick(100);
      assert.equal(audio.play(name), false, `${name} must finish naturally instead of repeating its first milliseconds`);
    }
    const source = harness.effectSources(name)[0];
    assert.equal(harness.effectSources(name).length, 1);
    assert.equal(source.starts.length, 1);
    assert.equal(source.stops.length, 0);
    assert.equal(source.playbackRate.value, 1);
    assert.equal(source.detune.value, 0);
    source.finish();
    harness.tick(1_000);
    assert.equal(audio.play(name), true, 'A completed sound may play normally again');
    audio.stopEffects();
  }
  assert.equal(harness.musicSources().length, 1);
  assert.equal(audio.inspect().musicPlaying, true);
  audio.destroy();
});

test('four recorded voices maximum leave music independent; important cues may replace the oldest effect', async () => {
  const harness = audioHarness();
  const { audio } = harness;
  audio.enable(); await audio.ready(); await audio.playMusic();
  for (const name of ['chomp', 'pea_hit', 'pea_shoot', 'zombie_groan']) assert.equal(audio.play(name), true);
  assert.equal(audio.inspect().maxVoices, 4);
  assert.equal(audio.inspect().effectVoices, 4);
  assert.equal(audio.play('zombie_fall'), false);
  assert.equal(audio.play('points'), true);
  assert.equal(harness.effectSources('chomp')[0].stops.length, 1);
  assert.equal(audio.inspect().effectVoices, 4);
  assert.equal(harness.musicSources()[0].stops.length, 0);
  harness.advance(2);
  assert.equal(audio.play('click'), true);
  assert.equal(audio.inspect().effectVoices, 1, 'Expired recorded voices are reclaimed even before an ended event arrives');
  const context = harness.contexts[0];
  assert.equal(context.compressors.length, 1, 'A shared limiter protects against clipping');
  assert(context.gains.every(gain => gain.gain.value < 1), 'Music, feedback, and master output keep headroom');
  audio.destroy();
});

test('freeze sounds share the same context and are capped at two voices without touching the music', async () => {
  const harness = audioHarness();
  const { audio } = harness;
  audio.enable(); await audio.ready(); await audio.playMusic();
  assert.equal(audio.play('freeze'), true);
  harness.tick(350); assert.equal(audio.play('freeze'), true);
  harness.tick(350); assert.equal(audio.play('freeze'), true);
  assert.equal(harness.contexts.length, 1);
  const tones = harness.contexts[0].oscillators;
  assert.equal(tones.length, 9);
  assert(tones.slice(0, 3).every(tone => tone.stops.includes(undefined)), 'The oldest of three ice voices is discarded');
  assert(tones.slice(3).every(tone => !tone.stops.includes(undefined)));
  audio.stopEffects();
  assert(tones.every(tone => tone.stops.includes(undefined)));
  assert.equal(audio.inspect().musicPlaying, true);
  assert.equal(harness.musicSources()[0].stops.length, 0);
  audio.destroy();
});

test('pausing and muting preserve the music position and do not reset playback speed', async () => {
  const harness = audioHarness();
  const { audio } = harness;
  audio.enable(); await audio.ready(); await audio.playMusic();
  harness.advance(7);
  assert.equal(audio.inspect().musicOffset, 7);
  audio.pauseMusic();
  assert.equal(audio.inspect().musicOffset, 7);
  assert.equal(audio.inspect().musicPlaying, false);
  harness.advance(10);
  await audio.playMusic();
  assert.equal(harness.musicSources()[1].starts[0].offset, 7);
  harness.advance(3);
  audio.disable();
  assert.equal(audio.inspect().musicOffset, 10);
  assert.equal(audio.play('chomp'), false);
  assert.equal(audio.inspect().contextState, 'suspended');
  harness.advance(60);
  audio.enable(); await audio.playMusic();
  assert.equal(harness.musicSources()[2].starts[0].offset, 10);
  assert(harness.musicSources().every(source => source.playbackRate.value === 1 && source.detune.value === 0));
  assert.equal(harness.contexts.length, 1);
  audio.destroy();
});

test('music playback depends only on the audio clock, not on combat clocks or bursts of effects', async () => {
  const harness = audioHarness();
  const { audio } = harness;
  audio.enable(); await audio.ready(); await audio.playMusic();
  harness.advance(6);
  harness.tick(10_000_000);
  for (const name of EFFECT_NAMES) audio.play(name);
  assert.equal(audio.inspect().musicOffset, 6, 'Huge game-time jumps do not alter the soundtrack clock');
  assert.equal(audio.inspect().musicRate, 1);
  assert.equal(harness.musicSources().length, 1);
  assert.equal(harness.musicSources()[0].stops.length, 0);
  audio.stopEffects();
  assert.equal(audio.inspect().musicOffset, 6);
  assert.equal(audio.inspect().musicPlaying, true);
  audio.destroy();
});

test('hiding and restoring the app, then recovering Safari interrupted state, preserves normal music', async () => {
  const harness = audioHarness();
  const { audio, contexts } = harness;
  audio.enable(); await audio.ready(); await audio.playMusic();
  harness.advance(5);
  audio.setVisible(false);
  assert.equal(audio.inspect().musicPlaying, false);
  assert.equal(audio.play('points'), false);
  harness.advance(100);
  audio.setVisible(true); await audio.resume();
  assert.equal(audio.inspect().musicPlaying, true);
  assert.equal(harness.musicSources()[1].starts[0].offset, 5);
  contexts[0].state = 'interrupted'; contexts[0].onstatechange?.();
  assert.equal(audio.inspect().musicPlaying, false);
  assert.equal(audio.play('points'), false);
  await audio.resume();
  assert.equal(audio.inspect().contextState, 'running');
  assert.equal(audio.inspect().musicPlaying, true);
  assert.equal(harness.musicSources().length, 2, 'Resuming a still-attached soundtrack never creates duplicate loops');
  assert.equal(audio.inspect().musicRate, 1);
  audio.destroy();
});

test('music does not start if mute, pause, hide, or destroy occurs while its download is pending', async t => {
  for (const action of ['disable', 'pauseMusic', 'hide', 'destroy']) {
    await t.test(action, async () => {
      const gate = deferred();
      const harness = audioHarness({ fetchGate: gate });
      const { audio } = harness;
      audio.enable(); await audio.playMusic();
      const ready = audio.ready();
      if (action === 'hide') audio.setVisible(false); else audio[action]();
      gate.resolve(); await ready;
      assert.equal(audio.inspect().musicPlaying, false);
      assert.equal(harness.musicSources().length, 0);
      assert.equal(audio.inspect().effectVoices, 0);
      audio.destroy();
    });
  }
});

test('rapid off/on during loading starts exactly one requested soundtrack, while off/on/off stays silent', async t => {
  for (const finalEnabled of [true, false]) {
    await t.test(finalEnabled ? 'enabled' : 'muted', async () => {
      const gate = deferred();
      const harness = audioHarness({ fetchGate: gate });
      const { audio } = harness;
      audio.enable(); await audio.playMusic();
      audio.disable(); audio.enable(); await audio.playMusic();
      if (!finalEnabled) audio.disable();
      gate.resolve(); await audio.ready();
      assert.equal(audio.inspect().enabled, finalEnabled);
      assert.equal(audio.inspect().musicPlaying, finalEnabled);
      assert.equal(harness.musicSources().length, finalEnabled ? 1 : 0);
      assert.equal(harness.contexts.length, 1);
      audio.destroy();
    });
  }
});

test('failed downloads, corrupt audio, unsupported contexts, and rejected resumes never throw into gameplay', async t => {
  await t.test('missing effect', async () => {
    const harness = audioHarness({ failedFetch: 'chomp' });
    harness.audio.enable(); await harness.audio.playMusic(); await harness.audio.ready();
    assert.equal(harness.audio.play('chomp'), false);
    assert.equal(harness.audio.play('points'), true);
    assert.equal(harness.audio.inspect().musicPlaying, true);
    assert.equal(harness.errors.length, 1);
    harness.audio.destroy();
  });
  await t.test('corrupt music', async () => {
    const harness = audioHarness({ failedDecode: 'theme' });
    harness.audio.enable(); await harness.audio.playMusic(); await harness.audio.ready();
    assert.equal(harness.audio.inspect().musicPlaying, false);
    assert.equal(harness.audio.play('points'), true);
    assert.equal(harness.errors.length, 1);
    harness.audio.destroy();
  });
  await t.test('context rejected', async () => {
    const harness = audioHarness({ rejectedResume: true });
    harness.audio.enable(); await harness.audio.playMusic(); await harness.audio.ready();
    assert.equal(harness.audio.inspect().musicPlaying, false);
    assert.equal(harness.audio.play('points'), false);
    assert(harness.errors.length > 0);
    harness.audio.destroy();
  });
  await t.test('context unavailable', async () => {
    const audio = createGameAudio({ AudioContext: null });
    assert.equal(audio.enable(), false);
    assert.equal(audio.play('points'), false);
    assert.equal(await audio.playMusic(), false);
    await audio.ready();
    assert.doesNotThrow(() => audio.destroy());
  });
});

test('destroy stops and closes the only context, clears buffers, and prevents later playback or reactivation', async () => {
  const harness = audioHarness();
  const { audio, contexts } = harness;
  audio.enable(); await audio.ready(); await audio.playMusic(); audio.play('points'); audio.play('freeze');
  audio.destroy();
  assert.equal(contexts[0].state, 'closed');
  assert.equal(contexts[0].closeCalls, 1);
  assert.equal(audio.inspect().decodedBuffers, 0);
  assert.equal(audio.inspect().effectVoices, 0);
  assert.equal(audio.inspect().musicPlaying, false);
  assert.equal(audio.enable(), false);
  assert.equal(audio.play('points'), false);
  assert.equal(audio.play('freeze'), false);
  assert.equal(await audio.playMusic(), false);
  assert.equal(await audio.resume(), false);
  audio.destroy();
  assert.equal(contexts[0].closeCalls, 1);
});
