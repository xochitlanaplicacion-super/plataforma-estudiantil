import { UNITS, getUnit } from './catalog.js';

// Pure classroom rules: one click resolves exactly one finite round. Animation
// and questions live outside this module and never drive combat timing.
export const BOARD_ROWS = 5;
export const BOARD_COLS = 8;
const SIDES = ['plants', 'zombies'];
const MAX_RESOURCES = 1500;
const MAX_ZOMBIES = 30;
export const MAX_CLEANUP_STEPS = 30;
const copy = value => structuredClone(value);
const pair = value => ({ plants: value, zombies: value });
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const validSide = side => assert(SIDES.includes(side), 'Elige el equipo de Plantas o Zombis.');
const definition = typeId => {
  let result;
  try { result = getUnit(typeId); } catch { /* Normalize the public error. */ }
  assert(result, 'Esta unidad no existe en el repertorio disponible.');
  return result;
};
const catalog = () => Array.isArray(UNITS) ? UNITS : Object.values(UNITS);
const humanSide = state => state.config.mode === 'coop-plants' ? 'plants' : state.config.mode === 'coop-zombies' ? 'zombies' : null;
const firstSide = state => humanSide(state) || (state.round % 2 ? 'plants' : 'zombies');
const otherSide = side => side === 'plants' ? 'zombies' : 'plants';
const addResource = (state, side, amount) => { state.resources[side] = Math.min(MAX_RESOURCES, state.resources[side] + amount); };
const nextId = (state, prefix) => `${prefix}-${state.nextId++}`;
export function orderLimit(side) {
  validSide(side);
  return side === 'zombies' ? 8 : 5;
}
const combatClock = state => state.battleStep ?? state.stats.roundsResolved + (state.stats.cleanupSteps || 0);

function seedNumber(seed) {
  let hash = 2166136261;
  for (const char of String(seed)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0) || 1;
}

function random(state, max) {
  // A persisted seed also makes battle tests and classroom replays reproducible.
  let x = state.randomState;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  state.randomState = x >>> 0;
  return Math.floor((state.randomState / 4294967296) * max);
}

function spawn(state, order) {
  const unit = definition(order.typeId);
  const result = {
    id: nextId(state, 'unit'), typeId: order.typeId, side: unit.side,
    row: order.row, col: order.col, hp: unit.hp, maxHp: unit.hp,
    damage: unit.damage || 0, move: unit.move || 0, ability: unit.ability,
    placedRound: state.round, placedStep: combatClock(state), lastChompRound: -2, lastSpikeRound: -1,
  };
  state.units.push(result);
  state.stats.unitsPlaced[unit.side] += 1;
  return result;
}

export function createMatch(config = {}) {
  assert(config && typeof config === 'object' && !Array.isArray(config), 'La configuración de la partida no es válida.');
  // Keep teacher-only question banks, credentials and other controller fields
  // outside the engine and therefore outside projected public snapshots.
  const settings = {
    mode: config.mode ?? 'duel', planning: config.planning ?? 'open',
    rounds: config.rounds ?? 10, seed: config.seed ?? 'aula',
  };
  assert(['duel', 'coop-plants', 'coop-zombies'].includes(settings.mode), 'Selecciona duelo o uno de los modos cooperativos.');
  assert(['open', 'secret'].includes(settings.planning), 'Selecciona planificación abierta o secreta.');
  assert(Number.isInteger(settings.rounds) && settings.rounds >= 1 && settings.rounds <= 30, 'La partida debe durar entre 1 y 30 rondas.');
  assert(typeof settings.seed === 'string' || (typeof settings.seed === 'number' && Number.isFinite(settings.seed)), 'La semilla de la partida debe ser texto o un número válido.');
  const state = {
    config: settings, phase: 'resources', activeSide: null, round: 1, maxRounds: settings.rounds,
    resources: pair(200), units: [], plans: { plants: [], zombies: [] }, planLocked: pair(false),
    mowers: Array(BOARD_ROWS).fill(true), winner: null, bonusThisRound: pair(0),
    randomState: seedNumber(settings.seed), nextId: 1, publicResources: pair(200), battleStep: 0,
    stats: { roundsResolved: 0, cleanupSteps: 0, resourcesAwarded: pair(0), resourcesSpent: pair(0), unitsPlaced: pair(0), unitsDefeated: pair(0) },
  };
  // Three visible starter defenses, not a hidden unlimited CPU army. The outer
  // and inner lanes remain open and the CPU pays for all later reinforcements.
  if (settings.mode === 'coop-zombies') {
    spawn(state, { typeId: 'peashooter', row: 0, col: 2 });
    spawn(state, { typeId: 'wallnut', row: 2, col: 4 });
    spawn(state, { typeId: 'peashooter', row: 4, col: 2 });
  }
  return state;
}

