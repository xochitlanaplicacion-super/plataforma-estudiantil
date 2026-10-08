import { describe, expect, it } from 'vitest';
import {
  MAP_SIZES, NAVAL_CORRECT_XP, NAVAL_FEVER_XP, NAVAL_HIT_XP, NAVAL_SHIP_INFO, NAVAL_SHIP_KINDS,
  NAVAL_SPECIAL_INFO, NAVAL_SUPPLY_XP, NAVAL_XP_MAX,
  activateNavalFlare, activateNavalRadar, advanceNavalTurn, answerNavalTurn, attackNaval, autoPlaceNavalFleet,
  availableNavalSpecials, canPlaceNavalShip, cellKey, clearNavalRadar, confirmNavalFleet,
  continueNavalAnswer, createNavalBattle, placeNavalShip, previewShipCells, removeNavalShip,
  repairNavalShip, selectNavalTarget, shuffleNaval, skipNavalAttack, startNavalTurn,
  type NavalCell, type NavalConfig, type NavalMapSize, type NavalShipKind, type NavalSpecial, type NavalState,
} from '@/lib/activities/naval-battle';

const config: NavalConfig = { mapSize: 'small', turnOrder: 'sequential', targetOrder: 'sequential', questionMode: 'none' };
function seeded(seed = 1) {
  let current = seed >>> 0;
  return () => { current = (Math.imul(current, 1664525) + 1013904223) >>> 0; return current / 0x100000000; };
}
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    Object.values(value).forEach(freeze);
  }
  return value;
}
const preparedCache = new Map<string, NavalState>();
function prepared(overrides: Partial<NavalConfig> = {}, count = 2): NavalState {
  const settings = { ...config, ...overrides };
  const key = JSON.stringify({ settings, count });
  if (!preparedCache.has(key)) {
    const random = seeded(2489);
    let state = createNavalBattle(settings, Array.from({ length: count }, (_, index) => `Equipo ${index + 1}`), random);
    for (const player of state.players) {
      state = autoPlaceNavalFleet(state, player.id, random);
      state = confirmNavalFleet(state, player.id);
    }
    preparedCache.set(key, state);
  }
  return copy(preparedCache.get(key)!);
}
const playing = (overrides: Partial<NavalConfig> = {}, count = 2, random = seeded(975)) => startNavalTurn(prepared(overrides, count), random);
const actor = (state: NavalState) => state.players.find((player) => player.id === state.actorId)!;
const target = (state: NavalState) => state.players.find((player) => player.id === state.targetId)!;
function openCell(state: NavalState, hit = false): NavalCell {
  const enemy = target(state);
  const shots = new Set(enemy.shots.map(cellKey));
  const fleet = new Set(enemy.ships.flatMap((ship) => ship.cells.map(cellKey)));
  for (let row = 0; row < state.size; row++) for (let col = 0; col < state.size; col++) {
    const cell = { row, col };
    if (!shots.has(cellKey(cell)) && fleet.has(cellKey(cell)) === hit) return cell;
  }
  throw new Error('La prueba no encontró una coordenada libre.');
}
function nextTurn(state: NavalState, random = seeded(125)): NavalState {
  return startNavalTurn(advanceNavalTurn(attackNaval(state, openCell(state))), random);
}
function charged(overrides: Partial<NavalConfig> = {}): NavalState {
  const state = playing({ questionMode: 'none', ...overrides });
  actor(state).xp = NAVAL_XP_MAX;
  return state;
}
/** Geometry tests isolate damage footprints from the independently tested island anti-air. */
function withoutFlak(state: NavalState): NavalState { state.islands = []; return state; }

