'use client';

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type ViewportRect = { width: number; height: number; left: number; top: number };

function measureViewport(): ViewportRect {
  const visible = window.visualViewport;
  const dimension = (value: number | undefined, fallback: number) =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : Math.max(1, fallback);
  const offset = (value: number | undefined) =>
    typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
  return {
    width: dimension(visible?.width, window.innerWidth),
    height: dimension(visible?.height, window.innerHeight),
    left: offset(visible?.offsetLeft),
    top: offset(visible?.offsetTop),
  };
}

/** Escape dashboard clipping and fit the actual visible area, including iPad browser chrome. */
export function FlyingCatViewport({ children }: { children: ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [viewport, setViewport] = useState<ViewportRect | null>(null);

  useEffect(() => {
    const body = document.body;
    if (!body) return;
    const lockedStyles = [
      { property: 'overflow', installed: 'hidden' },
      { property: 'overscroll-behavior', installed: 'none' },
    ].map(({ property, installed }) => ({
      property, installed,
      previous: body.style.getPropertyValue(property),
      priority: body.style.getPropertyPriority(property),
    }));
    lockedStyles.forEach(({ property, installed }) => body.style.setProperty(property, installed));

    const update = () => {
      const next = measureViewport();
      setViewport((previous) => previous && previous.width === next.width && previous.height === next.height
        && previous.left === next.left && previous.top === next.top ? previous : next);
    };
    const visible = window.visualViewport;
    setHost(body);
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    visible?.addEventListener('resize', update);
    visible?.addEventListener('scroll', update);

    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      visible?.removeEventListener('resize', update);
      visible?.removeEventListener('scroll', update);
      lockedStyles.forEach(({ property, installed, previous, priority }) => {
        // The student player or an enclosing dialog may restore its own lock
        // first. Do not overwrite a style another owner changed during cleanup.
        if (body.style.getPropertyValue(property) !== installed || body.style.getPropertyPriority(property)) return;
        if (previous) body.style.setProperty(property, previous, priority);
        else body.style.removeProperty(property);
      });
    };
  }, []);

  // No document/window access during SSR or the initial hydration render.
  if (!host || !viewport) return null;
  const style: CSSProperties = {
    position: 'fixed', zIndex: 1000, isolation: 'isolate', pointerEvents: 'auto',
    left: viewport.left, top: viewport.top, width: viewport.width, height: viewport.height,
    minWidth: 0, minHeight: 0, overflow: 'hidden', overscrollBehavior: 'none',
    boxSizing: 'border-box', background: '#f4ecdd',
  };
  return createPortal(<div className="fc-viewport" data-testid="flying-cat-viewport" style={style}>{children}</div>, host);
}
