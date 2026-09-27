import { describe, expect, it } from 'vitest';
import {
  appendParkourAnswer,
  makeParkourAnswerEvent,
  MAX_ANSWER_TRACE_BYTES,
  MAX_ANSWER_TRACE_EVENTS,
  type GameAnswerTrace,
} from '../../games/parkour-race/src/lib/answer-trace';
import type { Question } from '../../games/parkour-race/src/lib/core';

const question: Question = {
  id: 'exercise-1',
  prompt: '¿Cuál es la respuesta?',
  answers: ['No', 'Sí', 'Quizá'],
  correctIndex: 1,
};

describe('Parkour Race answer trace', () => {
  it('records wrong and correct retries in chronological order without changing scoring inputs', () => {
    const wrong = makeParkourAnswerEvent(question, 0, 1);
    const correct = makeParkourAnswerEvent(question, 1, 2);
    const first = appendParkourAnswer({ answers: [], truncated: false }, wrong);
    const second = appendParkourAnswer(first, correct);

    expect(second).toEqual({
      answers: [
        { questionId: 'exercise-1', prompt: '¿Cuál es la respuesta?', selectedAnswer: 'No',
          correctAnswer: 'Sí', isCorrect: false, attemptNumber: 1 },
        { questionId: 'exercise-1', prompt: '¿Cuál es la respuesta?', selectedAnswer: 'Sí',
          correctAnswer: 'Sí', isCorrect: true, attemptNumber: 2 },
      ],
      truncated: false,
    });
  });

  it('does not invent a selected answer for an invalid choice', () => {
    expect(makeParkourAnswerEvent(question, -1, 1)).toMatchObject({
      selectedAnswer: null,
      isCorrect: false,
    });
  });

  it('bounds Unicode text, event count and serialized bytes while keeping recent answers', () => {
    const longQuestion: Question = {
      id: '😀'.repeat(200),
      prompt: '😀'.repeat(1000),
      answers: ['😀'.repeat(500), '👍'.repeat(500)],
      correctIndex: 1,
    };
    let trace: GameAnswerTrace = { answers: [], truncated: false };
    for (let attempt = 1; attempt <= 300; attempt++) {
      trace = appendParkourAnswer(trace, makeParkourAnswerEvent(longQuestion, 0, attempt));
    }

    expect(trace.truncated).toBe(true);
    expect(trace.answers.length).toBeLessThanOrEqual(MAX_ANSWER_TRACE_EVENTS);
    expect(new TextEncoder().encode(JSON.stringify(trace.answers)).length).toBeLessThanOrEqual(MAX_ANSWER_TRACE_BYTES);
    expect(trace.answers.at(-1)?.attemptNumber).toBe(300);
    expect(Array.from(trace.answers.at(-1)?.prompt || '')).toHaveLength(500);
    expect(Array.from(trace.answers.at(-1)?.selectedAnswer || '')).toHaveLength(240);
  });
});
