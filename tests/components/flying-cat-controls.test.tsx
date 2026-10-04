// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FlightState } from '@/lib/activities/flying-cat-engine';

const observed = vi.hoisted(() => ({ state: null as FlightState | null, touch: false, collide: false }));
vi.mock('@/lib/activities/flying-cat-engine', async (importOriginal) => {
  const engine = await importOriginal<typeof import('@/lib/activities/flying-cat-engine')>();
  return {
    ...engine,
    createFlight: (...args: Parameters<typeof engine.createFlight>) => {
      observed.state = engine.createFlight(...args);
      return observed.state;
    },
    stepFlight: (state: FlightState, ...args: [number, any]) => {
      if (observed.collide && state.mode === 'flying') {
        observed.collide = false;
        state.immunity = 0;
        state.obstacleDelay = 100;
        state.obstacles = [{ ...state.player, speed: 0, id: 1, kind: 0 }];
      }
      engine.stepFlight(state, ...args);
    },
  };
});
import FlyingCatGame from '@/components/activities/flying-cat/FlyingCatGame';

beforeEach(() => {
  observed.state = null; observed.touch = false; observed.collide = false;
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 16));
  vi.stubGlobal('cancelAnimationFrame', (timer: ReturnType<typeof setTimeout>) => clearTimeout(timer));
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('matchMedia', () => ({ matches: observed.touch, addEventListener() {}, removeEventListener() {} }));
  Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: 5 });
  vi.stubGlobal('PointerEvent', class extends MouseEvent {
    pointerId: number; pointerType: string;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init); this.pointerId = init.pointerId ?? 1; this.pointerType = init.pointerType ?? 'touch';
    }
  });
  Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', { configurable: true, value: vi.fn() });
});
afterEach(() => {
  cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, 'maxTouchPoints');
  Reflect.deleteProperty(HTMLElement.prototype, 'setPointerCapture');
});

const makeExercise = () => ({ titulo: 'Vocabulario', contenido: {
  version: 1, instructions: 'Pilota hacia el concepto correcto.', showFeedback: true, settings: { difficulty: 'hard' },
  items: [{ id: 'q1', prompt: 'Profesional que enseña y orienta a los estudiantes.',
    options: ['Docente', 'Piloto'], correctIndex: 0, feedback: 'El docente enseña.' }],
} });
const tick = async (ms = 32) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
const start = () => {
  fireEvent.click(screen.getByRole('button', { name: /Comenzar vuelo/ }));
  fireEvent.click(screen.getByRole('button', { name: /Continuar vuelo/ }));
};

