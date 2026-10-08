import { describe, expect, it, vi } from 'vitest';
import {
  NAVAL_CORRECT_XP, NAVAL_FEVER_XP, NAVAL_SHIP_INFO, NAVAL_SUPPLY_XP,
  activateNavalFlare, advanceNavalTurn, answerNavalTurn, attackNaval, availableNavalSpecials,
  cellKey, confirmNavalFleet, continueNavalAnswer, createNavalBattle, grantNavalTeacherXP,
  placeNavalShip, previewShipCells, repairNavalShip, skipNavalAttack, skipNavalQuestion, startNavalTurn,
  type NavalCell, type NavalConfig, type NavalShip, type NavalShipKind, type NavalState,
} from '@/lib/activities/naval-battle';

const config: NavalConfig = { mapSize: 'small', turnOrder: 'sequential', targetOrder: 'sequential', questionMode: 'teacher' };
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(freeze); }
  return value;
}
const actor = (state: NavalState) => state.players.find((player) => player.id === state.actorId)!;
const ownShip = (state: NavalState, kind: NavalShipKind) => actor(state).ships.find((ship) => ship.kind === kind)!;
let fleet: NavalState | null = null;
function ready(questionMode: NavalConfig['questionMode'] = 'teacher'): NavalState {
  if (!fleet) {
    let state = createNavalBattle(config, ['Azul', 'Rojo'], () => 0.5);
    state.islands = [{ row: 9, col: 9 }];
    const anchors: Record<NavalShipKind, NavalCell> = {
      nuclear: { row: 0, col: 0 }, semi_nuclear: { row: 1, col: 0 },
      carrier: { row: 3, col: 0 }, supply: { row: 6, col: 0 },
      destroyer: { row: 8, col: 0 }, hospital: { row: 3, col: 7 }, troops: { row: 9, col: 9 },
    };
    for (const player of state.players) {
      for (const kind of Object.keys(anchors) as NavalShipKind[]) state = placeNavalShip(state, player.id, kind, anchors[kind], 0);
      state = confirmNavalFleet(state, player.id);
    }
    fleet = state;
  }
  const state = copy(fleet); state.config.questionMode = questionMode;
  return state;
}
const question = (mode: NavalConfig['questionMode'] = 'teacher') => startNavalTurn(ready(mode), () => 0.5);
function damaged(kind: NavalShipKind = 'nuclear'): NavalState {
  const state = question('none'); actor(state).xp = 100;
  const ship = ownShip(state, kind);
  ship.hits = [{ ...ship.cells[0] }]; actor(state).shots.push({ ...ship.cells[0], hit: true });
  return state;
}
/** Leave only selected empty sea cells unshot, preserving every intact unit's cells. */
function blockEmptySea(state: NavalState, allowed: NavalCell[]): void {
  const occupied = new Set(actor(state).ships.flatMap((ship) => ship.cells.map(cellKey)));
  const allowedKeys = new Set(allowed.map(cellKey));
  const previous = new Set(actor(state).shots.map(cellKey));
  for (let row = 0; row < state.size; row++) for (let col = 0; col < state.size; col++) {
    const cell = { row, col }; const key = cellKey(cell);
    if (!occupied.has(key) && !allowedKeys.has(key) && !previous.has(key)) actor(state).shots.push({ ...cell, hit: false });
  }
}
function footprint(ship: NavalShip): string { return ship.cells.map(cellKey).sort().join('|'); }

