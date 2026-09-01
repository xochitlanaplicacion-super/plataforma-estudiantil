import { describe, expect, it } from 'vitest';
import {
  createParkourRaceContent,
  normalizeParkourRaceContent,
  parkourRaceGameActivity,
  validateParkourRaceContent,
} from '@/lib/activities/parkour-race';

describe('Parkour Race activity contract', () => {
  it('persists presets and question explanations in the exercise content', () => {
    const content = normalizeParkourRaceContent({
      showFeedback: true,
      settings: { difficulty: 'hard', parkour: 'high', mapSize: 'small', seedMode: 'fixed', fixedSeed: '12345678' },
      items: [{
        type: 'multiple_choice',
        question: '¿Cuánto es 2 + 2?',
        options: [
          { id: '1', text: '3' }, { id: '2', text: '4' },
          { id: '3', text: '5' }, { id: '4', text: '6' },
        ],
        correctId: '2',
        feedback: 'Dos unidades más dos unidades forman cuatro.',
      }],
    });

    expect(content.settings.difficulty).toBe('hard');
    expect(content.settings.parkour).toBe('high');
    expect(content.items[0].feedback).toBe('Dos unidades más dos unidades forman cuatro.');
    expect(validateParkourRaceContent(content)).toBeNull();
  });

  it('converts the Supabase exercise JSON into the isolated game contract', () => {
    const content = createParkourRaceContent();
    content.items[0] = {
      type: 'multiple_choice',
      question: 'Capital de México',
      options: [
        { id: 'a', text: 'Monterrey' }, { id: 'b', text: 'Ciudad de México' },
        { id: 'c', text: 'Puebla' }, { id: 'd', text: 'Mérida' },
      ],
      correctId: 'b',
      feedback: 'La capital del país es Ciudad de México.',
    };

    const activity = parkourRaceGameActivity({
      id: 'exercise-id',
      titulo: 'Geografía en movimiento',
      contenido: JSON.stringify(content),
    });

    expect(activity.questions[0]).toMatchObject({
      prompt: 'Capital de México',
      correctIndex: 1,
      feedback: 'La capital del país es Ciudad de México.',
    });
    expect(activity.settings.showFeedback).toBe(true);
  });

  it('rejects incomplete questions before saving', () => {
    const content = createParkourRaceContent();
    expect(validateParkourRaceContent(content)).toContain('enunciado');
  });

  it('supports true/false stations without converting them into four-option questions', () => {
    const content = normalizeParkourRaceContent({
      items: [{
        type: 'true_false',
        question: 'La Tierra gira alrededor del Sol.',
        options: [{ id: '1', text: 'texto alterado' }, { id: '2', text: 'otro texto' }],
        correctId: '1',
        feedback: 'El movimiento se llama traslación.',
      }],
    });
    const activity = parkourRaceGameActivity({ id: 'vf', contenido: content });

    expect(content.items[0]).toMatchObject({
      type: 'true_false',
      options: [{ id: '1', text: 'Verdadero' }, { id: '2', text: 'Falso' }],
    });
    expect(activity.questions[0]).toMatchObject({
      type: 'true_false',
      answers: ['Verdadero', 'Falso'],
      correctIndex: 0,
    });
    expect(validateParkourRaceContent(content)).toBeNull();
  });
});
