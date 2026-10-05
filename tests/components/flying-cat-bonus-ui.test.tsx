// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FlightBonusKind, FlightState } from '@/lib/activities/flying-cat-engine';

const observed = vi.hoisted(() => ({
  state: null as FlightState | null, touch: false, initialBonuses: [] as FlightBonusKind[],
}));
vi.mock('@/lib/activities/flying-cat-engine', async (importOriginal) => {
  const engine = await importOriginal<typeof import('@/lib/activities/flying-cat-engine')>();
  return {
    ...engine,
    createFlight: (...args: Parameters<typeof engine.createFlight>) => {
      const state = engine.createFlight(...args);
      observed.initialBonuses.slice(0, 2).forEach((kind, index) => {
        state.bonuses[index as 0 | 1] = { id: ++state.bonusSerial, kind };
      });
      observed.state = state;
      return state;
    },
  };
});
import { answerFlight } from '@/lib/activities/flying-cat-engine';
import FlyingCatGame from '@/components/activities/flying-cat/FlyingCatGame';
import { FLYING_CAT_CONTROL_STORAGE_KEY } from '@/components/activities/flying-cat/FlyingCatJoystick';

beforeEach(() => {
  localStorage.clear(); observed.state = null; observed.touch = false; observed.initialBonuses = [];
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 16));
  vi.stubGlobal('cancelAnimationFrame', (timer: ReturnType<typeof setTimeout>) => clearTimeout(timer));
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(pointer: coarse)' && observed.touch,
    addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal('innerWidth', 1024); vi.stubGlobal('innerHeight', 768);
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: 5 });
  vi.stubGlobal('PointerEvent', class extends MouseEvent {
    pointerId: number; pointerType: string;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init); this.pointerId = init.pointerId ?? 1; this.pointerType = init.pointerType ?? 'touch';
    }
  });
  Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', { configurable: true, value: vi.fn() });
  Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', { configurable: true, value: vi.fn() });
});
afterEach(() => {
  cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, 'maxTouchPoints');
  Reflect.deleteProperty(HTMLElement.prototype, 'setPointerCapture');
  Reflect.deleteProperty(HTMLElement.prototype, 'releasePointerCapture');
});

const exercise = () => ({ titulo: 'Conceptos', contenido: {
  version: 1, instructions: 'Encuentra la respuesta correcta.', showFeedback: true, settings: { difficulty: 'normal' },
  items: [
    { id: 'q1', prompt: 'Profesional que enseña y orienta a sus estudiantes.', options: ['Docente', 'Piloto'], correctIndex: 0, feedback: 'El docente enseña.' },
    { id: 'q2', prompt: 'Profesional que prepara alimentos para servirlos.', options: ['Cocinero', 'Piloto'], correctIndex: 0, feedback: 'El cocinero prepara alimentos.' },
  ],
} });
const tick = async (milliseconds = 32) => { await act(async () => { await vi.advanceTimersByTimeAsync(milliseconds); }); };
const start = () => {
  fireEvent.click(screen.getByRole('button', { name: /Comenzar vuelo/ }));
  fireEvent.click(screen.getByRole('button', { name: /Continuar vuelo/ }));
};

