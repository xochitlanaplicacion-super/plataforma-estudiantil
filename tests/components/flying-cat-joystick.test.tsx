// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_FLYING_CAT_CONTROLS, FLYING_CAT_CONTROL_STORAGE_KEY, FlyingCatControlSettings,
  FlyingCatJoystick, normalizeFlyingCatControlPreferences, useFlyingCatControlPreferences,
} from '@/components/activities/flying-cat/FlyingCatJoystick';

let sceneHeight = 300;
const observers: { callback: ResizeObserverCallback; disconnect: ReturnType<typeof vi.fn> }[] = [];
const box = (left: number, top: number, width: number, height: number) => ({
  x: left, y: top, left, top, width, height, right: left + width, bottom: top + height, toJSON() {},
}) as DOMRect;

beforeEach(() => {
  localStorage.clear(); sceneHeight = 300; observers.length = 0;
  vi.stubGlobal('PointerEvent', class extends MouseEvent {
    pointerId: number; pointerType: string;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init); this.pointerId = init.pointerId ?? 1; this.pointerType = init.pointerType ?? 'touch';
    }
  });
  vi.stubGlobal('ResizeObserver', class {
    disconnect = vi.fn(); observe = vi.fn(); unobserve = vi.fn();
    constructor(callback: ResizeObserverCallback) { observers.push({ callback, disconnect: this.disconnect }); }
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function(this: HTMLElement) {
    return this.classList.contains('fc-joystick-pad') ? box(20, 30, 100, 100) : box(0, 0, 800, sceneHeight);
  });
  Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', { configurable: true, value: vi.fn() });
  Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', { configurable: true, value: vi.fn() });
});
afterEach(() => {
  cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear();
  Reflect.deleteProperty(HTMLElement.prototype, 'setPointerCapture');
  Reflect.deleteProperty(HTMLElement.prototype, 'releasePointerCapture');
});

const mount = (preferences = { ...DEFAULT_FLYING_CAT_CONTROLS }) => {
  const onMove = vi.fn(); const onRelease = vi.fn();
  const rendered = render(<div className="fc-stage"><FlyingCatJoystick preferences={preferences} onMove={onMove} onRelease={onRelease} /></div>);
  return { ...rendered, onMove, onRelease, pad: screen.getByRole('button', { name: 'Palanca táctil de vuelo' }) };
};
const press = (pad: HTMLElement, pointerId = 1) => fireEvent.pointerDown(pad, { pointerId, clientX: 70, clientY: 80 });

