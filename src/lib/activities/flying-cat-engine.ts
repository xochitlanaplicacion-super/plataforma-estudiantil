import { flyingCatRandom, shuffleFlyingCatOptions, type FlyingCatContent, type FlyingCatQuestion } from './flying-cat';
import type { GameAnswerEvent } from '@/lib/academic/game-answer-details';

export type FlightMode = 'reading' | 'flying' | 'feedback' | 'paused' | 'crashing' | 'finished';
export interface FlightControls { up: boolean; down: boolean; left: boolean; right: boolean }
export interface FlightBody { x: number; y: number; width: number; height: number }
export interface FlightCard extends FlightBody { index: number; text: string }
export interface FlightObstacle extends FlightBody { kind: number; speed: number; id: number }
export interface FlyingCatResult {
  hits: number;
  total: number;
  wrongAttempts: number;
  time: number;
  score: number;
  answers: GameAnswerEvent[];
  answersTruncated?: boolean;
}
export interface FlightState {
  mode: FlightMode;
  resumeMode: 'reading' | 'flying';
  questions: FlyingCatQuestion[];
  questionIndex: number;
  width: number;
  height: number;
  /** Explicit device mode: a wide landscape phone still needs a smaller pilot. */
  compactPilot: boolean;
  player: FlightBody;
  card: FlightCard | null;
  obstacles: FlightObstacle[];
  nextOption: number;
  cardDelay: number;
  obstacleDelay: number;
  obstacleSerial: number;
  immunity: number;
  impactSeconds: number;
  impactSerial: number;
  activeSeconds: number;
  lives: number;
  hits: number;
  wrongAttempts: number;
  score: number;
  answers: GameAnswerEvent[];
  feedback: GameAnswerEvent | null;
  difficulty: FlyingCatContent['settings']['difficulty'];
  showFeedback: boolean;
  crashed: boolean;
  crashSeconds: number;
}

export const RESUME_IMMUNITY_SECONDS = 3;
export const CRASH_ANIMATION_SECONDS = 2.4;
export const IMPACT_ANIMATION_SECONDS = 0.65;
export const MAX_FLIGHT_OBSTACLES = 8;
const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n));
export const emptyFlightControls = (): FlightControls => ({ up: false, down: false, left: false, right: false });

/** One answer card at a time; gameplay objects are bounded, never an expanding particle list. */
export function createFlight(content: FlyingCatContent, width: number, height: number, random = flyingCatRandom, compactPilot = false): FlightState {
  const questions = content.items.map((question) => shuffleFlyingCatOptions(question, random));
  // Shuffle definitions too: restarting never becomes a memorised A/B/C/D sequence.
  for (let i = questions.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [questions[i], questions[j]] = [questions[j], questions[i]];
  }
  const state: FlightState = {
    mode: 'reading', resumeMode: 'reading', questions, questionIndex: 0,
    width: Math.max(180, width), height: Math.max(100, height), compactPilot,
    player: { x: 0, y: 0, width: 80, height: 60 }, card: null, obstacles: [],
    nextOption: 0, cardDelay: 0.6, obstacleDelay: 0.75, obstacleSerial: 0,
    immunity: 3, impactSeconds: 0, impactSerial: 0, activeSeconds: 0, lives: 3, hits: 0, wrongAttempts: 0,
    score: 0, answers: [], feedback: null, difficulty: content.settings.difficulty,
    showFeedback: content.showFeedback, crashed: false, crashSeconds: 0,
  };
  resizeFlight(state, width, height);
  state.player.x = state.width * 0.23;
  state.player.y = state.height * 0.5;
  return state;
}

export function resizeFlight(state: FlightState, width: number, height: number) {
  const oldWidth = state.width;
  const oldHeight = state.height;
  state.width = Math.max(180, width);
  state.height = Math.max(100, height);
  state.player.width = state.compactPilot
    ? clamp(state.width * 0.16, 64, 96)
    : clamp(state.width * 0.22, 90, 136);
  state.player.height = state.player.width * (230 / 340);
  state.player.x = state.player.x / oldWidth * state.width;
  state.player.y = state.player.y / oldHeight * state.height;
  for (const object of [...state.obstacles, ...(state.card ? [state.card] : [])]) {
    object.x = object.x / oldWidth * state.width;
    object.y = object.y / oldHeight * state.height;
  }
  for (const obstacle of state.obstacles) {
    obstacle.width = clamp(state.width * 0.12, 42, 76);
    obstacle.height = clamp(state.height * 0.14, 44, 58);
  }
  if (state.card) {
    state.card.width = clamp(state.width * 0.25, 82, 128);
    state.card.y = clamp(state.card.y, state.player.height / 2 + 3, state.height - state.player.height / 2 - 3);
  }
  // A rotation or a shorter arena must not shrink a previously safe corridor
  // into a wall. Offending obstacles are retired, not teleported into the pilot.
  state.obstacles = state.obstacles.filter((obstacle) =>
    clearObstacleCorridor(state, state.height / 2, obstacle)
    && (!state.card || clearObstacleCorridor(state, state.card.y, obstacle)))
    .slice(0, flightDifficulty(state).maximumObstacles);
  moveFlightPlayer(state, state.player.x, state.player.y);
}