export function grantResources(original, side, amount) {
  validSide(side);
  assert(original.phase === 'resources', 'Los premios se asignan antes de comenzar la planificación.');
  assert(!humanSide(original) || humanSide(original) === side, 'En cooperativo sólo se premia al equipo del salón.');
  assert([25, 50, 100].includes(amount), 'Los premios disponibles son +25, +50 y +100.');
  assert(original.bonusThisRound[side] + amount <= 300, 'El máximo es 300 recursos de premio por equipo y ronda.');
  const state = copy(original);
  addResource(state, side, amount);
  state.bonusThisRound[side] += amount;
  state.stats.resourcesAwarded[side] += amount;
  state.publicResources = copy(state.resources);
  return state;
}

export function beginPlanning(original) {
  assert(original.phase === 'resources', 'La planificación de esta ronda ya comenzó.');
  const state = copy(original);
  state.phase = 'planning'; state.activeSide = firstSide(state);
  state.publicResources = copy(state.resources);
  return state;
}

function checkOrder(state, side, typeId, row, col) {
  validSide(side);
  assert(state.phase === 'planning' && state.activeSide === side && !state.planLocked[side], 'Sólo el equipo que tiene el turno puede preparar sus unidades.');
  const unit = definition(typeId);
  assert(unit.side === side, 'Esta unidad pertenece al otro equipo.');
  assert(Number.isInteger(row) && row >= 0 && row < BOARD_ROWS && Number.isInteger(col), 'Selecciona una casilla válida del tablero.');
  assert(side === 'plants' ? col >= 1 && col <= 6 : col === 7, side === 'plants' ? 'Las plantas se colocan en las columnas 1 a 6.' : 'Los zombis entran por la columna 7.');
  assert(state.plans[side].length < orderLimit(side), `El equipo puede comprar como máximo ${orderLimit(side)} unidades por ronda.`);
  assert(state.resources[side] >= unit.cost, 'No hay suficientes recursos para comprar esta unidad.');
  if (side === 'plants') {
    assert(!state.units.some(item => item.row === row && item.col === col) && !state.plans.plants.some(item => item.row === row && item.col === col), 'Esta casilla ya está ocupada.');
  } else {
    assert(state.units.filter(item => item.side === 'zombies').length + state.plans.zombies.length < MAX_ZOMBIES, 'Ya hay 30 zombis en el tablero o preparados para entrar.');
  }
  return unit;
}

function purchase(state, side, typeId, row, col) {
  const unit = checkOrder(state, side, typeId, row, col);
  const order = { id: nextId(state, 'order'), typeId, side, row, col };
  state.plans[side].push(order);
  state.resources[side] -= unit.cost;
  state.stats.resourcesSpent[side] += unit.cost;
  return order;
}

export function addOrder(original, side, typeId, row, col) {
  const state = copy(original);
  purchase(state, side, typeId, row, col);
  return state;
}

export function removeOrder(original, side, orderId) {
  validSide(side);
  assert(original.phase === 'planning' && original.activeSide === side && !original.planLocked[side], 'Un plan confirmado ya no se puede cambiar.');
  const index = original.plans[side].findIndex(order => order.id === orderId);
  assert(index >= 0, 'Esta compra no está en el plan del equipo activo.');
  const state = copy(original);
  const [order] = state.plans[side].splice(index, 1);
  const amount = definition(order.typeId).cost;
  addResource(state, side, amount);
  state.stats.resourcesSpent[side] -= amount;
  return state;
}

