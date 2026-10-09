/** Local ice shimmer: no recording download, playback only after a user gesture. */
export function createIceSound({ AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext, onError = () => {} } = {}) {
  let context = null;
  let enabled = false;
  const voices = new Set();
  const fail = () => { try { onError(); } catch { /* Audio never interrupts combat. */ } };
  const stop = () => {
    for (const voice of [...voices]) voice.stop();
  };
  return {
    enable() {
      enabled = true;
      if (!AudioContext) return false;
      try {
        context ||= new AudioContext();
        if (context.state === 'suspended') Promise.resolve(context.resume()).catch(fail);
        return true;
      } catch { fail(); return false; }
    },
    play() {
      if (!enabled || !context || context.state !== 'running') return false;
      try {
        while (voices.size >= 4) voices.values().next().value.stop();
        const output = context.createGain();
        const at = context.currentTime;
        output.gain.setValueAtTime(0.0001, at);
        output.gain.exponentialRampToValueAtTime(0.12, at + 0.015);
        output.gain.exponentialRampToValueAtTime(0.0001, at + 0.38);
        output.connect(context.destination);
        const nodes = [];
        let ended = 0;
        const voice = { stop() {
          voices.delete(voice);
          for (const node of nodes) { try { node.stop(); } catch { /* Already ended. */ } node.disconnect(); }
          output.disconnect();
        } };
        for (const frequency of [1350, 1820, 2420]) {
          const tone = context.createOscillator();
          tone.type = 'triangle';
          tone.frequency.setValueAtTime(frequency, at);
          tone.frequency.exponentialRampToValueAtTime(frequency * 0.72, at + 0.35);
          tone.connect(output);
          tone.onended = () => { if (++ended === nodes.length) voice.stop(); };
          nodes.push(tone);
        }
        voices.add(voice);
        for (const tone of nodes) { tone.start(at); tone.stop(at + 0.4); }
        return true;
      } catch { fail(); return false; }
    },
    stop,
    disable() {
      enabled = false;
      stop();
      if (context?.state === 'running') Promise.resolve(context.suspend()).catch(fail);
    },
    destroy() {
      enabled = false;
      stop();
      if (context && context.state !== 'closed') Promise.resolve(context.close()).catch(() => {});
      context = null;
    },
  };
}
