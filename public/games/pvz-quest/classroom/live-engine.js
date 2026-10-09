import { getUnit, getUnits, ZOMBIE_SPEED_PRESETS, zombieSpeedForWave } from './catalog.js';
import { getBalanceProfile, profileRules } from './balance-profiles.js';

/**
 * Continuous classroom combat, deliberately separate from the round engine.
 * Rendering, question timers and browser focus never advance or pause combat.
 * Every caller uses the same 60 Hz rule clock, regardless of rendering FPS.
 * Every mode has a free, fixed zombie assistance schedule. The first wave
 * brings one common zombie per lane, beginning after five seconds. Later waves
 * add one arrival and introduce stronger types at stated wave numbers; student
 * answers and board strength never change that schedule. In coop-zombies the
 * plant CPU receives +100 per wave and still pays for its two purchases.
 * Profiles select educational values or classic-style values. Neither profile
 * replaces this classroom simulation with the original game's engine.
 */
export const LIVE_RULES = Object.freeze({
  fixedStep: 1 / 60,
  maxExternalStep: 0.25,
  secondsPerCell: 5,
  shotSeconds: 2.4,
  biteSeconds: 1.5,
  mineArmSeconds: 5,
  chompRestSeconds: 20,
  freezeSeconds: 4,
  iceSlowFactor: 0.7,
  spikeSlowFactor: 0.6,
  spikeSeconds: 2,
  purchaseCooldownSeconds: 1,
  firstZombieDelaySeconds: 5,
  plantCPUReactionSeconds: 1,
  plantCPUActionSeconds: 6,
  baseIncome: 25,
  cpuAnswerIncome: 100,
  sunflowerIncome: 25,
  sunflowerSeconds: 12,
  maxSunflowers: 4,
  maxResources: 1500,
  maxZombies: 200,
  assistantFirstWaveCount: 5,
  assistantAddedPerWave: 1,
  assistantMaxWaveCount: 20,
  assistantTypeWaves: Object.freeze({ cone: 2, bucket: 3, football: 4, balloon: 5, dragon: 6 }),
  waveEndingWarningSeconds: 5,
  overtimeSeconds: 120,
});

export const LIVE_ZOMBIE_SPEED_PRESETS = ZOMBIE_SPEED_PRESETS;
export { zombieSpeedForWave };

const copy = value => structuredClone(value);
const pair = value => ({ plants: value, zombies: value });
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const epsilon = 1e-8;
const shooters = new Set(['peashooter', 'snow-pea', 'repeater', 'threepeater', 'corn-pult']);
const groundPlants = new Set(['potato-mine', 'spikeweed']);
const decapitatingZombies = new Set(['common', 'cone', 'bucket', 'football', 'balloon']);
const profileId = state => state.config.balanceProfile ?? 'aula';
const combatRules = new Map();
const rulesFor = state => {
  const id = profileId(state);
  if (!combatRules.has(id)) combatRules.set(id, Object.freeze({ ...LIVE_RULES, ...profileRules(id) }));
  return combatRules.get(id);
};
const sideOfClass = state => state.config.mode === 'duel' ? state.activeSide : state.config.mode === 'coop-plants' ? 'plants' : 'zombies';
const canHumanControl = (state, side) => ['plants', 'zombies'].includes(side)
  && (state.config.mode === 'duel' || side === sideOfClass(state));
const sideOfCPU = state => state.config.mode === 'coop-zombies' ? 'plants' : null;
const alive = unit => unit.hp > 0;
const flying = unit => ['balloon', 'dragon'].includes(unit.typeId);
const definition = (state, typeId) => {
  const unit = getUnit(typeId, profileId(state));
  assert(unit, 'Esta unidad no existe en el repertorio disponible.');
  return unit;
};
const emit = (events, type, data = {}) => events.push({ type, ...data });
const addResource = (state, side, amount) => {
  const before = state.resources[side];
  state.resources[side] = Math.min(LIVE_RULES.maxResources, before + amount);
  return state.resources[side] - before;
};
const nextId = state => `live-unit-${state.nextId++}`;

function seedNumber(seed) {
  let hash = 2166136261;
  for (const char of String(seed)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0) || 1;
}

function random(state, count) {
  let value = state.randomState;
  value ^= value << 13; value ^= value >>> 17; value ^= value << 5;
  state.randomState = value >>> 0;
  return Math.floor(state.randomState / 4294967296 * count);
}

function spawn(state, typeId, row, col, events = [], source = 'purchase') {
  const type = definition(state, typeId), rules = rulesFor(state);
  const unit = {
    id: nextId(state), typeId, side: type.side, row, col,
    hp: type.hp, maxHp: type.hp, damage: type.damage, move: type.move,
    ability: type.ability, placedRound: state.pendingWave ?? state.round, placedAt: state.elapsed,
    readyAt: state.elapsed + (typeId === 'potato-mine' ? rules.mineArmSeconds : 0),
    shootCooldown: state.elapsed + rules.shotSeconds,
    biteCooldown: state.elapsed + rules.biteSeconds,
    chompCooldown: state.elapsed,
    sunReadyAt: typeId === 'sunflower' ? state.elapsed + LIVE_RULES.sunflowerSeconds : null,
    groundHits: {},
  };
  state.units.push(unit);
  state.stats.unitsPlaced[type.side] += 1;
  emit(events, 'deployment', { unitId: unit.id, typeId, side: type.side, row, col, source });
  return unit;
}

