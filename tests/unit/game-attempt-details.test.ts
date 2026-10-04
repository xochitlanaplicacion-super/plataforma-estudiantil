import { describe, expect, it } from 'vitest';
import { gameAttemptDetails } from '@/lib/academic/game-attempt-details';
import { normalizeGameAnswerDetails } from '@/lib/academic/game-answer-details';

const event = {
  questionId: 'concept-1', prompt: 'A'.repeat(1600), selectedAnswer: 'Doctor',
  correctAnswer: 'Pilot', isCorrect: false, attemptNumber: 1,
};

describe('bounded game-attempt academic evidence', () => {
  it('keeps full Flying Cat definitions without changing legacy game limits', () => {
    const flying = gameAttemptDetails('flying_cat', { tiempo_segundos: 75 }, [event]);
    const parkour = gameAttemptDetails('parkour_race', { caidas: 0 }, [event]);
    expect(flying[1]).toMatchObject({ reactivo: event.prompt });
    expect(parkour[1]).toMatchObject({ reactivo: event.prompt.slice(0, 240) });
  });

  it('bounds twenty UTF-8 definitions and explicitly marks any omitted evidence', () => {
    const details = gameAttemptDetails('flying_cat', {}, Array.from({ length: 20 }, (_, index) => ({
      ...event, questionId: `q-${index}`, prompt: 'ñ'.repeat(1600),
    })));
    // UTF-8 two-byte definitions may exceed the shared budget: flag any
    // omission explicitly instead of silently inventing complete evidence.
    expect(new TextEncoder().encode(JSON.stringify(details)).length).toBeLessThan(131072);
    const metadata = details[0];
    expect(metadata.respuestas_omitidas).toBe(20 - (details.length - 1));
    expect(metadata.traza_truncada).toBe(metadata.respuestas_omitidas > 0);
  });

  it('marks truncated runs and protects the serialized metadata type', () => {
    expect(gameAttemptDetails('flying_cat', { tipo: 'malformed' }, [event], true)[0])
      .toMatchObject({ tipo: 'flying_cat', traza_truncada: true, detalle_respuestas_disponible: true });
    expect(gameAttemptDetails('flying_cat', {}, undefined)[0])
      .toMatchObject({ detalle_respuestas_disponible: false, respuestas_omitidas: 0 });
  });

  it('cannot disable prompt bounds with an invalid requested limit', () => {
    expect(normalizeGameAnswerDetails([event], { maxPromptCharacters: Infinity }).details[0].reactivo)
      .toHaveLength(240);
    expect(normalizeGameAnswerDetails([{ ...event, prompt: 'x'.repeat(10000) }], { maxPromptCharacters: 10000 }).details[0].reactivo)
      .toHaveLength(1600);
  });
});