export function moveFlightPlayer(state: FlightState, x: number, y: number) {
  state.player.x = clamp(x, state.player.width / 2 + 3, state.width - state.player.width / 2 - 3);
  state.player.y = clamp(y, state.player.height / 2 + 3, state.height - state.player.height / 2 - 3);
}

/** Speed rises with progress, but remains playable on narrow screens. */
export function flightDifficulty(state: FlightState) {
  const level = 1 + Math.floor(state.questionIndex / 2);
  const factor = state.difficulty === 'easy' ? 0.8 : state.difficulty === 'hard' ? 1.18 : 1;
  const progression = Math.min(1.8, 1 + (level - 1) * 0.13);
  const interval = state.difficulty === 'easy' ? 1.55 : state.difficulty === 'hard' ? 0.88 : 1.15;
  const density = state.difficulty === 'easy' ? 4 : state.difficulty === 'hard' ? MAX_FLIGHT_OBSTACLES : 6;
  const arenaCap = state.height < 150 ? 3 : state.width < 300 ? 4 : MAX_FLIGHT_OBSTACLES;
  return {
    level,
    cardSpeed: clamp(state.width * 0.22, 60, 220) * factor * progression,
    obstacleSpeed: clamp(state.width * 0.14, 46, 175) * factor * progression,
    obstacleInterval: Math.max(0.72, interval / progression),
    maximumObstacles: Math.min(density, arenaCap),
  };
}

export function resumeFlight(state: FlightState) {
  if (state.mode === 'finished' || state.mode === 'flying' || state.mode === 'crashing') return;
  if (state.mode === 'paused') {
    state.mode = state.resumeMode;
  } else if (state.mode === 'feedback') {
    state.questionIndex += 1;
    state.feedback = null;
    state.card = null;
    state.obstacles = [];
    state.nextOption = 0;
    if (state.questionIndex >= state.questions.length) { state.mode = 'finished'; return; }
    state.mode = 'reading';
  } else if (state.mode === 'reading') {
    state.mode = 'flying';
  }
  state.immunity = state.impactSeconds > 0 ? 0 : RESUME_IMMUNITY_SECONDS;
  state.cardDelay = Math.max(state.cardDelay, 0.6);
  state.obstacleDelay = Math.max(state.obstacleDelay, 0.65);
}

export function pauseFlight(state: FlightState) {
  if (state.mode !== 'flying' && state.mode !== 'reading') return;
  state.resumeMode = state.mode;
  state.mode = 'paused';
}

function intersects(player: FlightBody, target: FlightBody) {
  // Ignore the scarf, smoke and decorative wingtips for fair collisions.
  return Math.abs(player.x - target.x) < player.width * 0.25 + target.width * 0.42
    && Math.abs(player.y - target.y) < player.height * 0.25 + target.height * 0.4;
}

function obstacleCorridorRadius(state: FlightState, obstacle: FlightBody) {
  // Reserve the actual pilot hitbox plus breathing room, even in a 100px arena.
  const margin = clamp((state.height - state.player.height) * 0.12, 4, 12);
  return state.player.height * 0.25 + obstacle.height * 0.4 + margin;
}

function clearObstacleCorridor(state: FlightState, y: number, obstacle: FlightBody) {
  return Math.abs(y - obstacle.y) >= obstacleCorridorRadius(state, obstacle);
}

function nextCardHeight(state: FlightState, random: () => number) {
  const minimum = state.player.height / 2 + 3;
  const maximum = state.height - minimum;
  const lanes = [...new Set([0.22, 0.5, 0.78].map((fraction) => clamp(state.height * fraction, minimum, maximum)))];
  const available = lanes.filter((lane) => state.obstacles.every((obstacle) => clearObstacleCorridor(state, lane, obstacle)));
  // The centre is always reserved by the obstacle spawner. Other lanes stay
  // available whenever their whole approach is also clear.
  const safe = available.length ? available : [state.height / 2];
  return safe[Math.floor(clamp(random(), 0, 1 - Number.EPSILON) * safe.length)];
}

function nextObstacleHeight(state: FlightState, obstacle: FlightBody, random: () => number): number | null {
  // Peripheral objects may be slightly cropped in exceptionally short arenas,
  // while the middle and the active answer lane remain continuously reachable.
  let bands = [[obstacle.height * 0.12, state.height - obstacle.height * 0.12]];
  const radius = obstacleCorridorRadius(state, obstacle);
  const protectedLanes = [state.height / 2, ...(state.card ? [state.card.y] : [])];
  for (const lane of protectedLanes) {
    const lower = lane - radius;
    const upper = lane + radius;
    bands = bands.flatMap(([start, end]) => {
      if (upper <= start || lower >= end) return [[start, end]];
      const remaining: number[][] = [];
      if (lower > start) remaining.push([start, Math.min(lower, end)]);
      if (upper < end) remaining.push([Math.max(upper, start), end]);
      return remaining;
    });
  }
  const space = bands.reduce((total, [start, end]) => total + end - start, 0);
  if (space <= 0) return null;
  let position = clamp(random(), 0, 1 - Number.EPSILON) * space;
  for (const [start, end] of bands) {
    if (position <= end - start) return start + position;
    position -= end - start;
  }
  return bands[bands.length - 1][1];
}