function assistantType(round, index) {
  if (round >= LIVE_RULES.assistantTypeWaves.dragon && index % 7 === 6) return 'dragon';
  if (round >= LIVE_RULES.assistantTypeWaves.balloon && index % 6 === 5) return 'balloon';
  if (round >= LIVE_RULES.assistantTypeWaves.football && index % 5 === 4) return 'football';
  if (round >= LIVE_RULES.assistantTypeWaves.bucket && index % 4 === 3) return 'bucket';
  if (round >= LIVE_RULES.assistantTypeWaves.cone && index % 3 === 2) return 'cone';
  return 'common';
}

function scheduleAssistantWave(state) {
  const rows = [0, 1, 2, 3, 4];
  for (let index = rows.length - 1; index > 0; index -= 1) {
    const swap = random(state, index + 1);
    [rows[index], rows[swap]] = [rows[swap], rows[index]];
  }
  const count = Math.min(LIVE_RULES.assistantMaxWaveCount,
    LIVE_RULES.assistantFirstWaveCount + (state.round - 1) * LIVE_RULES.assistantAddedPerWave);
  const delay = LIVE_RULES.firstZombieDelaySeconds;
  // Leave a small gap before the boundary. Even a 30-second wave has all five
  // initial arrivals, separated in time and distributed across all lanes.
  const interval = (state.config.waveSeconds - delay - 3) / count;
  state.assistantWavePlan = Array.from({ length: count }, (_, index) => ({
    row: rows[index % rows.length], typeId: assistantType(state.round, index),
    at: state.elapsed + delay + index * interval,
  }));
  state.assistantSpawnedThisWave = 0;
  state.assistantNextIndex = 0;
  state.assistantNextActionAt = state.assistantWavePlan[0].at;
}

function prepareWaveBudget(state, events, first = false) {
  state.bonusThisWave = pair(0);
  state.purchasesBySideThisWave = pair(0);
  state.humanPurchasesThisWave = 0;
  state.cpuPurchasesThisWave = 0;
  const cpuSide = sideOfCPU(state);
  const income = pair(first ? 0 : LIVE_RULES.baseIncome);
  if (cpuSide) income[cpuSide] += LIVE_RULES.cpuAnswerIncome;
  for (const side of ['plants', 'zombies']) {
    income[side] = addResource(state, side, income[side]);
    state.stats.resourcesIncome[side] += income[side];
  }
  emit(events, 'income', { plants: income.plants, zombies: income.zombies, cpuAnswer: cpuSide ? LIVE_RULES.cpuAnswerIncome : 0 });
}

function beginWave(state, events, first = false, prepared = false) {
  if (!prepared) prepareWaveBudget(state, events, first);
  state.zombieSpeed = zombieSpeedForWave(state.round);
  state.zombieSpeedMode = 'auto';
  state.waveElapsed = 0;
  state.waveEnding = false;
  state.cpuNextActionAt = sideOfCPU(state) ? state.elapsed + LIVE_RULES.plantCPUReactionSeconds : Infinity;
  scheduleAssistantWave(state);
  emit(events, 'wave', { round: state.round, maxRounds: state.maxRounds });
}

function openTacticalBreak(state, events, initial = false) {
  state.pendingWave = initial ? state.round : state.round + 1;
  if (!initial) prepareWaveBudget(state, events);
  const order = ['plants', 'zombies'];
  // Fisher–Yates for two sides: one unbiased draw, no dependence on scores.
  const swap = random(state, 2);
  [order[1], order[swap]] = [order[swap], order[1]];
  state.tacticalOrder = order;
  state.tacticalIndex = 0;
  state.tacticalPhase = 'coin';
  state.activeSide = order[0];
  if (state.config.mode === 'duel') state.humanSide = order[0];
  state.humanPurchasesThisWave = state.purchasesBySideThisWave[state.activeSide];
  state.paused = true;
  state.accumulator = 0;
  state.waveEnding = false;
  state.cpuNextActionAt = Infinity;
  state.tacticalPublicBaseline = { units: copy(state.units), stats: copy(state.stats) };
  state.tacticalPublicResources = copy(state.resources);
  emit(events, 'tactical', { tacticalPhase: 'coin', round: state.round, pendingWave: state.pendingWave });
}