describe('Teacher questions and a single capped manual XP award', () => {
  it('accepts offline teacher questions and resets the award when starting each turn', () => {
    const initial = ready(); expect(initial.teacherBonusXP).toBeNull();
    const started = question(); expect(started.phase).toBe('question'); expect(started.teacherBonusXP).toBeNull();
    expect(actor(started).xp).toBe(NAVAL_SUPPLY_XP);
    expect(() => createNavalBattle({ ...config, questionMode: 'oral' as 'teacher' }, ['A', 'B'])).toThrow(/configuración/);
    const awarded = grantNavalTeacherXP(answerNavalTurn(started, true), 30);
    const handoff = advanceNavalTurn(skipNavalAttack(continueNavalAnswer(awarded)));
    expect(handoff.teacherBonusXP).toBe(30);
    const next = startNavalTurn(freeze(handoff));
    expect(next.teacherBonusXP).toBeNull(); expect(next.answerCorrect).toBeNull(); expect(next.actorId).toBe('player-2');
    expect(handoff.teacherBonusXP).toBe(30);
  });

  it.each([0, 1, 2, 5])('teacher correctness records streak %s without automatic 25/50 XP', (streak) => {
    const state = question(); actor(state).correctStreak = streak; actor(state).xp = 73;
    const original = freeze(state);
    const answered = answerNavalTurn(original, true);
    expect(answered.phase).toBe('answer_result'); expect(answered.answerCorrect).toBe(true);
    expect(actor(answered).correctStreak).toBe(streak + 1); expect(actor(answered).xp).toBe(73);
    expect(actor(original).correctStreak).toBe(streak); expect(answered.teacherBonusXP).toBeNull();
    expect(() => answerNavalTurn(answered, true)).toThrow(/paso actual/);
    expect(continueNavalAnswer(answered).phase).toBe('attack');
  });

  it('teacher wrong answers reset the streak and keep supply XP without enabling an award', () => {
    const state = question(); actor(state).correctStreak = 4;
    const answered = answerNavalTurn(freeze(state), false);
    expect(actor(answered).correctStreak).toBe(0); expect(actor(answered).xp).toBe(NAVAL_SUPPLY_XP);
    expect(() => grantNavalTeacherXP(answered, 50)).toThrow(/respuesta correcta/);
    expect(continueNavalAnswer(answered).phase).toBe('handoff');
  });

  it.each([10, 30, 50] as const)('a %s-XP award adds to supplies, changes only actor XP, and is immutable', (amount) => {
    const answered = freeze(answerNavalTurn(question(), true));
    const rewarded = grantNavalTeacherXP(answered, amount);
    expect(actor(rewarded).xp).toBe(NAVAL_SUPPLY_XP + amount); expect(rewarded.teacherBonusXP).toBe(amount);
    const expected = copy(answered); actor(expected).xp += amount; expected.teacherBonusXP = amount;
    expect(rewarded).toEqual(expected); expect(actor(answered).xp).toBe(NAVAL_SUPPLY_XP);
    expect(rewarded.players[1]).toEqual(answered.players[1]);
    for (const duplicate of [10, 30, 50] as const) expect(() => grantNavalTeacherXP(freeze(rewarded), duplicate)).toThrow(/Ya se eligió/);
    expect(actor(rewarded).xp).toBe(NAVAL_SUPPLY_XP + amount);
  });

  it('records a choice even at the cap, discards excess XP and never restores that excess after spending', () => {
    const state = question(); actor(state).xp = 95;
    const rewarded = grantNavalTeacherXP(answerNavalTurn(state, true), 50);
    expect(actor(rewarded).xp).toBe(100); expect(rewarded.teacherBonusXP).toBe(50);
    expect(Object.keys(rewarded).sort()).toEqual(Object.keys(state).sort());
    expect(() => grantNavalTeacherXP(rewarded, 10)).toThrow(/Ya se eligió/);
    const flare = activateNavalFlare(continueNavalAnswer(rewarded), { row: 2, col: 2 });
    expect(actor(flare).xp).toBe(65); expect(flare.teacherBonusXP).toBe(50);
    const capped = question(); actor(capped).xp = 100;
    const atCap = grantNavalTeacherXP(answerNavalTurn(capped, true), 10);
    expect(actor(atCap).xp).toBe(100); expect(atCap.teacherBonusXP).toBe(10);
    expect(() => grantNavalTeacherXP(atCap, 50)).toThrow(/Ya se eligió/);
  });

  it.each(['multiple_choice', 'true_false', 'mixed'] as const)('%s retains automatic AI XP and allows one additional manual award', (mode) => {
    const answered = answerNavalTurn(question(mode), true);
    expect(actor(answered).xp).toBe(NAVAL_SUPPLY_XP + NAVAL_CORRECT_XP);
    expect(actor(grantNavalTeacherXP(answered, 30)).xp).toBe(NAVAL_SUPPLY_XP + NAVAL_CORRECT_XP + 30);
    const fever = question(mode); actor(fever).correctStreak = 2;
    const correct = answerNavalTurn(fever, true);
    expect(actor(correct).xp).toBe(NAVAL_SUPPLY_XP + NAVAL_FEVER_XP);
    expect(actor(grantNavalTeacherXP(correct, 50)).xp).toBe(100);
  });

  it.each(['placement', 'handoff', 'question', 'attack', 'attack_result', 'finished'] as const)('rejects an award in %s', (phase) => {
    const state = question(); state.phase = phase; state.answerCorrect = true;
    const original = freeze(state);
    expect(() => grantNavalTeacherXP(original, 10)).toThrow(/paso actual/);
    expect(actor(original).xp).toBe(NAVAL_SUPPLY_XP); expect(original.teacherBonusXP).toBeNull();
  });

  it('rejects unvalidated answers, no-question games and invalid award amounts', () => {
    const unvalidated = question(); unvalidated.phase = 'answer_result';
    expect(() => grantNavalTeacherXP(unvalidated, 10)).toThrow(/respuesta correcta/);
    const noQuestion = question('none'); noQuestion.phase = 'answer_result'; noQuestion.answerCorrect = true;
    expect(() => grantNavalTeacherXP(noQuestion, 10)).toThrow(/partida con preguntas/);
    const answered = freeze(answerNavalTurn(question(), true));
    for (const amount of [-10, 0, 15, 100, NaN]) expect(() => grantNavalTeacherXP(answered, amount as 10)).toThrow(/10, 30 o 50/);
    expect(actor(answered).xp).toBe(NAVAL_SUPPLY_XP); expect(answered.teacherBonusXP).toBeNull();
  });
});

