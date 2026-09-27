import { describe, expect, it } from 'vitest';
import { exerciseAttemptDetailCsv, exercisePerformanceCsv } from '@/lib/academic/exercise-performance-csv';

describe('exercise results export', () => {
  it('includes automatic results and neutralizes spreadsheet formulas in names', () => {
    const csv = exercisePerformanceCsv([{ name: '=IMPORTXML("evil")', group: 'A', grade: 9,
      hits: 9, total: 10, attempts: 1, completedAt: '2026-09-27' }]);
    expect(csv).toContain("'=IMPORTXML");
    expect(csv).toContain('"9"');
    expect(csv).toContain('2026-09-27');
    expect(csv).toContain('Promedio de intentos / 10');
    expect(exercisePerformanceCsv([], { game: true }))
      .toContain('Aciertos al primer intento (última partida)');
  });

  it('exports game retries and marks legacy attempts without answers truthfully', () => {
    const csv = exerciseAttemptDetailCsv([{
      name: 'Juan Prueba', group: 'A', history: [
        { intento: 1, calificacion_10: 4, aciertos: 2, total_preguntas: 5,
          detalles: [{ tipo: 'parkour_race', intentos_incorrectos: 3, tiempo_segundos: 75 }] },
        { intento: 2, calificacion_10: 8, aciertos: 5, total_preguntas: 5,
          detalles: [
            { tipo: 'parkour_race', intentos_incorrectos: 1, tiempo_segundos: 68,
              traza_truncada: true, respuestas_omitidas: 2 },
            { tipo: 'respuesta_juego', pregunta_id: 'q1', reactivo: '=SUM(A1)',
              respuesta_dada: 'Incorrecta', respuesta_correcta: 'Correcta', esCorrecto: false, numero_intento: 1 },
            { tipo: 'respuesta_juego', pregunta_id: 'q1', reactivo: '=SUM(A1)',
              respuesta_dada: 'Correcta', respuesta_correcta: 'Correcta', esCorrecto: true, numero_intento: 2 },
          ] },
      ],
    }]);

    expect(csv).toContain('Sin desglose de respuestas');
    expect(csv).toContain('Parcial: se omitieron respuestas o reintentos');
    expect(csv).toContain('Reintentos incorrectos');
    expect(csv).toContain("'=SUM(A1)");
    expect(csv).toContain('"Incorrecta"');
    expect(csv).toContain('"Correcta"');
    expect(csv.match(/Juan Prueba/g)).toHaveLength(3);
  });
});
