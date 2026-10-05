// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FlightState, FlyingCatResult } from '@/lib/activities/flying-cat-engine';

const observed = vi.hoisted(() => ({
  state: null as FlightState | null,
  order: [] as string[],
  musicResume: vi.fn(), musicPause: vi.fn(), musicToggle: vi.fn(),
}));
vi.mock('@/lib/activities/flying-cat-engine', async (importOriginal) => {
  const engine = await importOriginal<typeof import('@/lib/activities/flying-cat-engine')>();
  return { ...engine, createFlight: (...args: Parameters<typeof engine.createFlight>) => {
    observed.state = engine.createFlight(...args); return observed.state;
  } };
});
vi.mock('@/components/activities/flying-cat/useFlyingCatMusic', () => ({
  useFlyingCatMusic: () => ({ enabled: true, resume: observed.musicResume,
    pause: observed.musicPause, toggle: observed.musicToggle }),
}));
import FlyingCatGame from '@/components/activities/flying-cat/FlyingCatGame';
import { FlyingCatViewport } from '@/components/activities/flying-cat/FlyingCatViewport';
import { flightResult } from '@/lib/activities/flying-cat-engine';

let nativeElement: Element | null;
const installed: { target: object; key: string; descriptor?: PropertyDescriptor }[] = [];
function install(target: object, key: string, descriptor: PropertyDescriptor) {
  installed.push({ target, key, descriptor: Object.getOwnPropertyDescriptor(target, key) });
  Object.defineProperty(target, key, { configurable: true, ...descriptor });
}
function changeFullscreen(element: Element | null) {
  nativeElement = element; document.dispatchEvent(new Event('fullscreenchange'));
}
let nativeRequest: ReturnType<typeof vi.fn>;
beforeEach(() => {
  localStorage.clear(); observed.state = null; observed.order = []; nativeElement = null;
  observed.musicResume.mockImplementation(() => { observed.order.push('music'); });
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 16));
  vi.stubGlobal('cancelAnimationFrame', (timer: ReturnType<typeof setTimeout>) => clearTimeout(timer));
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal('visualViewport', Object.assign(new EventTarget(), { width: 1024, height: 680, offsetLeft: 0, offsetTop: 36 }));
  vi.stubGlobal('innerWidth', 1024); vi.stubGlobal('innerHeight', 768);
  install(document, 'fullscreenElement', { get: () => nativeElement });
  install(document, 'fullscreenEnabled', { value: true, writable: true });
  nativeRequest = vi.fn(function (this: HTMLElement) {
    observed.order.push('fullscreen'); changeFullscreen(this); return Promise.resolve();
  });
  install(HTMLElement.prototype, 'requestFullscreen', { value: nativeRequest, writable: true });
  install(document, 'exitFullscreen', { value: vi.fn(() => { changeFullscreen(null); return Promise.resolve(); }), writable: true });
});
afterEach(() => {
  cleanup();
  installed.reverse().forEach(({ target, key, descriptor }) => {
    if (descriptor) Object.defineProperty(target, key, descriptor);
    else Reflect.deleteProperty(target, key);
  });
  installed.length = 0;
  vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); document.body.removeAttribute('style');
});
const exercise = { id: 'fullscreen-run', titulo: 'Conceptos de vuelo', tipo: 'flying_cat', contenido: {
  version: 1, instructions: 'Pilota hacia el concepto correcto.', showFeedback: true, settings: { difficulty: 'normal' },
  items: [
    { id: 'q1', prompt: 'Profesional que enseña y orienta a los estudiantes.',
      options: ['Docente', 'Piloto'], correctIndex: 0, feedback: 'El docente enseña.' },
    { id: 'q2', prompt: 'Profesional preparado para conducir aviones y transportar viajeros.',
      options: ['Piloto', 'Médico'], correctIndex: 0, feedback: 'Un piloto conduce aeronaves.' },
  ],
} };
const begin = async () => { await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Comenzar vuelo/ })); }); };
const resume = async () => { await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Continuar vuelo/ })); }); };
const tick = async (milliseconds = 32) => { await act(async () => { await vi.advanceTimersByTimeAsync(milliseconds); }); };
function renderGame(props: { onComplete?: (result: FlyingCatResult) => unknown; onClose?: () => void } = {}) {
  return render(<div style={{ transform: 'translateY(20px)', overflow: 'hidden', height: 100 }}>
    <FlyingCatViewport><FlyingCatGame exercise={exercise} {...props} /></FlyingCatViewport>
  </div>);
}
async function makeRealCorrectAnswer() {
  const state = observed.state!;
  const question = state.questions[state.questionIndex];
  // Place an actual answer card in collision range. The production engine,
  // not a fabricated result, records the answer, points and earned bonus.
  state.card = { ...state.player, index: question.correctIndex, text: question.options[question.correctIndex] };
  await tick(16);
  expect(state.mode).toBe('feedback'); expect(state.hits).toBe(1); expect(state.answers).toHaveLength(1);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Siguiente definición' })); });
  await resume();
  expect(state.mode).toBe('flying'); expect(state.questionIndex).toBe(1);
}

