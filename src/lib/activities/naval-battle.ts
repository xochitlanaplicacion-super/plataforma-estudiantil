/** Local, immutable classroom game. No academic grades, database or student connection. */
export type NavalMapSize = 'small' | 'medium' | 'large';
export type NavalShipKind = 'nuclear' | 'semi_nuclear' | 'carrier' | 'supply' | 'destroyer' | 'hospital' | 'troops';
export type NavalSpecial = 'nuclear' | 'big_boy' | 'fat_boy' | 'night_fire' | 'radar' | 'flare' | 'repair';
export interface NavalCell { row: number; col: number }
export interface NavalShip {
  id: string; kind: NavalShipKind; anchor: NavalCell; rotation: number;
  cells: NavalCell[]; hits: NavalCell[]; sunk: boolean;
}
/** Shots are received on this player's own board, not a history of outgoing shots. */
export interface NavalShot extends NavalCell { hit: boolean }
export interface NavalPlayer {
  id: string; name: string; color: string; ships: NavalShip[]; shots: NavalShot[];
  xp: number; correctStreak: number; eliminated: boolean; usedSpecials: NavalSpecial[];
}
export interface NavalConfig {
  mapSize: NavalMapSize;
  turnOrder: 'sequential' | 'random';
  targetOrder: 'sequential' | 'random' | 'choice';
  questionMode: 'none' | 'multiple_choice' | 'true_false' | 'mixed';
}
export interface NavalAttackResult {
  actorId: string; targetId: string; cells: NavalShot[]; sunkShipIds: string[];
  special: NavalSpecial | null; eliminated: boolean;
  deflectedFrom?: NavalCell;
}
export interface NavalState {
  config: NavalConfig; size: number; islands: NavalCell[]; players: NavalPlayer[];
  phase: 'placement' | 'handoff' | 'question' | 'answer_result' | 'attack' | 'attack_result' | 'finished';
  placementIndex: number; turnNumber: number; actorId: string | null; targetId: string | null;
  answerCorrect: boolean | null; lastAttack: NavalAttackResult | null;
  radar: { targetId: string; cells: NavalCell[]; kind: 'radar' | 'flare'; durationSeconds: 3 | 2; interference: boolean } | null;
  winnerId: string | null; bonusUsedThisTurn: boolean;
}