describe('Flying Cat earned bonus controls', () => {
  it.each([false, true])('explains every prize and the device-specific input before starting (touch=%s)', (touch) => {
    observed.touch = touch;
    const { container } = render(<FlyingCatGame exercise={exercise()} />);
    const guide = screen.getByRole('region', { name: 'Cómo usar los premios' });
    for (const name of ['Vida extra', 'Cámara lenta', 'Puntos ×2', 'Puntos ×3', 'Rayo', 'Señalar respuesta']) {
      expect(within(guide).getByText(name)).toBeInTheDocument();
    }
    expect(guide).toHaveTextContent('2 bonus');
    expect(guide).toHaveTextContent('no añaden puntos extra a tu calificación');
    expect(guide).toHaveTextContent(touch ? 'toca sus botones a la derecha' : 'pulsa E para el primero y R para el segundo');
    expect(container.textContent).toMatch(touch ? /palanca/i : /WASD/);
    expect(observed.state).toBeNull();
  });

  it('earns one visible prize only after a correct answer, holding it through explanation and reading', async () => {
    render(<FlyingCatGame exercise={exercise()} />);
    start();
    const state = observed.state!;
    expect(state.bonuses).toEqual([null, null]);
    act(() => { answerFlight(state, state.questions[0].correctIndex, () => 0); });
    await tick();
    expect(state.bonuses[0]?.kind).toBe('extra_life');
    const prize = screen.getByRole('button', { name: 'Usar bonus 1: Vida extra' });
    expect(prize).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente definición' }));
    expect(screen.getByRole('button', { name: 'Usar bonus 1: Vida extra' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /Continuar vuelo/ }));
    expect(screen.getByRole('button', { name: 'Usar bonus 1: Vida extra' })).toBeEnabled();
    expect(state.hits).toBe(1);
  });

  it('does not grant a prize for a wrong answer or use one while paused', async () => {
    render(<FlyingCatGame exercise={exercise()} />);
    start();
    const state = observed.state!;
    act(() => { answerFlight(state, (state.questions[0].correctIndex + 1) % 2, () => 0); });
    await tick();
    expect(state.bonuses).toEqual([null, null]);
    expect(state.wrongAttempts).toBe(1);
    expect(screen.queryByRole('button', { name: 'Usar bonus 1: Vida extra' })).not.toBeInTheDocument();
  });

  it('never replaces two held prizes with a third reward', async () => {
    observed.initialBonuses = ['points_x2', 'reveal'];
    render(<FlyingCatGame exercise={exercise()} />);
    start();
    const state = observed.state!;
    const held = state.bonuses.map((bonus) => ({ ...bonus! }));
    act(() => { answerFlight(state, state.questions[0].correctIndex, () => 0); });
    await tick();
    expect(state.bonuses).toEqual(held);
    expect(state.bonuses).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /^Usar bonus [12]:/ })).toHaveLength(2);
  });

  it('keeps an extra-life prize unused when the student already has the maximum five lives', async () => {
    observed.initialBonuses = ['extra_life'];
    const { container } = render(<FlyingCatGame exercise={exercise()} />);
    start();
    const state = observed.state!;
    state.lives = 5;
    await tick();
    const prize = screen.getByRole('button', { name: 'Usar bonus 1: Vida extra' });
    expect(prize).toBeDisabled();
    fireEvent.click(prize);
    fireEvent.keyDown(container.querySelector('.fc-stage')!, { key: 'e' });
    expect(state.lives).toBe(5);
    expect(state.bonuses[0]?.kind).toBe('extra_life');
  });

  it('uses stable E and R slots on PC and ignores key auto-repeat', () => {
    observed.initialBonuses = ['extra_life', 'points_x3'];
    const { container } = render(<FlyingCatGame exercise={exercise()} />);
    start();
    const state = observed.state!;
    const stage = container.querySelector('.fc-stage')!;
    const first = screen.getByRole('button', { name: 'Usar bonus 1: Vida extra' });
    expect(within(first).getByText('E')).toBeInTheDocument();
    expect(within(screen.getByRole('button', { name: /^Usar bonus 2:/ })).getByText('R')).toBeInTheDocument();
    fireEvent.keyDown(stage, { key: 'e', repeat: true });
    expect(state.lives).toBe(3);
    expect(state.bonuses[0]).not.toBeNull();
    fireEvent.keyDown(stage, { key: 'E' });
    expect(state.lives).toBe(4);
    expect(state.bonuses[0]).toBeNull();
    expect(state.bonuses[1]?.kind).toBe('points_x3');
    fireEvent.keyDown(stage, { key: 'r' });
    expect(state.scoreMultiplier).toBe(3);
    expect(state.bonuses).toEqual([null, null]);
    expect(state.hits).toBe(0);
  });

  it('keeps held prizes and timers unchanged while paused, including E/R presses', async () => {
    observed.initialBonuses = ['extra_life', 'slow_time'];
    const { container } = render(<FlyingCatGame exercise={exercise()} />);
    start();
    const state = observed.state!;
    fireEvent.click(screen.getByRole('button', { name: 'Pausar y releer definición' }));
    const held = [...state.bonuses];
    expect(screen.getByRole('button', { name: 'Usar bonus 1: Vida extra' })).toBeDisabled();
    fireEvent.keyDown(container.querySelector('.fc-stage')!, { key: 'e' });
    fireEvent.keyDown(container.querySelector('.fc-stage')!, { key: 'r' });
    await tick(500);
    expect(state.bonuses).toEqual(held);
    expect(state.lives).toBe(3);
    expect(state.slowSeconds).toBe(0);
  });

  it('allows tapping a prize with another finger without dropping the active joystick', async () => {
    observed.touch = true; observed.initialBonuses = ['extra_life'];
    render(<FlyingCatGame exercise={exercise()} />);
    start();
    const state = observed.state!;
    const pad = screen.getByRole('button', { name: 'Palanca táctil de vuelo' });
    vi.spyOn(pad, 'getBoundingClientRect').mockReturnValue({ x: 10, y: 100, left: 10, top: 100,
      right: 118, bottom: 208, width: 108, height: 108, toJSON() {} });
    fireEvent.pointerDown(pad, { pointerId: 5, clientX: 64, clientY: 154 });
    fireEvent.pointerMove(window, { pointerId: 5, clientX: 98, clientY: 154 });
    await tick();
    const x = state.player.x;
    const prize = screen.getByRole('button', { name: 'Usar bonus 1: Vida extra' });
    expect(within(prize).queryByText('E')).not.toBeInTheDocument();
    fireEvent.pointerDown(prize, { pointerId: 9 });
    fireEvent.click(prize);
    fireEvent.pointerUp(window, { pointerId: 9 });
    expect(state.lives).toBe(4);
    await tick();
    expect(state.player.x).toBeGreaterThan(x);
    fireEvent.pointerUp(window, { pointerId: 5 });
    const stopped = { ...state.player };
    await tick();
    expect(state.player).toEqual(stopped);
  });

  it('opens saved control adjustments in a paused inline panel without resetting the flight', async () => {
    observed.touch = true;
    const { container } = render(<FlyingCatGame exercise={exercise()} />);
    start();
    const state = observed.state!;
    await tick();
    const before = { time: state.activeSeconds, player: { ...state.player }, question: state.questionIndex, lives: state.lives };
    fireEvent.click(screen.getByRole('button', { name: 'Ajustar controles' }));
    expect(state.mode).toBe('paused');
    const panel = screen.getByRole('dialog');
    expect(container.contains(panel)).toBe(true);
    expect(panel).toHaveTextContent('Ajustes de la palanca');
    fireEvent.change(screen.getByLabelText(/Tamaño/), { target: { value: 'large' } });
    fireEvent.change(screen.getByLabelText(/Lado del control/), { target: { value: 'right' } });
    fireEvent.change(screen.getByLabelText(/Visibilidad/), { target: { value: '0.6' } });
    fireEvent.change(screen.getByLabelText(/Sensibilidad/), { target: { value: '1.5' } });
    expect(JSON.parse(localStorage.getItem(FLYING_CAT_CONTROL_STORAGE_KEY)!)).toEqual({ size: 'large', side: 'right', opacity: 0.6, sensitivity: 1.5 });
    expect(container.querySelector('.fc-joystick')).toHaveAttribute('data-side', 'right');
    await tick(500);
    expect(state.activeSeconds).toBe(before.time);
    expect(state.player).toEqual(before.player);
    expect(state.questionIndex).toBe(before.question);
    expect(state.lives).toBe(before.lives);
    fireEvent.click(screen.getByRole('button', { name: /Continuar vuelo/ }));
    expect(state.mode).toBe('flying');
  });

  it('activates lightning from its slot, removes only distractors and creates noncolliding falling debris', async () => {
    observed.initialBonuses = ['lightning'];
    const { container } = render(<FlyingCatGame exercise={exercise()} />);
    start();
    const state = observed.state!;
    const question = state.questions[0];
    state.obstacles = [
      { id: 1, kind: 0, x: 330, y: 40, width: 44, height: 44, speed: 10 },
      { id: 2, kind: 1, x: 330, y: 330, width: 44, height: 44, speed: 10 },
    ];
    state.card = { x: 350, y: 250, width: 90, height: 44, index: (question.correctIndex + 1) % 2, text: 'Distractor' };
    fireEvent.keyDown(container.querySelector('.fc-stage')!, { key: 'e' });
    expect(state.obstacles).toHaveLength(0);
    expect(state.card).toBeNull();
    expect(state.debris).toHaveLength(2);
    expect(state.lightningQuestionIndex).toBe(0);
    expect(state.lives).toBe(3);
    await tick(200);
    expect(container.querySelector('.fc-lightning-effect')).toBeInTheDocument();
    const fragments = container.querySelectorAll<HTMLElement>('.fc-debris:not([hidden])');
    expect(fragments).toHaveLength(2);
    expect([...fragments].every((fragment) => fragment.style.transform.includes('rotate('))).toBe(true);
    expect(state.card?.index).toBe(question.correctIndex);
    expect(state.lives).toBe(3);
    expect(state.hits).toBe(0);
  });

  it('reveal marks the correct concept when it appears without answering or changing the academic score', async () => {
    observed.initialBonuses = ['reveal'];
    const { container } = render(<FlyingCatGame exercise={exercise()} />);
    start();
    const state = observed.state!;
    const question = state.questions[0];
    const correct = question.options[question.correctIndex];
    state.card = { x: 350, y: 30, width: 90, height: 44, index: question.correctIndex, text: correct };
    fireEvent.keyDown(container.querySelector('.fc-stage')!, { key: 'e' });
    expect(state.revealQuestionIndex).toBe(0);
    await tick();
    expect(screen.getByText(correct, { selector: '.fc-card' })).toHaveAttribute('data-revealed', 'true');
    expect(state.answers).toHaveLength(0);
    expect(state.hits).toBe(0);
    expect(state.score).toBe(0);
  });
});