export function createLiveMatch(config = {}) {
  assert(config && typeof config === 'object' && !Array.isArray(config), 'La configuración de la partida no es válida.');
  const settings = {
    mode: config.mode ?? 'coop-plants', tempo: 'continuous',
    waves: config.waves ?? 10, waveSeconds: config.waveSeconds ?? 45,
    seed: config.seed ?? 'aula-continua',
    startPaused: config.startPaused ?? false,
    tacticalPauses: config.tacticalPauses ?? true,
    balanceProfile: config.balanceProfile ?? 'aula',
  };
  assert(['duel', 'coop-plants', 'coop-zombies'].includes(settings.mode), 'Elige duelo o un modo cooperativo.');
  assert(Number.isInteger(settings.waves) && settings.waves >= 1 && settings.waves <= 30, 'Elige entre 1 y 30 oleadas.');
  assert(Number.isInteger(settings.waveSeconds) && settings.waveSeconds >= 30 && settings.waveSeconds <= 600, 'Cada oleada debe durar entre 30 y 600 segundos.');
  assert(typeof settings.seed === 'string' || (typeof settings.seed === 'number' && Number.isFinite(settings.seed)), 'La semilla de la partida debe ser texto o un número válido.');
  assert(typeof settings.startPaused === 'boolean', 'Indica si el combate debe comenzar en pausa.');
  assert(typeof settings.tacticalPauses === 'boolean', 'Indica si quieres pausas tácticas entre oleadas.');
  getBalanceProfile(settings.balanceProfile);
  const zombieSpeed = config.zombieSpeed ?? zombieSpeedForWave(1);
  validateZombieSpeed(zombieSpeed);
  const state = {
    config: settings, phase: 'live', activeSide: settings.mode === 'coop-zombies' ? 'zombies' : 'plants',
    humanSide: settings.mode === 'coop-zombies' ? 'zombies' : 'plants',
    round: 1, maxRounds: settings.waves, elapsed: 0, waveElapsed: 0,
    tickCount: 0, accumulator: 0, paused: settings.startPaused, closing: false, closingAt: null,
    initialStaging: settings.mode === 'duel' && settings.startPaused, zombieSpeed, zombieSpeedMode: 'auto',
    tacticalPhase: null, tacticalOrder: [], tacticalIndex: 0, pendingWave: null, waveEnding: false,
    tacticalPublicBaseline: null, tacticalPublicResources: null,
    resources: pair(200), units: [], plans: { plants: [], zombies: [] },
    mowers: Array(5).fill(true), winner: null, bonusThisWave: pair(0),
    humanPurchasesThisWave: 0, purchasesBySideThisWave: pair(0), cpuPurchasesThisWave: 0,
    purchaseReadyAt: {}, cpuNextActionAt: Infinity,
    assistantWavePlan: [], assistantNextActionAt: Infinity, assistantNextIndex: 0, assistantSpawnedThisWave: 0,
    randomState: seedNumber(settings.seed), nextId: 1,
    stats: { roundsResolved: 0, wavesCompleted: 0, resourcesAwarded: pair(0), resourcesIncome: pair(0),
      resourcesSpent: pair(0), unitsPlaced: pair(0), unitsDefeated: pair(0), shots: 0, assistantUnitsSpawned: 0 },
  };
  if (settings.mode === 'coop-zombies') {
    spawn(state, 'peashooter', 0, 2, [], 'starter');
    spawn(state, 'wallnut', 2, 4, [], 'starter');
    spawn(state, 'peashooter', 4, 2, [], 'starter');
  }
  beginWave(state, [], true);
  if (config.zombieSpeed != null) {
    state.zombieSpeed = zombieSpeed;
    state.zombieSpeedMode = 'manual';
  }
  if (state.initialStaging && settings.tacticalPauses) {
    state.tacticalPhase = 'briefing';
    state.pendingWave = 1;
    state.tacticalPublicBaseline = { units: [], stats: copy(state.stats) };
    state.tacticalPublicResources = copy(state.resources);
  }
  return state;
}

export function awardLiveResources(original, side, amount) {
  assert(original.phase === 'live', 'Esta partida ya terminó.');
  assert(canHumanControl(original, side), 'En cooperativo sólo se premia al equipo del salón.');
  assert([25, 50, 100].includes(amount), 'Los premios disponibles son +25, +50 y +100.');
  const state = copy(original);
  const actual = addResource(state, side, amount);
  state.bonusThisWave[side] += amount;
  state.stats.resourcesAwarded[side] += actual;
  if (state.tacticalPublicResources) {
    state.tacticalPublicResources[side] = Math.min(LIVE_RULES.maxResources, state.tacticalPublicResources[side] + amount);
  }
  return state;
}

export function selectLiveSide(original, side) {
  assert(original.phase === 'live', 'Esta partida ya terminó.');
  assert(canHumanControl(original, side), 'Sólo el equipo del salón puede controlar unidades en cooperativo.');
  assert(!original.tacticalPhase || side === original.activeSide, 'El orden de compra lo decide la moneda; confirma el turno actual para continuar.');
  const state = copy(original);
  state.activeSide = side;
  state.humanSide = side;
  state.humanPurchasesThisWave = state.purchasesBySideThisWave[side];
  return state;
}