export function answerFlight(state: FlightState, index: number) {
  const question = state.questions[state.questionIndex];
  if (state.mode !== 'flying' || state.impactSeconds > 0 || !question || !Number.isInteger(index) || index < 0 || index >= question.options.length) return;
  const isCorrect = index === question.correctIndex;
  const event: GameAnswerEvent = {
    questionId: question.id, prompt: question.prompt, selectedAnswer: question.options[index],
    correctAnswer: question.options[question.correctIndex], isCorrect, attemptNumber: 1,
  };
  state.answers.push(event);
  state.feedback = event;
  if (isCorrect) { state.hits++; state.score += 100 + state.lives * 20; }
  else { state.wrongAttempts++; }
  state.card = null;
  state.mode = 'feedback';
  if (!state.showFeedback) resumeFlight(state);
}

/** Delta is capped; a backgrounded tab can never jump directly into a collision. */
export function stepFlight(state: FlightState, delta: number, controls: FlightControls, random = Math.random) {
  const dt = clamp(Number.isFinite(delta) ? delta : 0, 0, 0.05);
  if (state.mode === 'crashing') {
    state.crashSeconds += dt;
    if (state.crashSeconds >= CRASH_ANIMATION_SECONDS) state.mode = 'finished';
    return;
  }
  if (state.mode !== 'flying') return;
  state.activeSeconds += dt;
  if (state.impactSeconds > 0) {
    // React visibly before showing the shield. Freeze the world during this
    // brief reaction so no card is accidentally answered and no second hit lands.
    state.impactSeconds = Math.max(0, state.impactSeconds - dt);
    if (state.impactSeconds === 0) state.immunity = RESUME_IMMUNITY_SECONDS;
    return;
  }
  state.immunity = Math.max(0, state.immunity - dt);
  const dx = Number(controls.right) - Number(controls.left);
  const dy = Number(controls.down) - Number(controls.up);
  const diagonal = dx && dy ? Math.SQRT1_2 : 1;
  const movement = clamp(state.width * 0.7, 250, 500) * dt * diagonal;
  moveFlightPlayer(state, state.player.x + dx * movement, state.player.y + dy * movement);
  const difficulty = flightDifficulty(state);
  const question = state.questions[state.questionIndex];
  if (!question) { state.mode = 'finished'; return; }

  if (!state.card) {
    state.cardDelay -= dt;
    if (state.cardDelay <= 0) {
      const index = state.nextOption % question.options.length;
      state.nextOption++;
      const cardWidth = clamp(state.width * 0.25, 82, 128);
      state.card = {
        index, text: question.options[index], x: state.width + cardWidth / 2,
        y: nextCardHeight(state, random), width: cardWidth, height: 44,
      };
    }
  }
  if (state.card) {
    state.card.x -= difficulty.cardSpeed * dt;
    if (intersects(state.player, state.card)) { answerFlight(state, state.card.index); return; }
    if (state.card.x < -state.card.width) { state.card = null; state.cardDelay = 0.35; }
  }

  state.obstacleDelay -= dt;
  if (state.obstacleDelay <= 0 && state.obstacles.length < difficulty.maximumObstacles) {
    const width = clamp(state.width * 0.12, 42, 76);
    const height = clamp(state.height * 0.14, 44, 58);
    const y = nextObstacleHeight(state, { x: 0, y: 0, width, height }, random);
    if (y !== null) state.obstacles.push({
      id: ++state.obstacleSerial, kind: Math.floor(clamp(random(), 0, 1 - Number.EPSILON) * 3), x: state.width + width / 2,
      y, width, height, speed: difficulty.obstacleSpeed * (0.9 + random() * 0.2),
    });
    state.obstacleDelay = difficulty.obstacleInterval;
  }
  for (const obstacle of state.obstacles) {
    obstacle.x -= obstacle.speed * dt;
    if (state.immunity <= 0 && state.impactSeconds <= 0 && intersects(state.player, obstacle)) {
      obstacle.x = -200;
      state.lives--;
      state.score = Math.max(0, state.score - 25);
      state.immunity = 0;
      if (state.lives <= 0) {
        state.crashed = true;
        state.mode = 'crashing';
        state.crashSeconds = 0;
        state.impactSeconds = 0;
        state.card = null;
        state.obstacles = [];
        return;
      }
      state.impactSerial += 1;
      state.impactSeconds = IMPACT_ANIMATION_SECONDS;
    }
  }
  state.obstacles = state.obstacles.filter((object) => object.x > -object.width);
}

export function flightResult(state: FlightState): FlyingCatResult {
  return {
    hits: state.hits, total: state.questions.length, wrongAttempts: state.wrongAttempts,
    time: Math.round(state.activeSeconds), score: state.score, answers: state.answers.map((answer) => ({ ...answer })),
  };
}