describe('Flying Cat circular touch joystick', () => {
  it('only moves after a touch begins on its own pad and ignores mouse or ordinary scenery dragging', () => {
    const { pad, container, onMove } = mount();
    const scene = container.querySelector('.fc-stage')!;
    fireEvent.pointerDown(scene, { pointerId: 1, clientX: 200, clientY: 200 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 400, clientY: 400 });
    fireEvent.pointerDown(pad, { pointerType: 'mouse', pointerId: 2, clientX: 70, clientY: 80 });
    fireEvent.pointerMove(window, { pointerType: 'mouse', pointerId: 2, clientX: 100, clientY: 80 });
    fireEvent.keyDown(pad, { key: 'ArrowUp' });
    expect(onMove).not.toHaveBeenCalled();
    press(pad);
    expect(onMove).toHaveBeenLastCalledWith(0, 0);
    expect(pad.setPointerCapture).toHaveBeenCalledWith(1);
    expect(pad).toHaveAttribute('data-active', 'true');
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 1000, clientY: 80 });
    expect(onMove).toHaveBeenLastCalledWith(1, 0);
  });

  it('clamps all directions to the unit circle and emits smooth analog diagonals', () => {
    const { pad, onMove } = mount();
    press(pad);
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 1000, clientY: -850 });
    const [x, y] = onMove.mock.lastCall!;
    expect(x).toBeCloseTo(Math.SQRT1_2); expect(y).toBeCloseTo(-Math.SQRT1_2);
    expect(Math.hypot(x, y)).toBeCloseTo(1);
    fireEvent.pointerMove(window, { pointerId: 1, clientX: -1000, clientY: 80 });
    expect(onMove).toHaveBeenLastCalledWith(-1, 0);
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 70, clientY: 1000 });
    expect(onMove).toHaveBeenLastCalledWith(0, 1);
  });

  it('has a centered dead zone and adjustable sensitivity without exceeding maximum speed', () => {
    const { pad, onMove } = mount({ ...DEFAULT_FLYING_CAT_CONTROLS, sensitivity: 0.6 });
    press(pad);
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 72, clientY: 80 });
    expect(onMove).toHaveBeenLastCalledWith(0, 0);
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 85.5, clientY: 80 });
    expect(onMove.mock.lastCall![0]).toBeCloseTo((0.5 - 0.12) / 0.88 * 0.6);
    expect(onMove.mock.lastCall![1]).toBe(0);
  });

  it('does not let another finger steal or release the held joystick while selecting a bonus', () => {
    const { pad, onMove, onRelease } = mount();
    press(pad, 7);
    fireEvent.pointerMove(window, { pointerId: 7, clientX: 70, clientY: 40 });
    const last = onMove.mock.lastCall!;
    press(pad, 9);
    fireEvent.pointerMove(window, { pointerId: 9, clientX: 1000, clientY: 80 });
    fireEvent.pointerUp(window, { pointerId: 9 });
    expect(onMove.mock.lastCall).toEqual(last);
    expect(onRelease).not.toHaveBeenCalled();
    fireEvent.pointerUp(window, { pointerId: 7 });
    expect(onRelease).toHaveBeenCalledOnce();
    expect(onMove).toHaveBeenLastCalledWith(0, 0);
  });

  it.each(['pointerUp', 'pointerCancel', 'lostPointerCapture'] as const)('releases and centers on %s even outside the pad', (event) => {
    const { pad, container, onMove, onRelease } = mount();
    press(pad);
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 150, clientY: 80 });
    fireEvent[event](event === 'lostPointerCapture' ? pad : window, { pointerId: 1 });
    expect(onMove).toHaveBeenLastCalledWith(0, 0);
    expect(onRelease).toHaveBeenCalledOnce();
    expect(pad).not.toHaveAttribute('data-active');
    expect(container.querySelector('.fc-joystick-thumb')).toHaveStyle({ transform: 'translate(-50%, -50%)' });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 1000, clientY: 80 });
    expect(onMove).toHaveBeenLastCalledWith(0, 0);
  });

  it('survives unavailable pointer capture and still releases on window blur', () => {
    const { pad, onMove, onRelease } = mount();
    vi.mocked(pad.setPointerCapture).mockImplementationOnce(() => { throw new Error('No capture'); });
    press(pad);
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 1000, clientY: 80 });
    expect(onMove).toHaveBeenLastCalledWith(1, 0);
    fireEvent.blur(window);
    expect(onRelease).toHaveBeenCalledOnce();
    expect(onMove).toHaveBeenLastCalledWith(0, 0);
  });

  it('clears a held pointer when disabled and unmounting removes listeners and observers', () => {
    const { pad, onMove, onRelease, rerender, unmount } = mount();
    press(pad);
    rerender(<div className="fc-stage"><FlyingCatJoystick disabled preferences={{ ...DEFAULT_FLYING_CAT_CONTROLS }} onMove={onMove} onRelease={onRelease} /></div>);
    expect(onRelease).toHaveBeenCalledOnce();
    expect(pad).toBeDisabled();
    expect(onMove).toHaveBeenLastCalledWith(0, 0);
    onMove.mockClear();
    unmount();
    expect(observers[0].disconnect).toHaveBeenCalledOnce();
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 500, clientY: 80 });
    expect(onMove).not.toHaveBeenCalled();
  });

  it('releases on unmount or hidden tab without transferring control to a new pointer', () => {
    const { pad, onRelease, unmount } = mount();
    press(pad);
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    fireEvent(document, new Event('visibilitychange'));
    expect(onRelease).toHaveBeenCalledOnce();
    press(pad, 5);
    unmount();
    expect(onRelease).toHaveBeenCalledTimes(2);
  });

  it('fits the selected circle inside a short scene and mirrors the chosen hand side', () => {
    sceneHeight = 90;
    const { container, rerender, onMove, onRelease } = mount({ ...DEFAULT_FLYING_CAT_CONTROLS, size: 'large' });
    const control = container.querySelector('.fc-joystick') as HTMLElement;
    expect(control.style.getPropertyValue('--fc-stick-diameter')).toBe('74px');
    expect(control).toHaveAttribute('data-side', 'left');
    rerender(<div className="fc-stage"><FlyingCatJoystick preferences={{ ...DEFAULT_FLYING_CAT_CONTROLS, side: 'right', opacity: 0.5 }} onMove={onMove} onRelease={onRelease} /></div>);
    expect(control).toHaveAttribute('data-side', 'right');
    expect(control).toHaveStyle({ opacity: '0.5' });
    expect(control.style.getPropertyValue('--fc-stick-diameter')).toBe('32px');
    press(screen.getByRole('button', { name: 'Palanca táctil de vuelo' }));
    sceneHeight = 300;
    act(() => { observers.at(-1)!.callback([], {} as ResizeObserver); });
    expect(control.style.getPropertyValue('--fc-stick-diameter')).toBe('108px');
    expect(onRelease).toHaveBeenCalledOnce();
  });
});

