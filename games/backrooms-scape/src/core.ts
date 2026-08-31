export type QuestionType = 'multiple_choice' | 'true_false';
export interface Question { id: string; type: QuestionType; prompt: string; options: string[]; correctIndex: number; feedback: string }
export interface Activity {
  id: string; title: string; subject: string; instructions: string; createdAt: number;
  questions: Question[];
  settings: {
    difficulty: 'easy' | 'normal' | 'hard'; mazeSize: 'small' | 'medium' | 'large';
    biome: 'liminal_halls' | 'flooded_rooms' | 'toy_rooms' | 'storage_maze' | 'mixed';
    questionTime: number; doorLockSeconds: number; requiredFragments: number;
    seedMode: 'unique' | 'fixed'; fixedSeed: string; showFeedback: boolean;
  };
}
export interface Result { hits: number; total: number; wrongAttempts: number; time: number; captures: number; score: number; seedCode: string; fragments: number }

export function clamp(value: number, minimum: number, maximum: number) { return Math.max(minimum, Math.min(maximum, value)); }
export function randomSeed() { return Math.floor(Math.random() * 100_000_000); }
export function seedCode(seed: number) { return (seed % 100_000_000).toString().padStart(8, '0'); }
export function mulberry32(seed: number) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6d2b79f5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

export function normalizeActivity(input: any): Activity | null {
  if (!input || !Array.isArray(input.questions) || input.questions.length === 0) return null;
  const questions = input.questions.slice(0, 20).map((item: any, index: number): Question => {
    const type: QuestionType = item?.type === 'true_false' ? 'true_false' : 'multiple_choice';
    const options = type === 'true_false' ? ['Verdadero', 'Falso'] : Array.isArray(item.options) ? item.options.slice(0, 4).map(String) : [];
    while (options.length < (type === 'true_false' ? 2 : 4)) options.push('—');
    return { id: String(item.id || index), type, prompt: String(item.prompt || ''), options,
      correctIndex: clamp(Number(item.correctIndex) || 0, 0, options.length - 1), feedback: String(item.feedback || '') };
  });
  const settings = input.settings || {};
  return {
    id: String(input.id || 'preview'), title: String(input.title || 'Backrooms Scape'), subject: String(input.subject || ''),
    instructions: String(input.instructions || ''), createdAt: Number(input.createdAt) || Date.now(), questions,
    settings: {
      difficulty: ['easy', 'normal', 'hard'].includes(settings.difficulty) ? settings.difficulty : 'normal',
      mazeSize: ['small', 'medium', 'large'].includes(settings.mazeSize) ? settings.mazeSize : 'medium',
      biome: ['liminal_halls', 'flooded_rooms', 'toy_rooms', 'storage_maze', 'mixed'].includes(settings.biome) ? settings.biome : 'liminal_halls',
      questionTime: clamp(Number(settings.questionTime) || 20, 10, 60), doorLockSeconds: clamp(Number(settings.doorLockSeconds) || 10, 5, 20),
      requiredFragments: clamp(Number(settings.requiredFragments) || Math.min(5, questions.length), 1, questions.length),
      seedMode: settings.seedMode === 'fixed' ? 'fixed' : 'unique', fixedSeed: String(settings.fixedSeed || '47291385'),
      showFeedback: settings.showFeedback !== false,
    },
  };
}
