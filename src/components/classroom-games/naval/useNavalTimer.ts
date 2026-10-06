'use client';

import { useEffect, useRef, useState } from 'react';

/** Each question/shot gets its own clock; pause preserves its unused time. */
export function useNavalTimer(key: string, seconds: number, running: boolean, onExpire: () => void) {
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
      if (remaining.current === 0 && !expired.current) { expired.current = true; callback.current(); }
    }, 100);
    return () => {
      clearInterval(interval);
      // Preserve the active fraction after the latest 100ms tick instead of gifting time on every pause.
      if (!expired.current) remaining.current = Math.max(0, remaining.current - (performance.now() - previous));
    };
  }, [key, seconds, running]);
  return display;
}
