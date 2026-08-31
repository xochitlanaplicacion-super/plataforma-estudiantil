export type BackroomsQuestionType = 'multiple_choice' | 'true_false';
export type BackroomsDifficulty = 'easy' | 'normal' | 'hard';
export type BackroomsMazeSize = 'small' | 'medium' | 'large';
export type BackroomsSeedMode = 'unique' | 'fixed';
export type BackroomsBiome = 'liminal_halls' | 'flooded_rooms' | 'toy_rooms' | 'storage_maze' | 'mixed';

export interface BackroomsScapeQuestion {
  id: string;
  type: BackroomsQuestionType;
  prompt: string;
  options: string[];
  correctIndex: number;
  feedback: string;
}

export interface BackroomsScapeContent {
  version: 1;
  instructions: string;
  showFeedback: boolean;
  settings: {
    difficulty: BackroomsDifficulty;
    mazeSize: BackroomsMazeSize;
    biome: BackroomsBiome;
    questionTime: number;
    doorLockSeconds: number;
    requiredFragments: number;
    seedMode: BackroomsSeedMode;
    fixedSeed: string;
  };
  items: BackroomsScapeQuestion[];
}

function question(type: BackroomsQuestionType = 'multiple_choice'): BackroomsScapeQuestion {
  return {
    id: crypto.randomUUID(),
    type,
    prompt: '',
    options: type === 'true_false' ? ['Verdadero', 'Falso'] : ['', '', '', ''],
    correctIndex: 0,
    feedback: '',
  };
}

export function createBackroomsScapeQuestion(type: BackroomsQuestionType = 'multiple_choice') {
  return question(type);
}

export function createBackroomsScapeContent(): BackroomsScapeContent {
  return {
    version: 1,
    instructions: 'Explora el laberinto, encuentra salas seguras, responde y reúne los fragmentos para escapar.',
    showFeedback: true,
    settings: {
      difficulty: 'normal',
      mazeSize: 'medium',
      biome: 'liminal_halls',
      questionTime: 20,
      doorLockSeconds: 10,
      requiredFragments: 5,
      seedMode: 'unique',
      fixedSeed: '47291385',
    },
    items: [question('multiple_choice'), question('true_false')],
  };
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && allowed.includes(value as T) ? value as T : fallback;
}

function bounded(value: unknown, minimum: number, maximum: number, fallback: number) {
  const parsed = Number(value);
  return Math.max(minimum, Math.min(maximum, Number.isFinite(parsed) ? Math.round(parsed) : fallback));
}

function normalizeQuestion(input: any, index: number): BackroomsScapeQuestion {
  const inferredType: BackroomsQuestionType = input?.type === 'true_false'
    || typeof input?.correct === 'boolean' || typeof input?.statement === 'string'
    ? 'true_false' : 'multiple_choice';
  const type = oneOf(input?.type, ['multiple_choice', 'true_false'] as const, inferredType);
  if (type === 'true_false') {
    const correctIndex = typeof input?.correct === 'boolean'
      ? (input.correct ? 0 : 1) : bounded(input?.correctIndex, 0, 1, 0);
    return {
      id: String(input?.id || `question-${index + 1}`),
      type,
      prompt: String(input?.prompt ?? input?.statement ?? input?.question ?? ''),
      options: ['Verdadero', 'Falso'],
      correctIndex,
      feedback: String(input?.feedback ?? input?.justification ?? input?.justificacion ?? ''),
    };
  }
  const rawOptions = Array.isArray(input?.options) ? input.options.slice(0, 4) : [];
  const options = rawOptions.map((option: any) => String(option?.text ?? option ?? ''));
  while (options.length < 4) options.push('');
  let correctIndex = bounded(input?.correctIndex, 0, 3, 0);
  if (input?.correctId !== undefined) {
    const byId = rawOptions.findIndex((option: any, optionIndex: number) =>
      String(option?.id ?? optionIndex + 1) === String(input.correctId));
    if (byId >= 0) correctIndex = byId;
  }
  return {
    id: String(input?.id || `question-${index + 1}`),
    type,
    prompt: String(input?.prompt ?? input?.question ?? ''),
    options,
    correctIndex,
    feedback: String(input?.feedback ?? input?.justification ?? input?.justificacion ?? ''),
  };
}

export function normalizeBackroomsScapeContent(input: unknown): BackroomsScapeContent {
  const defaults = createBackroomsScapeContent();
  const source = input && typeof input === 'object' ? input as Record<string, any> : {};
  const settings = source.settings && typeof source.settings === 'object' ? source.settings : {};
  const items = Array.isArray(source.items) && source.items.length > 0
    ? source.items.slice(0, 20).map(normalizeQuestion) : defaults.items;
  return {
    version: 1,
    instructions: String(source.instructions ?? defaults.instructions),
    showFeedback: source.showFeedback !== false,
    settings: {
      difficulty: oneOf(settings.difficulty, ['easy', 'normal', 'hard'] as const, 'normal'),
      mazeSize: oneOf(settings.mazeSize, ['small', 'medium', 'large'] as const, 'medium'),
      biome: oneOf(settings.biome, ['liminal_halls', 'flooded_rooms', 'toy_rooms', 'storage_maze', 'mixed'] as const, 'liminal_halls'),
      questionTime: bounded(settings.questionTime, 10, 60, 20),
      doorLockSeconds: bounded(settings.doorLockSeconds, 5, 20, 10),
      requiredFragments: bounded(settings.requiredFragments, 1, Math.max(1, items.length), Math.min(5, items.length)),
      seedMode: oneOf(settings.seedMode, ['unique', 'fixed'] as const, 'unique'),
      fixedSeed: String(settings.fixedSeed || defaults.settings.fixedSeed).replace(/\D/g, '').slice(0, 8),
    },
    items,
  };
}

export function validateBackroomsScapeContent(content: BackroomsScapeContent): string | null {
  if (content.items.length === 0) return 'Agrega al menos una pregunta.';
  for (const [index, item] of content.items.entries()) {
    if (!item.prompt.trim()) return `Escribe la pregunta ${index + 1}.`;
    const required = item.type === 'true_false' ? 2 : 4;
    if (item.options.length !== required || item.options.some((option) => !option.trim())) {
      return `Completa las ${required} respuestas de la pregunta ${index + 1}.`;
    }
    if (item.correctIndex < 0 || item.correctIndex >= required) {
      return `Selecciona la respuesta correcta de la pregunta ${index + 1}.`;
    }
  }
  if (content.settings.requiredFragments > content.items.length) {
    return 'Los fragmentos necesarios no pueden superar la cantidad de preguntas.';
  }
  return null;
}

export function backroomsScapeGameActivity(exercise: any) {
  let rawContent = exercise?.contenido;
  if (typeof rawContent === 'string') {
    try { rawContent = JSON.parse(rawContent || '{}'); } catch { rawContent = {}; }
  }
  const content = normalizeBackroomsScapeContent(rawContent);
  return {
    id: String(exercise?.id || `preview-${Date.now()}`),
    title: String(exercise?.titulo || 'Backrooms Scape'),
    subject: String(exercise?.materia || 'Actividad educativa'),
    instructions: content.instructions,
    createdAt: exercise?.created_at ? new Date(exercise.created_at).getTime() : Date.now(),
    questions: content.items,
    settings: { ...content.settings, showFeedback: content.showFeedback },
  };
}
