import type { PlatformQuestion } from "../platform";

export interface ShuffledQuestion {
  id: string;
  type: PlatformQuestion["type"];
  cat: string;
  text: string;
  options: string[];
  correct: number;
  feedback: string;
}

export function shuffleQuestion(q: PlatformQuestion, category: string, rand: () => number): ShuffledQuestion {
  const indexes = q.options.map((_, index) => index);
  if (q.type !== "true_false") {
    for (let index = indexes.length - 1; index > 0; index--) {
      const replacement = Math.floor(rand() * (index + 1));
      [indexes[index], indexes[replacement]] = [indexes[replacement], indexes[index]];
    }
  }
  return {
    id: q.id,
    type: q.type,
    cat: category,
    text: q.prompt,
    options: indexes.map((index) => q.options[index]),
    correct: indexes.indexOf(q.correctIndex),
    feedback: q.feedback,
  };
}