export function beginLiveTacticalShopping(original) {
  assert(original.phase === 'live' && original.tacticalPhase === 'coin', 'Primero debe resolverse la moneda de esta pausa táctica.');
  const state = copy(original);
  state.tacticalPhase = 'shopping';
  return state;
}

export function beginLiveInitialCoin(original) {
  assert(original.phase === 'live' && original.initialStaging && original.tacticalPhase === 'briefing',
    'La moneda inicial sólo se lanza después de la primera ronda de preguntas o premios.');
  const state = copy(original);
  openTacticalBreak(state, [], true);
  return state;
}

export function confirmLiveTacticalTurn(original, side = original.activeSide) {
  assert(original.phase === 'live' && original.tacticalPhase === 'shopping', 'No hay un turno de compra táctica que confirmar.');
  assert(side === original.activeSide && side === original.tacticalOrder[original.tacticalIndex], 'Confirma únicamente el equipo que tiene el turno.');
  const state = copy(original);
  // Only the plant CPU buys. Zombie assistance keeps its existing free
  // schedule; confirming the zombie CPU never creates a duplicate army.
  if (state.config.mode === 'coop-zombies' && side === 'plants') {
    while (state.cpuPurchasesThisWave < 2 && buyCPUPlantOnce(state, [])) {}
  }
  if (state.tacticalIndex === 0) {
    state.tacticalIndex = 1;
    state.activeSide = state.tacticalOrder[1];
    if (state.config.mode === 'duel') state.humanSide = state.activeSide;
    state.humanPurchasesThisWave = state.purchasesBySideThisWave[state.activeSide];
  } else state.tacticalPhase = 'ready';
  return state;
}

export function resumeLiveTacticalWave(original) {
  assert(original.phase === 'live' && original.tacticalPhase === 'ready', 'Confirma la compra de ambos equipos antes de continuar.');
  const state = copy(original);
  const initial = state.initialStaging;
  state.round = state.pendingWave;
  state.pendingWave = null;
  state.tacticalPhase = null;
  state.tacticalOrder = [];
  state.tacticalIndex = 0;
  state.tacticalPublicBaseline = null;
  state.tacticalPublicResources = null;
  state.initialStaging = false;
  state.paused = false;
  state.accumulator = 0;
  if (!initial) beginWave(state, [], false, true);
  else {
    state.zombieSpeed = zombieSpeedForWave(state.round);
    state.zombieSpeedMode = 'auto';
  }
  if (state.config.mode !== 'duel') state.activeSide = sideOfClass(state);
  state.humanSide = state.activeSide;
  state.humanPurchasesThisWave = state.purchasesBySideThisWave[state.activeSide];
  return state;
}

function validateZombieSpeed(value) {
  assert(typeof value === 'number' && Number.isFinite(value) && value >= ZOMBIE_SPEED_PRESETS[0] && value <= ZOMBIE_SPEED_PRESETS.at(-1),
    'La velocidad de los zombis debe estar entre 0.35 y 1.7.');
}

export function setLiveZombieSpeed(original, value) {
  assert(original.phase === 'live', 'Esta partida ya terminó.');
  validateZombieSpeed(value);
  const state = copy(original);
  state.zombieSpeed = value;
  state.zombieSpeedMode = 'manual';
  return state;
}

function purchaseProblem(state, side, typeId, row, col, checkPosition = true) {
  const type = getUnit(typeId, profileId(state));
  if (state.phase !== 'live') return 'Esta partida ya terminó.';
  if (!canHumanControl(state, side)) return 'Sólo el equipo del salón puede comprar unidades.';
  if (state.tacticalPhase && state.tacticalPhase !== 'shopping') return 'Espera a que la moneda abra el turno de compras.';
  if (state.tacticalPhase && side !== state.activeSide) return 'Sólo puede comprar el equipo que tiene el turno de la moneda.';
  if (state.closing) return 'Terminó la última oleada: se resolverán las unidades que ya están en el tablero.';
  if (!type || type.side !== side) return 'Esta unidad no pertenece al equipo seleccionado.';
  if (!state.paused && !state.initialStaging && !state.tacticalPhase && (state.purchaseReadyAt[typeId] || 0) > state.elapsed + epsilon) return 'Esta unidad se está recargando; espera un segundo de juego.';
  if (state.resources[side] < type.cost) return 'No hay suficientes recursos para comprar esta unidad.';
  if (side === 'zombies' && state.units.filter(unit => unit.side === 'zombies' && alive(unit)).length >= LIVE_RULES.maxZombies) return `Límite de seguridad: ${LIVE_RULES.maxZombies} zombis simultáneos en el tablero.`;
  if (!checkPosition) return null;
  if (!Number.isInteger(row) || row < 0 || row > 4 || !Number.isInteger(col)) return 'Selecciona una casilla válida del tablero.';
  if (side === 'plants') {
    if (col < 1 || col > 6) return 'Las plantas se colocan en las columnas 1 a 6.';
    if (state.units.some(unit => unit.row === row && (unit.side === 'plants' ? unit.col === col : Math.abs(unit.col - col) < 0.65))) return 'Esta casilla está ocupada.';
  } else if (col !== 7) return 'Los zombis entran por la columna 7.';
  return null;
}

