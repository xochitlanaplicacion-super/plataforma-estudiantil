import type { ClassroomQuestionInput } from '@/lib/actions/classroom-games';

export type ClassroomQuestionMode = 'multiple_choice' | 'true_false' | 'mixed';

function secureIndex(maxExclusive: number) {
  if (maxExclusive <= 1) return 0;
  const limit = Math.floor(0x1_0000_0000 / maxExclusive) * maxExclusive;
  const value = new Uint32Array(1);
  do crypto.getRandomValues(value); while (value[0] >= limit);
  return value[0] % maxExclusive;
}

export function shuffleQuestionOptions(
  question: ClassroomQuestionInput,
  randomIndex: (maxExclusive: number) => number = secureIndex,
): ClassroomQuestionInput {
  if (question.questionType !== 'multiple_choice') return question;

  const indexed = question.options.map((text, originalIndex) => ({ text, originalIndex }));
  for (let index = indexed.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(index + 1);
    [indexed[index], indexed[swapIndex]] = [indexed[swapIndex], indexed[index]];
  }

  return {
    ...question,
    options: indexed.map((option) => option.text),
    correctIndex: indexed.findIndex((option) => option.originalIndex === question.correctIndex),
  };
}

export function shuffleEachQuestionOptions(
  questions: ClassroomQuestionInput[],
  randomIndex?: (maxExclusive: number) => number,
) {
  return questions.map((question) => shuffleQuestionOptions(question, randomIndex));
}
