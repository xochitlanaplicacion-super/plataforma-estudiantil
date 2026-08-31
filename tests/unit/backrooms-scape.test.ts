import { describe, expect, it } from 'vitest';
import {
  backroomsScapeGameActivity,
  createBackroomsScapeContent,
  normalizeBackroomsScapeContent,
  validateBackroomsScapeContent,
} from '@/lib/activities/backrooms-scape';

describe('Backrooms Scape activity contract', () => {
  it('normalizes mixed multiple-choice and true/false AI questions with feedback', () => {
    const content = normalizeBackroomsScapeContent({
      showFeedback: true,
      settings: { difficulty: 'hard', mazeSize: 'large', requiredFragments: 2, seedMode: 'fixed', fixedSeed: '12-34' },
      items: [
        { question: '¿Capital de México?', options: ['CDMX', 'Lima', 'Bogotá', 'Quito'], correctIndex: 0, justification: 'La capital es Ciudad de México.' },
        { type: 'true_false', statement: 'La Tierra es un planeta.', correct: true, justification: 'Orbita alrededor del Sol.' },
      ],
    });

    expect(content.items).toHaveLength(2);
    expect(content.items[0]).toMatchObject({ type: 'multiple_choice', feedback: 'La capital es Ciudad de México.' });
    expect(content.items[1]).toMatchObject({ type: 'true_false', options: ['Verdadero', 'Falso'], correctIndex: 0 });
    expect(content.settings).toMatchObject({ difficulty: 'hard', mazeSize: 'large', requiredFragments: 2, fixedSeed: '1234' });
    expect(validateBackroomsScapeContent(content)).toBeNull();
  });

  it('rejects incomplete questions and impossible fragment goals', () => {
    const content = createBackroomsScapeContent();
    expect(validateBackroomsScapeContent(content)).toContain('pregunta 1');

    const normalized = normalizeBackroomsScapeContent({
      settings: { requiredFragments: 99 },
      items: [{ type: 'true_false', prompt: 'Reactivo', correctIndex: 1, feedback: 'Explicación' }],
    });
    expect(normalized.settings.requiredFragments).toBe(1);
  });

  it('creates the standalone game payload without exposing tenant or user identifiers', () => {
    const activity = backroomsScapeGameActivity({
      id: 'exercise-1',
      titulo: 'Repaso de ciencias',
      materia: 'Ciencias',
      tenant_id: 'private-tenant',
      created_by: 'private-user',
      contenido: {
        settings: { requiredFragments: 1 },
        items: [{ type: 'true_false', prompt: 'El agua es H₂O.', correctIndex: 0, feedback: 'Dos átomos de hidrógeno y uno de oxígeno.' }],
      },
    });

    expect(activity).toMatchObject({ id: 'exercise-1', title: 'Repaso de ciencias', subject: 'Ciencias' });
    expect(activity.questions[0].feedback).toContain('hidrógeno');
    expect(activity).not.toHaveProperty('tenant_id');
    expect(activity).not.toHaveProperty('created_by');
  });
});