describe('Naval classroom configuration and terrain', () => {
  it('accepts only 2–10 uniquely named participants and creates local, ungraded boards', () => {
    const state = createNavalBattle(config, ['  Azul  ', 'Rojo'], seeded(1));
    expect(state.players.map((player) => player.name)).toEqual(['Azul', 'Rojo']);
    expect(state.phase).toBe('placement');
    expect(state.actorId).toBeNull();
    expect(state.players.every((player) => !player.ships.length && !player.shots.length && player.xp === 0)).toBe(true);
    expect(state).not.toHaveProperty('grade');
    expect(() => createNavalBattle(config, ['Uno'])).toThrow(/2 y 10/);
    expect(() => createNavalBattle(config, Array.from({ length: 11 }, (_, index) => String(index)))).toThrow(/2 y 10/);
    expect(() => createNavalBattle(config, ['Ana', ' ana '])).toThrow(/diferente/);
    expect(() => createNavalBattle(config, ['A', '  '])).toThrow(/nombres/);
    expect(() => createNavalBattle(config, ['A', 'B'.repeat(61)])).toThrow(/60/);
    expect(() => createNavalBattle({ ...config, turnOrder: 'invalid' as 'random' }, ['A', 'B'])).toThrow(/configuración/);
  });

  it.each(Object.keys(MAP_SIZES) as NavalMapSize[])('%s has the requested size, few islands, connected 1–6-cell clusters, and room for all ten fleets', (mapSize) => {
    const random = seeded(2489);
    let state = createNavalBattle({ ...config, mapSize }, Array.from({ length: 10 }, (_, index) => `Equipo ${index + 1}`), random);
    expect(state.size).toBe(MAP_SIZES[mapSize]);
    expect(state.size).toBeGreaterThanOrEqual(10);
    expect(state.islands.length).toBeGreaterThan(0);
    expect(state.islands.length).toBeLessThan(state.size * state.size / 4);
    const remaining = new Set(state.islands.map(cellKey));
    while (remaining.size) {
      const [first] = remaining;
      const queue = [first]; remaining.delete(first);
      let count = 0;
      while (queue.length) {
        const [row, col] = queue.shift()!.split(':').map(Number); count++;
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const neighbour = `${row + dr}:${col + dc}`;
          if (remaining.delete(neighbour)) queue.push(neighbour);
        }
      }
      expect(count).toBeGreaterThanOrEqual(1); expect(count).toBeLessThanOrEqual(6);
    }
    const terrain = state.islands.map(cellKey);
    for (const player of state.players) {
      const original = freeze(state);
      state = autoPlaceNavalFleet(original, player.id, random);
      const fleet = state.players.find((item) => item.id === player.id)!.ships;
      expect(fleet).toHaveLength(7);
      expect(new Set(fleet.flatMap((ship) => ship.cells.map(cellKey))).size).toBe(21);
      fleet.forEach((ship) => ship.cells.forEach((cell) => {
        expect(cell.row).toBeGreaterThanOrEqual(0); expect(cell.row).toBeLessThan(state.size);
        expect(cell.col).toBeGreaterThanOrEqual(0); expect(cell.col).toBeLessThan(state.size);
        expect(terrain.includes(cellKey(cell))).toBe(ship.kind === 'troops');
      }));
      state = confirmNavalFleet(state, player.id);
    }
    expect(state.phase).toBe('handoff');
    expect(state.islands.map(cellKey)).toEqual(terrain);
  });

  it.each([0, 1, -4, 9, NaN, Infinity])('bounded random handling (%s) retains a valid map and automatic fleet', (draw) => {
    let state = createNavalBattle(config, ['A', 'B'], () => draw);
    state = autoPlaceNavalFleet(state, state.players[0].id, () => draw);
    expect(state.players[0].ships).toHaveLength(7);
  });

  it('Fisher–Yates shuffles a copy, preserves all values, and clamps malformed random fractions', () => {
    const values = freeze([1, 2, 3, 4]);
    expect(shuffleNaval(values, () => 0)).toEqual([2, 3, 4, 1]);
    expect(values).toEqual([1, 2, 3, 4]);
    for (const value of [NaN, Infinity, -100, 100]) expect(shuffleNaval(values, () => value).sort()).toEqual([1, 2, 3, 4]);
  });
});

describe('Naval exact-grid placement and privacy', () => {
  it.each(NAVAL_SHIP_KINDS)('%s exposes every legal degree rotation without duplicate or fractional coordinates', (kind) => {
    for (const rotation of NAVAL_SHIP_INFO[kind].rotations) {
      const cells = previewShipCells(kind, { row: 5, col: 5 }, rotation);
      expect(cells).toHaveLength(NAVAL_SHIP_INFO[kind].cells);
      expect(new Set(cells.map(cellKey)).size).toBe(cells.length);
      expect(cells.every((cell) => Number.isInteger(cell.row) && Number.isInteger(cell.col))).toBe(true);
    }
  });

  it('represents a 3+2 carrier, triangular supply base, four-cell diagonals and single island troop', () => {
    expect(previewShipCells('carrier', { row: 0, col: 0 }, 0)).toEqual([
      { row: 0, col: 0 }, { row: 1, col: 0 }, { row: 2, col: 0 }, { row: 0, col: 1 }, { row: 1, col: 1 },
    ]);
    expect(previewShipCells('supply', { row: 2, col: 2 }, 90)).toEqual([{ row: 2, col: 2 }, { row: 2, col: 1 }, { row: 3, col: 2 }]);
    expect(previewShipCells('nuclear', { row: 5, col: 5 }, 315)).toEqual([{ row: 5, col: 5 }, { row: 4, col: 6 }, { row: 3, col: 7 }, { row: 2, col: 8 }]);
    expect(previewShipCells('troops', { row: 2, col: 3 }, 0)).toEqual([{ row: 2, col: 3 }]);
    expect(() => previewShipCells('carrier', { row: 5, col: 5 }, 45)).toThrow(/rotación/);
    expect(() => previewShipCells('nuclear', { row: 0.5, col: 0 }, 0)).toThrow(/coordenada/);
    expect(() => previewShipCells('nuclear', { row: 0, col: 0 }, NaN)).toThrow(/válidas/);
  });

  it('replaces a previous same-kind placement but rejects other ships, land, bounds and the wrong participant', () => {
    let state = createNavalBattle(config, ['A', 'B'], seeded(1));
    state.islands = [{ row: 9, col: 9 }];
    const id = state.players[0].id;
    const old = freeze(state);
    state = placeNavalShip(old, id, 'nuclear', { row: 0, col: 0 }, 0);
    expect(old.players[0].ships).toHaveLength(0);
    expect(canPlaceNavalShip(state, id, 'nuclear', { row: 0, col: 1 }, 0)).toBe(true);
    state = placeNavalShip(state, id, 'nuclear', { row: 0, col: 1 }, 0);
    expect(state.players[0].ships).toHaveLength(1);
    expect(canPlaceNavalShip(state, id, 'destroyer', { row: 0, col: 2 }, 0)).toBe(false);
    expect(canPlaceNavalShip(state, id, 'destroyer', { row: 9, col: 8 }, 0)).toBe(false);
    expect(canPlaceNavalShip(state, id, 'nuclear', { row: 0, col: 0 }, 180)).toBe(false);
    expect(canPlaceNavalShip(state, id, 'troops', { row: 1, col: 1 }, 0)).toBe(false);
    expect(canPlaceNavalShip(state, id, 'troops', { row: 9, col: 9 }, 0)).toBe(true);
    expect(canPlaceNavalShip(state, state.players[1].id, 'destroyer', { row: 3, col: 3 }, 0)).toBe(false);
    expect(() => placeNavalShip(state, state.players[1].id, 'destroyer', { row: 3, col: 3 }, 0)).toThrow(/participante/);
    expect(() => placeNavalShip(state, id, 'troops', { row: 1, col: 1 }, 0)).toThrow(/isla/);
    state = removeNavalShip(freeze(state), id, 'nuclear');
    expect(state.players[0].ships).toHaveLength(0);
  });

  it('will not advance an incomplete fleet and exposes the next player only after confirmation', () => {
    let state = createNavalBattle(config, ['A', 'B'], seeded(1));
    expect(() => confirmNavalFleet(state, state.players[0].id)).toThrow(/siete/);
    state = autoPlaceNavalFleet(state, state.players[0].id, seeded(3));
    state = confirmNavalFleet(freeze(state), state.players[0].id);
    expect(state.placementIndex).toBe(1); expect(state.phase).toBe('placement');
    expect(() => confirmNavalFleet(state, state.players[0].id)).toThrow(/participante/);
    expect(() => startNavalTurn(state)).toThrow(/paso actual/);
    state = autoPlaceNavalFleet(state, state.players[1].id, seeded(4));
    state = confirmNavalFleet(state, state.players[1].id);
    expect(state.phase).toBe('handoff'); expect(state.actorId).toBeNull();
    expect(() => removeNavalShip(state, state.players[1].id, 'troops')).toThrow(/participante/);
  });
});

