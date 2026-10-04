// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const selection = vi.hoisted(() => ({ correct: true }));
vi.mock('@/lib/activities/flying-cat-engine', async (importOriginal) => {
  const engine = await importOriginal<typeof import('@/lib/activities/flying-cat-engine')>();
  return { ...engine, stepFlight: (state: Parameters<typeof engine.stepFlight>[0], ...args: [number, any]) => {
    if (state.mode === 'flying') {
      const question = state.questions[state.questionIndex];
      const selected = selection.correct ? question.correctIndex : (question.correctIndex + 1) % question.options.length;
      engine.answerFlight(state, selected);
      return;
    }
    engine.stepFlight(state, ...args);
  } };
});
import FlyingCatGame from '@/components/activities/flying-cat/FlyingCatGame';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 16));
  vi.stubGlobal('cancelAnimationFrame', (timer: ReturnType<typeof setTimeout>) => clearTimeout(timer));
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

const exercise = { id: 'simple-flight', titulo: 'Jobs', tipo: 'flying_cat', contenido: {
  version: 1, instructions: 'Elige el concepto correcto.', showFeedback: true, settings: { difficulty: 'normal' },
  items: [{ id: 'q1', prompt: '¿Quién vuela?', options: ['Pilot', 'Nurse'], correctIndex: 0, feedback: '' }],
} };

describe('simple manual Flying Cat questions', () => {
  it.each([true, false])('starts and shows the correct concept without inventing an explanation (correct=%s)', async (correct) => {
    selection.correct = correct;
    const onComplete = vi.fn(async () => null);
    const { container } = render(<FlyingCatGame exercise={exercise} onComplete={onComplete} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Comenzar vuelo/ }));
    expect(screen.getAllByText('¿Quién vuela?').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: /Continuar vuelo/ }));
    await act(async () => { await vi.advanceTimersByTimeAsync(40); });

    expect(screen.getByRole('dialog')).toHaveTextContent('Concepto correcto: Pilot');
    expect(screen.getByRole('dialog')).toHaveTextContent('Respuesta · vuelo en pausa');
    expect(screen.getByRole('dialog')).toHaveTextContent(`Tu elección: ${correct ? 'Pilot' : 'Nurse'}`);
    expect(container.querySelector('.fc-explanation')).not.toBeInTheDocument();
    expect(screen.queryByText(/Relaciona las características/)).not.toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Ver mi resultado' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(40); });
    expect(onComplete).toHaveBeenCalledOnce();
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ hits: correct ? 1 : 0, total: 1 }));
  });
});
