'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** Short synthesized cues, initialized only by a teacher gesture. No downloads/autoplay. */
export function useNavalAudio() {
  const [enabled, setEnabled] = useState(true);
  const enabledRef = useRef(true);
  const context = useRef<AudioContext | null>(null);
  const nodes = useRef(new Set<OscillatorNode>());
  const last = useRef(-Infinity);
  const stop = useCallback(() => {
    for (const node of nodes.current) { try { node.stop(); } catch { /* Already ended. */ } node.disconnect(); }
    nodes.current.clear();
  }, []);
  const play = useCallback((kind: 'alarm' | 'hit' | 'miss') => {
    if (!enabledRef.current || performance.now() - last.current < 250) return;
    last.current = performance.now();
    try {
      const Constructor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Constructor) return;
      const audio = context.current ?? new Constructor(); context.current = audio;
      void audio.resume().catch(() => undefined);
      stop();
      const oscillator = audio.createOscillator(); const gain = audio.createGain();
      const now = audio.currentTime; const duration = kind === 'alarm' ? .7 : .35;
      oscillator.type = kind === 'hit' ? 'sawtooth' : 'triangle';
      if (kind === 'alarm') {
        for (let index = 0; index < 5; index++) oscillator.frequency.setValueAtTime(index % 2 ? 650 : 390, now + index * .12);
      } else { oscillator.frequency.setValueAtTime(kind === 'hit' ? 130 : 340, now); oscillator.frequency.exponentialRampToValueAtTime(kind === 'hit' ? 35 : 120, now + duration); }
      gain.gain.setValueAtTime(.0001, now); gain.gain.exponentialRampToValueAtTime(.045, now + .02); gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
      oscillator.connect(gain); gain.connect(audio.destination); nodes.current.add(oscillator);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); nodes.current.delete(oscillator); };
      oscillator.start(now); oscillator.stop(now + duration + .03);
    } catch { /* Sound support or OS audio settings never block the game. */ }
  }, [stop]);
  const toggle = useCallback(() => {
    enabledRef.current = !enabledRef.current; setEnabled(enabledRef.current);
    if (!enabledRef.current) stop();
    else play('alarm');
  }, [stop, play]);
  useEffect(() => () => { stop(); if (context.current) void context.current.close().catch(() => undefined); }, [stop]);
  return { enabled, toggle, play, stop };
}
