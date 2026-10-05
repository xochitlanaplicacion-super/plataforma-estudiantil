import { describe, expect, it } from 'vitest';
import type { FlyingCatContent } from '@/lib/activities/flying-cat';
import {
  activateFlightBonus, answerFlight, createFlight, emptyFlightControls, flightDifficulty, flightResult,
  grantFlightBonus, pauseFlight, resizeFlight, resumeFlight, stepFlight,
  FLIGHT_BONUS_KINDS, LIGHTNING_ANIMATION_SECONDS, MAX_FLIGHT_BONUSES, MAX_FLIGHT_LIVES,
  MAX_FLIGHT_OBSTACLES, SLOW_TIME_FACTOR, SLOW_TIME_SECONDS,
  type FlightBonusKind, type FlightState,
} from '@/lib/activities/flying-cat-engine';

const content: FlyingCatContent = {
  version: 1, instructions: 'Lee, pilota y selecciona el concepto correcto.', showFeedback: true,
  settings: { difficulty: 'normal' },
  items: Array.from({ length: 12 }, (_, index) => ({
    id: `question-${index}`, prompt: `Transporta pasajeros a través del cielo. Caso ${index}.`,
    options: ['Pilot', 'Teacher', 'Farmer', 'Doctor'], correctIndex: 0,
    feedback: 'El piloto conduce un avión.',
  })),
};
const random = () => 0.4;
const fixture = () => {
  const state = createFlight(content, 800, 450, random);
  resumeFlight(state);
  state.cardDelay = 1000;
  state.obstacleDelay = 1000;
  state.immunity = 1000;
  return state;
};
const tick = (state: FlightState, seconds: number) => {
  for (let frame = 0; frame < Math.round(seconds * 20); frame++) stepFlight(state, 0.05, emptyFlightControls(), random);
};
const award = (state: FlightState, kind: FlightBonusKind) => {
  const index = FLIGHT_BONUS_KINDS.indexOf(kind);
  return grantFlightBonus(state, () => (index + 0.5) / FLIGHT_BONUS_KINDS.length)!;
};
const nextQuestion = (state: FlightState) => { resumeFlight(state); resumeFlight(state); };

