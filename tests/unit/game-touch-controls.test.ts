// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installTouchControls } from '../../games/shared/touch-controls';

afterEach(() => { document.body.replaceChildren(); localStorage.clear(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function mount(initiallyPaused = true) {
  Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: 5 });
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  const host = document.createElement('div'), canvas = document.createElement('canvas');
  host.append(canvas); document.body.append(host);
  let paused = initiallyPaused;
  const key = vi.fn();
  const dispose = installTouchControls({ id: 'test', canvas, playing: () => !paused, paused: () => paused,
    pause: () => { paused = true; }, key, look: vi.fn(), actions: [{ code: 'Space', label: 'Saltar' }] });
  return { host, canvas, dispose, key, setPaused: (value: boolean) => { paused = value; } };
}

describe('touch preferences and lifecycle', () => {
  it('requires a fresh touch after a question closes and releases outside the control', () => {
    vi.useFakeTimers();
    const { host, key, dispose, setPaused } = mount(false);
    const button = host.querySelector('[aria-label="Saltar"]') as HTMLButtonElement;
    button.setPointerCapture = vi.fn();
    const event = (type: string, pointerId = 4) => Object.assign(new Event(type, { cancelable: true }), { pointerId, clientX: 100, clientY: 100 });
    button.dispatchEvent(event('pointerdown'));
    setPaused(true);
    vi.advanceTimersByTime(100);
    expect(key).toHaveBeenLastCalledWith('Space', false);
    setPaused(false);
    key.mockClear();
    button.dispatchEvent(event('pointermove'));
    expect(key).not.toHaveBeenCalled();
    button.dispatchEvent(event('pointerdown', 5));
    expect(key).toHaveBeenLastCalledWith('Space', true);
    window.dispatchEvent(event('pointerup', 5));
    expect(key).toHaveBeenLastCalledWith('Space', false);
    dispose();
  });
  it('releases a held action after pointer cancellation or device blur', () => {
    const { host, key, dispose } = mount(false);
    const button = host.querySelector('[aria-label="Saltar"]') as HTMLButtonElement;
    button.setPointerCapture = vi.fn();
    const event = (type: string) => Object.assign(new Event(type, { cancelable: true }), { pointerId: 4, clientX: 100, clientY: 100 });
    button.dispatchEvent(event('pointerdown'));
    expect(key).toHaveBeenLastCalledWith('Space', true);
    button.dispatchEvent(event('pointercancel'));
    expect(key).toHaveBeenLastCalledWith('Space', false);
    button.dispatchEvent(event('pointerdown'));
    window.dispatchEvent(new Event('blur'));
    expect(key).toHaveBeenLastCalledWith('Space', false);
    dispose();
  });
  it('does not trigger gameplay while repositioning controls', () => {
    const { host, key, dispose } = mount();
    const button = host.querySelector('[aria-label="Saltar"]') as HTMLButtonElement;
    button.setPointerCapture = vi.fn();
    // Editing is deliberately separate from gameplay: a drag must not press jump.
    window.dispatchEvent(new Event('touch-settings:test'));
    const edit = [...host.querySelectorAll('button')].find(b => b.textContent === 'Mover botones')!;
    edit.click();
    const event = (type: string) => Object.assign(new Event(type, { cancelable: true }), { pointerId: 4, clientX: 100, clientY: 100 });
    button.dispatchEvent(event('pointerdown'));
    button.dispatchEvent(event('pointercancel'));
    window.dispatchEvent(new Event('blur'));
    expect(key).not.toHaveBeenCalled();
    dispose();
  });
  it('offers a visible pause control while playing', () => {
    const { host, dispose } = mount(false);
    const pause = host.querySelector('[aria-label="Pausar juego"]') as HTMLButtonElement;
    expect(pause).toBeTruthy();
    expect(pause.hidden).toBe(false);
    pause.click();
    dispose();
  });
  it('saves preferences and restores them after reopening the game', () => {
    const first = mount();
    const slider = first.host.querySelector('input')!;
    slider.value = '0.8'; slider.dispatchEvent(new Event('input'));
    first.dispose();
    const second = mount();
    expect(second.host.querySelector('input')!.value).toBe('0.8');
    second.dispose();
  });
  it('recovers from corrupt local preferences and fully removes the overlay', () => {
    localStorage.setItem('game-touch-v1:test', '{broken');
    const { host, canvas, dispose } = mount();
    expect(host.querySelectorAll('button').length).toBeGreaterThan(2);
    dispose();
    expect(host.children.length).toBe(1);
    expect(host.firstElementChild).toBe(canvas);
  });
  it('keeps sliders bounded when stored preferences are tampered with', () => {
    localStorage.setItem('game-touch-v1:test', JSON.stringify({ opacity: 20, size: 900 }));
    const { host, dispose } = mount();
    const sliders = host.querySelectorAll('input');
    expect(sliders[0].value).toBe('0.9');
    expect(sliders[1].value).toBe('100');
    dispose();
  });
  it('does not insert touch controls on a desktop without touch', () => {
    Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: 0 });
    const canvas = document.createElement('canvas');
    expect(() => installTouchControls({ id: 'desktop', canvas, playing: () => true, paused: () => false,
      pause: vi.fn(), key: vi.fn(), look: vi.fn(), actions: [] })()).not.toThrow();
  });
});