export function buyLiveUnit(original, side, typeId, row, col) {
  const error = purchaseProblem(original, side, typeId, row, col);
  assert(!error, error);
  const state = copy(original), unit = definition(state, typeId);
  state.resources[side] -= unit.cost;
  state.stats.resourcesSpent[side] += unit.cost;
  state.purchasesBySideThisWave[side] += 1;
  state.humanPurchasesThisWave = state.purchasesBySideThisWave[state.activeSide];
  state.purchaseReadyAt[typeId] = state.elapsed + LIVE_RULES.purchaseCooldownSeconds;
  spawn(state, typeId, row, col);
  return state;
}

export function availableLiveUnits(state, side = sideOfClass(state)) {
  return getUnits(profileId(state)).filter(unit => unit.side === side).map(unit => {
    const disabledReason = purchaseProblem(state, side, unit.id, 0, side === 'plants' ? 1 : 7, false);
    return { ...unit, affordable: !disabledReason, disabledReason };
  });
}

export function pauseLive(original, paused) {
  assert(typeof paused === 'boolean', 'Indica si quieres pausar o reanudar el combate.');
  assert(original.phase === 'live', 'Esta partida ya terminó.');
  assert(paused || !original.tacticalPhase, 'Completa la moneda y confirma ambos turnos de compra antes de continuar.');
  const state = copy(original);
  state.paused = paused;
  if (!paused) state.initialStaging = false;
  return state;
}

function hurt(state, unit, amount, events, sourceId) {
  if (!unit || !alive(unit) || amount <= 0) return;
  const actual = Math.min(unit.hp, amount);
  unit.hp = Math.max(0, unit.hp - amount);
  emit(events, 'damage', { unitId: unit.id, side: unit.side, row: unit.row, col: unit.col, amount: actual, sourceId });
  // Classic body health loses its head below 90 HP. Helm health is included
  // in the total pool; unlike the original game, classroom combat retires the
  // now harmless zombie rather than keeping a headless walking corpse.
  if (unit.hp > 0 && unit.hp < (rulesFor(state).zombieRetireHp || 0) && decapitatingZombies.has(unit.typeId)) {
    unit.hp = 0;
    unit.defeatReason = 'decapitated';
  }
}

function removeDead(state, events) {
  for (const unit of state.units.filter(unit => !alive(unit))) {
    state.stats.unitsDefeated[unit.side] += 1;
    emit(events, 'defeat', { unitId: unit.id, typeId: unit.typeId, side: unit.side, row: unit.row, col: unit.col,
      ...(unit.defeatReason ? { reason: unit.defeatReason } : {}) });
  }
  state.units = state.units.filter(alive);
}

function cpuPurchase(state, typeId, row, col, events) {
  const type = definition(state, typeId);
  if (type.cost > state.resources[type.side]) return false;
  if (type.side === 'zombies' && state.units.filter(unit => unit.side === 'zombies').length >= LIVE_RULES.maxZombies) return false;
  if (type.side === 'plants' && state.units.some(unit => unit.row === row && (unit.side === 'plants' ? unit.col === col : Math.abs(unit.col - col) < 0.65))) return false;
  state.resources[type.side] -= type.cost;
  state.stats.resourcesSpent[type.side] += type.cost;
  state.cpuPurchasesThisWave += 1;
  spawn(state, typeId, row, col, events, 'cpu');
  return true;
}

function buyCPUPlantOnce(state, events) {
    const rows = Array.from({ length: 5 }, (_, row) => ({ row, tie: random(state, 1000) }));
    const pressure = row => state.units.filter(unit => unit.side === 'zombies' && unit.row === row).reduce((sum, unit) => sum + 8 - unit.col, 0);
    rows.sort((a, b) => pressure(b.row) - pressure(a.row) || a.tie - b.tie);
    for (const { row } of rows) {
      const own = state.units.filter(unit => unit.side === 'plants' && unit.row === row);
      const hasShooter = own.some(unit => shooters.has(unit.typeId));
      const typeId = hasShooter ? 'wallnut' : 'peashooter';
      const columns = hasShooter ? [5, 4, 3] : [2, 1, 3];
      const col = columns.find(column => !state.units.some(unit => unit.row === row && (unit.side === 'plants' ? unit.col === column : Math.abs(unit.col - column) < 0.65)));
      if (col != null && cpuPurchase(state, typeId, row, col, events)) return true;
    }
  return false;
}

