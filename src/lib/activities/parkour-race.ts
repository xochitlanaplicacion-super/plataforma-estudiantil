export type ParkourMapSize = 'small' | 'medium' | 'large' | 'custom';
export type ParkourDifficulty = 'easy' | 'normal' | 'hard';
export type ParkourDensity = 'low' | 'medium' | 'high';
export type ParkourSeedMode = 'unique' | 'fixed' | 'manual';

export interface ParkourRaceOption {
  id: string;
  text: string;
}

export interface ParkourRaceQuestion {
  question: string;
  options: ParkourRaceOption[];
  correctId: string;
  feedback: string;
}

export interface ParkourRaceContent {
  version: 1;
  instructions: string;
  showFeedback: boolean;
  settings: {
    mapSize: ParkourMapSize;
    customStations: number;
    difficulty: ParkourDifficulty;
    parkour: ParkourDensity;
    seedMode: ParkourSeedMode;
    fixedSeed: string;
  };
  items: ParkourRaceQuestion[];
}

const defaultQuestion = (): ParkourRaceQuestion => ({
  question: '',
  options: [
    { id: '1', text: '' },
    { id: '2', text: '' },
    { id: '3', text: '' },
    { id: '4', text: '' },
  ],
  correctId: '1',
  feedback: '',
});

export function createParkourRaceContent(): ParkourRaceContent {
  return {
    version: 1,
    instructions: 'Supera el parkour y responde las preguntas en cada estación.',
    showFeedback: true,
    settings: {
      mapSize: 'medium',
      customStations: 5,
      difficulty: 'normal',
      parkour: 'medium',
      seedMode: 'unique',
      fixedSeed: '38172914',
    },
    items: [defaultQuestion()],
  };
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && allowed.includes(value as T) ? value as T : fallback;
}

export function normalizeParkourRaceContent(input: unknown): ParkourRaceContent {
  const defaults = createParkourRaceContent();
  const source = input && typeof input === 'object' ? input as Record<string, any> : {};
  const settings = source.settings && typeof source.settings === 'object' ? source.settings : {};
  const items = Array.isArray(source.items) && source.items.length > 0
    ? source.items.map((item: any): ParkourRaceQuestion => {
      const options = Array.isArray(item?.options) ? item.options.slice(0, 4).map((option: any, index: number) => ({
        id: String(option?.id ?? index + 1),
        text: String(option?.text ?? ''),
      })) : [];
      while (options.length < 4) options.push({ id: String(options.length + 1), text: '' });
      const requestedCorrectId = String(item?.correctId ?? options[0].id);
      return {
        question: String(item?.question ?? ''),
        options,
        correctId: options.some((option: ParkourRaceOption) => option.id === requestedCorrectId)
          ? requestedCorrectId : options[0].id,
        feedback: String(item?.feedback ?? ''),
      };
    })
    : defaults.items;

  return {
    version: 1,
    instructions: String(source.instructions ?? defaults.instructions),
    showFeedback: source.showFeedback !== false,
    settings: {
      mapSize: oneOf(settings.mapSize, ['small', 'medium', 'large', 'custom'] as const, 'medium'),
      customStations: Math.max(1, Math.min(20, Number(settings.customStations) || 5)),
      difficulty: oneOf(settings.difficulty, ['easy', 'normal', 'hard'] as const, 'normal'),
      parkour: oneOf(settings.parkour, ['low', 'medium', 'high'] as const, 'medium'),
      seedMode: oneOf(settings.seedMode, ['unique', 'fixed', 'manual'] as const, 'unique'),
      fixedSeed: String(settings.fixedSeed || defaults.settings.fixedSeed).replace(/\D/g, '').slice(0, 8),
    },
    items,
  };
}

export function parkourRaceGameActivity(exercise: any) {
  const content = normalizeParkourRaceContent(
    typeof exercise?.contenido === 'string' ? JSON.parse(exercise.contenido || '{}') : exercise?.contenido,
  );
  return {
    id: String(exercise?.id || `preview-${Date.now()}`),
    title: String(exercise?.titulo || 'Parkour Race'),
    subject: String(exercise?.materia || 'Actividad educativa'),
    instructions: content.instructions,
    color: '#FF6B8A',
    createdAt: exercise?.created_at ? new Date(exercise.created_at).getTime() : Date.now(),
    questions: content.items.map((item, index) => ({
      id: `${exercise?.id || 'preview'}-${index + 1}`,
      prompt: item.question,
      answers: item.options.map((option) => option.text),
      correctIndex: Math.max(0, item.options.findIndex((option) => option.id === item.correctId)),
      feedback: item.feedback,
    })),
    settings: { ...content.settings, showFeedback: content.showFeedback },
  };
}

export function validateParkourRaceContent(content: ParkourRaceContent): string | null {
  if (content.items.length === 0) return 'Agrega al menos una pregunta.';
  for (const [index, item] of content.items.entries()) {
    if (!item.question.trim()) return `Escribe el enunciado de la pregunta ${index + 1}.`;
    if (item.options.length !== 4 || item.options.some((option) => !option.text.trim())) {
      return `Completa las cuatro respuestas de la pregunta ${index + 1}.`;
    }
    if (!item.options.some((option) => option.id === item.correctId)) {
      return `Selecciona la respuesta correcta de la pregunta ${index + 1}.`;
    }
  }
  return null;
}
