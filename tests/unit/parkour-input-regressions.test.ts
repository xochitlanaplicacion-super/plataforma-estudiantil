// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdventureGame } from '../../games/parkour-race/src/game/game';
import { useStore } from '../../games/parkour-race/src/store';

vi.mock('../../games/parkour-race/src/game/builder', () => ({ burstConfetti: vi.fn() }));
vi.mock('../../games/parkour-race/src/game/sfx', () => ({ sfx: { correct: vi.fn(), checkpoint: vi.fn(), wrong: vi.fn() } }));

afterEach(() => {
  useStore.setState({ question: null, questionFeedback: 'idle', paused: false });
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function mockStationGame(touchOnly: boolean) {
  Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: touchOnly ? 5 : 0 });
  const game = Object.create(AdventureGame.prototype) as AdventureGame;
  const stations = Array.from({ length: 2 }, () => ({
    completed: false, open: vi.fn(), beamMat: { alpha: 0 },
    spawnPos: { clone: () => ({}) }, exitYaw: 0, totemCore: { getAbsolutePosition: () => ({}) },
  }));
  Object.assign(game, {
    activity: { settings: { showFeedback: false } }, scene: {}, firstTry: true, disposed: false,
    course: { stations, orderedQuestions: [
      { id: 'q1', prompt: 'Primera', answers: ['Bien', 'Mal'], correctIndex: 0 },
      { id: 'q2', prompt: 'Segunda', answers: ['Bien', 'Mal'], correctIndex: 0 },
    ] },
    stats: { answered: 0, score: 0, firstTryCorrect: 0, wrong: 0 },
    answerAttemptsByStation: new Map(), answerTrace: { answers: [], truncated: false }, requestLock: vi.fn(),
  });
  useStore.getState().openQuestion(0, 2);
  return { game, stations };
}

function mockRunningGame() {
  // The answer API does not need WebGL. Avoid creating a real Babylon engine
  // while exercising the same synchronous state transitions used by clicks.
  const game = Object.create(AdventureGame.prototype) as AdventureGame;
  const state = game as unknown as {
    course: { orderedQuestions: { id: string; prompt: string; answers: string[]; correctIndex: number }[] };
    stats: { answered: number };
    answerAttemptsByStation: Map<number, number>;
    answerTrace: { answers: unknown[]; truncated: boolean };
    completeStation: (index: number) => void;
  };
  state.course = { orderedQuestions: [
    { id: 'q1', prompt: 'Pregunta 1', answers: ['Mal', 'Bien'], correctIndex: 1 },
    { id: 'q2', prompt: 'Pregunta 2', answers: ['Bien', 'Mal'], correctIndex: 0 },
  ] };
  state.stats = { answered: 0 };
  state.answerAttemptsByStation = new Map();
  state.answerTrace = { answers: [], truncated: false };
  state.completeStation = vi.fn(() => {
    state.stats.answered++;
    useStore.getState().setQuestionFeedback('correct');
  });
  useStore.getState().openQuestion(0, 2);
  return { game, state };
}

describe('Parkour Race answer transitions', () => {
  it('counts a double or triple click on the correct answer only once', () => {
    const { game, state } = mockRunningGame();
    expect(game.submitAnswer(1)).toBe('correct');
    expect(game.submitAnswer(1)).toBe('ignored');
    expect(game.submitAnswer(1)).toBe('ignored');
    expect(state.completeStation).toHaveBeenCalledTimes(1);
    expect(state.stats.answered).toBe(1);
    expect(state.answerTrace.answers).toHaveLength(1);
  });

  it('rejects a stale question index and invalid option without changing progress', () => {
    const { game, state } = mockRunningGame();
    expect(game.submitAnswer(99)).toBe('ignored');
    useStore.getState().openQuestion(1, 2);
    expect(game.submitAnswer(0)).toBe('ignored');
    expect(state.completeStation).not.toHaveBeenCalled();
    expect(state.answerTrace.answers).toHaveLength(0);
  });

  it('closes each correct question without feedback and permits the next station on mobile', () => {
    vi.useFakeTimers();
    const { game, stations } = mockStationGame(true);
    expect(game.submitAnswer(0, 'touch')).toBe('correct');
    vi.advanceTimersByTime(420);
    expect(useStore.getState().question).toBeNull();
    expect(useStore.getState().paused).toBe(false);
    useStore.getState().openQuestion(1, 2);
    expect(game.submitAnswer(0, 'touch')).toBe('correct');
    vi.advanceTimersByTime(420);
    expect(useStore.getState().question).toBeNull();
    expect(stations.every(station => station.completed)).toBe(true);
    expect(game.requestLock).toHaveBeenCalledTimes(2);
  });

  it('leaves a resumable state on PC when automatic pointer capture is unavailable', () => {
    vi.useFakeTimers();
    const { game } = mockStationGame(false);
    game.submitAnswer(0, 'mouse');
    vi.advanceTimersByTime(420);
    expect(useStore.getState().question).toBeNull();
    expect(useStore.getState().paused).toBe(true);
    expect(game.requestLock).toHaveBeenCalledWith('mouse');
  });

  it('allows retrying a wrong answer and advances only once after correcting it', () => {
    vi.useFakeTimers();
    const { game, stations } = mockStationGame(true);
    expect(game.submitAnswer(1, 'touch')).toBe('wrong');
    expect(game.submitAnswer(0, 'touch')).toBe('ignored');
    game.retryAfterFeedback();
    expect(game.submitAnswer(0, 'touch')).toBe('correct');
    vi.advanceTimersByTime(420);
    expect(stations[0].open).toHaveBeenCalledTimes(1);
    expect(useStore.getState().question).toBeNull();
  });
});
