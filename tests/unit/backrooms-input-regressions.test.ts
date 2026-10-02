// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BackroomsGame } from '../../games/backrooms-scape/src/game/BackroomsGame';

vi.mock('../../games/backrooms-scape/src/game/music', () => ({ backroomsMusic: { leaveQuestion: vi.fn() } }));

afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

function questionGame(showFeedback: boolean) {
  vi.useFakeTimers();
  const game = Object.create(BackroomsGame.prototype) as BackroomsGame;
  const room = { state: 'active', firstTry: true, cell: { c: 1, r: 1 }, lockUntil: 0 };
  const q = { id: 'q1', options: ['Incorrecta', 'Correcta'], correct: 1, feedback: 'Explicación' };
  const state = {
    mode: 'question', question: { q, room }, activity: { settings: { showFeedback } },
    pendingAnswer: null, answerFeedback: null, keys: new Set(['KeyW']),
    fragments: 0, fragmentsNeeded: 2, correctN: 0, firstTryN: 0, wrongN: 0,
    streak: 0, bestStreak: 0, score: 0, t: 0, halfW: 0, halfH: 0,
    cfg: { lock: 10, grace: 2 }, maze: { solid: Array.from({ length: 3 }, () => [false, false, false]) },
    audio: { correct: vi.fn(), pickup: vi.fn(), wrong: vi.fn(), slam: vi.fn() },
    recordAnswer: vi.fn(), grantBoost: vi.fn(), updateRoomVisual: vi.fn(),
    flash: vi.fn(), toast: vi.fn(), openExit: vi.fn(), lock: vi.fn(), unlock: vi.fn(),
    emit: vi.fn(), isRoomCell: () => false,
  };
  Object.assign(game, state);
  return { game, state: game as unknown as typeof state, room, q };
}

describe('Backrooms answer progression', () => {
  it('continues after a correct answer exactly once and allows another question', () => {
    const { game, state, room, q } = questionGame(true);
    game.answer(1, 'touch');
    game.answer(1, 'touch');
    expect(state.mode).toBe('feedback');
    expect(state.recordAnswer).toHaveBeenCalledTimes(1);
    game.continueAfterAnswer('touch');
    game.continueAfterAnswer('touch');
    expect(state.mode).toBe('play');
    expect(state.question).toBeNull();
    expect(room.state).toBe('done');
    expect(state.fragments).toBe(1);
    expect(state.keys.size).toBe(0);
    state.mode = 'question';
    state.question = { q, room: { ...room, state: 'active' } };
    game.answer(1, 'touch');
    game.continueAfterAnswer('touch');
    expect(state.fragments).toBe(2);
    expect(state.openExit).toHaveBeenCalledTimes(1);
  });

  it('returns to exploration after a wrong answer and locks only that room', () => {
    const { game, state, room } = questionGame(true);
    game.answer(0, 'touch');
    game.continueAfterAnswer('touch');
    expect(state.mode).toBe('play');
    expect(state.question).toBeNull();
    expect(room.state).toBe('locked');
    expect(room.lockUntil).toBe(10);
    expect(state.wrongN).toBe(1);
    expect(state.keys.size).toBe(0);
  });

  it('advances directly when feedback is disabled', () => {
    const { game, state, room } = questionGame(false);
    game.answer(1, 'touch');
    expect(state.mode).toBe('play');
    expect(state.question).toBeNull();
    expect(room.state).toBe('done');
    expect(state.lock).toHaveBeenCalledTimes(1);
  });

  it('ignores an out-of-range numeric shortcut instead of penalizing the student', () => {
    const { game, state } = questionGame(true);
    game.answer(8);
    expect(state.mode).toBe('question');
    expect(state.recordAnswer).not.toHaveBeenCalled();
  });
});
