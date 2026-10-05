// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Force an obstacle overlap, not a fabricated result: the real engine must
// transition through its third-hit crash state before the UI can save.
vi.mock('@/lib/activities/flying-cat-engine', async (importOriginal) => {
  const engine = await importOriginal<typeof import('@/lib/activities/flying-cat-engine')>();
  return { ...engine, stepFlight: (state: Parameters<typeof engine.stepFlight>[0], ...args: [number, any]) => {
    if (state.mode === 'flying' && !state.crashed) {
      state.lives = 1;
      state.immunity = 0;
      state.obstacleDelay = 100;
      state.obstacles = [{ ...state.player, speed: 0, id: 1, kind: 0 }];
    }
    engine.stepFlight(state, ...args);
  } };
});
import FlyingCatGame from '@/components/activities/flying-cat/FlyingCatGame';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 16));
  vi.stubGlobal('cancelAnimationFrame', (timer: ReturnType<typeof setTimeout>) => clearTimeout(timer));
  vi.stubGlobal('ResizeObserver', class {
    observe() {} unobserve() {} disconnect() {}
  });
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const exercise = { id: 'crash-test', titulo: 'Profesiones', tipo: 'flying_cat', contenido: {
  version: 1, instructions: 'Pilota con cuidado.', showFeedback: true, settings: { difficulty: 'normal' },
  items: [{ id: 'q1', prompt: 'Profesional preparado para conducir aviones y transportar viajeros.',
    options: ['Piloto', 'Médico'], correctIndex: 0, feedback: 'Un piloto conduce aeronaves.' }],
} };

describe('Flying Cat third-life visual sequence', () => {
  it('renders the broken plane and falling cat before the summary and saves exactly once', async () => {
    const onComplete = vi.fn(async () => null);
    const { container } = render(<FlyingCatGame exercise={exercise} onComplete={onComplete} />);
    fireEvent.click(screen.getByRole('button', { name: /Comenzar vuelo/ }));
    fireEvent.click(screen.getByRole('button', { name: /Continuar vuelo/ }));
    await act(async () => { await vi.advanceTimersByTimeAsync(40); });
    expect(container.querySelector('.fc-crash-scene')).toBeInTheDocument();
    expect(container.querySelector('.fc-crash-wreck svg')).toBeInTheDocument();
    expect(container.querySelector('.fc-crash-cat svg')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(container.querySelector('.fc-crash-scene')).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1800); });
    expect(container.querySelector('.fc-crash-scene')).not.toBeInTheDocument();
    expect(screen.getByText('0 de 1 respuestas correctas')).toBeInTheDocument();
    expect(onComplete).toHaveBeenCalledOnce();
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ hits: 0, total: 1 }));
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(onComplete).toHaveBeenCalledOnce();
  });
});