describe('Skipping a question directly hands off without changing earned XP', () => {
  it.each(['teacher', 'multiple_choice', 'true_false', 'mixed'] as const)('%s skips with false answer, reset streak, no shot and no manual reward', (mode) => {
    const state = question(mode); actor(state).correctStreak = 3; actor(state).xp = 67;
    const original = freeze(state); const skipped = skipNavalQuestion(original);
    expect(skipped.phase).toBe('handoff'); expect(skipped.answerCorrect).toBe(false);
    expect(skipped.teacherBonusXP).toBeNull(); expect(actor(skipped).correctStreak).toBe(0);
    expect(actor(skipped).xp).toBe(67); expect(skipped.lastAttack).toBeNull(); expect(skipped.radar).toBeNull();
    expect(skipped.players.map((player) => player.shots)).toEqual(original.players.map((player) => player.shots));
    expect(actor(original).correctStreak).toBe(3); expect(actor(original).xp).toBe(67);
    expect(() => skipNavalQuestion(skipped)).toThrow(/paso actual/);
    expect(() => answerNavalTurn(skipped, true)).toThrow(/paso actual/);
    expect(() => grantNavalTeacherXP(skipped, 50)).toThrow(/paso actual/);
    const next = startNavalTurn(skipped); expect(next.actorId).toBe('player-2'); expect(actor(next).xp).toBe(NAVAL_SUPPLY_XP);
  });

  it.each(['placement', 'handoff', 'answer_result', 'attack', 'attack_result', 'finished'] as const)('does not allow skipping from %s', (phase) => {
    const state = question(); state.phase = phase;
    expect(() => skipNavalQuestion(freeze(state))).toThrow(/paso actual/);
    expect(actor(state).xp).toBe(NAVAL_SUPPLY_XP);
  });
});

