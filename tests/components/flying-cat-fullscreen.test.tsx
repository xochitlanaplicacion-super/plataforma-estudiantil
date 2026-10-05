// @vitest-environment jsdom
import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FlyingCatViewport, useFlyingCatFullscreen } from '@/components/activities/flying-cat/FlyingCatViewport';

let nativeElement: Element | null;
let webkitElement: Element | null;
const installed: { target: object; key: string; descriptor?: PropertyDescriptor }[] = [];
function install(target: object, key: string, descriptor: PropertyDescriptor) {
  installed.push({ target, key, descriptor: Object.getOwnPropertyDescriptor(target, key) });
  Object.defineProperty(target, key, { configurable: true, ...descriptor });
}
function installRequest(request: unknown) {
  install(HTMLElement.prototype, 'requestFullscreen', { value: request, writable: true });
}
function changeFullscreen(next: Element | null) {
  nativeElement = next;
  document.dispatchEvent(new Event('fullscreenchange'));
}
function Harness({ afterRequest }: { afterRequest?: () => void }) {
  const fullscreen = useFlyingCatFullscreen();
  const [outcome, setOutcome] = useState<string>('idle');
  return <FlyingCatViewport ref={fullscreen.viewportRef}>
    <div>Game remains available</div>
    <button onClick={() => { const operation = fullscreen.requestFullscreen(); afterRequest?.(); void operation.then((ok) => setOutcome(ok ? 'accepted' : 'declined')); }}>Fullscreen</button>
    <button onClick={() => { void fullscreen.exitFullscreen(); }}>Exit</button>
    <button onClick={fullscreen.clearMessage}>Dismiss</button>
    <span data-testid="active">{String(fullscreen.isFullscreen)}</span>
    <span data-testid="supported">{String(fullscreen.supported)}</span>
    <span data-testid="requesting">{String(fullscreen.requesting)}</span>
    <span data-testid="outcome">{outcome}</span>
    {fullscreen.message && <p role="status">{fullscreen.message}</p>}
  </FlyingCatViewport>;
}
beforeEach(() => {
  nativeElement = null; webkitElement = null;
  install(document, 'fullscreenElement', { get: () => nativeElement });
  install(document, 'webkitFullscreenElement', { get: () => webkitElement });
  install(document, 'fullscreenEnabled', { value: true, writable: true });
  installRequest(undefined);
  install(HTMLElement.prototype, 'webkitRequestFullscreen', { value: undefined, writable: true });
  install(HTMLElement.prototype, 'webkitRequestFullScreen', { value: undefined, writable: true });
  install(document, 'exitFullscreen', { value: vi.fn(() => { changeFullscreen(null); return Promise.resolve(); }), writable: true });
  const visible = Object.assign(new EventTarget(), { width: 1024, height: 680, offsetLeft: 0, offsetTop: 36 });
  vi.stubGlobal('visualViewport', visible);
  vi.stubGlobal('innerWidth', 1024); vi.stubGlobal('innerHeight', 768);
});
afterEach(() => {
  cleanup();
  installed.reverse().forEach(({ target, key, descriptor }) => {
    if (descriptor) Object.defineProperty(target, key, descriptor);
    else Reflect.deleteProperty(target, key);
  });
  installed.length = 0;
  vi.unstubAllGlobals(); vi.restoreAllMocks(); document.body.removeAttribute('style');
});