export const MAP_SIZES: Record<NavalMapSize, number> = { small: 10, medium: 12, large: 14 };
export const NAVAL_XP_MAX = 100;
export const NAVAL_CORRECT_XP = 25;
export const NAVAL_FEVER_XP = 50;
export const NAVAL_HIT_XP = 25;
export const NAVAL_SUPPLY_XP = 20;
const LINE_ORIENTATIONS = [0, 45, 90, 135, 180, 225, 270, 315];
const SHAPED_ORIENTATIONS = [0, 90, 180, 270];
export const NAVAL_SHIP_INFO: Record<NavalShipKind, { name: string; cells: number; rotations: readonly number[]; terrain: 'sea' | 'land' }> = {
  nuclear: { name: 'Submarino nuclear', cells: 4, rotations: LINE_ORIENTATIONS, terrain: 'sea' },
  semi_nuclear: { name: 'Submarino seminuclear', cells: 3, rotations: LINE_ORIENTATIONS, terrain: 'sea' },
  carrier: { name: 'Portaaviones', cells: 5, rotations: SHAPED_ORIENTATIONS, terrain: 'sea' },
  supply: { name: 'Base de suministros', cells: 3, rotations: SHAPED_ORIENTATIONS, terrain: 'sea' },
  destroyer: { name: 'Destructor', cells: 2, rotations: LINE_ORIENTATIONS, terrain: 'sea' },
  hospital: { name: 'Buque hospital', cells: 3, rotations: SHAPED_ORIENTATIONS, terrain: 'sea' },
  troops: { name: 'Tropas terrestres', cells: 1, rotations: [0], terrain: 'land' },
};
export const NAVAL_SHIP_KINDS = Object.keys(NAVAL_SHIP_INFO) as NavalShipKind[];
export const NAVAL_SPECIAL_INFO: Record<NavalSpecial, { name: string; description: string; requiredShip: NavalShipKind; once: boolean; cost: number; aerial: boolean }> = {
  nuclear: { name: 'Bomba nuclear', description: 'Afecta un área de 3 × 3 coordenadas. Una vez por partida.', requiredShip: 'nuclear', once: true, cost: 100, aerial: true },
  big_boy: { name: 'Big Boy', description: 'Afecta dos coordenadas en línea horizontal o vertical aleatoria. Reutilizable.', requiredShip: 'nuclear', once: false, cost: 35, aerial: true },
  fat_boy: { name: 'Fat Boy', description: 'Afecta el centro y sus cuatro vecinos en cruz. Una vez por partida.', requiredShip: 'semi_nuclear', once: true, cost: 70, aerial: true },
  night_fire: { name: 'Night of Fire', description: 'Afecta tres coordenadas en una dirección aleatoria. Una vez por partida.', requiredShip: 'destroyer', once: true, cost: 70, aerial: false },
  radar: { name: 'Radar Vision', description: 'Revela un área de 3 × 3 durante tres segundos y conserva el disparo normal. Una vez por partida.', requiredShip: 'carrier', once: true, cost: 100, aerial: true },
  flare: { name: 'Bengala', description: 'Revela cinco coordenadas en cruz durante dos segundos, sin interferencia. Conserva el disparo normal.', requiredShip: 'troops', once: false, cost: 35, aerial: false },
  repair: { name: 'Reparación', description: 'Repara una casilla dañada de una nave propia que siga a flote. Una vez por partida; conserva el disparo normal.', requiredShip: 'hospital', once: true, cost: 100, aerial: false },
};

export const cellKey = (cell: NavalCell): string => `${cell.row}:${cell.col}`;
export type NavalRandom = () => number;
/** Fractional source for Fisher–Yates; injected sources make the engine deterministic in tests. */
export function navalRandom(): number {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    return values[0] / 0x100000000;
  }
  return Math.random();
}
const draw = (random: NavalRandom) => {
  const value = random();
  return Number.isFinite(value) ? Math.max(0, Math.min(1 - Number.EPSILON, value)) : 0;
};
export function shuffleNaval<T>(items: readonly T[], random: NavalRandom = navalRandom): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(draw(random) * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

function validCell(cell: NavalCell, size: number): boolean {
  return Number.isInteger(cell.row) && Number.isInteger(cell.col) && cell.row >= 0 && cell.col >= 0 && cell.row < size && cell.col < size;
}
function normalizedRotation(kind: NavalShipKind, rotation: number): number {
  if (!NAVAL_SHIP_KINDS.includes(kind) || !Number.isFinite(rotation)) throw new Error('Selecciona una nave y una rotación válidas.');
  const result = ((rotation % 360) + 360) % 360;
  if (!NAVAL_SHIP_INFO[kind].rotations.includes(result)) throw new Error('Esa rotación no coincide con la cuadrícula de esta nave.');
  return result;
}
/** Rotation is in degrees. The anchor is the first cell, not a bounding-box corner. */
export function previewShipCells(kind: NavalShipKind, anchor: NavalCell, rotation: number): NavalCell[] {
  const angle = normalizedRotation(kind, rotation);
  if (!Number.isInteger(anchor.row) || !Number.isInteger(anchor.col)) throw new Error('La posición debe coincidir con una coordenada de la cuadrícula.');
  if (kind === 'troops') return [{ ...anchor }];
  if (kind === 'nuclear' || kind === 'semi_nuclear' || kind === 'destroyer') {
    const directions: Record<number, [number, number]> = {
      0: [0, 1], 45: [1, 1], 90: [1, 0], 135: [1, -1],
      180: [0, -1], 225: [-1, -1], 270: [-1, 0], 315: [-1, 1],
    };
    const [row, col] = directions[angle];
    return Array.from({ length: NAVAL_SHIP_INFO[kind].cells }, (_, index) => ({ row: anchor.row + row * index, col: anchor.col + col * index }));
  }
  const shape = kind === 'carrier' ? [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1]] : [[0, 0], [1, 0], [0, 1]];
  return shape.map(([row, col]) => {
    const rotated = angle === 0 ? [row, col] : angle === 90 ? [col, -row] : angle === 180 ? [-row, -col] : [-col, row];
    return { row: anchor.row + rotated[0], col: anchor.col + rotated[1] };
  });
}