function cpuPlan(state, side) {
  state.phase = 'planning'; state.activeSide = side;
  const budget = Math.min(state.resources[side], 125 + state.round * 25, 300);
  let spent = 0;
  if (side === 'zombies') {
    const count = Math.min(orderLimit(side), 2 + Math.floor(state.round / 2));
    for (let index = 0; index < count; index += 1) {
      if (state.units.filter(unit => unit.side === 'zombies').length + state.plans.zombies.length >= MAX_ZOMBIES) break;
      const options = [
        'common', 'cone',
        ...(state.round >= 4 ? ['football', 'bucket'] : []),
        ...(state.round >= 6 ? ['balloon'] : []),
        ...(state.round >= 8 ? ['dragon'] : []),
      ];
      const affordable = options.filter(id => definition(id).cost <= budget - spent);
      if (!affordable.length) break;
      const typeId = affordable[random(state, affordable.length)];
      purchase(state, side, typeId, random(state, BOARD_ROWS), 7);
      spent += definition(typeId).cost;
    }
  } else {
    const rows = Array.from({ length: BOARD_ROWS }, (_, row) => row);
    // Fisher–Yates breaks ties without favouring the top lane every round.
    for (let index = rows.length - 1; index > 0; index -= 1) {
      const swap = random(state, index + 1); [rows[index], rows[swap]] = [rows[swap], rows[index]];
    }
    rows.sort((a, b) => state.units.filter(u => u.side === 'zombies' && u.row === b).length - state.units.filter(u => u.side === 'zombies' && u.row === a).length);
    for (const row of rows) {
      if (state.plans.plants.length >= 2) break;
      const own = state.units.filter(unit => unit.side === 'plants' && unit.row === row);
      const hasShooter = own.some(unit => ['peashooter', 'repeater', 'threepeater', 'corn-pult'].includes(unit.typeId));
      const typeId = hasShooter ? 'wallnut' : 'peashooter';
      if (definition(typeId).cost > budget - spent) continue;
      const positions = hasShooter ? [5, 4, 3] : [2, 1, 3];
      const col = positions.find(column => !state.units.some(unit => unit.row === row && unit.col === column) && !state.plans.plants.some(order => order.row === row && order.col === column));
      if (col == null) continue;
      purchase(state, side, typeId, row, col);
      spent += definition(typeId).cost;
    }
  }
  state.planLocked[side] = true;
}

export function commitPlan(original) {
  assert(original.phase === 'planning' && original.activeSide && !original.planLocked[original.activeSide], 'Este plan ya está confirmado o no hay un turno abierto.');
  const state = copy(original);
  state.planLocked[state.activeSide] = true;
  if (humanSide(state)) {
    cpuPlan(state, otherSide(humanSide(state)));
    if (state.config.mode === 'coop-zombies' && state.plans.zombies.length < orderLimit('zombies') && state.units.filter(unit => unit.side === 'zombies').length + state.plans.zombies.length < MAX_ZOMBIES) {
      // Explicit, bounded cooperation rule: one free common zombie per round.
      state.plans.zombies.push({ id: nextId(state, 'order'), typeId: 'common', side: 'zombies', row: random(state, BOARD_ROWS), col: 7, free: true });
    }
    state.phase = 'ready'; state.activeSide = null;
  } else if (SIDES.every(side => state.planLocked[side])) {
    state.phase = 'ready'; state.activeSide = null;
  } else {
    state.phase = 'handover';
  }
  return state;
}

export function continuePlanning(original) {
  assert(original.phase === 'handover', 'No hay un cambio de equipo pendiente.');
  const state = copy(original);
  state.activeSide = otherSide(state.activeSide); state.phase = 'planning';
  return state;
}

function event(list, type, data = {}) { list.push({ type, ...data }); }
function hurt(state, unit, amount, events, sourceId) {
  if (!unit || unit.hp <= 0) return;
  const actual = Math.min(unit.hp, amount);
  unit.hp -= amount;
  event(events, 'damage', { unitId: unit.id, side: unit.side, row: unit.row, col: unit.col, amount: actual, sourceId });
}
function removeDead(state, events) {
  for (const unit of state.units.filter(item => item.hp <= 0)) {
    state.stats.unitsDefeated[unit.side] += 1;
    event(events, 'defeat', { unitId: unit.id, typeId: unit.typeId, side: unit.side, row: unit.row, col: unit.col });
  }
  state.units = state.units.filter(item => item.hp > 0);
}
const floorPlant = unit => ['potato-mine', 'spikeweed'].includes(unit.typeId);
const flying = unit => unit.typeId === 'balloon';

function shoot(state, events) {
  const shots = [];
  for (const plant of state.units.filter(unit => unit.side === 'plants')) {
    if (!['peashooter', 'repeater', 'threepeater', 'corn-pult'].includes(plant.typeId)) continue;
    const rows = plant.typeId === 'threepeater' ? [plant.row - 1, plant.row, plant.row + 1] : [plant.row];
    for (const row of rows) {
      const target = state.units.filter(unit => unit.side === 'zombies' && unit.row === row && unit.col >= plant.col).sort((a, b) => a.col - b.col || a.id.localeCompare(b.id))[0];
      if (!target) continue;
      shots.push({ plant, target, damage: Math.max(1, plant.damage) });
    }
  }
  for (const shot of shots) {
    event(events, 'shot', { sourceId: shot.plant.id, targetId: shot.target.id, row: shot.target.row, fromCol: shot.plant.col, toCol: shot.target.col, lob: shot.plant.typeId === 'corn-pult' });
    hurt(state, shot.target, shot.damage, events, shot.plant.id);
  }
  removeDead(state, events);
}

