import { EFFECT_NAMES } from './sound-events.js';
import { createIceSound } from './ice-audio.js';

/** One native-rate mixer, not a collection of competing MP3 players.
 * Decode once; let the audio thread loop the music independently of combat,
 * frame rate and zombie speed. Never seek/restart an effect already playing.
 */
export function createGameAudio({
  AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext,
  fetch = globalThis.fetch?.bind(globalThis),
  assetURL = path => path,
  onError = () => {},
  now = () => globalThis.performance.now(),
} = {}) {
  const maxVoices = 4;
  const buffers = new Map(), loading = new Map(), voices = new Map(), lastPlayed = new Map();
  let context = null, musicBus = null, effectsBus = null, master = null, limiter = null;
  let enabled = false, destroyed = false, visible = true, musicWanted = false;
  let musicSource = null, musicStarted = 0, musicOffset = 0, prepared = null, resuming = null;
  const controller = new AbortController();
  const fail = error => { if (!destroyed && enabled) { try { onError(error); } catch { /* Never stop combat. */ } } };
  const ice = createIceSound({ getContext: () => context, getOutput: () => effectsBus, onError: fail });
  const running = () => enabled && visible && context?.state === 'running' && !destroyed;
  const setParam = (param, value) => { if (param) param.value = value; };
  const discard = source => {
    source.onended = null;
    try { source.stop(); } catch { /* Already stopped. */ }
    source.disconnect();
  };

  function stopVoice(name, voice) {
    if (voices.get(name) === voice) voices.delete(name);
    discard(voice.source);
  }

  function stopEffects() {
    for (const [name, voice] of voices) stopVoice(name, voice);
    ice.stop();
  }

  function stopMusic() {
    if (!musicSource) return;
    const duration = buffers.get('theme')?.duration || 1;
    musicOffset = (musicOffset + Math.max(0, context.currentTime - musicStarted)) % duration;
    discard(musicSource); musicSource = null;
  }

  function startMusic() {
    if (!running() || !musicWanted || musicSource || !buffers.has('theme')) return false;
    try {
      const source = context.createBufferSource();
      source.buffer = buffers.get('theme'); source.loop = true;
      // No relationship to the game's time scale or frame interval.
      setParam(source.playbackRate, 1); setParam(source.detune, 0);
      source.connect(musicBus);
      source.start(0, musicOffset % source.buffer.duration);
      musicStarted = context.currentTime; musicSource = source;
      return true;
    } catch (error) { fail(error); return false; }
  }

  function ensureContext() {
    if (context) return true;
    if (!AudioContext || !fetch || destroyed) { fail(new Error('Web Audio no disponible')); return false; }
    try {
      // Use the output device's rate: forcing 44.1/48 kHz can corrupt mobile
      // audio after switching headphones/speakers. decodeAudioData resamples.
      context = new AudioContext({ latencyHint: 'playback' });
      master = context.createGain(); setParam(master.gain, .85);
      musicBus = context.createGain(); setParam(musicBus.gain, .30);
      effectsBus = context.createGain(); setParam(effectsBus.gain, .18);
      musicBus.connect(master); effectsBus.connect(master);
      limiter = context.createDynamicsCompressor();
      setParam(limiter.threshold, -3); setParam(limiter.knee, 6); setParam(limiter.ratio, 8);
      setParam(limiter.attack, .003); setParam(limiter.release, .1);
      master.connect(limiter); limiter.connect(context.destination);
      context.onstatechange = () => {
        if (context?.state === 'running') startMusic();
      };
      // Unlock this single context inside the Start/toggle gesture, before
      // fetching anything. iOS must not require the separate test button.
      const silent = context.createBufferSource();
      silent.buffer = context.createBuffer(1, 1, context.sampleRate);
      silent.connect(master); silent.onended = () => silent.disconnect(); silent.start(0);
      return true;
    } catch (error) { fail(error); return false; }
  }

  function load(name) {
    if (buffers.has(name)) return Promise.resolve(buffers.get(name));
    if (loading.has(name)) return loading.get(name);
    const task = (async () => {
      try {
        const response = await fetch(assetURL(`/assets/audio/${name}.mp3`), { signal: controller.signal });
        if (!response.ok) throw new Error(`Audio ${name}: HTTP ${response.status}`);
        const bytes = await response.arrayBuffer();
        if (destroyed) return null;
        const buffer = await context.decodeAudioData(bytes);
        if (destroyed) return null;
        buffers.set(name, buffer);
        if (name === 'theme') startMusic();
        return buffer;
      } catch (error) { fail(error); return null; }
      finally { loading.delete(name); }
    })();
    loading.set(name, task);
    return task;
  }

  function prepare() {
    if (prepared || !context || destroyed) return prepared || Promise.resolve();
    // Prioritize the theme and reward feedback; decode the rest sequentially
    // instead of launching eleven media decoders on a phone at once.
    const task = (async () => {
      for (const name of ['theme', 'points', ...EFFECT_NAMES.filter(name => name !== 'points')]) {
        if (destroyed) return;
        await load(name);
      }
    })();
    prepared = task;
    // Retain successful decoded buffers, but a later enable/test gesture may
    // retry a file that failed temporarily instead of leaving music silent.
    task.then(() => { if (prepared === task) prepared = null; });
    return task;
  }

  function resume() {
    if (!enabled || !visible || !context || destroyed) return Promise.resolve(false);
    if (context.state === 'running') { resuming = null; startMusic(); return Promise.resolve(true); }
    if (context.state === 'closed') { fail(new Error('El audio se cerró')); return Promise.resolve(false); }
    if (resuming) return resuming;
    // Safari uses "interrupted" as well as "suspended" after a background
    // transition. Try on return and on the next real user gesture, not per frame.
    try {
      const task = Promise.resolve(context.resume()).then(() => {
        if (resuming === task) resuming = null;
        startMusic(); return context.state === 'running';
      }).catch(error => { if (resuming === task) resuming = null; fail(error); return false; });
      resuming = task;
      return task;
    } catch (error) { fail(error); return Promise.resolve(false); }
  }

  function enable() {
    if (destroyed) return false;
    enabled = true;
    if (!ensureContext()) { enabled = false; return false; }
    ice.enable(); resume(); prepare();
    return true;
  }

  function play(name) {
    if (!running()) return false;
    const time = now();
    const interval = name === 'freeze' ? 350 : name === 'chomp' ? 600 : 180;
    if (time - (lastPlayed.get(name) ?? -Infinity) < interval) return false;
    if (name === 'freeze') {
      const played = ice.play(); if (played) lastPlayed.set(name, time);
      return played;
    }
    if (!EFFECT_NAMES.includes(name) || !buffers.has(name)) return false;
    for (const [key, voice] of voices) if (voice.ends <= context.currentTime) stopVoice(key, voice);
    // Let a bite/hit finish naturally; restarting its first 150 ms sounded
    // like a distorted loop when Classic generated 25 bites each second.
    if (voices.has(name)) return false;
    if (voices.size >= maxVoices) {
      if (!['points', 'puff', 'zombieFinalKill', 'plantation'].includes(name)) return false;
      const oldest = voices.entries().next().value;
      stopVoice(...oldest);
    }
    try {
      const source = context.createBufferSource(); source.buffer = buffers.get(name);
      setParam(source.playbackRate, 1); setParam(source.detune, 0);
      source.connect(effectsBus);
      const voice = { source, ends: context.currentTime + source.buffer.duration };
      source.onended = () => {
        if (voices.get(name) === voice) voices.delete(name);
        source.disconnect();
      };
      source.start(0); voices.set(name, voice); lastPlayed.set(name, time);
      return true;
    } catch (error) { fail(error); return false; }
  }

  function playMusic() {
    if (!enabled || destroyed) return Promise.resolve(false);
    musicWanted = true;
    // While loading, load('theme') will start it only if still wanted/enabled.
    startMusic(); return resume();
  }

  function pauseMusic() { musicWanted = false; stopMusic(); }

  function disable() {
    enabled = false; resuming = null; pauseMusic(); stopEffects(); ice.disable();
    if (context && context.state !== 'closed') Promise.resolve(context.suspend()).catch(() => {});
  }

  function setVisible(value) {
    visible = !!value;
    if (!visible) {
      resuming = null;
      stopMusic(); stopEffects();
      if (context && context.state !== 'closed') Promise.resolve(context.suspend()).catch(() => {});
    } else resume();
  }

  function destroy() {
    if (destroyed) return;
    disable(); destroyed = true; controller.abort(); ice.destroy();
    if (context) {
      context.onstatechange = null;
      if (context.state !== 'closed') Promise.resolve(context.close()).catch(() => {});
    }
    for (const node of [musicBus, effectsBus, master, limiter]) node?.disconnect();
    buffers.clear(); loading.clear(); lastPlayed.clear();
  }

  return { enable, disable, play, playMusic, pauseMusic, stopEffects, resume, setVisible, destroy,
    ready: () => prepare(),
    inspect: () => ({ enabled, contextState: context?.state || 'uninitialized', sampleRate: context?.sampleRate || 0,
      musicPlaying: !!musicSource && running(), musicOffset: musicOffset + (musicSource ? Math.max(0, context.currentTime - musicStarted) : 0),
      musicRate: musicSource?.playbackRate.value ?? 1, effectVoices: voices.size, decodedBuffers: buffers.size, maxVoices }),
  };
}