function cloneState(state: NavalState): NavalState {
  return {
    ...state, config: { ...state.config }, islands: state.islands.map((cell) => ({ ...cell })),
    players: state.players.map((player) => ({
      ...player, usedSpecials: [...player.usedSpecials], shots: player.shots.map((shot) => ({ ...shot })),
      ships: player.ships.map((ship) => ({ ...ship, anchor: { ...ship.anchor }, cells: ship.cells.map((cell) => ({ ...cell })), hits: ship.hits.map((cell) => ({ ...cell })) })),
    })),
    radar: state.radar ? { ...state.radar, cells: state.radar.cells.map((cell) => ({ ...cell })) } : null,
    lastAttack: state.lastAttack ? { ...state.lastAttack, ...(state.lastAttack.deflectedFrom ? { deflectedFrom: { ...state.lastAttack.deflectedFrom } } : {}), cells: state.lastAttack.cells.map((cell) => ({ ...cell })), sunkShipIds: [...state.lastAttack.sunkShipIds] } : null,
  };
}
function playerById(state: NavalState, playerId: string): NavalPlayer {
  const player = state.players.find((item) => item.id === playerId);
  if (!player) throw new Error('No se encontró a ese participante en esta partida.');
  return player;
}
function assertPlacement(state: NavalState, playerId: string): NavalPlayer {
  if (state.phase !== 'placement' || state.players[state.placementIndex]?.id !== playerId) throw new Error('Sólo puede colocar su flota el participante al que se está entregando el dispositivo.');
  return playerById(state, playerId);
}
function assertPhase(state: NavalState, phase: NavalState['phase']): void {
  if (state.phase !== phase) throw new Error('Esta acción no está disponible en el paso actual de la partida.');
}
function placementFits(state: NavalState, player: NavalPlayer, kind: NavalShipKind, cells: NavalCell[]): boolean {
  const land = new Set(state.islands.map(cellKey));
  const occupied = new Set(player.ships.filter((ship) => ship.kind !== kind).flatMap((ship) => ship.cells.map(cellKey)));
  return cells.every((cell) => validCell(cell, state.size) && !occupied.has(cellKey(cell)) && (kind === 'troops' ? land.has(cellKey(cell)) : !land.has(cellKey(cell))));
}
export function canPlaceNavalShip(state: NavalState, playerId: string, kind: NavalShipKind, anchor: NavalCell, rotation: number): boolean {
  try {
    const player = assertPlacement(state, playerId);
    return placementFits(state, player, kind, previewShipCells(kind, anchor, rotation));
  } catch { return false; }
}
export function placeNavalShip(state: NavalState, playerId: string, kind: NavalShipKind, anchor: NavalCell, rotation: number): NavalState {
  assertPlacement(state, playerId);
  const cells = previewShipCells(kind, anchor, rotation);
  if (!canPlaceNavalShip(state, playerId, kind, anchor, rotation)) throw new Error(kind === 'troops' ? 'Coloca las tropas dentro de una isla libre.' : 'La nave debe quedar dentro del mar, sin cruzar islas ni otra nave.');
  const next = cloneState(state);
  const player = playerById(next, playerId);
  const ship: NavalShip = { id: `${playerId}:${kind}`, kind, anchor: { ...anchor }, rotation: normalizedRotation(kind, rotation), cells, hits: [], sunk: false };
  player.ships = [...player.ships.filter((item) => item.kind !== kind), ship];
  return next;
}
export function removeNavalShip(state: NavalState, playerId: string, kind: NavalShipKind): NavalState {
  assertPlacement(state, playerId);
  const next = cloneState(state);
  playerById(next, playerId).ships = playerById(next, playerId).ships.filter((ship) => ship.kind !== kind);
  return next;
}