describe('Flying Cat earned prizes', () => {
  it.each(FLIGHT_BONUS_KINDS)('awards %s only after a correct answer and records the original academic answer once', (kind) => {
    const state = fixture();
    const question = state.questions[0];
    const draw = () => (FLIGHT_BONUS_KINDS.indexOf(kind) + 0.5) / FLIGHT_BONUS_KINDS.length;
    answerFlight(state, question.correctIndex, draw);
    answerFlight(state, question.correctIndex, draw);
    expect(state.bonuses).toEqual([{ id: 1, kind }, null]);
    expect(state.hits).toBe(1);
    expect(state.wrongAttempts).toBe(0);
    expect(state.answers).toHaveLength(1);
    expect(state.answers[0]).toMatchObject({ questionId: question.id, isCorrect: true, attemptNumber: 1 });
    expect(flightResult(state).total).toBe(content.items.length);
  });

  it('never awards a prize for an incorrect answer or an invalid/repeated answer', () => {
    const state = fixture();
    answerFlight(state, -1, random);
    answerFlight(state, NaN, random);
    answerFlight(state, state.questions[0].options.length, random);
    expect(state.bonuses).toEqual([null, null]);
    answerFlight(state, (state.questions[0].correctIndex + 1) % 4, random);
    answerFlight(state, state.questions[0].correctIndex, random);
    expect(state.bonuses).toEqual([null, null]);
    expect(state.bonusSerial).toBe(0);
    expect(state.hits).toBe(0);
    expect(state.wrongAttempts).toBe(1);
    expect(state.answers).toHaveLength(1);
  });

  it('retains both prizes when inventory is full and assigns unique identities after a slot becomes available', () => {
    const state = fixture();
    for (let index = 0; index < 3; index++) {
      answerFlight(state, state.questions[state.questionIndex].correctIndex, () => 0);
      nextQuestion(state);
    }
    expect(state.bonuses).toEqual([{ id: 1, kind: 'extra_life' }, { id: 2, kind: 'extra_life' }]);
    expect(state.bonuses).toHaveLength(MAX_FLIGHT_BONUSES);
    expect(state.bonusSerial).toBe(2);
    expect(activateFlightBonus(state, 0, 1)).toBe(true);
    answerFlight(state, state.questions[state.questionIndex].correctIndex, () => 0.9);
    expect(state.bonuses.map((bonus) => bonus?.id)).toEqual([3, 2]);
    expect(state.bonuses[0]!.kind).toBe('reveal');
    expect(state.hits).toBe(4);
  });

  it.each([NaN, Infinity, -Infinity, -7, 2, 1])('sanitizes a malformed random draw (%s) without invalid prizes', (draw) => {
    const state = fixture();
    answerFlight(state, state.questions[0].correctIndex, () => draw);
    expect(state.bonuses.filter(Boolean)).toHaveLength(1);
    expect(FLIGHT_BONUS_KINDS).toContain(state.bonuses[0]!.kind);
  });

  it('keeps E/R positions fixed and rejects stale double-clicks or repeated same-slot events', () => {
    const state = fixture();
    const first = award(state, 'slow_time');
    const second = award(state, 'extra_life');
    expect(activateFlightBonus(state, 0, first.id)).toBe(true);
    expect(activateFlightBonus(state, 0, first.id)).toBe(false);
    expect(activateFlightBonus(state, 0)).toBe(false);
    expect(state.bonuses).toEqual([null, second]);
    expect(state.lives).toBe(3);
    // E and R are independent, even when both are pressed in one frame.
    expect(activateFlightBonus(state, 1, second.id)).toBe(true);
    expect(state.lives).toBe(4);
    const replacement = award(state, 'extra_life');
    expect(activateFlightBonus(state, 0, replacement.id)).toBe(false);
    stepFlight(state, 0.05, emptyFlightControls(), random);
    expect(activateFlightBonus(state, 0, first.id)).toBe(false);
    expect(activateFlightBonus(state, 0, replacement.id)).toBe(true);
    expect(state.lives).toBe(5);
    expect(state.bonuses).toEqual([null, null]);
  });

  it.each(['reading', 'feedback', 'paused', 'crashing', 'finished'] as const)('does not activate or consume a prize while %s', (mode) => {
    const state = fixture();
    const bonus = award(state, 'extra_life');
    state.mode = mode;
    expect(activateFlightBonus(state, 0, bonus.id)).toBe(false);
    expect(state.bonuses).toEqual([bonus, null]);
    expect(state.lives).toBe(3);
  });

  it('does not activate a prize during a collision reaction or accept nonexistent slots', () => {
    const state = fixture();
    const bonus = award(state, 'extra_life');
    state.impactSeconds = 0.3;
    expect(activateFlightBonus(state, 0, bonus.id)).toBe(false);
    state.impactSeconds = 0;
    expect(activateFlightBonus(state, 1)).toBe(false);
    expect(activateFlightBonus(state, 2 as 0)).toBe(false);
    expect(state.bonuses).toEqual([bonus, null]);
  });

  it('adds one life up to five without changing academic evidence, and never wastes a life at the cap', () => {
    const state = fixture();
    state.lives = MAX_FLIGHT_LIVES - 1;
    const before = flightResult(state);
    const first = award(state, 'extra_life');
    expect(activateFlightBonus(state, 0, first.id)).toBe(true);
    expect(state.lives).toBe(MAX_FLIGHT_LIVES);
    expect(flightResult(state)).toEqual(before);
    const second = award(state, 'extra_life');
    stepFlight(state, 0.05, emptyFlightControls(), random);
    expect(activateFlightBonus(state, 0, second.id)).toBe(false);
    expect(state.bonuses).toEqual([second, null]);
    expect(state.lives).toBe(MAX_FLIGHT_LIVES);
  });

  it('slows scenery, existing obstacles, new cards and spawn delays equally without slowing the pilot', () => {
    const normal = fixture();
    const slow = fixture();
    for (const state of [normal, slow]) {
      state.card = { index: 0, text: 'Pilot', x: 700, y: 60, width: 100, height: 44 };
      state.obstacles = [{ id: 1, kind: 0, x: 680, y: 380, width: 44, height: 44, speed: 120 }];
    }
    const previousDifficulty = flightDifficulty(normal);
    const bonus = award(slow, 'slow_time');
    expect(activateFlightBonus(slow, 0, bonus.id)).toBe(true);
    expect(flightDifficulty(slow).worldSpeedFactor).toBe(SLOW_TIME_FACTOR);
    expect(flightDifficulty(slow).cardSpeed / previousDifficulty.cardSpeed).toBe(SLOW_TIME_FACTOR);
    expect(flightDifficulty(slow).obstacleSpeed / previousDifficulty.obstacleSpeed).toBe(SLOW_TIME_FACTOR);
    expect(flightDifficulty(slow).landscapeSpeedFactor / previousDifficulty.landscapeSpeedFactor).toBe(SLOW_TIME_FACTOR);
    const controls = { ...emptyFlightControls(), right: true, down: true };
    for (const state of [normal, slow]) stepFlight(state, 0.05, controls, random);
    expect(slow.player).toEqual(normal.player);
    expect((700 - slow.card!.x) / (700 - normal.card!.x)).toBeCloseTo(SLOW_TIME_FACTOR);
    expect((680 - slow.obstacles[0].x) / (680 - normal.obstacles[0].x)).toBeCloseTo(SLOW_TIME_FACTOR);
    expect((1000 - slow.obstacleDelay) / (1000 - normal.obstacleDelay)).toBeCloseTo(SLOW_TIME_FACTOR);
  });

  it('applies slowing to newly spawned obstacles but restores their original speed after expiry', () => {
    const state = fixture();
    award(state, 'slow_time');
    activateFlightBonus(state, 0);
    state.obstacleDelay = 0;
    stepFlight(state, 0.05, emptyFlightControls(), random);
    expect(state.obstacles).toHaveLength(1);
    const obstacle = state.obstacles[0];
    const speed = obstacle.speed;
    const initial = obstacle.x;
    stepFlight(state, 0.05, emptyFlightControls(), random);
    expect(initial - obstacle.x).toBeCloseTo(speed * 0.05 * SLOW_TIME_FACTOR);
    state.slowSeconds = 0;
    const after = obstacle.x;
    stepFlight(state, 0.05, emptyFlightControls(), random);
    expect(after - obstacle.x).toBeCloseTo(speed * 0.05);
  });

  it('expires slowing after eight active flight seconds and freezes it during every nonplaying state and impact', () => {
    const state = fixture();
    award(state, 'slow_time');
    activateFlightBonus(state, 0);
    tick(state, 2);
    expect(state.slowSeconds).toBeCloseTo(SLOW_TIME_SECONDS - 2);
    pauseFlight(state);
    tick(state, 20);
    expect(state.slowSeconds).toBeCloseTo(6);
    resumeFlight(state);
    state.impactSeconds = 0.5;
    tick(state, 0.4);
    expect(state.slowSeconds).toBeCloseTo(6);
    state.impactSeconds = 0;
    for (const mode of ['reading', 'feedback', 'crashing', 'finished'] as const) {
      state.mode = mode;
      tick(state, 0.5);
      expect(state.slowSeconds).toBeCloseTo(6);
    }
    state.mode = 'flying';
    tick(state, 6);
    expect(state.slowSeconds).toBe(0);
    expect(flightDifficulty(state).worldSpeedFactor).toBe(1);
  });

  it.each([['points_x2', 2], ['points_x3', 3]] as const)('%s multiplies only arcade points on the next correct answer, never academic hits or grades', (kind, multiplier) => {
    const state = fixture();
    award(state, kind);
    activateFlightBonus(state, 0);
    answerFlight(state, (state.questions[0].correctIndex + 1) % 4, random);
    expect(state.scoreMultiplier).toBe(multiplier);
    expect(state.score).toBe(0);
    nextQuestion(state);
    answerFlight(state, state.questions[1].correctIndex, random);
    expect(state.score).toBe((100 + 3 * 20) * multiplier);
    expect(state.scoreMultiplier).toBe(1);
    expect(flightResult(state)).toMatchObject({ hits: 1, total: 12, wrongAttempts: 1 });
    nextQuestion(state);
    answerFlight(state, state.questions[2].correctIndex, random);
    expect(state.score).toBe((100 + 3 * 20) * (multiplier + 1));
    expect(flightResult(state).hits).toBe(2);
    expect(state.answers.map((answer) => answer.isCorrect)).toEqual([false, true, true]);
  });

  it('replaces rather than stacks a second multiplier and retains it across a pause', () => {
    const state = fixture();
    award(state, 'points_x3');
    activateFlightBonus(state, 0);
    stepFlight(state, 0.05, emptyFlightControls(), random);
    award(state, 'points_x2');
    activateFlightBonus(state, 0);
    expect(state.scoreMultiplier).toBe(2);
    pauseFlight(state);
    tick(state, 10);
    expect(state.scoreMultiplier).toBe(2);
    resumeFlight(state);
    answerFlight(state, state.questions[0].correctIndex, random);
    expect(state.score).toBe(320);
    expect(state.hits).toBe(1);
  });

  it('lightning immediately removes all collisions, preserves the active answer and creates bounded falling debris', () => {
    const state = fixture();
    state.immunity = 0;
    state.card = { index: state.questions[0].correctIndex, text: 'Pilot', x: 700, y: 60, width: 100, height: 44 };
    state.obstacles = Array.from({ length: MAX_FLIGHT_OBSTACLES }, (_, index) => ({
      ...state.player, id: index + 1, kind: index % 3, speed: 100,
    }));
    const before = flightResult(state);
    const card = { ...state.card };
    award(state, 'lightning');
    expect(activateFlightBonus(state, 0)).toBe(true);
    expect(state.obstacles).toEqual([]);
    expect(state.debris).toHaveLength(MAX_FLIGHT_OBSTACLES);
    expect(state.lightningSeconds).toBe(LIGHTNING_ANIMATION_SECONDS);
    expect(state.lightningSerial).toBe(1);
    expect(state.lightningQuestionIndex).toBe(0);
    expect(state.card).toEqual(card);
    const y = state.debris[0].y;
    stepFlight(state, 0.05, emptyFlightControls(), random);
    expect(state.debris[0].y).toBeGreaterThan(y);
    expect(state.debris[0].rotation).not.toBe(0);
    expect(state.debris[1].rotation).toBeLessThan(0);
    expect(state.lives).toBe(3);
    expect(state.hits).toBe(before.hits);
    expect(state.answers).toEqual(before.answers);
    expect(state.obstacles).toEqual([]);
    state.obstacleDelay = 1000;
    tick(state, 1);
    expect(state.debris).toEqual([]);
    expect(state.lightningSeconds).toBe(0);
    expect(state.lightningQuestionIndex).toBe(0);
  });

  it('lightning retires a false card without answering and spawns only the true concept until this question is answered', () => {
    const state = fixture();
    const correctIndex = state.questions[0].correctIndex;
    state.player.y = state.height - state.player.height / 2 - 3;
    state.card = {
      index: (correctIndex + 1) % 4, text: 'A distractor', x: 700, y: 60, width: 100, height: 44,
    };
    const before = flightResult(state);
    award(state, 'lightning');
    activateFlightBonus(state, 0);
    expect(state.card).toBeNull();
    expect(state.nextOption).toBe(correctIndex);
    expect(state.cardDelay).toBe(0.15);
    expect(state.lightningQuestionIndex).toBe(0);
    expect(flightResult(state)).toEqual(before);
    const seen = new Set<number>();
    for (let frame = 0; frame < 500; frame++) {
      stepFlight(state, 0.05, emptyFlightControls(), () => 0.1);
      if (state.card) seen.add(state.card.index);
    }
    expect(seen).toEqual(new Set([correctIndex]));
    expect(state.nextOption).toBeGreaterThan(correctIndex + 1);
    expect(state.questionIndex).toBe(0);
    expect(state.mode).toBe('flying');
    expect(state.answers).toEqual([]);
    expect(state.hits).toBe(0);
    expect(state.score).toBe(0);
    expect(state.lightningSeconds).toBe(0);
    expect(state.lightningQuestionIndex).toBe(0);

    answerFlight(state, correctIndex, random);
    expect(state.lightningQuestionIndex).toBeNull();
    expect(state.hits).toBe(1);
    expect(state.answers).toHaveLength(1);
    nextQuestion(state);
    state.obstacleDelay = 1000;
    // Force four harmless offscreen passes: following questions must again
    // offer every option, not inherit the previous definition's prize.
    const nextSeen = new Set<number>();
    for (let pass = 0; pass < 4; pass++) {
      state.card = null;
      state.cardDelay = 0;
      stepFlight(state, 0.01, emptyFlightControls(), () => 0.1);
      expect(state.card).not.toBeNull();
      nextSeen.add(state.card!.index);
    }
    expect(nextSeen).toEqual(new Set([0, 1, 2, 3]));
    expect(state.questionIndex).toBe(1);
    expect(state.hits).toBe(1);
  });

  it('freezes lightning and debris during pause and never accumulates fragments across repeated activations', () => {
    const state = fixture();
    for (let activation = 0; activation < 12; activation++) {
      state.obstacles = Array.from({ length: MAX_FLIGHT_OBSTACLES + 3 }, (_, index) => ({
        id: 100 * activation + index, kind: index % 3, x: 650, y: 80, width: 44, height: 44, speed: 100,
      }));
      award(state, 'lightning');
      expect(activateFlightBonus(state, 0)).toBe(true);
      expect(state.debris).toHaveLength(MAX_FLIGHT_OBSTACLES);
      const before = state.debris.map((fragment) => ({ ...fragment }));
      const time = state.lightningSeconds;
      pauseFlight(state);
      tick(state, 2);
      expect(state.debris).toEqual(before);
      expect(state.lightningSeconds).toBe(time);
      resumeFlight(state);
      stepFlight(state, 0.05, emptyFlightControls(), random);
    }
    expect(state.lightningSerial).toBe(12);
    expect(state.debris.length).toBeLessThanOrEqual(MAX_FLIGHT_OBSTACLES);
    expect(state.lives).toBe(3);
    resizeFlight(state, 500, 250);
    expect(state.debris.every((fragment) => Number.isFinite(fragment.x) && Number.isFinite(fragment.y))).toBe(true);
    state.obstacleDelay = 1000;
    tick(state, 1);
    expect(state.debris).toEqual([]);
  });

  it('reveals only the current correct concept without auto-answering or changing its identity', () => {
    const state = fixture();
    const before = flightResult(state);
    const questions = state.questions.map((question) => ({ ...question, options: [...question.options] }));
    award(state, 'reveal');
    activateFlightBonus(state, 0);
    expect(state.revealQuestionIndex).toBe(0);
    expect(flightResult(state)).toEqual(before);
    expect(state.questions).toEqual(questions);
    pauseFlight(state);
    tick(state, 10);
    expect(state.revealQuestionIndex).toBe(0);
    resumeFlight(state);
    answerFlight(state, state.questions[0].correctIndex, random);
    expect(state.revealQuestionIndex).toBeNull();
    nextQuestion(state);
    expect(state.questionIndex).toBe(1);
    expect(state.revealQuestionIndex).toBeNull();
  });
});