describe('Flying Cat Game and native fullscreen portal integration', () => {
  it('Begin fullscreens the complete stable portal before starting music, never just the flight field', async () => {
    renderGame();
    const portal = screen.getByTestId('flying-cat-viewport');
    await begin();
    expect(nativeElement).toBe(portal);
    expect(nativeRequest).toHaveBeenCalledExactlyOnceWith({ navigationUI: 'hide' });
    expect(observed.order.slice(0, 2)).toEqual(['fullscreen', 'music']);
    expect(portal).toHaveStyle({ height: '768px', top: '0px' });
    expect(portal.contains(screen.getByRole('button', { name: 'Salir de pantalla completa' }))).toBe(true);
    expect(portal.contains(screen.getByLabelText('Tus dos bonus'))).toBe(true);
    expect(portal.querySelector('.fc-stage')).not.toBe(nativeElement);
    await resume();
    expect(observed.state!.mode).toBe('flying');
    expect(nativeElement).toBe(portal);
  });

  it('Resume re-enters native fullscreen on the same portal without restarting the flight', async () => {
    renderGame(); await begin(); await resume();
    const state = observed.state!;
    const portal = screen.getByTestId('flying-cat-viewport');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Salir de pantalla completa' })); });
    fireEvent.click(screen.getByRole('button', { name: 'Pausar y releer definición' }));
    expect(state.mode).toBe('paused');
    observed.order = [];
    await resume();
    expect(nativeRequest).toHaveBeenCalledTimes(2);
    expect(nativeElement).toBe(portal);
    expect(observed.state).toBe(state);
    expect(state.mode).toBe('flying');
    expect(observed.order.slice(0, 2)).toEqual(['fullscreen', 'music']);
  });

  it.each(['browser gesture', 'Escape key'] as const)('%s exits safely, pauses, and preserves a real recorded grade and earned bonuses', async (mechanism) => {
    const onComplete = vi.fn();
    renderGame({ onComplete }); await begin(); await resume(); await makeRealCorrectAnswer();
    const state = observed.state!;
    const recorded = flightResult(state);
    const bonuses = structuredClone(state.bonuses);
    const lives = state.lives;
    const time = state.activeSeconds;
    act(() => {
      if (mechanism === 'Escape key') fireEvent.keyDown(document.querySelector('.fc-stage')!, { key: 'Escape' });
      changeFullscreen(null);
    });
    expect(state.mode).toBe('paused');
    expect(screen.getByRole('dialog')).toHaveTextContent('Vuelo en pausa');
    expect(screen.getByTestId('flying-cat-viewport')).toHaveStyle({ height: '680px', top: '36px' });
    await tick(500);
    expect(state.activeSeconds).toBe(time);
    expect(flightResult(state)).toEqual(recorded);
    expect(state.bonuses).toEqual(bonuses); expect(state.lives).toBe(lives);
    expect(onComplete).not.toHaveBeenCalled();
    await resume();
    expect(state.mode).toBe('flying');
    expect(nativeElement).toBe(screen.getByTestId('flying-cat-viewport'));
    expect(flightResult(state)).toEqual(recorded);
  });

  it('the explicit fullscreen HUD exit keeps the flight running and restores the visible browser area', async () => {
    renderGame(); await begin(); await resume();
    const state = observed.state!;
    const before = state.activeSeconds;
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Salir de pantalla completa' })); });
    expect(nativeElement).toBeNull();
    expect(state.mode).toBe('flying');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Entrar en pantalla completa' })).toBeVisible();
    expect(screen.getByTestId('flying-cat-viewport')).toHaveStyle({ height: '680px', top: '36px' });
    await tick();
    expect(state.activeSeconds).toBeGreaterThan(before);
    expect(state.mode).toBe('flying');
  });

  it('a rejected native request displays its fallback but never prevents starting or playing', async () => {
    nativeRequest.mockImplementation(() => Promise.reject(new TypeError('Browser denied fullscreen')));
    renderGame(); await begin();
    expect(nativeElement).toBeNull();
    expect(screen.getByText(/El navegador no permitió entrar en pantalla completa/)).toBeVisible();
    expect(observed.state!.mode).toBe('reading');
    await resume(); await tick();
    expect(observed.state!.mode).toBe('flying');
    expect(observed.state!.activeSeconds).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Entrar en pantalla completa' })).not.toBeDisabled();
  });

  it('an unsupported mobile-style browser stays playable and explains its actual limitation', async () => {
    install(HTMLElement.prototype, 'requestFullscreen', { value: undefined, writable: true });
    renderGame(); await begin();
    expect(screen.getByText(/Tu navegador no permite pantalla completa para este juego/)).toBeVisible();
    await resume(); await tick();
    expect(observed.state!.mode).toBe('flying'); expect(observed.state!.lives).toBe(3);
    expect(nativeElement).toBeNull();
    expect(nativeRequest).not.toHaveBeenCalled();
  });

  it('closing pauses, releases its own fullscreen and removes the portal without saving an unfinished game', async () => {
    const onClose = vi.fn(); const onComplete = vi.fn();
    const { unmount } = renderGame({ onClose, onComplete }); await begin(); await resume();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Cerrar juego' })); });
    expect(onClose).toHaveBeenCalledOnce(); expect(observed.state!.mode).toBe('paused');
    expect(nativeElement).toBeNull(); expect(document.exitFullscreen).toHaveBeenCalledOnce();
    unmount();
    expect(screen.queryByTestId('flying-cat-viewport')).not.toBeInTheDocument();
    expect(document.exitFullscreen).toHaveBeenCalledOnce(); expect(onComplete).not.toHaveBeenCalled();
  });

  it('closing before a pending native request finishes still releases only that old game portal', async () => {
    let finishRequest!: () => void;
    let requestedPortal!: HTMLElement;
    nativeRequest.mockImplementation(function (this: HTMLElement) {
      requestedPortal = this; return new Promise<void>((resolve) => { finishRequest = resolve; });
    });
    const onClose = vi.fn(); const onComplete = vi.fn();
    const { unmount } = renderGame({ onClose, onComplete });
    // Do not await the native promise: the student closes while it is pending.
    fireEvent.click(screen.getByRole('button', { name: /Comenzar vuelo/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar juego' }));
    unmount();
    await act(async () => { changeFullscreen(requestedPortal); finishRequest(); });
    expect(nativeElement).toBeNull();
    expect(document.exitFullscreen).toHaveBeenCalledOnce();
    expect(onComplete).not.toHaveBeenCalled(); expect(onClose).toHaveBeenCalledOnce();
  });
});