const CARDINAL: NavalCell[] = [{ row: -1, col: 0 }, { row: 1, col: 0 }, { row: 0, col: -1 }, { row: 0, col: 1 }];
function generateIslands(size: number, random: NavalRandom): NavalCell[] {
  const islands: NavalCell[] = [];
  const used = new Set<string>();
  const all = Array.from({ length: size * size }, (_, index) => ({ row: Math.floor(index / size), col: index % size }));
  const clusterCount = Math.max(2, size / 2 - 2);
  const neighbouring = (cell: NavalCell) => CARDINAL.map((direction) => ({ row: cell.row + direction.row, col: cell.col + direction.col }));
  for (let cluster = 0; cluster < clusterCount; cluster++) {
    const eligible = shuffleNaval(all.filter((cell) => !used.has(cellKey(cell)) && neighbouring(cell).every((item) => !used.has(cellKey(item)))), random);
    if (!eligible.length) break;
    const length = 1 + Math.floor(draw(random) * 6);
    const cells = [eligible[0]];
    const local = new Set([cellKey(cells[0])]);
    while (cells.length < length) {
      const choices = shuffleNaval(cells.flatMap(neighbouring).filter((cell) => validCell(cell, size) && !local.has(cellKey(cell)) && !used.has(cellKey(cell)) && neighbouring(cell).every((item) => !used.has(cellKey(item)))), random);
      if (!choices.length) break;
      const cell = choices[0];
      cells.push(cell); local.add(cellKey(cell));
    }
    for (const cell of cells) { islands.push({ ...cell }); used.add(cellKey(cell)); }
  }
  return islands;
}
const COLORS = ['#22d3ee', '#fb7185', '#fbbf24', '#a78bfa', '#34d399', '#fb923c', '#60a5fa', '#e879f9', '#a3e635', '#f472b6'];
export function createNavalBattle(config: NavalConfig, names: readonly string[], random: NavalRandom = navalRandom): NavalState {
  if (!config || !Object.prototype.hasOwnProperty.call(MAP_SIZES, config.mapSize) || !['sequential', 'random'].includes(config.turnOrder) || !['sequential', 'random', 'choice'].includes(config.targetOrder) || !['none', 'multiple_choice', 'true_false', 'mixed'].includes(config.questionMode)) throw new Error('La configuración de la partida no es válida.');
  if (names.length < 2 || names.length > 10) throw new Error('La partida admite entre 2 y 10 participantes o equipos.');
  const trimmed = names.map((name) => typeof name === 'string' ? name.trim() : '');
  if (trimmed.some((name) => !name || name.length > 60)) throw new Error('Escribe nombres de entre 1 y 60 caracteres para todos los participantes.');
  if (new Set(trimmed.map((name) => name.toLocaleLowerCase('es'))).size !== trimmed.length) throw new Error('Cada participante o equipo debe tener un nombre diferente.');
  const size = MAP_SIZES[config.mapSize];
  return {
    config: { ...config }, size, islands: generateIslands(size, random),
    players: trimmed.map((name, index) => ({ id: `player-${index + 1}`, name, color: COLORS[index], ships: [], shots: [], xp: 0, correctStreak: 0, eliminated: false, usedSpecials: [] })),
    phase: 'placement', placementIndex: 0, turnNumber: 0, actorId: null, targetId: null,
    answerCorrect: null, lastAttack: null, radar: null, winnerId: null, bonusUsedThisTurn: false,
  };
}

