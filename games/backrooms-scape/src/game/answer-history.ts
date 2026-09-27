import type { PlatformAnswer } from '../platform';
import type { ShuffledQuestion } from './questions';

export interface BackroomsAnswerTrace {
  answers: PlatformAnswer[];
  truncated: boolean;
}

// The academic RPC caps p_detalles at 128 KiB. Keep the game trace well below it.
export const MAX_BACKROOMS_ANSWER_EVENTS = 120;
export const MAX_BACKROOMS_ANSWER_BYTES = 60_000;
const encoder = new TextEncoder();

function boundedText(value: string | undefined, maximum: number): string {
  return Array.from(value ?? '').slice(0, maximum).join('');
}

export function makeBackroomsAnswerEvent(
  question: ShuffledQuestion,
  selectedIndex: number | null,
  attemptNumber: number,
  order: number,
  timedOut = false,
): PlatformAnswer {
  const validChoice = !timedOut && Number.isInteger(selectedIndex)
    && selectedIndex !== null && selectedIndex >= 0 && selectedIndex < question.options.length;
  return {
    questionId: boundedText(question.id, 80),
    prompt: boundedText(question.text, 200),
    selectedAnswer: validChoice ? boundedText(question.options[selectedIndex], 120) : null,
    correctAnswer: boundedText(question.options[question.correct], 120),
    isCorrect: validChoice && selectedIndex === question.correct,
    attemptNumber,
    order,
    ...(timedOut ? { timedOut: true } : {}),
  };
}

export function appendBackroomsAnswer(trace: BackroomsAnswerTrace, event: PlatformAnswer): BackroomsAnswerTrace {
  const answers = [...trace.answers, event];
  let truncated = trace.truncated;
  while (answers.length > MAX_BACKROOMS_ANSWER_EVENTS
    || encoder.encode(JSON.stringify(answers)).length > MAX_BACKROOMS_ANSWER_BYTES) {
    answers.shift();
    truncated = true;
  }
  return { answers, truncated };
}
