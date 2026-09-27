import { describe, expect, it } from 'vitest';
import { appendBackroomsAnswer, makeBackroomsAnswerEvent, MAX_BACKROOMS_ANSWER_EVENTS } from '../../games/backrooms-scape/src/game/answer-history';
import { shuffleQuestion } from '../../games/backrooms-scape/src/game/questions';

const question = {
  id: 'jobs-1',
  type: 'multiple_choice' as const,
  prompt: 'Who designs buildings?',
  options: ['Doctor', 'Architect', 'Pilot', 'Chef'],
  correctIndex: 1,
  feedback: '',
};

describe('Backrooms answer history', () => {
  it('records shuffled choices, timeout and retry order without changing scoring', () => {
    const shuffled = shuffleQuestion(question, 'Jobs', () => 0);
    const wrongIndex = (shuffled.correct + 1) % shuffled.options.length;
    let trace = { answers: [], truncated: false } as ReturnType<typeof appendBackroomsAnswer>;
    trace = appendBackroomsAnswer(trace, makeBackroomsAnswerEvent(shuffled, wrongIndex, 1, 1));
    trace = appendBackroomsAnswer(trace, makeBackroomsAnswerEvent(shuffled, null, 2, 2, true));
    trace = appendBackroomsAnswer(trace, makeBackroomsAnswerEvent(shuffled, shuffled.correct, 3, 3));

    expect(trace.truncated).toBe(false);
    expect(trace.answers).toHaveLength(3);
    expect(trace.answers.map(({ attemptNumber, order, isCorrect }) => ({ attemptNumber, order, isCorrect })))
      .toEqual([
        { attemptNumber: 1, order: 1, isCorrect: false },
        { attemptNumber: 2, order: 2, isCorrect: false },
        { attemptNumber: 3, order: 3, isCorrect: true },
      ]);
    expect(trace.answers[0].selectedAnswer).toBe(shuffled.options[wrongIndex]);
    expect(trace.answers[1]).toMatchObject({ selectedAnswer: null, timedOut: true });
    expect(trace.answers[2].correctAnswer).toBe('Architect');
    expect(trace.answers[2].selectedAnswer).toBe('Architect');
  });

  it('bounds long histories and marks omitted old events', () => {
    const shuffled = shuffleQuestion(question, 'Jobs', () => 0);
    let trace = { answers: [], truncated: false } as ReturnType<typeof appendBackroomsAnswer>;
    for (let order = 1; order <= MAX_BACKROOMS_ANSWER_EVENTS + 1; order++) {
      trace = appendBackroomsAnswer(trace, makeBackroomsAnswerEvent(shuffled, shuffled.correct, order, order));
    }
    expect(trace.truncated).toBe(true);
    expect(trace.answers).toHaveLength(MAX_BACKROOMS_ANSWER_EVENTS);
    expect(trace.answers[0].order).toBe(2);
    expect(trace.answers.at(-1)?.order).toBe(MAX_BACKROOMS_ANSWER_EVENTS + 1);
  });
});