function actCPU(state, events) {
  if (state.closing || sideOfCPU(state) !== 'plants' || state.elapsed + epsilon < state.cpuNextActionAt) return;
  if (state.cpuPurchasesThisWave < 2) buyCPUPlantOnce(state, events);
  state.cpuNextActionAt = state.elapsed + LIVE_RULES.plantCPUActionSeconds;
}

function actAssistant(state, events) {
  if (state.closing || state.elapsed + epsilon < state.assistantNextActionAt) return;
  const scheduled = state.assistantWavePlan[state.assistantNextIndex];
  if (!scheduled) return;
  if (state.units.filter(unit => alive(unit) && unit.side === 'zombies').length < LIVE_RULES.maxZombies) {
    spawn(state, scheduled.typeId, scheduled.row, 7, events, 'assistant-wave');
    state.assistantSpawnedThisWave += 1;
    state.stats.assistantUnitsSpawned += 1;
  }
  // A full board skips its scheduled arrival. It never banks an unseen horde
  // that could appear together as soon as space becomes available.
  state.assistantNextIndex += 1;
  state.assistantNextActionAt = state.assistantWavePlan[state.assistantNextIndex]?.at ?? Infinity;
}

function produceSun(state, events) {
  const sunflowers = state.units.filter(unit => alive(unit) && unit.typeId === 'sunflower');
  for (const [index, plant] of sunflowers.entries()) {
    // The fallback also supports previously saved continuous states.
    plant.sunReadyAt ??= (plant.placedAt ?? state.elapsed) + LIVE_RULES.sunflowerSeconds;
    if (state.elapsed + epsilon < plant.sunReadyAt) continue;
    plant.sunReadyAt += LIVE_RULES.sunflowerSeconds;
    // Extra flowers can be planted, but only the first four living flowers
    // produce. A waiting flower never stores income for a later burst.
    if (index >= LIVE_RULES.maxSunflowers) continue;
    const actual = addResource(state, 'plants', LIVE_RULES.sunflowerIncome);
    state.stats.resourcesIncome.plants += actual;
    emit(events, 'sun', { unitId: plant.id, row: plant.row, col: plant.col, side: 'plants', amount: actual });
  }
}

function shoot(state, events) {
  const rules = rulesFor(state);
  const attacks = [];
  for (const plant of state.units.filter(unit => unit.side === 'plants' && shooters.has(unit.typeId))) {
    if (state.elapsed + epsilon < plant.shootCooldown) continue;
    const rows = plant.typeId === 'threepeater' ? [plant.row - 1, plant.row, plant.row + 1] : [plant.row];
    let fired = false;
    for (const row of rows) {
      const target = state.units.filter(unit => unit.side === 'zombies' && alive(unit) && unit.row === row && unit.col >= plant.col - 0.1)
        .sort((a, b) => a.col - b.col || a.id.localeCompare(b.id))[0];
      if (!target) continue;
      fired = true;
      attacks.push({ plant, target, damage: Math.max(1, plant.damage) });
    }
    // An idle shooter is ready immediately when the next target enters range.
    if (fired) plant.shootCooldown = state.elapsed + rules.shotSeconds;
  }
  for (const { plant, target, damage } of attacks) {
    emit(events, 'shot', { sourceId: plant.id, targetId: target.id, row: target.row,
      fromCol: plant.col, toCol: target.col, lob: plant.typeId === 'corn-pult',
      typeId: plant.typeId, ice: plant.typeId === 'snow-pea' });
    state.stats.shots += 1;
    hurt(state, target, damage, events, plant.id);
    if (plant.typeId === 'snow-pea' && alive(target)) {
      target.freezeUntil = state.elapsed + rules.freezeSeconds;
      emit(events, 'freeze', { sourceId: plant.id, targetId: target.id, unitId: target.id,
        row: target.row, col: target.col, until: target.freezeUntil });
    }
  }
  removeDead(state, events);
}

function groundContact(state, zombie, events) {
  if (flying(zombie) || !alive(zombie)) return;
  for (const plant of state.units.filter(unit => unit.side === 'plants' && alive(unit) && unit.row === zombie.row && Math.abs(unit.col - zombie.col) <= 0.46)) {
    if (plant.typeId === 'potato-mine' && state.elapsed + epsilon >= plant.readyAt) {
      emit(events, 'mine', { sourceId: plant.id, targetId: zombie.id, row: plant.row, col: plant.col });
      hurt(state, zombie, zombie.hp, events, plant.id);
      hurt(state, plant, plant.hp, events, plant.id);
      break;
    }
    if (plant.typeId === 'spikeweed' && state.elapsed + epsilon >= (zombie.groundHits[plant.id] || 0)) {
      zombie.groundHits[plant.id] = state.elapsed + rulesFor(state).spikeSeconds;
      hurt(state, zombie, Math.max(1, plant.damage), events, plant.id);
    }
  }
}

