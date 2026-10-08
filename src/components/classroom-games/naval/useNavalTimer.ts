'use client';

import { useEffect, useRef, useState } from 'react';

/** Each question/shot gets its own clock; return false to reject a queued expiration. */
export function useNavalTimer(key: string, seconds: number, running: boolean, onExpire: () => unknown) {
  const remaining = useRef(seconds * 1000);
  const lastKey = useRef(key);
  const expired = useRef(false);
  const callback = useRef(onExpire); callback.current = onExpire;
  const [display, setDisplay] = useState(seconds);
  useEffect(() => {
    if (lastKey.current !== key) {
      lastKey.current = key; remaining.current = seconds * 1000; expired.current = false; setDisplay(seconds);
    }
    if (!running || expired.current) { setDisplay(Math.ceil(remaining.current / 1000)); return; }
    let previous = performance.now();
    const interval = setInterval(() => {
      const now = performance.now();
      remaining.current = Math.max(0, remaining.current - (now - previous)); previous = now;
      setDisplay(Math.ceil(remaining.current / 1000));
      if (remaining.current === 0 && !expired.current) {
        // A cinematic can block a tick before its paused state commits. Leave
        // that expiration pending so the same phase can expire after resuming.
        expired.current = callback.current() !== false;
      }
    }, 100);
    return () => {
      clearInterval(interval);
      // Preserve the active fraction after the latest 100ms tick instead of gifting time on every pause.
      if (!expired.current) remaining.current = Math.max(0, remaining.current - (performance.now() - previous));
    };
  }, [key, seconds, running]);
  return display;
}