describe('Flying Cat analogue joystick input', () => {
  it('retains gentle analogue speed, caps diagonals, and does not change keyboard movement', () => {
    const keyboard = fixture();
    const gentle = fixture();
    const diagonal = fixture();
    const x = keyboard.player.x;
    stepFlight(keyboard, 0.05, { ...emptyFlightControls(), right: true }, random);
    stepFlight(gentle, 0.05, { ...emptyFlightControls(), axisX: 0.25, axisY: 0 }, random);
    stepFlight(diagonal, 0.05, { ...emptyFlightControls(), axisX: 1, axisY: 1 }, random);
    const full = keyboard.player.x - x;
    expect(gentle.player.x - x).toBeCloseTo(full * 0.25);
    expect(Math.hypot(diagonal.player.x - x, diagonal.player.y - keyboard.player.y)).toBeCloseTo(full);
    expect(diagonal.player.x - x).toBeCloseTo(full * Math.SQRT1_2);
  });

  it('clamps hostile or nonfinite input and respects stage bounds', () => {
    const state = fixture();
    const before = { ...state.player };
    stepFlight(state, 0.05, { ...emptyFlightControls(), axisX: NaN, axisY: Infinity }, random);
    expect(state.player).toEqual(before);
    for (let frame = 0; frame < 300; frame++) {
      stepFlight(state, 0.05, { ...emptyFlightControls(), axisX: 400, axisY: -500 }, random);
    }
    expect(state.player.x + state.player.width / 2).toBeLessThanOrEqual(state.width - 3);
    expect(state.player.y - state.player.height / 2).toBeGreaterThanOrEqual(3);
  });

  it('freezes analogue movement in reading, feedback, paused and collision reaction states', () => {
    const state = fixture();
    for (const mode of ['reading', 'feedback', 'paused'] as const) {
      state.mode = mode;
      const before = { ...state.player };
      stepFlight(state, 0.05, { ...emptyFlightControls(), axisX: 1, axisY: -1 }, random);
      expect(state.player).toEqual(before);
    }
    state.mode = 'flying';
    state.impactSeconds = 0.5;
    const before = { ...state.player };
    stepFlight(state, 0.05, { ...emptyFlightControls(), axisX: 1, axisY: -1 }, random);
    expect(state.player).toEqual(before);
  });
});