describe('Independent naval turns and question gates', () => {
  it('cycles live players and the following opponent sequentially', () => {
    let state = playing({}, 3);
    const turns: Array<[string | null, string | null]> = [];
    for (let index = 0; index < 6; index++) { turns.push([state.actorId, state.targetId]); state = nextTurn(state); }
    expect(turns).toEqual([
      ['player-1', 'player-2'], ['player-2', 'player-3'], ['player-3', 'player-1'],
      ['player-1', 'player-2'], ['player-2', 'player-3'], ['player-3', 'player-1'],
    ]);
    expect(state.turnNumber).toBe(7);
  });

  it('fresh Fisher–Yates draws allow the same actor on consecutive random turns, never self-attacking', () => {
    let state = playing({ turnOrder: 'random', targetOrder: 'random' }, 3, () => 0);
    const first = state.actorId;
    for (let index = 0; index < 4; index++) {
      expect(state.actorId).toBe(first); expect(state.targetId).not.toBe(first);
      state = nextTurn(state, () => 0);
    }
    expect(first).toBe('player-2');
  });

  it('random rivals do not randomize the sequential actor, and random actors do not randomize sequential rivals', () => {
    const randomRival = playing({ targetOrder: 'random' }, 3, () => 0);
    expect(randomRival.actorId).toBe('player-1'); expect(randomRival.targetId).toBe('player-3');
    const randomActor = playing({ turnOrder: 'random' }, 3, () => 0);
    expect(randomActor.actorId).toBe('player-2'); expect(randomActor.targetId).toBe('player-3');
  });

  it('all-against-all chooses only another live player; two participants always get each other', () => {
    let state = playing({ targetOrder: 'choice' }, 3);
    expect(state.targetId).toBeNull();
    expect(() => attackNaval(state, { row: 0, col: 0 })).toThrow(/contrincante/);
    expect(() => selectNavalTarget(state, state.actorId!)).toThrow(/otro participante/);
    state = selectNavalTarget(freeze(state), 'player-3'); expect(state.targetId).toBe('player-3');
    expect(playing({ targetOrder: 'choice' }).targetId).toBe('player-2');
    expect(() => selectNavalTarget(playing(), 'player-2')).toThrow(/Todos contra todos/);
  });

  it('eliminated fleets never receive a turn or become a rival', () => {
    const state = prepared({}, 3); state.players[0].eliminated = true;
    const next = startNavalTurn(freeze(state), () => 0);
    expect(next.actorId).toBe('player-2'); expect(next.targetId).toBe('player-3');
    const choice = playing({ targetOrder: 'choice' }, 3); choice.players[2].eliminated = true;
    expect(() => selectNavalTarget(choice, 'player-3')).toThrow(/siga en juego/);
  });

  it.each(['multiple_choice', 'true_false', 'mixed'] as const)('%s gates a single shot behind a correct answer and prevents double-answer XP', (questionMode) => {
    const question = freeze(playing({ questionMode }));
    expect(question.phase).toBe('question'); expect(actor(question).xp).toBe(NAVAL_SUPPLY_XP);
    expect(() => attackNaval(question, openCell(question))).toThrow(/paso actual/);
    const answered = answerNavalTurn(question, true);
    expect(answered.phase).toBe('answer_result'); expect(actor(answered).xp).toBe(NAVAL_SUPPLY_XP + NAVAL_CORRECT_XP);
    expect(actor(question).xp).toBe(NAVAL_SUPPLY_XP);
    expect(() => answerNavalTurn(answered, true)).toThrow(/paso actual/);
    const attack = continueNavalAnswer(freeze(answered));
    expect(attack.phase).toBe('attack'); expect(attack.answerCorrect).toBe(true);
    const result = attackNaval(attack, openCell(attack, true));
    expect(actor(result).xp).toBe(NAVAL_SUPPLY_XP + NAVAL_CORRECT_XP);
    expect(() => attackNaval(result, openCell(result))).toThrow(/paso actual/);
  });

  it('wrong or expired questions hand off without a shot, while supply XP continues per intact own turn', () => {
    const question = playing({ questionMode: 'mixed' });
    const answered = answerNavalTurn(freeze(question), false);
    expect(actor(answered).xp).toBe(NAVAL_SUPPLY_XP);
    const next = continueNavalAnswer(answered);
    expect(next.phase).toBe('handoff'); expect(next.answerCorrect).toBe(false);
    expect(next.players.every((player) => player.shots.length === 0)).toBe(true);
    expect(startNavalTurn(next).actorId).toBe('player-2');
  });

  it('expired attacks preserve answers but do not deal damage, consume another bonus or award XP', () => {
    let state = playing({ questionMode: 'mixed' });
    state = continueNavalAnswer(answerNavalTurn(state, true));
    const before = freeze(state);
    const next = skipNavalAttack(before);
    expect(next.phase).toBe('attack_result'); expect(next.lastAttack).toBeNull(); expect(next.answerCorrect).toBe(true);
    expect(next.players).toEqual(before.players); expect(next.radar).toBeNull();
    expect(() => skipNavalAttack(next)).toThrow(/paso actual/);
    expect(startNavalTurn(advanceNavalTurn(next)).actorId).toBe('player-2');
  });

  it('supply grants fixed XP only while completely undamaged and caps the meter at 100', () => {
    const handoff = prepared(); handoff.players[0].xp = 95;
    expect(actor(startNavalTurn(handoff)).xp).toBe(100);
    const damaged = prepared();
    const supply = damaged.players[0].ships.find((ship) => ship.kind === 'supply')!;
    supply.hits = [{ ...supply.cells[0] }];
    expect(actor(startNavalTurn(damaged)).xp).toBe(0);
  });
});