describe('Random repair and hidden bounded relocation', () => {
  it('repairs one hit, whitens its registered historic impact, charges 100 once and preserves the ordinary attack', () => {
    const state = damaged(); const beforeShip = copy(ownShip(state, 'nuclear'));
    actor(state).shots.push({ row: 2, col: 5, hit: false });
    state.players[1].shots.push({ row: 2, col: 2, hit: false });
    state.lastAttack = { actorId: 'player-2', targetId: 'player-1', cells: [{ ...beforeShip.hits[0], hit: true }], sunkShipIds: [], special: null, eliminated: false };
    state.radar = { targetId: 'player-2', cells: [{ row: 5, col: 5 }], kind: 'flare', durationSeconds: 2, interference: false };
    const original = freeze(state); const random = vi.fn().mockReturnValueOnce(0).mockReturnValueOnce(0.6);
    const repaired = repairNavalShip(original, random); const ship = ownShip(repaired, 'nuclear');
    expect(random).toHaveBeenCalledTimes(2); expect(ship.id).toBe(beforeShip.id); expect(ship.kind).toBe(beforeShip.kind);
    expect(ship.hits).toEqual([]); expect(ship.sunk).toBe(false); expect(footprint(ship)).not.toBe(footprint(beforeShip));
    expect(ship.cells).toEqual(previewShipCells(ship.kind, ship.anchor, ship.rotation));
    const forbidden = new Set([
      ...original.islands.map(cellKey), ...actor(original).shots.map(cellKey),
      ...actor(original).ships.filter((item) => item.id !== ship.id).flatMap((item) => item.cells.map(cellKey)),
    ]);
    expect(ship.cells.every((cell) => cell.row >= 0 && cell.col >= 0 && cell.row < repaired.size && cell.col < repaired.size && !forbidden.has(cellKey(cell)))).toBe(true);
    const expectedShots = actor(original).shots.map((shot) => cellKey(shot) === cellKey(beforeShip.hits[0]) ? { ...shot, hit: false, repaired: true } : shot);
    expect(actor(repaired).shots).toEqual(expectedShots);
    expect(actor(repaired).shots.map(cellKey)).toEqual(actor(original).shots.map(cellKey));
    expect(repaired.players[1].shots).toEqual(original.players[1].shots);
    expect(actor(original).shots[0]).toEqual({ ...beforeShip.hits[0], hit: true });
    expect(actor(repaired).shots).not.toBe(actor(original).shots); expect(ownShip(original, 'nuclear')).toEqual(beforeShip);
    expect(repaired.lastAttack).toEqual(original.lastAttack); expect(repaired.radar).toBeNull();
    expect(actor(repaired).xp).toBe(0); expect(actor(repaired).usedSpecials).toEqual(['repair']);
    expect(repaired.bonusUsedThisTurn).toBe(true); expect(repaired.phase).toBe('attack');
    expect(attackNaval(repaired, { row: 2, col: 3 }).phase).toBe('attack_result');
    expect(() => repairNavalShip(repaired, random)).toThrow(/bonus/); expect(random).toHaveBeenCalledTimes(2);
    const opposing = copy(repaired); opposing.actorId = 'player-2'; opposing.targetId = 'player-1'; opposing.bonusUsedThisTurn = false;
    expect(() => attackNaval(opposing, beforeShip.hits[0])).toThrow(/ya recibió/);
    const attacked = attackNaval(opposing, ship.cells[0]);
    expect(attacked.lastAttack!.cells[0].hit).toBe(true);
    expect(attacked.players[0].ships.find((item) => item.id === ship.id)!.hits).toHaveLength(1);
  });

  it('selects uniformly among eligible ships, independently from the destination draw', () => {
    const state = damaged();
    for (const kind of ['semi_nuclear', 'destroyer'] as const) {
      const ship = ownShip(state, kind); ship.hits = [{ ...ship.cells[0] }]; actor(state).shots.push({ ...ship.cells[0], hit: true });
    }
    const original = freeze(state);
    for (const [fraction, selected] of [[1 / 6, 'nuclear'], [3 / 6, 'semi_nuclear'], [5 / 6, 'destroyer']] as const) {
      const random = vi.fn().mockReturnValueOnce(fraction).mockReturnValueOnce(0);
      const repaired = repairNavalShip(original, random);
      expect(ownShip(repaired, selected).hits).toEqual([]); expect(random).toHaveBeenCalledTimes(2);
      const selectedImpact = ownShip(original, selected).hits[0];
      expect(actor(repaired).shots.find((shot) => cellKey(shot) === cellKey(selectedImpact))).toEqual({ ...selectedImpact, hit: false, repaired: true });
      for (const kind of ['nuclear', 'semi_nuclear', 'destroyer'] as const) {
        if (kind !== selected) {
          expect(ownShip(repaired, kind)).toEqual(ownShip(original, kind));
          const impact = ownShip(original, kind).hits[0];
          expect(actor(repaired).shots.find((shot) => cellKey(shot) === cellKey(impact))).toEqual({ ...impact, hit: true });
        }
      }
    }
  });

  it('changes only the selected historic hit to white, retaining other hits, misses, wreckage and previous repaired marks', () => {
    const state = damaged();
    const carrier = ownShip(state, 'carrier'); carrier.hits = copy(carrier.cells.slice(0, 2));
    const destroyer = ownShip(state, 'destroyer'); destroyer.hits = copy(destroyer.cells); destroyer.sunk = true;
    actor(state).shots.push(...[...carrier.hits, ...destroyer.hits].map((cell) => ({ ...cell, hit: true })));
    actor(state).shots.push({ row: 2, col: 5, hit: false }, { row: 2, col: 6, hit: false, repaired: true });
    const original = freeze(state); const repaired = repairNavalShip(original, () => 0);
    const oldImpact = ownShip(original, 'nuclear').hits[0];
    expect(actor(repaired).shots).toEqual(actor(original).shots.map((shot) => cellKey(shot) === cellKey(oldImpact) ? { ...shot, hit: false, repaired: true } : shot));
    expect(actor(repaired).shots).toHaveLength(actor(original).shots.length);
    expect(actor(repaired).shots.filter((shot) => shot.hit)).toHaveLength(4);
    expect(ownShip(repaired, 'carrier')).toEqual(carrier); expect(ownShip(repaired, 'destroyer')).toEqual(destroyer);
    expect(actor(original).shots[0].hit).toBe(true); expect(actor(original).shots[0].repaired).toBeUndefined();
    const previous = new Set(actor(original).shots.map(cellKey));
    expect(ownShip(repaired, 'nuclear').cells.every((cell) => !previous.has(cellKey(cell)))).toBe(true);
  });

  it('excludes intact, sunk, troop and multiply damaged units even when they precede a legal target', () => {
    const state = damaged(); ownShip(state, 'nuclear').hits.push({ ...ownShip(state, 'nuclear').cells[1] });
    const sunk = ownShip(state, 'destroyer'); sunk.hits = [{ ...sunk.cells[0] }]; sunk.sunk = true;
    const troops = ownShip(state, 'troops'); troops.hits = [{ ...troops.cells[0] }]; troops.sunk = false;
    const eligible = ownShip(state, 'semi_nuclear'); eligible.hits = [{ ...eligible.cells[0] }]; actor(state).shots.push({ ...eligible.cells[0], hit: true });
    const original = freeze(state); const repaired = repairNavalShip(original, () => 0);
    expect(ownShip(repaired, 'semi_nuclear').hits).toEqual([]);
    for (const kind of ['nuclear', 'destroyer', 'troops', 'carrier', 'supply', 'hospital'] as const) expect(ownShip(repaired, kind)).toEqual(ownShip(original, kind));
  });

  it.each(['xp', 'spent', 'bonus', 'hospital_hit', 'hospital_sunk', 'no_target'] as const)('blocks repair for %s without consuming randomness, XP or a use', (reason) => {
    const state = damaged();
    if (reason === 'xp') actor(state).xp = 99;
    if (reason === 'spent') actor(state).usedSpecials.push('repair');
    if (reason === 'bonus') state.bonusUsedThisTurn = true;
    if (reason === 'hospital_hit') ownShip(state, 'hospital').hits = [{ ...ownShip(state, 'hospital').cells[0] }];
    if (reason === 'hospital_sunk') ownShip(state, 'hospital').sunk = true;
    if (reason === 'no_target') ownShip(state, 'nuclear').hits = [];
    const expected = copy(state); const original = freeze(state); const random = vi.fn(() => 0);
    expect(availableNavalSpecials(original)).not.toContain('repair');
    expect(() => repairNavalShip(original, random)).toThrow(/bonus/);
    expect(random).not.toHaveBeenCalled(); expect(original).toEqual(expected);
  });

  it.each(['placement', 'handoff', 'question', 'answer_result', 'attack_result', 'finished'] as const)('rejects repair in %s', (phase) => {
    const state = damaged(); state.phase = phase;
    expect(availableNavalSpecials(state)).not.toContain('repair');
    expect(() => repairNavalShip(freeze(state), () => 0)).toThrow(/paso actual/);
  });

  it('blocks repair with no legal unshot destination and never removes the historic hit to create one', () => {
    const state = damaged(); blockEmptySea(state, []);
    const original = freeze(state); const random = vi.fn(() => 0);
    expect(availableNavalSpecials(original)).not.toContain('repair');
    expect(() => repairNavalShip(original, random)).toThrow(/reubicarse/);
    expect(random).not.toHaveBeenCalled(); expect(actor(original).xp).toBe(100);
    expect(actor(original).usedSpecials).toEqual([]); expect(ownShip(original, 'nuclear').hits).toHaveLength(1);
    expect(actor(original).shots).toContainEqual({ ...ownShip(original, 'nuclear').cells[0], hit: true });
  });

  it('ignores a damaged ship without room when another eligible ship has a legal destination', () => {
    const state = damaged(); const destroyer = ownShip(state, 'destroyer');
    destroyer.hits = [{ ...destroyer.cells[0] }]; actor(state).shots.push({ ...destroyer.cells[0], hit: true });
    const allowed = [{ row: 8, col: 7 }, { row: 8, col: 8 }]; blockEmptySea(state, allowed);
    expect(availableNavalSpecials(state)).toContain('repair');
    const repaired = repairNavalShip(freeze(state), () => 0);
    expect(ownShip(repaired, 'nuclear').hits).toHaveLength(1);
    expect(ownShip(repaired, 'destroyer').hits).toEqual([]); expect(ownShip(repaired, 'destroyer').cells).toEqual(allowed);
  });

  it('rotates when the only safe destination requires a new orientation', () => {
    const state = damaged('destroyer'); const allowed = [{ row: 7, col: 8 }, { row: 8, col: 8 }];
    blockEmptySea(state, allowed);
    const repaired = repairNavalShip(freeze(state), () => 0);
    expect(ownShip(repaired, 'destroyer').rotation).toBe(90); expect(ownShip(repaired, 'destroyer').cells).toEqual(allowed);
  });

  it('draws uniformly from unique legal footprints instead of counting reversed rotations twice', () => {
    const state = damaged('destroyer');
    const destinations = [
      [{ row: 0, col: 6 }, { row: 0, col: 7 }],
      [{ row: 5, col: 8 }, { row: 6, col: 8 }],
      [{ row: 8, col: 5 }, { row: 8, col: 6 }],
    ];
    blockEmptySea(state, destinations.flat()); const original = freeze(state);
    const counts = new Map<string, number>();
    for (let index = 0; index < 9; index++) {
      const random = vi.fn().mockReturnValueOnce(0).mockReturnValueOnce((index + 0.5) / 9);
      const key = footprint(ownShip(repairNavalShip(original, random), 'destroyer'));
      counts.set(key, (counts.get(key) ?? 0) + 1); expect(random).toHaveBeenCalledTimes(2);
    }
    expect([...counts.keys()].sort()).toEqual(destinations.map((cells) => cells.map(cellKey).sort().join('|')).sort());
    expect([...counts.values()]).toEqual([3, 3, 3]);
  });

  it.each([0, 1, -100, 100, NaN, Infinity])('clamps random fraction %s and finishes after two bounded draws', (fraction) => {
    const state = freeze(damaged()); const random = vi.fn(() => fraction);
    const repaired = repairNavalShip(state, random); const ship = ownShip(repaired, 'nuclear');
    expect(random).toHaveBeenCalledTimes(2); expect(ship.hits).toEqual([]);
    expect(NAVAL_SHIP_INFO[ship.kind].rotations).toContain(ship.rotation);
    expect(ship.cells.every((cell) => cell.row >= 0 && cell.col >= 0 && cell.row < repaired.size && cell.col < repaired.size)).toBe(true);
  });
});
