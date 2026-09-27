import type { Question } from './core';

export interface GameAnswerEvent {
  questionId: string;
  prompt: string;
  selectedAnswer: string | null;
  correctAnswer: string;
  isCorrect: boolean;
  attemptNumber: number;
  timedOut?: boolean;
}

export interface GameAnswerTrace {
  answers: GameAnswerEvent[];
  truncated: boolean;
}

// p_detalles is limited to 128 KiB by the academic result writer. Leave room
// for the game's metrics and the surrounding attempt-history JSON.
export const MAX_ANSWER_TRACE_BYTES = 88 * 1024;
export const MAX_ANSWER_TRACE_EVENTS = 128;

const encoder = new TextEncoder();

function boundedText(value: unknown, maxCharacters: number): string {
  if (typeof value !== 'string') return '';
  return Array.from(value.trim()).slice(0, maxCharacters).join('');
}

export function makeParkourAnswerEvent(
  question: Question,
  selectedIndex: number,
  attemptNumber: number,
): GameAnswerEvent {
  const validChoice = Number.isInteger(selectedIndex)
    && selectedIndex >= 0 && selectedIndex < question.answers.length;
  return {
    questionId: boundedText(question.id, 96),
    prompt: boundedText(question.prompt, 500),
    selectedAnswer: validChoice ? boundedText(question.answers[selectedIndex], 240) : null,
    correctAnswer: boundedText(question.answers[question.correctIndex], 240),
    isCorrect: selectedIndex === question.correctIndex,
    attemptNumber: Number.isSafeInteger(attemptNumber) && attemptNumber > 0 ? attemptNumber : 1,
  };
}

export function appendParkourAnswer(
  trace: GameAnswerTrace,
  answer: GameAnswerEvent,
): GameAnswerTrace {
  const answers = [...trace.answers, answer];
  let truncated = trace.truncated;
  while (answers.length > MAX_ANSWER_TRACE_EVENTS
    || encoder.encode(JSON.stringify(answers)).length > MAX_ANSWER_TRACE_BYTES) {
    answers.shift();
    truncated = true;
  }
  return { answers, truncated };
}