function chomp(state, events) {
  const rules = rulesFor(state);
  for (const plant of state.units.filter(unit => unit.side === 'plants' && unit.typeId === 'chomper' && alive(unit))) {
    if (state.elapsed + epsilon < plant.chompCooldown) continue;
    const target = state.units.filter(unit => unit.side === 'zombies' && alive(unit) && !flying(unit) && unit.row === plant.row && unit.col >= plant.col - 0.25 && unit.col <= plant.col + 0.66)
      .sort((a, b) => a.col - b.col)[0];
    if (!target) continue;
    hurt(state, target, target.hp, events, plant.id);
    plant.chompCooldown = state.elapsed + rules.chompRestSeconds;
    emit(events, 'chomp', { sourceId: plant.id, targetId: target.id, row: plant.row, col: plant.col, duration: rules.chompRestSeconds });
  }
  removeDead(state, events);
}

function advanceAndBite(state, events) {
  const rules = rulesFor(state);
  for (const zombie of state.units.filter(unit => unit.side === 'zombies')) {
    if (!alive(zombie)) continue;
    const onSpikes = !flying(zombie) && state.units.some(plant => plant.side === 'plants' && alive(plant)
      && plant.typeId === 'spikeweed' && plant.row === zombie.row && Math.abs(plant.col - zombie.col) <= 0.46);
    // Status effects are relative to the current wave's speed and never stack
    // multiplicatively: the strongest active reduction takes precedence.
    const slowFactor = Math.min(state.elapsed < (zombie.freezeUntil || 0) ? rules.iceSlowFactor : 1,
      onSpikes ? rules.spikeSlowFactor : 1);
    const nextCol = zombie.col - Math.max(0, zombie.move) * state.zombieSpeed * slowFactor / LIVE_RULES.secondsPerCell * LIVE_RULES.fixedStep;
    const blocker = !flying(zombie) && state.units.filter(unit => unit.side === 'plants' && alive(unit) && unit.row === zombie.row && !groundPlants.has(unit.typeId)
      && unit.col + 0.42 <= zombie.col + epsilon && unit.col + 0.42 >= nextCol - epsilon)
      .sort((a, b) => b.col - a.col)[0];
    if (blocker) {
      zombie.col = blocker.col + 0.42;
      if (profileId(state) === 'classic') {
        // Preserve the 40 ms rhythm across 60 Hz ticks (do not round it to
        // 50 ms by scheduling from the last rendered/rule tick). Time spent
        // walking must not bank damage to unload on a new plant later.
        if (zombie.biteTargetId !== blocker.id) {
          zombie.biteTargetId = blocker.id;
          zombie.biteCooldown = Math.max(zombie.biteCooldown, state.elapsed);
        }
        while (alive(blocker) && state.elapsed + epsilon >= zombie.biteCooldown) {
          emit(events, 'bite', { sourceId: zombie.id, targetId: blocker.id, row: zombie.row, col: blocker.col });
          hurt(state, blocker, zombie.damage, events, zombie.id);
          zombie.biteCooldown += rules.biteSeconds;
        }
      } else if (state.elapsed + epsilon >= zombie.biteCooldown) {
        emit(events, 'bite', { sourceId: zombie.id, targetId: blocker.id, row: zombie.row, col: blocker.col });
        hurt(state, blocker, zombie.damage, events, zombie.id);
        zombie.biteCooldown = state.elapsed + rules.biteSeconds;
      }
    } else {
      zombie.col = nextCol;
      if (profileId(state) === 'classic') zombie.biteTargetId = null;
    }
    groundContact(state, zombie, events);
  }
  removeDead(state, events);
}

function finish(state, winner, events) {
  state.phase = 'finished'; state.activeSide = null; state.winner = winner;
  state.paused = false; state.accumulator = 0;
  emit(events, 'finished', { winner });
}

function houseAndMowers(state, events) {
  for (let row = 0; row < 5; row += 1) {
    if (!state.units.some(unit => unit.side === 'zombies' && alive(unit) && unit.row === row && unit.col <= 0.3)) continue;
    if (state.mowers[row]) {
      state.mowers[row] = false;
      emit(events, 'mower', { row, col: 0 });
      for (const unit of state.units.filter(unit => unit.side === 'zombies' && alive(unit) && unit.row === row)) hurt(state, unit, unit.hp, events, 'mower');
      removeDead(state, events);
    } else {
      emit(events, 'invasion', { row });
      finish(state, 'zombies', events);
      return;
    }
  }
}