/** Bounded backtracking (not an unbounded random loop), starting with larger footprints. */
export function autoPlaceNavalFleet(state: NavalState, playerId: string, random: NavalRandom = navalRandom): NavalState {
  assertPlacement(state, playerId);
  const next = cloneState(state);
  const player = playerById(next, playerId);
  player.ships = [];
  const order: NavalShipKind[] = ['carrier', 'nuclear', 'semi_nuclear', 'supply', 'hospital', 'destroyer', 'troops'];
  const candidates = new Map<NavalShipKind, Array<{ anchor: NavalCell; rotation: number; cells: NavalCell[] }>>();
  for (const kind of order) {
    const possibilities: Array<{ anchor: NavalCell; rotation: number; cells: NavalCell[] }> = [];
    for (let row = 0; row < next.size; row++) for (let col = 0; col < next.size; col++) for (const rotation of NAVAL_SHIP_INFO[kind].rotations) {
      const anchor = { row, col }; const cells = previewShipCells(kind, anchor, rotation);
      if (placementFits(next, player, kind, cells)) possibilities.push({ anchor, rotation, cells });
    }
    candidates.set(kind, shuffleNaval(possibilities, random));
  }
  let visited = 0;
  const solve = (index: number): boolean => {
    if (index === order.length) return true;
    const kind = order[index];
    for (const candidate of candidates.get(kind) ?? []) {
      if (++visited > 50000) return false;
      if (!placementFits(next, player, kind, candidate.cells)) continue;
      player.ships.push({ id: `${playerId}:${kind}`, kind, anchor: { ...candidate.anchor }, rotation: candidate.rotation, cells: candidate.cells.map((cell) => ({ ...cell })), hits: [], sunk: false });
      if (solve(index + 1)) return true;
      player.ships.pop();
    }
    return false;
  };
  if (!solve(0)) throw new Error('No fue posible acomodar toda la flota. Reintenta la colocación automática o ajusta las posiciones.');
  return next;
}
export function confirmNavalFleet(state: NavalState, playerId: string): NavalState {
  const player = assertPlacement(state, playerId);
  if (player.ships.length !== NAVAL_SHIP_KINDS.length || NAVAL_SHIP_KINDS.some((kind) => !player.ships.some((ship) => ship.kind === kind))) throw new Error('Coloca las siete unidades antes de guardar y entregar el dispositivo.');
  const next = cloneState(state);
  next.placementIndex++;
  if (next.placementIndex >= next.players.length) next.phase = 'handoff';
  return next;
}