describe('Naval shots, destruction, bonuses and immutable outcomes', () => {
  it('records a red hit or white miss once on the opponent only, and no-question hits award 25 XP', () => {
    const miss = freeze(playing());
    const missResult = attackNaval(miss, openCell(miss));
    expect(missResult.lastAttack!.cells[0].hit).toBe(false);
    expect(target(missResult).shots).toHaveLength(1); expect(actor(missResult).shots).toHaveLength(0);
    expect(actor(missResult).xp).toBe(NAVAL_SUPPLY_XP);
    expect(target(miss).shots).toHaveLength(0);
    const hit = freeze(playing());
    const hitResult = attackNaval(hit, openCell(hit, true));
    expect(hitResult.lastAttack!.cells[0].hit).toBe(true);
    expect(actor(hitResult).xp).toBe(NAVAL_SUPPLY_XP + NAVAL_HIT_XP);
    expect(target(hitResult).ships.reduce((sum, ship) => sum + ship.hits.length, 0)).toBe(1);
  });

  it('rejects invalid coordinates, repeated centers and a second click without damage or XP', () => {
    const state = playing();
    for (const cell of [{ row: -1, col: 0 }, { row: 0, col: state.size }, { row: 1.2, col: 0 }, { row: NaN, col: 0 }]) {
      expect(() => attackNaval(state, cell)).toThrow(/coordenada/);
    }
    const cell = openCell(state, true);
    const result = attackNaval(state, cell);
    expect(() => attackNaval(result, cell)).toThrow(/paso actual/);
    const anotherAttack = copy(result); anotherAttack.phase = 'attack';
    expect(() => attackNaval(anotherAttack, cell)).toThrow(/ya recibió/);
    expect(target(result).shots).toHaveLength(1);
  });

  it('keeps destroyed ship footprints and hit points visible as wreckage, then finishes after all seven units sink', () => {
    const state = playing(); const victim = target(state);
    const troops = victim.ships.find((ship) => ship.kind === 'troops')!;
    const before = copy(troops);
    const result = attackNaval(freeze(state), troops.cells[0]);
    const wreck = target(result).ships.find((ship) => ship.id === troops.id)!;
    expect(wreck.sunk).toBe(true); expect(wreck.cells).toEqual(before.cells);
    expect(wreck.hits).toEqual(before.cells); expect(result.lastAttack!.sunkShipIds).toEqual([troops.id]);
    const last = playing(); const enemy = target(last);
    const finalCell = enemy.ships.find((ship) => ship.kind === 'troops')!.cells[0];
    for (const ship of enemy.ships) {
      if (ship.kind === 'troops') continue;
      ship.sunk = true; ship.hits = copy(ship.cells);
      enemy.shots.push(...ship.cells.map((cell) => ({ ...cell, hit: true })));
    }
    const finalAttack = attackNaval(last, finalCell);
    expect(target(finalAttack).eliminated).toBe(true); expect(finalAttack.lastAttack!.eliminated).toBe(true);
    const finished = advanceNavalTurn(finalAttack);
    expect(finished.phase).toBe('finished'); expect(finished.winnerId).toBe(last.actorId);
    expect(finished.players[1].ships).toHaveLength(7);
    expect(() => startNavalTurn(finished)).toThrow(/paso actual/);
  });

  it('only a sufficient XP tier and a completely untouched living ship enable its special', () => {
    const full = charged(); expect(availableNavalSpecials(full)).toEqual(Object.keys(NAVAL_SPECIAL_INFO).filter((special) => special !== 'repair'));
    const partial = copy(full); actor(partial).xp = 34; expect(availableNavalSpecials(partial)).toEqual([]);
    for (const special of Object.keys(NAVAL_SPECIAL_INFO) as NavalSpecial[]) {
      const state = copy(full);
      const repairTarget = actor(state).ships.find((item) => item.kind === 'nuclear')!;
      if (special === 'repair') repairTarget.hits = [{ ...repairTarget.cells[0] }];
      const ship = actor(state).ships.find((item) => item.kind === NAVAL_SPECIAL_INFO[special].requiredShip)!;
      ship.hits = [{ ...ship.cells[0] }];
      expect(availableNavalSpecials(state)).not.toContain(special);
      expect(() => special === 'radar' ? activateNavalRadar(state, { row: 4, col: 4 })
        : special === 'flare' ? activateNavalFlare(state, { row: 4, col: 4 })
          : special === 'repair' ? repairNavalShip(state, seeded(98))
            : attackNaval(state, openCell(state), special)).toThrow(/bonus/);
    }
  });

  it.each([['nuclear', 9], ['fat_boy', 5], ['big_boy', 2], ['night_fire', 3]] as const)('%s hits its exact footprint, spends only its tier cost and never mutates the input', (special, count) => {
    const state = withoutFlak(charged({ questionMode: 'mixed' }));
    // Prepared question state first: XP/bonus activation cannot bypass its answer gate.
    expect(availableNavalSpecials(state)).toEqual([]);
    const answered = continueNavalAnswer(answerNavalTurn(state, true));
    actor(answered).xp = NAVAL_XP_MAX;
    const before = freeze(answered);
    const result = attackNaval(before, { row: 4, col: 4 }, special, () => 0.35);
    expect(result.lastAttack!.cells).toHaveLength(count);
    expect(result.lastAttack!.special).toBe(special);
    expect(actor(result).xp).toBe(100 - NAVAL_SPECIAL_INFO[special].cost); expect(actor(before).xp).toBe(100);
    expect(actor(result).usedSpecials).toContain(special); expect(result.bonusUsedThisTurn).toBe(true);
    expect(availableNavalSpecials(result)).toEqual([]);
    expect(target(before).shots).toHaveLength(0);
  });

  it.each([['nuclear', 4], ['fat_boy', 3], ['big_boy', 2], ['night_fire', 3]] as const)('%s clips area effects, but chooses a full valid line when firing from an edge', (special, count) => {
    const result = attackNaval(withoutFlak(charged()), { row: 0, col: 0 }, special, () => 0);
    expect(result.lastAttack!.cells).toHaveLength(count);
    expect(result.lastAttack!.cells.every((cell) => cell.row >= 0 && cell.col >= 0 && cell.row < result.size && cell.col < result.size)).toBe(true);
  });

  it.each([
    [34, []], [35, ['big_boy', 'flare']], [69, ['big_boy', 'flare']],
    [70, ['big_boy', 'fat_boy', 'night_fire', 'flare']], [99, ['big_boy', 'fat_boy', 'night_fire', 'flare']],
    [100, ['nuclear', 'big_boy', 'fat_boy', 'night_fire', 'radar', 'flare']],
  ] as Array<[number, NavalSpecial[]]>)('XP %s enables exactly its unlocked 35/70/100-cost tiers', (xp, expected) => {
    const state = charged(); actor(state).xp = xp;
    expect(availableNavalSpecials(state)).toEqual(expected);
  });

  it('low-tier activation still limits the actor to one special per turn even with remaining XP', () => {
    let state = charged({ questionMode: 'mixed' });
    state = continueNavalAnswer(answerNavalTurn(state, true));
    const result = attackNaval(state, { row: 4, col: 4 }, 'big_boy');
    expect(actor(result).xp).toBe(65);
    const sameTurn = copy(result); sameTurn.phase = 'attack';
    expect(availableNavalSpecials(sameTurn)).toEqual([]);
    expect(() => attackNaval(sameTurn, { row: 8, col: 8 }, 'night_fire')).toThrow(/bonus/);
  });

  it('area attacks skip prior hits without duplicated shot points, duplicated damage or repeated sink events', () => {
    const state = withoutFlak(charged()); const enemy = target(state);
    const position = { row: 4, col: 5 };
    const ship = enemy.ships.find((item) => item.cells.some((cell) => cellKey(cell) === cellKey(position)));
    enemy.shots.push({ ...position, hit: !!ship }); if (ship) ship.hits.push({ ...position });
    const before = freeze(state);
    const result = attackNaval(before, { row: 4, col: 4 }, 'nuclear');
    expect(result.lastAttack!.cells).toHaveLength(8);
    expect(new Set(target(result).shots.map(cellKey)).size).toBe(target(result).shots.length);
    if (ship) expect(target(result).ships.find((item) => item.id === ship.id)!.hits.filter((cell) => cellKey(cell) === cellKey(position))).toHaveLength(1);
  });

  it('once-per-game specials stay exhausted, but Big Boy can be charged and fired again on a later turn', () => {
    const state = charged();
    let result = attackNaval(state, { row: 4, col: 4 }, 'big_boy', () => 0);
    result = copy(result); result.phase = 'attack'; result.bonusUsedThisTurn = false; actor(result).xp = 100;
    expect(availableNavalSpecials(result)).toContain('big_boy');
    expect(() => attackNaval(result, { row: 8, col: 8 }, 'big_boy')).not.toThrow();
    for (const special of ['nuclear', 'fat_boy', 'night_fire', 'radar'] as NavalSpecial[]) {
      const spent = charged(); actor(spent).usedSpecials.push(special);
      expect(availableNavalSpecials(spent)).not.toContain(special);
    }
  });

  it('radar is a non-damaging three-second reveal followed by the ordinary shot, with no second special or target swap', () => {
    let state = charged({ targetOrder: 'choice' });
    const before = freeze(state);
    state = activateNavalRadar(before, { row: 4, col: 4 });
    expect(state.phase).toBe('attack'); expect(state.radar?.cells).toHaveLength(9);
    expect(state.radar?.targetId).toBe(state.targetId);
    expect(state.players.map((player) => player.shots)).toEqual(before.players.map((player) => player.shots));
    expect(actor(state).xp).toBe(0); expect(state.bonusUsedThisTurn).toBe(true);
    expect(actor(state).usedSpecials).toEqual(['radar']);
    expect(() => activateNavalRadar(state, { row: 4, col: 4 })).toThrow(/bonus/);
    expect(() => selectNavalTarget(state, state.targetId!)).toThrow(/radar/);
    const cleared = clearNavalRadar(freeze(state));
    expect(cleared.radar).toBeNull(); expect(cleared.phase).toBe('attack'); expect(state.radar).not.toBeNull();
    const result = attackNaval(cleared, openCell(cleared));
    expect(result.lastAttack?.cells).toHaveLength(1); expect(result.lastAttack?.special).toBeNull();
    expect(() => attackNaval(before, { row: 4, col: 4 }, 'radar')).toThrow(/antes del disparo/);
  });

  it('clearing an absent radar is a harmless no-op and no special is enabled during handoff or question', () => {
    const state = prepared(); expect(clearNavalRadar(state)).toBe(state);
    expect(availableNavalSpecials(state)).toEqual([]);
    expect(availableNavalSpecials(playing({ questionMode: 'mixed' }))).toEqual([]);
  });
});

