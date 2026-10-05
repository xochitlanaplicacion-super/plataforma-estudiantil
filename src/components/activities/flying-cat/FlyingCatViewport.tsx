'use client';

import { forwardRef, useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type ViewportRect = { width: number; height: number; left: number; top: number };

type NativeFullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
  webkitRequestFullScreen?: () => Promise<void> | void;
};
type NativeFullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitCurrentFullScreenElement?: Element | null;
  webkitFullscreenEnabled?: boolean;
  webkitExitFullscreen?: () => Promise<void> | void;
  webkitCancelFullScreen?: () => Promise<void> | void;
};

const UNSUPPORTED_MESSAGE = 'Tu navegador no permite pantalla completa para este juego. Puedes ocultar las barras desde su menú, si ofrece esa opción, o utilizar un navegador compatible.';
const REJECTED_MESSAGE = 'El navegador no permitió entrar en pantalla completa. Pulsa el botón de pantalla completa para volver a intentarlo.';

function fullscreenElement(): Element | null {
  const native = document as NativeFullscreenDocument;
  return native.fullscreenElement ?? native.webkitFullscreenElement ?? native.webkitCurrentFullScreenElement ?? null;
}

function fullscreenRequest(element: NativeFullscreenElement) {
  const native = document as NativeFullscreenDocument;
  if (typeof element.requestFullscreen === 'function' && native.fullscreenEnabled !== false) return element.requestFullscreen;
  if (native.webkitFullscreenEnabled === false) return undefined;
  return element.webkitRequestFullscreen ?? element.webkitRequestFullScreen;
}

async function exitOwnedFullscreen(element: HTMLElement | null): Promise<boolean> {
  if (!element || fullscreenElement() !== element) return false;
  const native = document as NativeFullscreenDocument;
  const exit = native.exitFullscreen ?? native.webkitExitFullscreen ?? native.webkitCancelFullScreen;
  if (typeof exit !== 'function') return false;
  try {
    await exit.call(native);
    return true;
  } catch { return false; }
}

/** Request from Begin/Resume/a button, before awaiting any other work. */
export function useFlyingCatFullscreen() {
  const element = useRef<HTMLDivElement | null>(null);
  const owner = useRef<HTMLDivElement | null>(null);
  const alive = useRef(true);
  const pending = useRef<Promise<boolean> | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [supported, setSupported] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const sync = useCallback(() => {
    if (!alive.current) return;
    const ownFullscreen = !!element.current && fullscreenElement() === element.current;
    setIsFullscreen(ownFullscreen);
    setSupported(!!element.current && typeof fullscreenRequest(element.current) === 'function');
    if (ownFullscreen) setMessage(null);
  }, []);
  const viewportRef = useCallback((node: HTMLDivElement | null) => {
    element.current = node;
    if (node) { owner.current = node; sync(); }
  }, [sync]);

  useEffect(() => {
    alive.current = true;
    const error = () => { if (alive.current) { sync(); setMessage(REJECTED_MESSAGE); } };
    sync();
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
    document.addEventListener('fullscreenerror', error);
    document.addEventListener('webkitfullscreenerror', error);
    return () => {
      alive.current = false;
      document.removeEventListener('fullscreenchange', sync);
      document.removeEventListener('webkitfullscreenchange', sync);
      document.removeEventListener('fullscreenerror', error);
      document.removeEventListener('webkitfullscreenerror', error);
      // Never dismiss fullscreen that belongs to a different player or tab UI.
      void exitOwnedFullscreen(owner.current);
    };
  }, [sync]);

  const requestFullscreen = useCallback((): Promise<boolean> => {
    if (pending.current) return pending.current;
    const target = element.current;
    if (!target) return Promise.resolve(false);
    if (fullscreenElement() === target) { sync(); return Promise.resolve(true); }
    const request = fullscreenRequest(target);
    if (typeof request !== 'function') {
      if (alive.current) { setSupported(false); setMessage(UNSUPPORTED_MESSAGE); }
      return Promise.resolve(false);
    }
    if (alive.current) { setRequesting(true); setMessage(null); }
    // Calling the native API must remain synchronous with the pointer/key
    // gesture. Awaiting music, an animation or a save first loses activation.
    let result: Promise<void> | void;
    try {
      result = request === target.requestFullscreen
        ? target.requestFullscreen({ navigationUI: 'hide' }) : request.call(target);
    } catch {
      if (alive.current) { sync(); setMessage(REJECTED_MESSAGE); setRequesting(false); }
      return Promise.resolve(false);
    }
    const operation = (async () => {
      try {
        await result;
        if (!alive.current) { await exitOwnedFullscreen(target); return false; }
        sync();
        // Older iPad/WebKit methods return void and publish state by event.
        return fullscreenElement() === target || result === undefined;
      } catch {
        if (alive.current) { sync(); setMessage(REJECTED_MESSAGE); }
        return false;
      } finally {
        pending.current = null;
        if (alive.current) setRequesting(false);
      }
    })();
    pending.current = operation;
    return operation;
  }, [sync]);
  const exitFullscreen = useCallback(() => exitOwnedFullscreen(owner.current), []);
  const clearMessage = useCallback(() => setMessage(null), []);
  return { viewportRef, requestFullscreen, exitFullscreen, isFullscreen, supported, requesting, message, clearMessage };
}

function measureViewport(root: HTMLElement | null): ViewportRect {
  const visible = window.visualViewport;
  const dimension = (value: number | undefined, fallback: number) =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : Math.max(1, fallback);
  const offset = (value: number | undefined) =>
    typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
  // Browser chrome disappears in native fullscreen; ignore stale pre-entry
  // VisualViewport offsets while the native resize event catches up.
  if (root && fullscreenElement() === root) return {
    width: dimension(window.innerWidth, 1), height: dimension(window.innerHeight, 1), left: 0, top: 0,
  };
  return {
    width: dimension(visible?.width, window.innerWidth),
    height: dimension(visible?.height, window.innerHeight),
    left: offset(visible?.offsetLeft),
    top: offset(visible?.offsetTop),
  };
}

/** Escape dashboard clipping and fit the actual visible area, including iPad browser chrome. */
export const FlyingCatViewport = forwardRef<HTMLDivElement, { children: ReactNode }>(function FlyingCatViewport({ children }, forwardedRef) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [viewport, setViewport] = useState<ViewportRect | null>(null);
  const root = useRef<HTMLDivElement | null>(null);
  const assignRoot = useCallback((node: HTMLDivElement | null) => {
    root.current = node;
    if (typeof forwardedRef === 'function') forwardedRef(node);
    else if (forwardedRef) forwardedRef.current = node;
  }, [forwardedRef]);

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
      const next = measureViewport(root.current);
      setViewport((previous) => previous && previous.width === next.width && previous.height === next.height
        && previous.left === next.left && previous.top === next.top ? previous : next);
    };
    const visible = window.visualViewport;
    setHost(body);
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    document.addEventListener('fullscreenchange', update);
    document.addEventListener('webkitfullscreenchange', update);
    visible?.addEventListener('resize', update);
    visible?.addEventListener('scroll', update);

    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      document.removeEventListener('fullscreenchange', update);
      document.removeEventListener('webkitfullscreenchange', update);
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
  return createPortal(<div ref={assignRoot} className="fc-viewport" data-testid="flying-cat-viewport" style={style}>{children}</div>, host);
});
