export type FlyingCatDifficulty = 'easy' | 'normal' | 'hard';

export interface FlyingCatQuestion {
  id: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  feedback: string;
}

export interface FlyingCatContent {
  version: 1;
  instructions: string;
  showFeedback: boolean;
  settings: { difficulty: FlyingCatDifficulty };
  items: FlyingCatQuestion[];
}

export const FLYING_CAT_MAX_ITEMS = 20;
export const FLYING_CAT_MAX_OPTION_CHARACTERS = 24;

export function createFlyingCatQuestion(): FlyingCatQuestion {
  return { id: crypto.randomUUID(), prompt: '', options: ['', '', '', ''], correctIndex: 0, feedback: '' };
}

export function createFlyingCatContent(): FlyingCatContent {
  return {
    version: 1,
    instructions: 'Lee la definición, pilota hasta el concepto correcto y esquiva las otras respuestas y los obstáculos.',
    showFeedback: true,
    settings: { difficulty: 'normal' },
    items: [createFlyingCatQuestion()],
  };
}

/** Prepare editable values without hiding invalid counts or changing the correct answer. */
export function normalizeFlyingCatContent(input: unknown): FlyingCatContent {
  const defaults = createFlyingCatContent();
  const source = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const settings = source.settings && typeof source.settings === 'object'
    ? source.settings as Record<string, unknown> : {};
  return {
    version: (source.version ?? 1) as 1,
    instructions: typeof source.instructions === 'string' ? source.instructions : defaults.instructions,
    showFeedback: typeof source.showFeedback === 'boolean' ? source.showFeedback : true,
    settings: { difficulty: (settings.difficulty ?? 'normal') as FlyingCatDifficulty },
    items: Array.isArray(source.items) ? source.items.map((raw, index) => {
      const item = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
      return {
        id: typeof item.id === 'string' && item.id ? item.id : `question-${index + 1}`,
        prompt: typeof item.prompt === 'string' ? item.prompt : '',
        options: Array.isArray(item.options) ? item.options.map((option) => typeof option === 'string' ? option : '') : [],
        correctIndex: typeof item.correctIndex === 'number' ? item.correctIndex : -1,
        feedback: typeof item.feedback === 'string' ? item.feedback : '',
      };
    }) : defaults.items,
  };
}

/** Also accepts raw JSON so imports are rejected before normalization can fill defaults. */
export function validateFlyingCatContent(input: unknown): string | null {
  if (!input || typeof input !== 'object') return 'El JSON debe contener un objeto de Flying Cat.';
  const content = input as Record<string, any>;
  if (content.version !== 1) return 'La versión del JSON de Flying Cat debe ser 1.';
  if (typeof content.instructions !== 'string' || !content.instructions.trim() || content.instructions.length > 1000) {
    return 'Escribe instrucciones de entre 1 y 1000 caracteres.';
  }
  if (typeof content.showFeedback !== 'boolean') return 'showFeedback debe ser verdadero o falso.';
  if (!['easy', 'normal', 'hard'].includes(content.settings?.difficulty)) return 'Selecciona una dificultad válida: easy, normal o hard.';
  if (!Array.isArray(content.items) || content.items.length < 1 || content.items.length > FLYING_CAT_MAX_ITEMS) {
    return `Agrega entre 1 y ${FLYING_CAT_MAX_ITEMS} definiciones.`;
  }
  const ids = new Set<string>();
  for (const [index, item] of content.items.entries()) {
    const prefix = `Definición ${index + 1}: `;
    if (!item || typeof item !== 'object') return `${prefix}el reactivo no es válido.`;
    if (typeof item.id !== 'string' || !item.id.trim() || item.id !== item.id.trim() || item.id.length > 80 || ids.has(item.id)) {
      return `${prefix}cada id debe ser único, tener entre 1 y 80 caracteres y no llevar espacios al inicio o al final.`;
    }
    ids.add(item.id);
    if (typeof item.prompt !== 'string' || item.prompt.trim().length < 30 || item.prompt.length > 1600) {
      return `${prefix}escribe una descripción, definición o caso de uso de 30 a 1600 caracteres.`;
    }
    if (!Array.isArray(item.options) || item.options.length < 2 || item.options.length > 4) {
      return `${prefix}necesita entre 2 y 4 conceptos, sin recortarlos.`;
    }
    const concepts = new Set<string>();
    for (const option of item.options) {
      if (typeof option !== 'string' || !option.trim()) return `${prefix}completa todos los conceptos.`;
      const text = option.trim().replace(/\s+/gu, ' ');
      if (text.split(' ').length > 2 || Array.from(text).length > FLYING_CAT_MAX_OPTION_CHARACTERS) {
        return `${prefix}cada concepto debe tener como máximo 2 palabras y ${FLYING_CAT_MAX_OPTION_CHARACTERS} caracteres.`;
      }
      const key = text.toLocaleLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
      if (concepts.has(key)) return `${prefix}los conceptos no pueden repetirse.`;
      concepts.add(key);
    }
    if (!Number.isInteger(item.correctIndex) || item.correctIndex < 0 || item.correctIndex >= item.options.length) {
      return `${prefix}selecciona una respuesta correcta existente (correctIndex inicia en 0).`;
    }
    if (typeof item.feedback !== 'string' || !item.feedback.trim() || item.feedback.length > 2000) {
      return `${prefix}agrega una explicación de la respuesta (máximo 2000 caracteres).`;
    }
  }
  return null;
}

export function flyingCatRandom(): number {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    return crypto.getRandomValues(new Uint32Array(1))[0] / 0x100000000;
  }
  return Math.random();
}

/** Fisher–Yates: shuffle identities, not labels, to keep the correct answer intact. */
export function shuffleFlyingCatOptions(item: FlyingCatQuestion, random: () => number = flyingCatRandom): FlyingCatQuestion {
  const order = item.options.map((_, index) => index);
  for (let index = order.length - 1; index > 0; index -= 1) {
    const draw = Math.max(0, Math.min(1 - Number.EPSILON, random()));
    const other = Math.floor(draw * (index + 1));
    [order[index], order[other]] = [order[other], order[index]];
  }
  return { ...item, options: order.map((index) => item.options[index]), correctIndex: order.indexOf(item.correctIndex) };
}