describe('Naval hospital, fever and coastal defenses', () => {
  let coastalCache: NavalState | null = null;
  function coastal(): NavalState {
    if (!coastalCache) {
      const random = seeded(719);
      let state = createNavalBattle(config, ['Azul', 'Rojo'], random);
      state.islands = [{ row: 4, col: 4 }, { row: 4, col: 5 }, { row: 4, col: 6 }, { row: 1, col: 1 }];
      for (const player of state.players) {
        state = autoPlaceNavalFleet(state, player.id, random);
        state = placeNavalShip(state, player.id, 'troops', { row: 4, col: 4 }, 0);
        state = confirmNavalFleet(state, player.id);
      }
      state = startNavalTurn(state); actor(state).xp = 100;
      coastalCache = state;
    }
    return copy(coastalCache);
  }

  it('hospital has a rotatable three-cell L sea footprint and all seven units are required', () => {
    expect(NAVAL_SHIP_INFO.hospital.rotations).toEqual([0, 90, 180, 270]);
    expect(NAVAL_SHIP_INFO.hospital.terrain).toBe('sea');
    for (const rotation of NAVAL_SHIP_INFO.hospital.rotations) {
      expect(previewShipCells('hospital', { row: 4, col: 4 }, rotation)).toEqual(previewShipCells('supply', { row: 4, col: 4 }, rotation));
    }
    let state = createNavalBattle(config, ['A', 'B'], seeded(11));
    state = autoPlaceNavalFleet(state, state.players[0].id, seeded(12));
    state = removeNavalShip(state, state.players[0].id, 'hospital');
    expect(() => confirmNavalFleet(state, state.players[0].id)).toThrow(/siete/);
  });

  it('third and subsequent correct answers enter 50-XP fever; a wrong answer resets the streak', () => {
    let state = playing({ questionMode: 'mixed' });
    for (const streak of [1, 2, 3, 4]) {
      actor(state).xp = 0;
      const input = freeze(state);
      const answered = answerNavalTurn(input, true);
      expect(actor(answered).correctStreak).toBe(streak);
      expect(actor(answered).xp).toBe(streak >= 3 ? NAVAL_FEVER_XP : NAVAL_CORRECT_XP);
      expect(actor(input).correctStreak).toBe(streak - 1);
      expect(answered.players[1].correctStreak).toBe(0);
      state = copy(answered); state.phase = 'question';
    }
    actor(state).xp = 0;
    const wrong = answerNavalTurn(state, false);
    expect(actor(wrong).correctStreak).toBe(0); expect(actor(wrong).xp).toBe(0);
    const reset = copy(wrong); reset.phase = 'question';
    expect(actor(answerNavalTurn(reset, true)).xp).toBe(NAVAL_CORRECT_XP);
  });

  it('fever caps XP at 100 and no-question hits do not fabricate an academic answer streak', () => {
    const state = playing({ questionMode: 'mixed' }); actor(state).correctStreak = 2; actor(state).xp = 85;
    expect(actor(answerNavalTurn(state, true)).xp).toBe(100);
    const noQuestion = playing(); actor(noQuestion).correctStreak = 2;
    const result = attackNaval(noQuestion, openCell(noQuestion, true));
    expect(actor(result).correctStreak).toBe(2); expect(actor(result).xp).toBe(NAVAL_SUPPLY_XP + NAVAL_HIT_XP);
  });

  it('repair needs exactly one hit on a living sea target and whitens the registered impact while relocating without spending the shot', () => {
    const state = charged();
    expect(availableNavalSpecials(state)).not.toContain('repair');
    const submarine = actor(state).ships.find((ship) => ship.kind === 'nuclear')!;
    submarine.hits = copy(submarine.cells.slice(0, 2));
    actor(state).shots.push(...submarine.hits.map((cell) => ({ ...cell, hit: true })));
    expect(availableNavalSpecials(state)).not.toContain('repair');
    submarine.hits = copy(submarine.cells.slice(0, 1));
    actor(state).shots = submarine.hits.map((cell) => ({ ...cell, hit: true }));
    expect(availableNavalSpecials(state)).toContain('repair');
    const original = freeze(state);
    const healed = repairNavalShip(original, seeded(98));
    const repaired = actor(healed).ships.find((ship) => ship.id === submarine.id)!;
    expect(repaired.hits).toEqual([]); expect(repaired.sunk).toBe(false);
    expect(repaired.cells.map(cellKey).sort()).not.toEqual(submarine.cells.map(cellKey).sort());
    expect(actor(healed).shots).toEqual([{ ...submarine.hits[0], hit: false, repaired: true }]);
    expect(actor(healed).shots.map(cellKey)).toEqual(actor(original).shots.map(cellKey));
    expect(actor(original).shots).toEqual([{ ...submarine.hits[0], hit: true }]);
    expect(actor(original).shots).toHaveLength(1);
    expect(actor(healed).xp).toBe(0); expect(actor(healed).usedSpecials).toContain('repair');
    expect(healed.phase).toBe('attack'); expect(healed.bonusUsedThisTurn).toBe(true);
    expect(attackNaval(healed, openCell(healed)).phase).toBe('attack_result');
    expect(() => repairNavalShip(healed)).toThrow(/bonus/);
    const sunk = charged();
    const victim = actor(sunk).ships.find((ship) => ship.kind === 'destroyer')!; victim.sunk = true; victim.hits = copy(victim.cells);
    expect(() => repairNavalShip(sunk)).toThrow(/bonus/);
    expect(availableNavalSpecials(sunk)).not.toContain('repair');
  });

  it('a damaged hospital cannot repair, and healing an intact-again weapon never restores a spent once-only special', () => {
    const state = charged();
    const submarine = actor(state).ships.find((ship) => ship.kind === 'nuclear')!;
    submarine.hits = [{ ...submarine.cells[0] }]; actor(state).shots.push({ ...submarine.cells[0], hit: true });
    const hospital = actor(state).ships.find((ship) => ship.kind === 'hospital')!;
    hospital.hits = [{ ...hospital.cells[0] }];
    expect(availableNavalSpecials(state)).not.toContain('repair');
    expect(() => repairNavalShip(state)).toThrow(/bonus/);
    hospital.hits = [];
    const healed = repairNavalShip(state, seeded(98));
    const nextTurn = copy(healed); nextTurn.bonusUsedThisTurn = false; actor(nextTurn).xp = 100;
    expect(availableNavalSpecials(nextTurn)).toContain('nuclear');
    expect(availableNavalSpecials(nextTurn)).not.toContain('repair');
    actor(nextTurn).usedSpecials.push('nuclear');
    expect(availableNavalSpecials(nextTurn)).not.toContain('nuclear');
    expect(availableNavalSpecials(nextTurn)).toContain('big_boy');
    // The new position is attackable, while the white historical impact remains registered.
    nextTurn.actorId = 'player-2'; nextTurn.targetId = 'player-1'; nextTurn.bonusUsedThisTurn = false;
    expect(() => attackNaval(nextTurn, submarine.cells[0])).toThrow(/ya recibió/);
    const newPosition = target(nextTurn).ships.find((ship) => ship.id === submarine.id)!.cells[0];
    const hitAgain = attackNaval(nextTurn, newPosition);
    expect(hitAgain.lastAttack!.cells[0].hit).toBe(true);
    expect(target(hitAgain).ships.find((ship) => ship.id === submarine.id)!.hits).toHaveLength(1);
  });

  it('repairing before selecting an all-against-all rival still allows the initial target choice and normal shot', () => {
    const state = playing({ targetOrder: 'choice' }, 3); actor(state).xp = 100;
    const submarine = actor(state).ships.find((ship) => ship.kind === 'nuclear')!;
    submarine.hits = [{ ...submarine.cells[0] }]; actor(state).shots.push({ ...submarine.cells[0], hit: true });
    expect(state.targetId).toBeNull();
    const healed = repairNavalShip(freeze(state), seeded(98));
    const chosen = selectNavalTarget(healed, 'player-3');
    expect(chosen.targetId).toBe('player-3'); expect(chosen.bonusUsedThisTurn).toBe(true);
    expect(attackNaval(chosen, openCell(chosen)).phase).toBe('attack_result');
  });

  it.each(['nuclear', 'big_boy', 'fat_boy'] as const)('coastal troops deflect aerial %s by one unshot valid neighbour, including protection from the entire connected island', (special) => {
    const state = freeze(coastal()); const aim = { row: 4, col: 8 };
    const result = attackNaval(state, aim, special, () => 0);
    expect(result.lastAttack!.deflectedFrom).toEqual(aim);
    expect(result.lastAttack!.cells.length).toBeGreaterThan(0);
    expect(target(state).shots).toHaveLength(0);
    expect(NAVAL_SPECIAL_INFO[special].aerial).toBe(true);
    expect(result.lastAttack!.cells.every((cell) => cell.row >= 0 && cell.col >= 0 && cell.row < result.size && cell.col < result.size)).toBe(true);
  });

  it('normal shots and cannon Night of Fire never deflect; unrelated islands and distant coordinates have no anti-air', () => {
    const aim = { row: 4, col: 8 };
    expect(attackNaval(coastal(), aim).lastAttack!.deflectedFrom).toBeUndefined();
    expect(attackNaval(coastal(), aim, 'night_fire', () => 0).lastAttack!.deflectedFrom).toBeUndefined();
    expect(NAVAL_SPECIAL_INFO.night_fire.aerial).toBe(false);
    for (const cell of [{ row: 0, col: 0 }, { row: 9, col: 9 }]) {
      expect(attackNaval(coastal(), cell, 'nuclear', () => 0).lastAttack!.deflectedFrom).toBeUndefined();
    }
    const destroyed = coastal(); const troops = target(destroyed).ships.find((ship) => ship.kind === 'troops')!;
    troops.sunk = true; troops.hits = copy(troops.cells); target(destroyed).shots.push({ ...troops.cells[0], hit: true });
    expect(attackNaval(destroyed, aim, 'nuclear', () => 0).lastAttack!.deflectedFrom).toBeUndefined();
  });

  it('deflection never lands on an already-shot neighbour, and an entirely shot ring cannot create an empty attack', () => {
    const state = coastal(); const aim = { row: 4, col: 8 };
    const ring: NavalCell[] = [];
    for (let row = -1; row <= 1; row++) for (let col = -1; col <= 1; col++) if (row || col) ring.push({ row: aim.row + row, col: aim.col + col });
    const lastOpen = ring.pop()!;
    target(state).shots.push(...ring.map((cell) => ({ ...cell, hit: false })));
    const result = attackNaval(state, aim, 'big_boy', () => 0);
    expect(result.lastAttack!.deflectedFrom).toEqual(aim);
    expect(result.lastAttack!.cells.some((cell) => cellKey(cell) === cellKey(lastOpen))).toBe(true);
    expect(result.lastAttack!.cells.length).toBeGreaterThan(0);
    const enclosed = coastal(); target(enclosed).shots.push(...[...ring, lastOpen].map((cell) => ({ ...cell, hit: false })));
    const fallback = attackNaval(enclosed, aim, 'big_boy', () => 0);
    expect(fallback.lastAttack!.deflectedFrom).toBeUndefined();
    expect(fallback.lastAttack!.cells.map(cellKey)).toContain(cellKey(aim));
  });

  it('aerial radar is jammed inside coastal range but flare remains an unjammed two-second cross and can be recharged', () => {
    const state = freeze(coastal()); const aim = { row: 4, col: 8 };
    const radar = activateNavalRadar(state, aim);
    expect(radar.radar).toMatchObject({ kind: 'radar', durationSeconds: 3, interference: true });
    expect(radar.radar!.cells).toHaveLength(9); expect(target(radar).shots).toHaveLength(0);
    expect(activateNavalRadar(coastal(), { row: 0, col: 0 }).radar?.interference).toBe(false);
    const flare = activateNavalFlare(state, aim);
    expect(flare.radar).toMatchObject({ kind: 'flare', durationSeconds: 2, interference: false });
    expect(flare.radar!.cells).toHaveLength(5); expect(actor(flare).xp).toBe(65); expect(flare.phase).toBe('attack');
    expect(target(flare).shots).toHaveLength(0);
    expect(() => activateNavalFlare(flare, aim)).toThrow(/bonus/);
    const nextTurn = copy(flare); nextTurn.radar = null; nextTurn.bonusUsedThisTurn = false;
    expect(availableNavalSpecials(nextTurn)).toContain('flare');
    expect(actor(activateNavalFlare(nextTurn, aim)).xp).toBe(30);
    expect(() => attackNaval(state, aim, 'flare')).toThrow(/antes del disparo/);
  });

  it('successful timed defense reduces nuclear impact from nine coordinates to the center cross of five, without changing cost', () => {
    const state = withoutFlak(continueNavalAnswer(answerNavalTurn(charged({ questionMode: 'mixed' }), true))); const aim = { row: 4, col: 4 };
    const full = attackNaval(freeze(state), aim, 'nuclear', () => 0);
    const defended = attackNaval(state, aim, 'nuclear', () => 0, { reducedNuclear: true });
    expect(full.lastAttack!.cells).toHaveLength(9); expect(defended.lastAttack!.cells).toHaveLength(5);
    expect(defended.lastAttack!.cells.map(cellKey).sort()).toEqual(['3:4', '4:3', '4:4', '4:5', '5:4']);
    expect(actor(defended).usedSpecials).toContain('nuclear');
    expect(actor(defended).xp).toBe(actor(full).xp);
  });
});
