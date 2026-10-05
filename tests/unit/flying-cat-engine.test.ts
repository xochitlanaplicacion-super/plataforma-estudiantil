import { describe, expect, it } from 'vitest';
import {
  answerFlight, createFlight, emptyFlightControls, flightDifficulty, flightResult,
  moveFlightPlayer, pauseFlight, resizeFlight, resumeFlight, stepFlight,
  MAX_FLIGHT_OBSTACLES, IMPACT_ANIMATION_SECONDS, RESUME_IMMUNITY_SECONDS,
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
  it.each([[360, 400], [568, 156], [1024, 500]])('uses explicit phone sizing without changing tablet or desktop sizing in a %sx%s arena', (width, height) => {
    const normal = createFlight(content, width, height, rng);
    const phone = createFlight(content, width, height, rng, true);
    expect(normal.compactPilot).toBe(false);
    expect(phone.compactPilot).toBe(true);
    expect(normal.player.width).toBe(Math.max(90, Math.min(136, width * 0.22)));
    expect(phone.player.width).toBe(Math.max(64, Math.min(96, width * 0.16)));
    expect(phone.player.width / normal.player.width).toBeGreaterThanOrEqual(0.7);
    expect(phone.player.width / normal.player.width).toBeLessThanOrEqual(0.75);
    expect(phone.player.height).toBe(phone.player.width * (230 / 340));
    expect(phone.questions).toEqual(normal.questions);
    expect(phone.immunity).toBe(normal.immunity);
  });

  it('retains compact sizing through phone rotation and keeps the entire pilot inside narrow arenas', () => {
    const state = createFlight(content, 360, 400, rng, true);
    for (const [width, height] of [[568, 156], [180, 100], [1024, 500], [360, 400]]) {
      moveFlightPlayer(state, state.width, state.height);
      resizeFlight(state, width, height);
      expect(state.compactPilot).toBe(true);
      expect(state.player.width).toBe(Math.max(64, Math.min(96, width * 0.16)));
      expect(state.player.height).toBe(state.player.width * (230 / 340));
      expect(state.player.x - state.player.width / 2).toBeGreaterThanOrEqual(3);
      expect(state.player.x + state.player.width / 2).toBeLessThanOrEqual(width - 3);
      expect(state.player.y - state.player.height / 2).toBeGreaterThanOrEqual(3);
      expect(state.player.y + state.player.height / 2).toBeLessThanOrEqual(height - 3);
    }
  });

  it('can change the explicit size mode mid-flight without changing timers, academic history or active controls', () => {
    const state = createFlight(content, 568, 156, rng);
    resumeFlight(state);
    answerFlight(state, state.questions[0].correctIndex);
    resumeFlight(state);
    resumeFlight(state);
    state.cardDelay = 100;
    state.obstacleDelay = 100;
    stepFlight(state, 0.05, { ...emptyFlightControls(), right: true }, rng);
    const result = flightResult(state);
    const playerPosition = { x: state.player.x, y: state.player.y };
    const immunity = state.immunity;
    state.compactPilot = true;
    resizeFlight(state, 568, 156);
    expect(state.player.width).toBeCloseTo(90.88);
    expect({ x: state.player.x, y: state.player.y }).toEqual(playerPosition);
    expect(state.mode).toBe('flying');
    expect(state.immunity).toBe(immunity);
    expect(flightResult(state)).toEqual(result);
    const x = state.player.x;
    stepFlight(state, 0.05, { ...emptyFlightControls(), right: true }, rng);
    expect(state.player.x).toBeGreaterThan(x);
    state.compactPilot = false;
    resizeFlight(state, 568, 156);
    expect(state.player.width).toBeCloseTo(124.96);
    expect(state.mode).toBe('flying');
    expect(state.answers).toEqual(result.answers);
    expect(state.hits).toBe(result.hits);
    expect(state.wrongAttempts).toBe(result.wrongAttempts);
  });

  it('preserves answer traces and frame-based movement across normal and compact pilots', () => {
    const normal = createFlight(content, 568, 320, rng);
    const compact = createFlight(content, 568, 320, rng, true);
    for (const state of [normal, compact]) {
      resumeFlight(state);
      state.obstacleDelay = 100;
      state.cardDelay = 100;
      stepFlight(state, 0.05, { ...emptyFlightControls(), right: true, up: true }, rng);
      answerFlight(state, state.questions[0].correctIndex);
    }
    expect({ x: compact.player.x, y: compact.player.y }).toEqual({ x: normal.player.x, y: normal.player.y });
    expect(compact.immunity).toBe(normal.immunity);
    expect(flightResult(compact)).toEqual(flightResult(normal));
  });

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
    expect(state.obstacles.length).toBeLessThanOrEqual(flightDifficulty(state).maximumObstacles);
    resizeFlight(state, 1000, 600);
    expect(state.player.x).toBeGreaterThanOrEqual(state.player.width / 2);
    expect(state.player.width).toBeLessThanOrEqual(136);
  });

  it('already shows several obstacles on easy, with more capacity and shorter intervals on normal and hard', () => {
    const maxima: number[] = [];
    const intervals: number[] = [];
    for (const difficulty of ['easy', 'normal', 'hard'] as const) {
      const state = createFlight({ ...content, settings: { difficulty } }, 360, 400, rng);
      resumeFlight(state);
      state.cardDelay = 1000;
      state.immunity = 1000;
      let peak = 0;
      for (let index = 0; index < 800; index++) {
        stepFlight(state, 0.05, emptyFlightControls(), rng);
        peak = Math.max(peak, state.obstacles.length);
        expect(state.obstacles.length).toBeLessThanOrEqual(flightDifficulty(state).maximumObstacles);
        expect(state.obstacles.length).toBeLessThanOrEqual(MAX_FLIGHT_OBSTACLES);
      }
      expect(peak).toBe(flightDifficulty(state).maximumObstacles);
      expect(state.obstacles.every((obstacle) => obstacle.width >= 42 && obstacle.height >= 44)).toBe(true);
      maxima.push(peak);
      intervals.push(flightDifficulty(state).obstacleInterval);
    }
    expect(maxima).toEqual([4, 6, 8]);
    expect(intervals[0]).toBeGreaterThan(intervals[1]);
    expect(intervals[1]).toBeGreaterThan(intervals[2]);
  });

  it.each([[180, 100], [240, 170], [360, 320], [1000, 600]])('always leaves a reachable centre and clear answer approach in a %sx%s arena', (width, height) => {
    const state = createFlight({ ...content, settings: { difficulty: 'hard' } }, width, height, rng);
    resumeFlight(state);
    state.immunity = 1000;
    state.cardDelay = 1000;
    tick(state, 15);
    // Force several new cards while existing obstacles are on screen. The
    // answer lane must be clear before the card is introduced, not by teleporting.
    for (const sample of [0, 0.15, 0.5, 0.85, 0.999999]) {
      state.card = null; state.cardDelay = 0;
      stepFlight(state, 0.01, emptyFlightControls(), () => sample);
      expect(state.card).not.toBeNull();
      expect(state.card!.y).toBeGreaterThanOrEqual(state.player.height / 2 + 3);
      expect(state.card!.y).toBeLessThanOrEqual(state.height - state.player.height / 2 - 3);
      for (const obstacle of state.obstacles) {
        const collisionRadius = state.player.height * 0.25 + obstacle.height * 0.4;
        expect(Math.abs(obstacle.y - state.height / 2)).toBeGreaterThan(collisionRadius);
        expect(Math.abs(obstacle.y - state.card!.y)).toBeGreaterThan(collisionRadius);
      }
      expect(state.obstacles.length).toBeLessThanOrEqual(MAX_FLIGHT_OBSTACLES);
    }
    resizeFlight(state, 180, 100);
    for (const obstacle of state.obstacles) {
      const collisionRadius = state.player.height * 0.25 + obstacle.height * 0.4;
      expect(Math.abs(obstacle.y - state.height / 2)).toBeGreaterThan(collisionRadius);
      expect(Math.abs(obstacle.y - state.card!.y)).toBeGreaterThan(collisionRadius);
    }
    expect(state.obstacles.length).toBeLessThanOrEqual(flightDifficulty(state).maximumObstacles);
  });

  it('reacts once to a nonfatal impact, freezes physics, then starts the full shield after the reaction', () => {
    const state = createFlight(content, 390, 420, rng);
    resumeFlight(state);
    state.immunity = 0;
    state.obstacleDelay = 100;
    state.cardDelay = 100;
    state.obstacles = [1, 2].map((id) => ({ ...state.player, width: 44, height: 44, kind: 0, id, speed: 0 }));
    stepFlight(state, 0.01, emptyFlightControls(), rng);
    expect(state.lives).toBe(2);
    expect(state.impactSerial).toBe(1);
    expect(state.impactSeconds).toBe(IMPACT_ANIMATION_SECONDS);
    expect(state.immunity).toBe(0);
    const player = { ...state.player };
    const obstacles = state.obstacles.map((obstacle) => ({ ...obstacle }));
    const cardDelay = state.cardDelay;
    stepFlight(state, 0.05, { ...emptyFlightControls(), right: true, down: true }, rng);
    answerFlight(state, state.questions[0].correctIndex);
    expect(state.player).toEqual(player);
    expect(state.obstacles).toEqual(obstacles);
    expect(state.cardDelay).toBe(cardDelay);
    expect(state.answers).toHaveLength(0);
    expect(state.impactSerial).toBe(1);
    expect(state.lives).toBe(2);
    expect(state.immunity).toBe(0);
    for (let index = 0; index < 20 && state.impactSeconds > 0; index++) stepFlight(state, 0.05, emptyFlightControls(), rng);
    expect(state.impactSeconds).toBe(0);
    expect(state.immunity).toBe(RESUME_IMMUNITY_SECONDS);
    tick(state, 2);
    expect(state.lives).toBe(2);
    expect(state.impactSerial).toBe(1);
    state.immunity = 0;
    stepFlight(state, 0.01, emptyFlightControls(), rng);
    expect(state.lives).toBe(1);
    expect(state.impactSerial).toBe(2);
    expect(state.impactSeconds).toBe(IMPACT_ANIMATION_SECONDS);
  });

  it('pauses the impact timer and cannot grant immunity early when resuming a reaction', () => {
    const state = createFlight(content, 360, 400, rng);
    resumeFlight(state);
    state.immunity = 0; state.obstacleDelay = 100; state.cardDelay = 100;
    state.obstacles = [{ ...state.player, kind: 0, id: 1, speed: 0 }];
    stepFlight(state, 0.01, emptyFlightControls(), rng);
    pauseFlight(state);
    const seconds = state.impactSeconds;
    tick(state, 5);
    expect(state.impactSeconds).toBe(seconds);
    resumeFlight(state);
    expect(state.immunity).toBe(0);
    expect(state.impactSeconds).toBe(seconds);
    for (let index = 0; index < 20 && state.impactSeconds > 0; index++) stepFlight(state, 0.05, emptyFlightControls(), rng);
    expect(state.immunity).toBe(RESUME_IMMUNITY_SECONDS);
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
    expect(state.impactSeconds).toBe(0);
    expect(state.impactSerial).toBe(0);
    expect(state.immunity).toBe(0);
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