function groundContact(state, zombie, events) {
  if (flying(zombie) || zombie.hp <= 0) return;
  for (const plant of state.units.filter(unit => unit.side === 'plants' && unit.hp > 0 && unit.row === zombie.row && unit.col === zombie.col)) {
    if (plant.typeId === 'potato-mine' && combatClock(state) > (plant.placedStep ?? plant.placedRound)) {
      event(events, 'mine', { sourceId: plant.id, targetId: zombie.id, row: zombie.row, col: zombie.col });
      hurt(state, zombie, zombie.hp, events, plant.id); hurt(state, plant, plant.hp, events, plant.id);
      break;
    }
    if (plant.typeId === 'spikeweed' && (zombie.lastSpikeStep ?? zombie.lastSpikeRound) !== combatClock(state)) {
      hurt(state, zombie, Math.max(1, plant.damage), events, plant.id);
      zombie.lastSpikeRound = state.round;
      zombie.lastSpikeStep = combatClock(state);
    }
  }
}

function advance(state, events) {
  for (const zombie of state.units.filter(unit => unit.side === 'zombies').sort((a, b) => a.col - b.col)) {
    groundContact(state, zombie, events);
    if (zombie.hp <= 0) continue;
    for (let step = 0; step < Math.max(1, zombie.move); step += 1) {
      const nextCol = zombie.col - 1;
      if (nextCol < 0) break;
      const blocker = !flying(zombie) && state.units.find(unit => unit.side === 'plants' && unit.hp > 0 && unit.row === zombie.row && unit.col === nextCol && !floorPlant(unit));
      if (blocker) {
        event(events, 'blocked', { unitId: zombie.id, targetId: blocker.id, row: zombie.row, col: zombie.col });
        break;
      }
      const fromCol = zombie.col;
      zombie.col = nextCol;
      event(events, 'move', { unitId: zombie.id, row: zombie.row, fromCol, toCol: nextCol });
      groundContact(state, zombie, events);
      if (zombie.hp <= 0 || nextCol === 0) break;
    }
  }
  removeDead(state, events);
}

function bites(state, events) {
  // Carnivores eat before bites; their one-round recovery cannot eat infinitely.
  for (const plant of state.units.filter(unit => unit.side === 'plants' && unit.typeId === 'chomper')) {
    if (combatClock(state) <= (plant.lastChompStep ?? plant.lastChompRound) + 1) continue;
    const target = state.units.find(unit => unit.side === 'zombies' && unit.hp > 0 && !flying(unit) && unit.row === plant.row && unit.col >= plant.col && unit.col <= plant.col + 1);
    if (target) {
      hurt(state, target, target.hp, events, plant.id);
      plant.lastChompRound = state.round;
      plant.lastChompStep = combatClock(state);
      event(events, 'chomp', { sourceId: plant.id, targetId: target.id, row: plant.row, col: target.col });
    }
  }
  for (const zombie of state.units.filter(unit => unit.side === 'zombies' && unit.hp > 0 && !flying(unit))) {
    const plant = state.units.filter(unit => unit.side === 'plants' && unit.hp > 0 && unit.row === zombie.row && (unit.col === zombie.col || unit.col === zombie.col - 1)).sort((a, b) => b.col - a.col)[0];
    if (!plant) continue;
    event(events, 'bite', { sourceId: zombie.id, targetId: plant.id, row: zombie.row, col: plant.col });
    hurt(state, plant, Math.max(1, zombie.damage), events, zombie.id);
  }
  removeDead(state, events);
}

function mow(state, events) {
  for (let row = 0; row < BOARD_ROWS; row += 1) {
    if (!state.units.some(unit => unit.side === 'zombies' && unit.hp > 0 && unit.row === row && unit.col <= 0)) continue;
    if (state.mowers[row]) {
      state.mowers[row] = false;
      // A triggered mower clears every living zombie in its lane once.
      event(events, 'mower', { row, col: 0 });
      for (const zombie of state.units.filter(unit => unit.side === 'zombies' && unit.hp > 0 && unit.row === row)) hurt(state, zombie, zombie.hp, events, 'mower');
    } else {
      state.winner = 'zombies';
      event(events, 'invasion', { row });
    }
  }
  removeDead(state, events);
}

