// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { createRef } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FlyingCatParallax, type FlyingCatParallaxHandle } from '@/components/activities/flying-cat/FlyingCatParallax';

const speeds = [6, 14, 27, 43, 62];
let width: number;
let observers: SceneResizeObserver[];
let preference: MotionPreference;

class MotionPreference extends EventTarget {
  matches = false;
  media = '(prefers-reduced-motion: reduce)';
}

class SceneResizeObserver {
  observe = vi.fn();
  disconnect = vi.fn();
  constructor(private callback: ResizeObserverCallback) { observers.push(this); }
  resize() { this.callback([], this as unknown as ResizeObserver); }
}

function translations(container: HTMLElement) {
  return [...container.querySelectorAll<HTMLElement>('.fc-parallax-track')].map((track) => {
    const match = /^translate3d\((-?[\d.]+)px, 0, 0\)$/.exec(track.style.transform);
    expect(match).not.toBeNull();
    return Number(match![1]);
  });
}

function expectedTranslations(seconds: number, tileWidth = width) {
  return speeds.map((speed) => Number((-(seconds * speed % tileWidth)).toFixed(3)));
}

function setReducedMotion(matches: boolean) {
  act(() => { preference.matches = matches; preference.dispatchEvent(new Event('change')); });
}

beforeEach(() => {
  width = 1200;
  observers = [];
  preference = new MotionPreference();
  vi.stubGlobal('ResizeObserver', SceneResizeObserver);
  vi.stubGlobal('matchMedia', vi.fn(() => preference));
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({
    x: 0, y: 0, left: 0, top: 0, right: width, bottom: 600, width, height: 600, toJSON: () => ({}),
  }));
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('Flying Cat lightweight layered parallax', () => {
  it('renders five decorative depth layers with two identical SVG tiles each', () => {
    const { container } = render(<FlyingCatParallax />);
    const scene = container.querySelector('.fc-sky-hills.fc-parallax')!;
    expect(scene).toHaveAttribute('aria-hidden', 'true');
    const layers = [...scene.querySelectorAll('.fc-parallax-layer')];
    expect(layers.map((layer) => layer.getAttribute('data-layer'))).toEqual(['clouds', 'mountains', 'hills', 'fields', 'trees']);
    expect(layers.map((layer) => Number(layer.getAttribute('data-speed')))).toEqual(speeds);
    expect(scene.querySelectorAll('svg.fc-parallax-tile')).toHaveLength(10);
    layers.forEach((layer) => {
      const tiles = layer.querySelectorAll('svg');
      expect(tiles).toHaveLength(2);
      expect(tiles[0].outerHTML).toBe(tiles[1].outerHTML);
      expect(tiles[0]).toHaveAttribute('preserveAspectRatio', 'none');
    });
    expect(scene.querySelectorAll('filter, image, canvas, animate, animateTransform')).toHaveLength(0);
    expect(observers[0].observe).toHaveBeenCalledExactlyOnceWith(scene);
  });

  it('uses distinct exact velocities from the shared absolute clock, without a private RAF', () => {
    const requestFrame = vi.fn();
    vi.stubGlobal('requestAnimationFrame', requestFrame);
    const ref = createRef<FlyingCatParallaxHandle>();
    const { container } = render(<FlyingCatParallax ref={ref} />);
    act(() => ref.current!.advance(2));
    expect(translations(container)).toEqual([-12, -28, -54, -86, -124]);
    act(() => ref.current!.advance(4));
    expect(translations(container)).toEqual(expectedTranslations(4));
    expect(requestFrame).not.toHaveBeenCalled();
  });

  it('wraps at the measured tile width and never grows the DOM after a long flight', () => {
    width = 500;
    const ref = createRef<FlyingCatParallaxHandle>();
    const { container } = render(<FlyingCatParallax ref={ref} />);
    const initialTiles = [...container.querySelectorAll('svg')];
    act(() => ref.current!.advance(100));
    expect(translations(container)).toEqual([-100, -400, -200, -300, -200]);
    act(() => { for (let second = 1000; second <= 1_000_000_000; second *= 10) ref.current!.advance(second); });
    expect(translations(container)).toEqual(expectedTranslations(1_000_000_000));
    translations(container).forEach((offset) => { expect(offset).toBeGreaterThan(-width); expect(offset).toBeLessThanOrEqual(0); });
    expect([...container.querySelectorAll('svg')]).toEqual(initialTiles);
    expect(container.querySelectorAll('.fc-parallax-layer')).toHaveLength(5);
    expect(container.querySelectorAll('.fc-parallax-track')).toHaveLength(5);
  });

  it('rejects invalid clocks and leaves paused or explanation clocks completely still', () => {
    const ref = createRef<FlyingCatParallaxHandle>();
    const { container } = render(<FlyingCatParallax ref={ref} />);
    act(() => ref.current!.advance(5));
    const before = translations(container);
    act(() => { for (const clock of [-1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 5, 5]) ref.current!.advance(clock); });
    expect(translations(container)).toEqual(before);
    act(() => ref.current!.advance(6));
    expect(translations(container)).toEqual(expectedTranslations(6));
  });

  it('resizes around the same absolute clock and resumes at the appropriate new tile boundary', () => {
    const ref = createRef<FlyingCatParallaxHandle>();
    const { container } = render(<FlyingCatParallax ref={ref} />);
    act(() => ref.current!.advance(41));
    expect(translations(container)).toEqual(expectedTranslations(41, 1200));
    width = 600;
    act(() => observers[0].resize());
    expect(translations(container)).toEqual(expectedTranslations(41, 600));
    width = 1200;
    fireEvent.resize(window);
    expect(translations(container)).toEqual(expectedTranslations(41, 1200));
    act(() => ref.current!.advance(42));
    expect(translations(container)).toEqual(expectedTranslations(42, 1200));
  });

  it('restores the saved landscape phase after an orientation remount', () => {
    const firstRef = createRef<FlyingCatParallaxHandle>();
    const first = render(<FlyingCatParallax ref={firstRef} />);
    act(() => firstRef.current!.advance(53.25));
    const before = translations(first.container);
    first.unmount();
    expect(firstRef.current).toBeNull();
    const nextRef = createRef<FlyingCatParallaxHandle>();
    const next = render(<FlyingCatParallax ref={nextRef} />);
    act(() => nextRef.current!.advance(53.25));
    expect(translations(next.container)).toEqual(before);
  });

  it('freezes reduced motion at its current phase and reactivates without jumping ahead', () => {
    const ref = createRef<FlyingCatParallaxHandle>();
    const { container } = render(<FlyingCatParallax ref={ref} />);
    act(() => ref.current!.advance(1));
    const before = translations(container);
    setReducedMotion(true);
    act(() => { ref.current!.advance(2); ref.current!.advance(10); });
    expect(translations(container)).toEqual(before);
    setReducedMotion(false);
    act(() => ref.current!.advance(10));
    expect(translations(container)).toEqual(before);
    act(() => ref.current!.advance(10.5));
    expect(translations(container)).toEqual(expectedTranslations(1.5));
  });

  it('can restore a static saved clock even when reduced motion is already enabled', () => {
    preference.matches = true;
    const ref = createRef<FlyingCatParallaxHandle>();
    const { container } = render(<FlyingCatParallax ref={ref} />);
    act(() => ref.current!.advance(12));
    const restored = expectedTranslations(12);
    expect(translations(container)).toEqual(restored);
    act(() => ref.current!.advance(21));
    expect(translations(container)).toEqual(restored);
    setReducedMotion(false);
    act(() => ref.current!.advance(21));
    expect(translations(container)).toEqual(restored);
  });

  it('disconnects measurement and media listeners when the scene unmounts', () => {
    const addWindow = vi.spyOn(window, 'addEventListener');
    const removeWindow = vi.spyOn(window, 'removeEventListener');
    const addMedia = vi.spyOn(preference, 'addEventListener');
    const removeMedia = vi.spyOn(preference, 'removeEventListener');
    const rect = vi.mocked(HTMLElement.prototype.getBoundingClientRect);
    const { unmount } = render(<FlyingCatParallax />);
    const resizeHandler = addWindow.mock.calls.find(([type]) => type === 'resize')![1];
    const mediaHandler = addMedia.mock.calls.find(([type]) => type === 'change')![1];
    unmount();
    expect(observers[0].disconnect).toHaveBeenCalledOnce();
    expect(removeWindow).toHaveBeenCalledWith('resize', resizeHandler);
    expect(removeMedia).toHaveBeenCalledWith('change', mediaHandler);
    const measurements = rect.mock.calls.length;
    fireEvent.resize(window);
    expect(rect).toHaveBeenCalledTimes(measurements);
  });

  it('supports older iPad media listeners and cleans up the exact legacy callback', () => {
    const legacy = { matches: false, addListener: vi.fn(), removeListener: vi.fn() };
    vi.stubGlobal('matchMedia', vi.fn(() => legacy));
    const ref = createRef<FlyingCatParallaxHandle>();
    const { container, unmount } = render(<FlyingCatParallax ref={ref} />);
    const listener = legacy.addListener.mock.calls[0][0] as () => void;
    act(() => ref.current!.advance(1));
    const before = translations(container);
    act(() => { legacy.matches = true; listener(); ref.current!.advance(5); });
    expect(translations(container)).toEqual(before);
    unmount();
    expect(legacy.removeListener).toHaveBeenCalledExactlyOnceWith(listener);
  });

  it('works with window resizing when browser measurement or preference APIs are missing', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    vi.stubGlobal('matchMedia', undefined);
    const ref = createRef<FlyingCatParallaxHandle>();
    const { container } = render(<FlyingCatParallax ref={ref} />);
    act(() => ref.current!.advance(3));
    expect(translations(container)).toEqual(expectedTranslations(3));
    width = 400;
    fireEvent.resize(window);
    expect(translations(container)).toEqual(expectedTranslations(3));
  });

  it('renders safely on the server without measuring, reading preferences, or starting motion', () => {
    const ref = createRef<FlyingCatParallaxHandle>();
    const markup = renderToString(<FlyingCatParallax ref={ref} />);
    expect(markup).toContain('aria-hidden="true"');
    expect(markup.match(/class="fc-parallax-tile"/g)).toHaveLength(10);
    expect(markup).not.toContain('style="transform:');
    expect(window.matchMedia).not.toHaveBeenCalled();
    expect(HTMLElement.prototype.getBoundingClientRect).not.toHaveBeenCalled();
    expect(observers).toHaveLength(0);
    expect(ref.current).toBeNull();
  });
});