describe('Flying Cat exclusive movement controls', () => {
  it('uses only on-stage direction buttons on touch screens, including independent multi-touch release', async () => {
    observed.touch = true;
    const { container } = render(<FlyingCatGame exercise={makeExercise()} />);
    start();
    const stage = container.querySelector('.fc-stage')!;
    expect(stage.contains(screen.getByLabelText('Controles táctiles de vuelo'))).toBe(true);
    const initial = { ...observed.state!.player };
    fireEvent.pointerDown(stage, { pointerId: 1, clientX: 320, clientY: 300 });
    fireEvent.pointerMove(stage, { pointerId: 1, clientX: 220, clientY: 30 });
    fireEvent.pointerUp(stage, { pointerId: 1 });
    fireEvent.keyDown(stage, { key: 'w' });
    fireEvent.keyDown(stage, { key: 'ArrowRight' });
    await tick();
    expect(observed.state!.player).toEqual(initial);
    const up = screen.getByRole('button', { name: 'Volar hacia arriba' });
    const right = screen.getByRole('button', { name: 'Volar hacia la derecha' });
    fireEvent.pointerDown(up, { pointerId: 2 });
    fireEvent.pointerDown(right, { pointerId: 3 });
    await tick();
    expect(observed.state!.player.y).toBeLessThan(initial.y);
    expect(observed.state!.player.x).toBeGreaterThan(initial.x);
    const heldY = observed.state!.player.y;
    fireEvent.keyUp(stage, { key: 'w' });
    await tick();
    expect(observed.state!.player.y).toBeLessThan(heldY);
    fireEvent.pointerUp(up, { pointerId: 2 });
    const releasedY = observed.state!.player.y;
    const heldX = observed.state!.player.x;
    await tick();
    expect(observed.state!.player.y).toBe(releasedY);
    expect(observed.state!.player.x).toBeGreaterThan(heldX);
    fireEvent.pointerCancel(right, { pointerId: 3 });
    const released = { ...observed.state!.player };
    await tick();
    expect(observed.state!.player).toEqual(released);
    expect(screen.getByLabelText('Definición de la pregunta actual')).toHaveTextContent('Profesional que enseña');
  });

  it('ignores mouse and arrow keys on PC and clears held WASD when paused', async () => {
    const { container } = render(<FlyingCatGame exercise={makeExercise()} />);
    start();
    const stage = container.querySelector('.fc-stage')!;
    expect(screen.queryByLabelText('Controles táctiles de vuelo')).not.toBeInTheDocument();
    const initial = { ...observed.state!.player };
    fireEvent.pointerDown(stage, { pointerType: 'mouse', clientX: 330, clientY: 30 });
    fireEvent.pointerMove(stage, { pointerType: 'mouse', clientX: 310, clientY: 100 });
    fireEvent.keyDown(stage, { key: 'ArrowUp' });
    await tick();
    expect(observed.state!.player).toEqual(initial);
    fireEvent.keyDown(stage, { key: 'w' });
    await tick();
    expect(observed.state!.player.y).toBeLessThan(initial.y);
    fireEvent.blur(window);
    expect(screen.getByRole('dialog')).toHaveTextContent('Vuelo en pausa');
    fireEvent.click(screen.getByRole('button', { name: /Continuar vuelo/ }));
    const resumed = { ...observed.state!.player };
    await tick();
    expect(observed.state!.player).toEqual(resumed);
  });

  it('uses the student-selected difficulty without editing the teacher activity', () => {
    const exercise = makeExercise();
    render(<FlyingCatGame exercise={exercise} />);
    expect(screen.getByRole('radio', { name: 'Difícil' })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: 'Fácil' }));
    start();
    expect(observed.state!.difficulty).toBe('easy');
    expect(exercise.contenido.settings.difficulty).toBe('hard');
  });

  it('requires landscape on phones and preserves the paused flight through real viewport changes', async () => {
    observed.touch = true;
    vi.stubGlobal('innerWidth', 390); vi.stubGlobal('innerHeight', 844);
    render(<FlyingCatGame exercise={makeExercise()} />);
    expect(screen.getByRole('heading', { name: 'Gira tu teléfono para jugar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Comenzar vuelo/ })).not.toBeInTheDocument();
    vi.stubGlobal('innerWidth', 844); vi.stubGlobal('innerHeight', 390);
    fireEvent.resize(window);
    start();
    await tick();
    expect(observed.state!.mode).toBe('flying');
    const before = { player: { ...observed.state!.player }, time: observed.state!.activeSeconds,
      lives: observed.state!.lives, question: observed.state!.questionIndex };
    vi.stubGlobal('innerWidth', 390); vi.stubGlobal('innerHeight', 844);
    fireEvent.resize(window);
    expect(screen.getByRole('heading', { name: 'Gira tu teléfono para jugar' })).toBeInTheDocument();
    await tick(1000);
    expect(observed.state!.mode).toBe('paused');
    expect(observed.state!.activeSeconds).toBe(before.time);
    expect(observed.state!.lives).toBe(before.lives);
    expect(observed.state!.questionIndex).toBe(before.question);
    expect(observed.state!.player).toEqual(before.player);
    vi.stubGlobal('innerWidth', 844); vi.stubGlobal('innerHeight', 390);
    fireEvent.resize(window);
    expect(screen.getByRole('dialog')).toHaveTextContent('Vuelo en pausa');
    fireEvent.click(screen.getByRole('button', { name: /Continuar vuelo/ }));
    await tick();
    expect(observed.state!.mode).toBe('flying');
    expect(screen.queryByRole('heading', { name: 'Gira tu teléfono para jugar' })).not.toBeInTheDocument();
  });

  it('shows a concerned pilot and short impact reaction before the protective sphere', async () => {
    const onComplete = vi.fn();
    const { container } = render(<FlyingCatGame exercise={makeExercise()} onComplete={onComplete} />);
    start();
    observed.collide = true;
    await tick();
    expect(observed.state!.lives).toBe(2);
    expect(container.querySelector('.fc-stage--impact')).toBeInTheDocument();
    expect(container.querySelector('.fc-plane-reaction--impact')).toBeInTheDocument();
    expect(container.querySelector('.fc-art-pilot--worried')).toBeInTheDocument();
    expect(screen.queryByTestId('flying-cat-energy-shield')).not.toBeInTheDocument();
    await tick(300);
    expect(observed.state!.lives).toBe(2);
    await tick(450);
    expect(container.querySelector('.fc-stage--impact')).not.toBeInTheDocument();
    expect(screen.getByTestId('flying-cat-energy-shield')).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
  });
});