function battleStages(state, deploy) {
  // The combat clock keeps contact damage, mine arming and chomper recovery
  // moving during cleanup without creating more purchasing rounds or income.
  state.battleStep = Math.max(combatClock(state) + 1, state.round);
  const stages = []; const events = [];
  const stage = (name, run) => {
    const current = []; run(current); events.push(...current);
    stages.push({ name, units: copy(state.units), mowers: copy(state.mowers), events: current });
  };
  if (deploy) stage('deployment', list => {
    for (const side of SIDES) for (const order of state.plans[side]) {
      const unit = spawn(state, order);
      event(list, 'deploy', { unitId: unit.id, typeId: unit.typeId, side, row: unit.row, col: unit.col, free: !!order.free });
    }
  });
  stage('shots', list => shoot(state, list));
  stage('advance', list => advance(state, list));
  stage('bites', list => bites(state, list));
  stage('mowers', list => mow(state, list));
  return { stages, events };
}

function finalStage(state, stages, events) {
  state.publicResources = copy(state.resources);
  stages.push({ name: 'result', units: copy(state.units), mowers: copy(state.mowers), events: events.filter(item => ['victory', 'income', 'cleanup'].includes(item.type)) });
  return { state, stages, events };
}

export function resolveRound(original) {
  assert(original.phase === 'ready' && SIDES.every(side => original.planLocked[side]), 'Confirma primero los planes de ambos equipos; una ronda no se puede ejecutar dos veces.');
  const state = copy(original);
  const { stages, events } = battleStages(state, true);
  // Rounds limit purchasing, not travel time. A slow zombie deployed in the
  // last wave must still get a fair chance to reach the house or be defeated.
  const lastWave = state.round >= state.maxRounds;
  if (!state.winner && lastWave && !state.units.some(unit => unit.side === 'zombies')) state.winner = 'plants';
  state.stats.roundsResolved += 1;
  state.activeSide = null; state.plans = { plants: [], zombies: [] }; state.planLocked = pair(false);
  state.bonusThisRound = pair(0);
  if (state.winner) {
    state.phase = 'finished';
    event(events, 'victory', { side: state.winner });
  } else if (lastWave) {
    state.phase = 'cleanup';
    event(events, 'cleanup', { remainingZombies: state.units.filter(unit => unit.side === 'zombies').length });
  } else {
    state.round += 1; state.phase = 'resources';
    const flowers = Math.min(4, state.units.filter(unit => unit.side === 'plants' && unit.typeId === 'sunflower').length);
    addResource(state, 'plants', 25 + flowers * 25); addResource(state, 'zombies', 25);
    event(events, 'income', { plants: 25 + flowers * 25, zombies: 25 });
  }
  return finalStage(state, stages, events);
}

export function resolveCleanup(original) {
  assert(original.phase === 'cleanup' && !original.winner, 'Sólo se puede resolver el cierre de la última horda pendiente.');
  const state = copy(original);
  const { stages, events } = battleStages(state, false);
  state.stats.cleanupSteps = (state.stats.cleanupSteps || 0) + 1;
  if (!state.winner && !state.units.some(unit => unit.side === 'zombies')) state.winner = 'plants';
  if (!state.winner && state.stats.cleanupSteps >= MAX_CLEANUP_STEPS) state.winner = 'draw';
  if (state.winner) {
    state.phase = 'finished';
    event(events, 'victory', { side: state.winner });
  } else {
    event(events, 'cleanup', { remainingZombies: state.units.filter(unit => unit.side === 'zombies').length });
  }
  return finalStage(state, stages, events);
}

export function publicSnapshot(state) {
  const secret = state.config.planning === 'secret' && ['planning', 'handover', 'ready'].includes(state.phase);
  // Do not leak remaining budgets, purchased types, IDs or spending statistics
  // to a second projected display during secret purchases.
  const stats = copy(state.stats);
  if (secret) delete stats.resourcesSpent;
  return {
    config: copy(state.config), phase: state.phase, activeSide: state.activeSide,
    round: state.round, maxRounds: state.maxRounds, resources: copy(secret ? state.publicResources : state.resources),
    units: copy(state.units), mowers: copy(state.mowers), winner: state.winner, stats,
    plans: secret ? { plants: [], zombies: [] } : copy(state.plans), planLocked: copy(state.planLocked),
  };
}

export function availableUnits(state, side) {
  validSide(side);
  const count = state.plans[side].length;
  return catalog().filter(unit => unit.side === side).map(unit => {
    let disabledReason = null;
    if (count >= orderLimit(side)) disabledReason = `Máximo de ${orderLimit(side)} compras por ronda.`;
    else if (side === 'zombies' && state.units.filter(item => item.side === 'zombies').length + count >= MAX_ZOMBIES) disabledReason = 'Máximo de 30 zombis en juego.';
    else if (state.resources[side] < unit.cost) disabledReason = 'Recursos insuficientes.';
    return { ...copy(unit), affordable: !disabledReason, disabledReason };
  });
}
