'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export const FLYING_CAT_MUSIC_URL = '/games/flying-cat/audio/paper-wings-and-sunday-naps.mp3';
const PREFERENCE = 'flying-cat:music';

/** Load only after a gesture; an unavailable soundtrack must never stop the game. */
export function useFlyingCatMusic() {
  const [enabled, setEnabled] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const preference = useRef(true);
  const active = useRef(false);
  const request = useRef(0);

  useEffect(() => {
    try {
      preference.current = window.localStorage.getItem(PREFERENCE) !== 'off';
      setEnabled(preference.current);
    } catch { /* Private browsing/storage restrictions do not affect play. */ }
    return () => {
      active.current = false;
      request.current++;
      audio.current?.pause();
      if (audio.current) {
        audio.current.removeAttribute('src');
        audio.current.load();
        audio.current = null;
      }
    };
  }, []);

  const play = useCallback(() => {
    if (!active.current || !preference.current) return;
    const attempt = ++request.current;
    try {
      if (!audio.current) {
        audio.current = new Audio(FLYING_CAT_MUSIC_URL);
        audio.current.loop = true;
        audio.current.preload = 'none';
        audio.current.volume = 0.35;
      }
      const pending = audio.current.play();
      void Promise.resolve(pending).then(() => {
        if (request.current === attempt) setBlocked(false);
      }).catch(() => {
        if (request.current === attempt && active.current && preference.current) setBlocked(true);
      });
    } catch {
      if (request.current === attempt) setBlocked(true);
    }
  }, []);

  const resume = useCallback(() => {
    active.current = true;
    play(); // Called directly from Start/Continue, while user activation is live.
  }, [play]);
  const pause = useCallback(() => {
    active.current = false;
    request.current++;
    audio.current?.pause();
  }, []);
  const toggle = useCallback(() => {
    // A refused play attempt offers an explicit retry rather than falsely saying it is audible.
    const next = blocked ? true : !preference.current;
    preference.current = next;
    setEnabled(next);
    setBlocked(false);
    try { window.localStorage.setItem(PREFERENCE, next ? 'on' : 'off'); } catch { /* optional */ }
    if (next) play();
    else { request.current++; audio.current?.pause(); }
  }, [blocked, play]);

  return { enabled: enabled && !blocked, resume, pause, toggle };
}