function tick(state, events) {
  state.tickCount += 1;
  state.elapsed = state.tickCount * LIVE_RULES.fixedStep;
  const nextWaveAt = state.round * state.config.waveSeconds;
  if (!state.closing && !state.waveEnding && state.elapsed + epsilon >= nextWaveAt - 5) {
    state.waveEnding = true;
    emit(events, 'wave-ending', { round: state.round, final: state.round === state.maxRounds });
  }
  if (!state.closing && state.elapsed + epsilon >= nextWaveAt) {
    state.stats.wavesCompleted += 1;
    state.stats.roundsResolved = state.stats.wavesCompleted;
    if (state.round < state.maxRounds) {
      if (state.config.tacticalPauses) {
        state.waveElapsed = state.config.waveSeconds;
        openTacticalBreak(state, events);
        return;
      } else { state.round += 1; beginWave(state, events); }
    } else {
      state.closing = true;
      state.closingAt = nextWaveAt;
      emit(events, 'closing', { round: state.round });
    }
  }
  state.waveElapsed = Math.min(state.config.waveSeconds, Math.max(0,
    state.elapsed - (state.round - 1) * state.config.waveSeconds));
  actCPU(state, events);
  actAssistant(state, events);
  shoot(state, events);
  chomp(state, events);
  advanceAndBite(state, events);
  produceSun(state, events);
  houseAndMowers(state, events);
  if (state.phase === 'finished' || !state.closing) return;
  if (!state.units.some(unit => unit.side === 'zombies')) finish(state, 'plants', events);
  else if (state.elapsed + epsilon >= state.closingAt + LIVE_RULES.overtimeSeconds) finish(state, 'draw', events);
}

export function stepLive(original, dtSeconds) {
  assert(typeof dtSeconds === 'number' && Number.isFinite(dtSeconds) && dtSeconds >= 0 && dtSeconds <= LIVE_RULES.maxExternalStep,
    'El paso de simulación debe estar entre 0 y 0.25 segundos.');
  const state = copy(original), events = [];
  if (state.phase !== 'live' || state.paused || dtSeconds === 0) return { state, events };
  const previousPositions = new Map(state.units.filter(unit => unit.side === 'zombies').map(unit => [unit.id, unit.col]));
  state.accumulator += dtSeconds;
  while (state.accumulator + epsilon >= LIVE_RULES.fixedStep && state.phase === 'live' && !state.paused) {
    state.accumulator = Math.max(0, state.accumulator - LIVE_RULES.fixedStep);
    tick(state, events);
  }
  // One movement event per surviving unit per rendered step, not 60 duplicate
  // events per second. Combat itself still used every fixed rule tick.
  for (const unit of state.units.filter(unit => unit.side === 'zombies')) {
    const fromCol = previousPositions.get(unit.id);
    if (fromCol != null && Math.abs(fromCol - unit.col) > epsilon) emit(events, 'move', { unitId: unit.id, row: unit.row, fromCol, toCol: unit.col });
  }
  return { state, events };
}

/** A whitelist projection: never transmit RNG internals or teacher questions. */
export function liveSnapshot(state) {
  const hidden = !!state.tacticalPhase;
  const units = hidden ? state.tacticalPublicBaseline.units : state.units;
  return copy({
    config: { mode: state.config.mode, tempo: 'continuous', waves: state.config.waves, waveSeconds: state.config.waveSeconds,
      tacticalPauses: state.config.tacticalPauses, balanceProfile: profileId(state) },
    phase: state.phase, activeSide: state.activeSide, humanSide: state.humanSide,
    round: state.round, maxRounds: state.maxRounds, elapsed: state.elapsed, waveElapsed: state.waveElapsed,
    paused: state.paused, initialStaging: state.initialStaging, zombieSpeed: state.zombieSpeed, zombieSpeedMode: state.zombieSpeedMode,
    tacticalPhase: state.tacticalPhase, tacticalOrder: state.tacticalOrder,
    tacticalIndex: state.tacticalIndex, pendingWave: state.pendingWave, waveEnding: state.waveEnding,
    closing: state.closing, closingAt: state.closingAt,
    bonusThisWave: hidden ? pair(0) : state.bonusThisWave, purchasesBySideThisWave: hidden ? pair(0) : state.purchasesBySideThisWave,
    humanPurchasesThisWave: hidden ? 0 : state.humanPurchasesThisWave,
    assistantSpawnedThisWave: state.assistantSpawnedThisWave,
    assistantWaveCount: state.assistantWavePlan.length,
    resources: hidden ? state.tacticalPublicResources : state.resources, units: units.map(unit => ({
      id: unit.id, typeId: unit.typeId, side: unit.side, row: unit.row, col: unit.col,
      hp: unit.hp, maxHp: unit.maxHp, placedAt: unit.placedAt, readyAt: unit.readyAt,
      freezeUntil: unit.freezeUntil || 0, chompCooldown: unit.chompCooldown || 0,
      chompDuration: unit.typeId === 'chomper' ? rulesFor(state).chompRestSeconds : 0,
      cooldownSeconds: unit.typeId === 'chomper' ? Math.max(0, (unit.chompCooldown || 0) - state.elapsed) : 0,
      digesting: unit.typeId === 'chomper' && (unit.chompCooldown || 0) > state.elapsed,
    })),
    plans: { plants: [], zombies: [] }, mowers: state.mowers, winner: state.winner, stats: hidden ? state.tacticalPublicBaseline.stats : state.stats,
  });
}
