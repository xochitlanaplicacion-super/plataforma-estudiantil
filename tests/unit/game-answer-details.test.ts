import { describe, expect, it } from 'vitest';
import { normalizeGameAnswerDetails } from '@/lib/academic/game-answer-details';

describe('detalle de respuestas de juegos', () => {
  it('conserva el orden de respuestas incorrectas, reintentos y acierto', () => {
    const result = normalizeGameAnswerDetails([
      { questionId: 'p1', prompt: 'Pregunta 1', selectedAnswer: 'A', correctAnswer: 'B', isCorrect: false, attemptNumber: 1 },
      { questionId: 'p1', prompt: 'Pregunta 1', selectedAnswer: 'C', correctAnswer: 'B', isCorrect: false, attemptNumber: 2 },
      { questionId: 'p1', prompt: 'Pregunta 1', selectedAnswer: 'B', correctAnswer: 'B', isCorrect: true, attemptNumber: 3 },
    ]);
    expect(result.omitted).toBe(0);
    expect(result.details.map((answer) => [answer.respuesta_dada, answer.numero_intento, answer.esCorrecto]))
      .toEqual([['A', 1, false], ['C', 2, false], ['B', 3, true]]);
  });

  it('distingue un tiempo agotado de una respuesta vacía', () => {
    expect(normalizeGameAnswerDetails([{
      questionId: 'p2', prompt: 'Pregunta 2', selectedAnswer: null,
      correctAnswer: 'Verdadero', isCorrect: false, attemptNumber: 1, timedOut: true,
    }]).details).toMatchObject([{
      respuesta_dada: null, tiempo_agotado: true, esCorrecto: false,
    }]);
  });

  it('descarta datos malformados y limita la traza sin impedir guardar la nota', () => {
    const invalid = { questionId: '', prompt: '', selectedAnswer: null, correctAnswer: '', isCorrect: 'true', attemptNumber: 0 };
    const valid = { questionId: 'p', prompt: 'X'.repeat(1_000), selectedAnswer: 'A', correctAnswer: 'B', isCorrect: false, attemptNumber: 1 };
    const result = normalizeGameAnswerDetails([invalid, ...Array.from({ length: 200 }, () => valid)]);
    expect(result.details.length).toBeLessThanOrEqual(120);
    expect(result.omitted).toBeGreaterThan(0);
    expect(result.details[0].reactivo.length).toBeLessThanOrEqual(240);
    expect(new TextEncoder().encode(JSON.stringify(result.details)).length).toBeLessThan(65_536);
  });
});
