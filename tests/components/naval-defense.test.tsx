// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NavalDefenseChallenge } from '@/components/classroom-games/naval/NavalDefenseChallenge';
import { shuffleQuestionOptions, type NavalQuestion } from '@/lib/activities/naval-questions';

const question: NavalQuestion = {
  id: 'defense-1', type: 'multiple_choice', prompt: '¿Qué planeta es el más próximo al Sol?',
  options: ['Mercurio', 'Venus', 'Tierra', 'Marte'], correctIndex: 0,
  explanation: 'Mercurio tiene la órbita más cercana al Sol.',
};
const callbacks = () => ({ onResolve: vi.fn(), onCancel: vi.fn(), onPause: vi.fn() });
const props = (overrides: Partial<Parameters<typeof NavalDefenseChallenge>[0]> = {}) => ({ question, defenderName: 'Equipo Azul', paused: false, ...callbacks(), ...overrides });
const advance = (milliseconds: number) => act(() => { vi.advanceTimersByTime(milliseconds); });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance', 'Date'] });
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('Optional ten-second nuclear defense', () => {
  it('explains the 5-coordinate defense and 9-coordinate full attack without revealing the answer', () => {
    render(<NavalDefenseChallenge {...props()}/>);
    expect(screen.getByRole('dialog', { name: 'Equipo Azul: ¡defiendan su flota!' })).toBeInTheDocument();
    expect(screen.getByText(/cruz de 5 coordenadas/)).toHaveTextContent('9 coordenadas');
    expect(screen.getByRole('timer')).toHaveTextContent('10s');
    expect(screen.queryByText(question.explanation)).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('resolves a correct team answer immediately and exactly once', () => {
    const settings = props();
    render(<NavalDefenseChallenge {...settings}/>);
    const answer = screen.getByRole('button', { name: 'Mercurio' });
    act(() => { fireEvent.click(answer); fireEvent.click(answer); });
    advance(20_000);
    expect(settings.onResolve).toHaveBeenCalledExactlyOnceWith(true);
    expect(settings.onCancel).not.toHaveBeenCalled();
    expect(answer).toBeDisabled();
  });

  it('resolves a wrong answer as full damage, without retrying another option', () => {
    const settings = props();
    render(<NavalDefenseChallenge {...settings}/>);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Venus' }));
      fireEvent.click(screen.getByRole('button', { name: 'Mercurio' }));
    });
    expect(settings.onResolve).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('preserves correct identity when the prepared question options were shuffled', () => {
    const shuffled = shuffleQuestionOptions(question, () => 0);
    expect(shuffled.correctIndex).not.toBe(0);
    const settings = props({ question: shuffled });
    render(<NavalDefenseChallenge {...settings}/>);
    fireEvent.click(screen.getByRole('button', { name: 'Mercurio' }));
    expect(settings.onResolve).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('supports false binary answers with the existing question contract', () => {
    const binary: NavalQuestion = { ...question, type: 'true_false', prompt: 'La Tierra es el planeta más próximo al Sol.', options: ['Verdadero', 'Falso'], correctIndex: 1 };
    const settings = props({ question: binary });
    render(<NavalDefenseChallenge {...settings}/>);
    fireEvent.click(screen.getByRole('button', { name: 'Falso' }));
    expect(settings.onResolve).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('expires at ten active seconds once, retaining the full attack', () => {
    const settings = props();
    render(<NavalDefenseChallenge {...settings}/>);
    advance(9900);
    expect(settings.onResolve).not.toHaveBeenCalled();
    expect(screen.getByRole('timer')).toHaveTextContent('1s');
    advance(100);
    expect(settings.onResolve).toHaveBeenCalledExactlyOnceWith(false);
    advance(50_000);
    fireEvent.click(screen.getByRole('button', { name: 'Mercurio' }));
    expect(settings.onResolve).toHaveBeenCalledOnce();
  });

  it('pauses the defense clock and disallows answering behind the pause overlay', () => {
    const settings = props();
    const { rerender } = render(<NavalDefenseChallenge {...settings}/>);
    advance(4000);
    rerender(<NavalDefenseChallenge {...settings} paused/>);
    expect(screen.getByRole('timer')).toHaveTextContent('6s');
    fireEvent.click(screen.getByRole('button', { name: 'Mercurio' }));
    fireEvent.click(screen.getByRole('button', { name: 'Seguir sin reto' }));
    advance(30_000);
    expect(settings.onResolve).not.toHaveBeenCalled();
    expect(settings.onCancel).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('reloj está detenido');
    rerender(<NavalDefenseChallenge {...settings} paused={false}/>);
    advance(5900);
    expect(settings.onResolve).not.toHaveBeenCalled();
    advance(100);
    expect(settings.onResolve).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('lets the professor request pause/resume without resolving the defense', () => {
    const settings = props();
    const { rerender } = render(<NavalDefenseChallenge {...settings}/>);
    fireEvent.click(screen.getByRole('button', { name: 'Pausar reto' }));
    expect(settings.onPause).toHaveBeenCalledOnce();
    rerender(<NavalDefenseChallenge {...settings} paused/>);
    fireEvent.click(screen.getByRole('button', { name: 'Reanudar reto' }));
    expect(settings.onPause).toHaveBeenCalledTimes(2);
    expect(settings.onResolve).not.toHaveBeenCalled();
  });

  it('skips the optional challenge once without producing a second timeout result', () => {
    const settings = props();
    render(<NavalDefenseChallenge {...settings}/>);
    const cancel = screen.getByRole('button', { name: 'Seguir sin reto' });
    act(() => { fireEvent.click(cancel); fireEvent.click(cancel); });
    advance(20_000);
    expect(settings.onCancel).toHaveBeenCalledOnce();
    expect(settings.onResolve).not.toHaveBeenCalled();
  });

  it('does not allow a cancel and answer from the same input batch to resolve twice', () => {
    const settings = props();
    render(<NavalDefenseChallenge {...settings}/>);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Mercurio' }));
      fireEvent.click(screen.getByRole('button', { name: 'Seguir sin reto' }));
    });
    expect(settings.onResolve).toHaveBeenCalledExactlyOnceWith(true);
    expect(settings.onCancel).not.toHaveBeenCalled();
  });

  it('resets both the clock and resolution guard for a new question identity', () => {
    const settings = props();
    const { rerender } = render(<NavalDefenseChallenge {...settings}/>);
    fireEvent.click(screen.getByRole('button', { name: 'Mercurio' }));
    rerender(<NavalDefenseChallenge {...settings} question={{ ...question, id: 'defense-2' }}/>);
    expect(screen.getByRole('timer')).toHaveTextContent('10s');
    expect(screen.getByRole('button', { name: 'Mercurio' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Mercurio' }));
    expect(settings.onResolve).toHaveBeenCalledTimes(2);
  });

  it('does not reset its timer on ordinary rerenders of the same defense', () => {
    const settings = props();
    const { rerender } = render(<NavalDefenseChallenge {...settings}/>);
    advance(4000);
    rerender(<NavalDefenseChallenge {...settings} defenderName="Equipo Coral"/>);
    expect(screen.getByRole('timer')).toHaveTextContent('6s');
    advance(6000);
    expect(settings.onResolve).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('cleans up on unmount so a closed defense cannot damage any fleet', () => {
    const settings = props();
    const { unmount } = render(<NavalDefenseChallenge {...settings}/>);
    advance(4000);
    unmount();
    advance(30_000);
    expect(settings.onResolve).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
