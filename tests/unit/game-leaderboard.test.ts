import { describe, expect, it } from 'vitest';

import { buildGameLeaderboard } from '../../src/lib/game-leaderboard';
import { rankedEntries } from '../../games/shared/leaderboard';

const details = (tipo: 'parkour_race' | 'backrooms_scape', score: number, time: number, penalties: number) => [{
  tipo,
  puntos_juego: score,
  tiempo_segundos: time,
  ...(tipo === 'parkour_race' ? { caidas: penalties } : { capturas: penalties }),
}];

describe('game leaderboard', () => {
  it('keeps only students supplied by the tenant/group scope and chooses their personal best', () => {
    const board = buildGameLeaderboard('parkour_race', [
      { id: 'mine', nombre: 'Ana', apellidos: 'López' },
      { id: 'peer', nombre: 'Bruno', apellidos: 'Ríos' },
    ], [
      { alumno_id: 'mine', historico_intentos: [
        { aciertos: 3, total_preguntas: 4, detalles: details('parkour_race', 900, 80, 1) },
        { aciertos: 4, total_preguntas: 4, detalles: details('parkour_race', 700, 100, 2) },
      ] },
      { alumno_id: 'peer', historico_intentos: [{ aciertos: 4, total_preguntas: 4, detalles: details('parkour_race', 800, 90, 0) }] },
      { alumno_id: 'another-group', historico_intentos: [{ aciertos: 4, total_preguntas: 4, detalles: details('parkour_race', 9999, 1, 0) }] },
    ], 'mine', '2026-09-04T00:00:00.000Z');

    expect(board.entries.map((entry) => entry.name)).toEqual(['Bruno Ríos', 'Ana López']);
    expect(board.entries.find((entry) => entry.isCurrentStudent)).toMatchObject({ accuracy: 100, score: 700, attempts: 2 });
    expect(board.participantCount).toBe(2);
  });

  it('orders each visible category using the corresponding metric', () => {
    const board = buildGameLeaderboard('backrooms_scape', [
      { id: 'a', nombre: 'A', apellidos: null },
      { id: 'b', nombre: 'B', apellidos: null },
    ], [
      { alumno_id: 'a', historico_intentos: [{ aciertos: 3, total_preguntas: 4, detalles: details('backrooms_scape', 900, 120, 0) }] },
      { alumno_id: 'b', historico_intentos: [{ aciertos: 4, total_preguntas: 4, detalles: details('backrooms_scape', 600, 80, 2) }] },
    ], 'a');

    expect(rankedEntries(board, 'accuracy')[0].name).toBe('B');
    expect(rankedEntries(board, 'score')[0].name).toBe('A');
    expect(rankedEntries(board, 'time')[0].name).toBe('B');
    expect(rankedEntries(board, 'penalties')[0].name).toBe('A');
  });
});
