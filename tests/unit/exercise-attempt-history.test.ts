import { describe, expect, it } from 'vitest';
import { readExerciseAttempts } from '@/lib/academic/exercise-attempt-history';

describe('teacher automatic-attempt history', () => {
  it('reads the canonical per-attempt grade and keeps old game metrics without inventing answers', () => {
    const [attempt] = readExerciseAttempts([{
      intento: 2,
      fecha: '2026-09-27T18:00:00Z',
      calificacion_10: 8,
      aciertos: 5,
      total_preguntas: 5,
      detalles: [{
        tipo: 'parkour_race', intentos_incorrectos: 1, tiempo_segundos: 80,
        caidas: 2, puntos_juego: 710, codigo_mapa: '12345678',
      }],
    }]);

    expect(attempt.grade).toBe(8);
    expect(attempt.hits).toBe(5);
    expect(attempt.game).toMatchObject({ type: 'parkour_race', wrongAttempts: 1, falls: 2 });
    expect(attempt.answers).toEqual([]);
  });

  it('keeps each wrong answer, retry, and timeout in game order', () => {
    const [attempt] = readExerciseAttempts([{
      intento: 1,
      calificacion_10: 5,
      detalles: [
        { tipo: 'backrooms_scape', intentos_incorrectos: 2, capturas: 0 },
        { tipo: 'respuesta_juego', pregunta_id: 'q1', reactivo: '¿Resultado?',
          respuesta_dada: '0', respuesta_correcta: '4', esCorrecto: false, numero_intento: 1 },
        { tipo: 'respuesta_juego', pregunta_id: 'q1', reactivo: '¿Resultado?',
          respuesta_dada: '4', respuesta_correcta: '4', esCorrecto: true, numero_intento: 2 },
        { tipo: 'respuesta_juego', pregunta_id: 'q2', reactivo: '¿Siguiente?',
          respuesta_dada: null, respuesta_correcta: 'Sí', esCorrecto: false,
          numero_intento: 1, tiempo_agotado: true },
      ],
    }]);

    expect(attempt.answers).toHaveLength(3);
    expect(attempt.answers.map((answer) => answer.retryNumber)).toEqual([1, 2, 1]);
    expect(attempt.answers.map((answer) => answer.isCorrect)).toEqual([false, true, false]);
    expect(attempt.answers[0].given).toBe('0');
    expect(attempt.answers[2].timedOut).toBe(true);
    expect(attempt.answers[2].given).toBeNull();
  });

  it('does not guess the scale of a legacy grade or show unrelated metadata as questions', () => {
    const [attempt] = readExerciseAttempts([{
      intento: 1,
      calificacion: 80,
      detalles: [{ tipo: 'other_metadata' }],
    }]);
    expect(attempt.grade).toBeNull();
    expect(attempt.answers).toEqual([]);
  });
});