function nextSequential(state: NavalState, previousId: string | null, excludedId?: string): NavalPlayer {
  const previous = state.players.findIndex((player) => player.id === previousId);
  for (let offset = 1; offset <= state.players.length; offset++) {
    const candidate = state.players[(Math.max(-1, previous) + offset) % state.players.length];
    if (!candidate.eliminated && candidate.id !== excludedId) return candidate;
  }
  throw new Error('No quedan contrincantes disponibles.');
}
function resolveWinner(state: NavalState): boolean {
  const alive = state.players.filter((player) => !player.eliminated);
  if (alive.length > 1) return false;
  state.phase = 'finished'; state.winnerId = alive[0]?.id ?? null;
  state.radar = null; state.targetId = null;
  return true;
}
export function startNavalTurn(state: NavalState, random: NavalRandom = navalRandom): NavalState {
  assertPhase(state, 'handoff');
  const next = cloneState(state);
  if (resolveWinner(next)) return next;
  const alive = next.players.filter((player) => !player.eliminated);
  const actor = next.config.turnOrder === 'random' ? shuffleNaval(alive, random)[0] : nextSequential(next, next.actorId);
  next.actorId = actor.id;
  const rivals = alive.filter((player) => player.id !== actor.id);
  next.targetId = next.config.targetOrder === 'choice' && rivals.length > 1 ? null
    : next.config.targetOrder === 'random' ? shuffleNaval(rivals, random)[0].id : nextSequential(next, actor.id, actor.id).id;
  next.turnNumber++; next.answerCorrect = null; next.lastAttack = null; next.radar = null; next.bonusUsedThisTurn = false;
  if (actor.ships.some((ship) => ship.kind === 'supply' && !ship.sunk && ship.hits.length === 0)) actor.xp = Math.min(NAVAL_XP_MAX, actor.xp + NAVAL_SUPPLY_XP);
  next.phase = next.config.questionMode === 'none' ? 'attack' : 'question';
  return next;
}
export function answerNavalTurn(state: NavalState, correct: boolean): NavalState {
  assertPhase(state, 'question');
  if (typeof correct !== 'boolean') throw new Error('Indica si la respuesta fue correcta o incorrecta.');
  const next = cloneState(state);
  next.answerCorrect = correct; next.phase = 'answer_result';
  const actor = playerById(next, next.actorId!);
  if (correct) {
    actor.correctStreak++;
    actor.xp = Math.min(NAVAL_XP_MAX, actor.xp + (actor.correctStreak >= 3 ? NAVAL_FEVER_XP : NAVAL_CORRECT_XP));
  } else actor.correctStreak = 0;
  return next;
}
export function continueNavalAnswer(state: NavalState): NavalState {
  assertPhase(state, 'answer_result');
  const next = cloneState(state);
  next.phase = next.answerCorrect ? 'attack' : 'handoff';
  next.radar = null;
  return next;
}
export function advanceNavalTurn(state: NavalState): NavalState {
  assertPhase(state, 'attack_result');
  const next = cloneState(state);
  if (!resolveWinner(next)) next.phase = 'handoff';
  next.radar = null;
  return next;
}
/** An expired or skipped attack consumes this turn without damage or an XP reward. */
export function skipNavalAttack(state: NavalState): NavalState {
  assertPhase(state, 'attack');
  const next = cloneState(state);
  next.phase = 'attack_result'; next.lastAttack = null; next.radar = null;
  return next;
}
export function selectNavalTarget(state: NavalState, targetId: string): NavalState {
  if (!['question', 'answer_result', 'attack'].includes(state.phase) || state.config.targetOrder !== 'choice') throw new Error('Los contrincantes sólo se eligen en el modo Todos contra todos.');
  // A self-repair may be used before choosing a rival. Radar/flare already require one.
  if (state.bonusUsedThisTurn && state.targetId !== null) throw new Error('El radar o el bonus ya fijó el contrincante de este turno.');
  const target = playerById(state, targetId);
  if (target.eliminated || target.id === state.actorId) throw new Error('Selecciona otro participante cuya flota siga en juego.');
  const next = cloneState(state); next.targetId = targetId; next.radar = null;
  return next;
}
export function availableNavalSpecials(state: NavalState): NavalSpecial[] {
  if (state.phase !== 'attack' || !state.actorId || state.bonusUsedThisTurn) return [];
  const actor = playerById(state, state.actorId);
  return (Object.keys(NAVAL_SPECIAL_INFO) as NavalSpecial[]).filter((special) => {
    const info = NAVAL_SPECIAL_INFO[special];
    const repairTarget = special !== 'repair' || actor.ships.some((ship) => ship.kind !== 'troops' && !ship.sunk && ship.hits.length > 0);
    return repairTarget && actor.xp >= info.cost && (!info.once || !actor.usedSpecials.includes(special)) && actor.ships.some((ship) => ship.kind === info.requiredShip && !ship.sunk && ship.hits.length === 0);
  });
}
function attackActors(state: NavalState, cell: NavalCell): { actor: NavalPlayer; target: NavalPlayer } {
  assertPhase(state, 'attack');
  if (!validCell(cell, state.size)) throw new Error('Elige una coordenada dentro del mapa.');
  if (!state.actorId || !state.targetId) throw new Error('Elige a qué contrincante vas a atacar.');
  const actor = playerById(state, state.actorId); const target = playerById(state, state.targetId);
  if (actor.eliminated || target.eliminated || actor.id === target.id) throw new Error('Ese enfrentamiento ya no está disponible.');
  return { actor, target };
}
function consumeSpecial(state: NavalState, special: NavalSpecial): void {
  if (!availableNavalSpecials(state).includes(special)) throw new Error('Este bonus necesita XP suficiente para su nivel, su nave intacta y un uso disponible.');
  const actor = playerById(state, state.actorId!);
  actor.xp -= NAVAL_SPECIAL_INFO[special].cost; state.bonusUsedThisTurn = true;
  if (!actor.usedSpecials.includes(special)) actor.usedSpecials.push(special);
}
function squareCells(cell: NavalCell, size: number): NavalCell[] {
  const cells: NavalCell[] = [];
  for (let row = -1; row <= 1; row++) for (let col = -1; col <= 1; col++) cells.push({ row: cell.row + row, col: cell.col + col });
  return cells.filter((item) => validCell(item, size));
}
function crossCells(cell: NavalCell, size: number): NavalCell[] {
  return [cell, ...CARDINAL.map((direction) => ({ row: cell.row + direction.row, col: cell.col + direction.col }))].filter((item) => validCell(item, size)).map((item) => ({ ...item }));
}
/** Anti-air belongs to the complete connected island occupied by live troops. */
function flakProtects(state: NavalState, target: NavalPlayer, aim: NavalCell): boolean {
  const troops = target.ships.find((ship) => ship.kind === 'troops' && !ship.sunk);
  if (!troops) return false;
  const islands = new Set(state.islands.map(cellKey));
  const queue = troops.cells.filter((cell) => islands.has(cellKey(cell))).map((cell) => ({ ...cell }));
  const visited = new Set(queue.map(cellKey));
  while (queue.length) {
    const cell = queue.shift()!;
    if (Math.max(Math.abs(aim.row - cell.row), Math.abs(aim.col - cell.col)) <= 2) return true;
    for (const direction of CARDINAL) {
      const next = { row: cell.row + direction.row, col: cell.col + direction.col };
      const key = cellKey(next);
      if (islands.has(key) && !visited.has(key)) { visited.add(key); queue.push(next); }
    }
  }
  return false;
}
function driftBomb(state: NavalState, target: NavalPlayer, aim: NavalCell, random: NavalRandom): NavalCell {
  const previous = new Set(target.shots.map(cellKey));
  const neighbours: NavalCell[] = [];
  for (let row = -1; row <= 1; row++) for (let col = -1; col <= 1; col++) {
    if (!row && !col) continue;
    const cell = { row: aim.row + row, col: aim.col + col };
    if (validCell(cell, state.size) && !previous.has(cellKey(cell))) neighbours.push(cell);
  }
  // If all neighbours were shot, the untouched original aim still produces a real shot.
  return shuffleNaval(neighbours, random)[0] ?? { ...aim };
}
export interface NavalAttackOptions { reducedNuclear?: boolean }
function specialCells(state: NavalState, cell: NavalCell, special: NavalSpecial | undefined, random: NavalRandom, options: NavalAttackOptions): NavalCell[] {
  if (!special) return [{ ...cell }];
  if (special === 'nuclear') return options.reducedNuclear ? crossCells(cell, state.size) : squareCells(cell, state.size);
  if (special === 'fat_boy') return crossCells(cell, state.size);
  const directions = special === 'big_boy' ? CARDINAL : [
    ...CARDINAL, { row: -1, col: -1 }, { row: -1, col: 1 }, { row: 1, col: -1 }, { row: 1, col: 1 },
  ];
  const length = special === 'big_boy' ? 2 : 3;
  const complete = directions.filter((direction) => validCell({ row: cell.row + direction.row * (length - 1), col: cell.col + direction.col * (length - 1) }, state.size));
  const direction = shuffleNaval(complete.length ? complete : directions, random)[0];
  return Array.from({ length }, (_, index) => ({ row: cell.row + direction.row * index, col: cell.col + direction.col * index })).filter((item) => validCell(item, state.size));
}
export function attackNaval(state: NavalState, cell: NavalCell, special?: NavalSpecial, random: NavalRandom = navalRandom, options: NavalAttackOptions = {}): NavalState {
  const { target } = attackActors(state, cell);
  if (special === 'radar') throw new Error('Usa Radar Vision antes del disparo; el radar no causa daño.');
  if (special === 'flare') throw new Error('Usa Bengala antes del disparo; la bengala no causa daño.');
  if (special === 'repair') throw new Error('Selecciona una casilla dañada de una nave propia para repararla.');
  if (target.shots.some((shot) => cellKey(shot) === cellKey(cell))) throw new Error('Esa coordenada ya recibió un disparo. Elige otra.');
  const next = cloneState(state);
  if (special) consumeSpecial(next, special);
  const victim = playerById(next, target.id);
  const seen = new Set(victim.shots.map(cellKey));
  const result: NavalAttackResult = { actorId: next.actorId!, targetId: victim.id, cells: [], sunkShipIds: [], special: special ?? null, eliminated: false };
  const impact = special && NAVAL_SPECIAL_INFO[special].aerial && flakProtects(next, victim, cell) ? driftBomb(next, victim, cell, random) : { ...cell };
  if (cellKey(impact) !== cellKey(cell)) result.deflectedFrom = { ...cell };
  for (const position of specialCells(next, impact, special, random, options)) {
    const key = cellKey(position);
    if (seen.has(key)) continue;
    const ship = victim.ships.find((item) => item.cells.some((occupied) => cellKey(occupied) === key));
    const shot = { ...position, hit: !!ship };
    victim.shots.push(shot); result.cells.push({ ...shot }); seen.add(key);
    if (ship) {
      ship.hits.push({ ...position });
      if (ship.hits.length === ship.cells.length) { ship.sunk = true; result.sunkShipIds.push(ship.id); }
    }
  }
  victim.eliminated = victim.ships.length === NAVAL_SHIP_KINDS.length && victim.ships.every((ship) => ship.sunk);
  result.eliminated = victim.eliminated;
  if (next.config.questionMode === 'none' && result.cells.some((shot) => shot.hit)) {
    const actor = playerById(next, next.actorId!);
    actor.xp = Math.min(NAVAL_XP_MAX, actor.xp + NAVAL_HIT_XP);
  }
  next.lastAttack = result; next.radar = null; next.phase = 'attack_result';
  return next;
}
export function activateNavalRadar(state: NavalState, cell: NavalCell): NavalState {
  const { target } = attackActors(state, cell);
  const next = cloneState(state);
  consumeSpecial(next, 'radar');
  next.radar = { targetId: target.id, cells: squareCells(cell, next.size), kind: 'radar', durationSeconds: 3, interference: flakProtects(next, target, cell) };
  return next;
}
export function activateNavalFlare(state: NavalState, cell: NavalCell): NavalState {
  const { target } = attackActors(state, cell);
  const next = cloneState(state);
  consumeSpecial(next, 'flare');
  next.radar = { targetId: target.id, cells: crossCells(cell, next.size), kind: 'flare', durationSeconds: 2, interference: false };
  return next;
}
export function repairNavalShip(state: NavalState, shipId: string, cell: NavalCell): NavalState {
  assertPhase(state, 'attack');
  if (!state.actorId) throw new Error('No hay un participante activo para reparar su flota.');
  const actor = playerById(state, state.actorId);
  const ship = actor.ships.find((item) => item.id === shipId);
  if (!ship || ship.kind === 'troops' || ship.sunk || !ship.hits.some((hit) => cellKey(hit) === cellKey(cell))) throw new Error('Elige una casilla dañada de una nave propia que siga a flote; no se pueden revivir naves hundidas.');
  const next = cloneState(state);
  consumeSpecial(next, 'repair');
  const repaired = playerById(next, actor.id);
  repaired.ships.find((item) => item.id === shipId)!.hits = ship.hits.filter((hit) => cellKey(hit) !== cellKey(cell)).map((hit) => ({ ...hit }));
  repaired.shots = repaired.shots.filter((shot) => cellKey(shot) !== cellKey(cell));
  next.radar = null;
  return next;
}
/** The UI clears after radar.durationSeconds; it never changes phase or spends a shot. */
export function clearNavalRadar(state: NavalState): NavalState {
  if (!state.radar) return state;
  const next = cloneState(state); next.radar = null;
  return next;
}