describe('Flying Cat saved control preferences', () => {
  it('loads valid saved settings and persists merged changes without discarding other settings', () => {
    localStorage.setItem(FLYING_CAT_CONTROL_STORAGE_KEY, JSON.stringify({ size: 'small', side: 'right', opacity: 0.5, sensitivity: 1.4 }));
    const { result, unmount } = renderHook(useFlyingCatControlPreferences);
    expect(result.current.preferences).toEqual({ size: 'small', side: 'right', opacity: 0.5, sensitivity: 1.4 });
    act(() => { result.current.updatePreferences({ size: 'large' }); result.current.updatePreferences({ sensitivity: 0.7 }); });
    expect(result.current.preferences).toEqual({ size: 'large', side: 'right', opacity: 0.5, sensitivity: 0.7 });
    expect(JSON.parse(localStorage.getItem(FLYING_CAT_CONTROL_STORAGE_KEY)!)).toEqual(result.current.preferences);
    unmount();
    const restored = renderHook(useFlyingCatControlPreferences);
    expect(restored.result.current.preferences).toEqual({ size: 'large', side: 'right', opacity: 0.5, sensitivity: 0.7 });
    act(() => restored.result.current.resetPreferences());
    expect(restored.result.current.preferences).toEqual(DEFAULT_FLYING_CAT_CONTROLS);
  });

  it('rejects malformed or nonnumeric values and clamps legitimate out-of-range numbers', () => {
    expect(normalizeFlyingCatControlPreferences({ size: 'huge', side: 'middle', opacity: '1', sensitivity: Infinity })).toEqual(DEFAULT_FLYING_CAT_CONTROLS);
    expect(normalizeFlyingCatControlPreferences({ opacity: -15, sensitivity: 50 })).toEqual({ ...DEFAULT_FLYING_CAT_CONTROLS, opacity: 0.45, sensitivity: 1.8 });
    expect(normalizeFlyingCatControlPreferences([])).toEqual(DEFAULT_FLYING_CAT_CONTROLS);
    localStorage.setItem(FLYING_CAT_CONTROL_STORAGE_KEY, 'invalid-json');
    const { result } = renderHook(useFlyingCatControlPreferences);
    expect(result.current.preferences).toEqual(DEFAULT_FLYING_CAT_CONTROLS);
  });

  it('continues with in-memory settings when browser storage is disabled', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Private browser'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Private browser'); });
    const { result } = renderHook(useFlyingCatControlPreferences);
    expect(result.current.preferences).toEqual(DEFAULT_FLYING_CAT_CONTROLS);
    act(() => result.current.updatePreferences({ side: 'right' }));
    expect(result.current.preferences.side).toBe('right');
  });

  it('handles relevant cross-tab changes but ignores unrelated storage', () => {
    const { result } = renderHook(useFlyingCatControlPreferences);
    fireEvent(window, new StorageEvent('storage', { key: 'other', newValue: JSON.stringify({ side: 'right' }) }));
    expect(result.current.preferences.side).toBe('left');
    fireEvent(window, new StorageEvent('storage', { key: FLYING_CAT_CONTROL_STORAGE_KEY, newValue: JSON.stringify({ side: 'right' }) }));
    expect(result.current.preferences.side).toBe('right');
    fireEvent(window, new StorageEvent('storage', { key: null, newValue: null }));
    expect(result.current.preferences).toEqual(DEFAULT_FLYING_CAT_CONTROLS);
  });

  it('exposes clear editable settings for size, hand, visibility, sensitivity and reset', () => {
    const onChange = vi.fn(); const onReset = vi.fn();
    render(<FlyingCatControlSettings preferences={{ ...DEFAULT_FLYING_CAT_CONTROLS }} onChange={onChange} onReset={onReset} />);
    fireEvent.change(screen.getByLabelText('Tamaño', { exact: true }), { target: { value: 'large' } });
    expect(onChange).toHaveBeenLastCalledWith({ size: 'large' });
    fireEvent.change(screen.getByLabelText('Lado del control', { exact: true }), { target: { value: 'right' } });
    expect(onChange).toHaveBeenLastCalledWith({ side: 'right' });
    fireEvent.change(screen.getByLabelText(/Visibilidad/), { target: { value: '0.6' } });
    expect(onChange).toHaveBeenLastCalledWith({ opacity: 0.6 });
    fireEvent.change(screen.getByLabelText(/Sensibilidad/), { target: { value: '1.7' } });
    expect(onChange).toHaveBeenLastCalledWith({ sensitivity: 1.7 });
    fireEvent.click(screen.getByRole('button', { name: 'Restablecer controles' }));
    expect(onReset).toHaveBeenCalledOnce();
  });
});
