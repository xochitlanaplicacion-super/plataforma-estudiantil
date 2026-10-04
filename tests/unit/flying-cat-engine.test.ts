import { describe, expect, it } from 'vitest';
import {
  answerFlight, createFlight, emptyFlightControls, flightDifficulty, flightResult,
  moveFlightPlayer, pauseFlight, resizeFlight, resumeFlight, stepFlight,
} from '@/lib/activities/flying-cat-engine';
import type { FlyingCatContent } from '@/lib/activities/flying-cat';

const content: FlyingCatContent = {
  version: 1, instructions: 'Pilota al concepto correcto.', showFeedback: true,
  settings: { difficulty: 'normal' },
  items: Array.from({ length: 8 }, (_, index) => ({
    id: `q${index}`, prompt: `Una persona capacitada que maneja aviones y transporta viajeros. Caso ${index}.`,
    options: ['Pilot', 'Doctor', 'Teacher', 'Farmer'], correctIndex: 0,
    feedback: 'El piloto maneja aviones; las otras profesiones trabajan en otros lugares.',
  })),
};
const rng = () => 0.4;
const tick = (state: ReturnType<typeof createFlight>, seconds: number) => {
  for (let i = 0; i < seconds * 20; i++) stepFlight(state, 0.05, emptyFlightControls(), rng);
};

describe('Flying Cat mobile-first flight loop', () => {
  it('stays still until the definition is read and offers full three second obstacle immunity', () => {
    const state = createFlight(content, 360, 400, rng);
    tick(state, 10);
    expect(state.activeSeconds).toBe(0);
    resumeFlight(state);
    expect(state.immunity).toBe(3);
    state.obstacleDelay = 100;
    state.obstacles.push({ ...state.player, kind: 0, id: 1, speed: 0 });
    tick(state, 2);
    expect(state.lives).toBe(3);
    tick(state, 2);
    expect(state.lives).toBe(2);
  });

  it('only exposes one compact concept and recycles options instead of leaving a question impossible', () => {
    const state = createFlight(content, 320, 380, rng);
    resumeFlight(state);
    state.obstacleDelay = 1000;
    moveFlightPlayer(state, 40, 350);
    const seen = new Set<number>();
    for (let i = 0; i < 1300; i++) {
      stepFlight(state, 0.05, emptyFlightControls(), rng);
      if (state.card) {
        expect(state.card.width).toBeLessThanOrEqual(128);
        expect(state.card.height).toBe(44);
        seen.add(state.card.index);
      }
    }
    expect(seen.size).toBe(4);
    expect(state.questionIndex).toBe(0);
    expect(state.mode).toBe('flying');
  });

  it('pauses for either correct or wrong explanation, records once despite repeated collision and advances safely', () => {
    const state = createFlight(content, 390, 420, rng);
    resumeFlight(state);
    const first = state.questions[0];
    answerFlight(state, first.correctIndex);
    answerFlight(state, first.correctIndex);
    tick(state, 10);
    expect(state.answers).toHaveLength(1);
    expect(state.hits).toBe(1);
    expect(state.mode).toBe('feedback');
    expect(state.activeSeconds).toBe(0);
    resumeFlight(state);
    expect(state.mode).toBe('reading');
    expect(state.questionIndex).toBe(1);
    expect(state.obstacles).toHaveLength(0);
    resumeFlight(state);
    answerFlight(state, (state.questions[1].correctIndex + 1) % 4);
    expect(state.mode).toBe('feedback');
    expect(state.wrongAttempts).toBe(1);
    expect(state.feedback?.isCorrect).toBe(false);
  });

  it('restores controls after pauses, freezes timers, and gives immunity even with old obstacles on screen', () => {
    const state = createFlight(content, 360, 400, rng);
    resumeFlight(state);
    tick(state, 1);
    pauseFlight(state);
    const before = state.activeSeconds;
    tick(state, 20);
    expect(state.activeSeconds).toBe(before);
    resumeFlight(state);
    expect(state.mode).toBe('flying');
    expect(state.immunity).toBe(3);
    const x = state.player.x;
    stepFlight(state, 0.05, { ...emptyFlightControls(), right: true }, rng);
    expect(state.player.x).toBeGreaterThan(x);
  });

  it('bounds obstacle counts, card sizes and speeds across levels and sizes', () => {
    const state = createFlight(content, 360, 320, rng);
    const start = flightDifficulty(state);
    state.questionIndex = 6;
    expect(flightDifficulty(state).cardSpeed).toBeGreaterThan(start.cardSpeed);
    expect(flightDifficulty(state).obstacleSpeed).toBeGreaterThan(start.obstacleSpeed);
    resumeFlight(state);
    state.immunity = 1000;
    tick(state, 120);
    expect(state.obstacles.length).toBeLessThanOrEqual(2);
    resizeFlight(state, 1000, 600);
    expect(state.player.x).toBeGreaterThanOrEqual(state.player.width / 2);
    expect(state.player.width).toBeLessThanOrEqual(136);
  });

  it('saves full academic denominator even when a flight ends before answering everything', () => {
    const state = createFlight(content, 360, 400, rng);
    resumeFlight(state);
    answerFlight(state, state.questions[0].correctIndex);
    const result = flightResult(state);
    expect(result.hits).toBe(1);
    expect(result.total).toBe(8);
    expect(result.answers[0].selectedAnswer).toBe('Pilot');
    expect(content.items[0].correctIndex).toBe(0);
    expect(content.items[0].options).toEqual(['Pilot', 'Doctor', 'Teacher', 'Farmer']);
  });

  it('shows a protected crash sequence after the third hit before allowing the final result', () => {
    const state = createFlight(content, 390, 420, rng);
    resumeFlight(state);
    state.lives = 1;
    state.immunity = 0;
    state.obstacleDelay = 100;
    state.obstacles = [{ ...state.player, kind: 0, id: 1, speed: 0 }];
    stepFlight(state, 0.01, emptyFlightControls(), rng);
    expect(state.lives).toBe(0);
    expect(state.mode).toBe('crashing');
    expect(state.card).toBeNull();
    answerFlight(state, 0);
    resumeFlight(state);
    expect(state.answers).toHaveLength(0);
    expect(state.mode).toBe('crashing');
    tick(state, 2);
    expect(state.mode).toBe('crashing');
    tick(state, 1);
    expect(state.mode).toBe('finished');
    expect(flightResult(state).total).toBe(content.items.length);
  });
});