describe('Flying Cat native fullscreen', () => {
  it('requests the portal itself synchronously from the gesture, hiding navigation UI', async () => {
    const order: string[] = [];
    const request = vi.fn(function (this: HTMLElement) {
      order.push('native request'); changeFullscreen(this); return Promise.resolve();
    });
    installRequest(request);
    render(<Harness afterRequest={() => order.push('remaining gesture work')} />);
    expect(screen.getByTestId('supported')).toHaveTextContent('true');
    await act(async () => { fireEvent.click(screen.getByText('Fullscreen')); });
    const viewport = screen.getByTestId('flying-cat-viewport');
    expect(order).toEqual(['native request', 'remaining gesture work']);
    expect(request).toHaveBeenCalledExactlyOnceWith({ navigationUI: 'hide' });
    expect(nativeElement).toBe(viewport);
    expect(screen.getByTestId('active')).toHaveTextContent('true');
    expect(viewport).toHaveStyle({ width: '1024px', height: '768px', left: '0px', top: '0px' });
    expect(viewport.parentElement).toBe(document.body);
  });

  it('restores the visible viewport and state when Escape or browser back exits fullscreen', async () => {
    installRequest(function (this: HTMLElement) { changeFullscreen(this); return Promise.resolve(); });
    render(<Harness />);
    await act(async () => { fireEvent.click(screen.getByText('Fullscreen')); });
    act(() => { changeFullscreen(null); });
    expect(screen.getByTestId('active')).toHaveTextContent('false');
    expect(screen.getByTestId('flying-cat-viewport')).toHaveStyle({ height: '680px', top: '36px' });
    expect(screen.getByText('Game remains available')).toBeInTheDocument();
  });

  it('uses a real prefixed iPad/WebKit element API and prefixed events', async () => {
    const request = vi.fn(function (this: HTMLElement) {
      webkitElement = this; document.dispatchEvent(new Event('webkitfullscreenchange'));
    });
    install(HTMLElement.prototype, 'webkitRequestFullscreen', { value: request, writable: true });
    const exit = vi.fn(() => { webkitElement = null; document.dispatchEvent(new Event('webkitfullscreenchange')); });
    install(document, 'exitFullscreen', { value: undefined, writable: true });
    install(document, 'webkitExitFullscreen', { value: exit, writable: true });
    render(<Harness />);
    await act(async () => { fireEvent.click(screen.getByText('Fullscreen')); });
    expect(request).toHaveBeenCalledExactlyOnceWith();
    expect(webkitElement).toBe(screen.getByTestId('flying-cat-viewport'));
    expect(screen.getByTestId('active')).toHaveTextContent('true');
    expect(screen.getByTestId('flying-cat-viewport')).toHaveStyle({ height: '768px', top: '0px' });
    await act(async () => { fireEvent.click(screen.getByText('Exit')); });
    expect(exit).toHaveBeenCalledOnce();
    expect(screen.getByTestId('active')).toHaveTextContent('false');
  });

  it('keeps unsupported iPhone-style browsers playable and gives an honest fallback', async () => {
    render(<Harness />);
    expect(screen.getByTestId('supported')).toHaveTextContent('false');
    await act(async () => { fireEvent.click(screen.getByText('Fullscreen')); });
    expect(screen.getByRole('status')).toHaveTextContent('Tu navegador no permite pantalla completa');
    expect(screen.getByRole('status')).toHaveTextContent('navegador compatible');
    expect(screen.getByTestId('active')).toHaveTextContent('false');
    expect(screen.getByText('Game remains available')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Dismiss'));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('does not call a disabled native API blocked by the browser permissions policy', async () => {
    const request = vi.fn(); installRequest(request);
    install(document, 'fullscreenEnabled', { value: false, writable: true });
    render(<Harness />);
    await act(async () => { fireEvent.click(screen.getByText('Fullscreen')); });
    expect(request).not.toHaveBeenCalled();
    expect(screen.getByTestId('supported')).toHaveTextContent('false');
    expect(screen.getByTestId('outcome')).toHaveTextContent('declined');
  });

  it('catches rejected permission and allows a fresh gesture to retry', async () => {
    const request = vi.fn(function (this: HTMLElement) { changeFullscreen(this); return Promise.resolve(); });
    request.mockImplementationOnce(() => Promise.reject(new TypeError('No transient activation')));
    installRequest(request);
    render(<Harness />);
    await act(async () => { fireEvent.click(screen.getByText('Fullscreen')); });
    expect(screen.getByRole('status')).toHaveTextContent('no permitió');
    expect(screen.getByTestId('requesting')).toHaveTextContent('false');
    await act(async () => { fireEvent.click(screen.getByText('Fullscreen')); });
    expect(request).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('active')).toHaveTextContent('true');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('also recovers from a synchronous native throw without leaving a stuck pending request', async () => {
    const request = vi.fn(function (this: HTMLElement) { changeFullscreen(this); return Promise.resolve(); });
    request.mockImplementationOnce(() => { throw new Error('Denied synchronously'); });
    installRequest(request);
    render(<Harness />);
    await act(async () => { fireEvent.click(screen.getByText('Fullscreen')); });
    expect(screen.getByTestId('requesting')).toHaveTextContent('false');
    await act(async () => { fireEvent.click(screen.getByText('Fullscreen')); });
    expect(request).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('active')).toHaveTextContent('true');
  });

  it('deduplicates rapid gestures while a native fullscreen request is pending', async () => {
    let resolve!: () => void;
    const request = vi.fn(() => new Promise<void>((done) => { resolve = done; }));
    installRequest(request);
    render(<Harness />);
    fireEvent.click(screen.getByText('Fullscreen')); fireEvent.click(screen.getByText('Fullscreen'));
    expect(request).toHaveBeenCalledOnce();
    expect(screen.getByTestId('requesting')).toHaveTextContent('true');
    await act(async () => { changeFullscreen(screen.getByTestId('flying-cat-viewport')); resolve(); });
    expect(screen.getByTestId('requesting')).toHaveTextContent('false');
    expect(screen.getByTestId('active')).toHaveTextContent('true');
  });

  it('exits its own fullscreen and removes listeners when the game closes', async () => {
    installRequest(function (this: HTMLElement) { changeFullscreen(this); return Promise.resolve(); });
    const remove = vi.spyOn(document, 'removeEventListener');
    const { unmount } = render(<Harness />);
    await act(async () => { fireEvent.click(screen.getByText('Fullscreen')); });
    unmount();
    expect(document.exitFullscreen).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledWith('fullscreenchange', expect.any(Function));
    expect(remove).toHaveBeenCalledWith('webkitfullscreenchange', expect.any(Function));
    expect(remove).toHaveBeenCalledWith('fullscreenerror', expect.any(Function));
    expect(nativeElement).toBeNull();
  });

  it('never closes fullscreen owned by another element, including during cleanup', async () => {
    installRequest(function (this: HTMLElement) { changeFullscreen(this); return Promise.resolve(); });
    const { unmount } = render(<Harness />);
    act(() => { changeFullscreen(document.documentElement); });
    await act(async () => { fireEvent.click(screen.getByText('Exit')); });
    expect(document.exitFullscreen).not.toHaveBeenCalled();
    unmount();
    expect(document.exitFullscreen).not.toHaveBeenCalled();
    expect(nativeElement).toBe(document.documentElement);
  });

  it('releases only its own fullscreen if a pending request finishes after closing', async () => {
    let resolve!: () => void;
    let target!: HTMLElement;
    installRequest(function (this: HTMLElement) { target = this; return new Promise<void>((done) => { resolve = done; }); });
    const { unmount } = render(<Harness />);
    fireEvent.click(screen.getByText('Fullscreen'));
    unmount();
    await act(async () => { changeFullscreen(target); resolve(); });
    expect(document.exitFullscreen).toHaveBeenCalledOnce();
    expect(nativeElement).toBeNull();
  });

  it('does not read native browser state during server rendering', () => {
    expect(renderToString(<Harness />)).toBe('');
  });
});
