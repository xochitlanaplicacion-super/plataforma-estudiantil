/** Questions are kept in the teacher's current classroom session, never student grades. */
export type NavalQuestionType = 'multiple_choice' | 'true_false';
export type NavalQuestionMode = NavalQuestionType | 'mixed';

export interface NavalQuestion {
  id: string;
  type: NavalQuestionType;
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export class NavalQuestionValidationError extends Error {}

/** Literal duplicate protection also catches case, accent, Unicode and punctuation variants. */
export function questionFingerprint(question: string | Pick<NavalQuestion, 'prompt'>): string {
  const prompt = typeof question === 'string' ? question : question.prompt;
  return prompt.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('es')
    .replace(/[\p{P}\p{Z}\s]+/gu, ' ').trim();
}

function text(value: unknown, minimum: number, maximum: number, message: string): string {
  if (typeof value !== 'string') throw new NavalQuestionValidationError(message);
  const normalized = value.trim().replace(/\s+/gu, ' ');
  if (normalized.length < minimum || normalized.length > maximum) throw new NavalQuestionValidationError(message);
  return normalized;
}

/** No answer is inferred, truncated or silently repaired here. Invalid AI replies must be regenerated. */
export function parseNavalQuestions(input: unknown, mode?: NavalQuestionMode, optionCount?: number): NavalQuestion[] {
  if (mode !== undefined && !['multiple_choice', 'true_false', 'mixed'].includes(mode)) {
    throw new NavalQuestionValidationError('Selecciona opción múltiple, verdadero/falso o ambas.');
  }
  if (optionCount !== undefined && (!Number.isInteger(optionCount) || optionCount < 2 || optionCount > 6)) {
    throw new NavalQuestionValidationError('La opción múltiple admite entre 2 y 6 respuestas.');
  }
  const values = Array.isArray(input) ? input
    : input && typeof input === 'object' && 'items' in input ? input.items : null;
  if (!Array.isArray(values) || values.length < 1 || values.length > 12) {
    throw new NavalQuestionValidationError('Se requiere un lote de entre 1 y 12 preguntas.');
  }
  const seenPrompts = new Set<string>();
  const seenIds = new Set<string>();
  const questions = values.map((value: unknown, index): NavalQuestion => {
    const label = `Pregunta ${index + 1}`;
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new NavalQuestionValidationError(`${label}: formato no válido.`);
    const item = value as Record<string, unknown>;
    if (item.type !== 'multiple_choice' && item.type !== 'true_false') throw new NavalQuestionValidationError(`${label}: tipo no válido.`);
    if (mode && mode !== 'mixed' && item.type !== mode) throw new NavalQuestionValidationError(`${label}: el tipo no coincide con la modalidad elegida.`);
    const prompt = text(item.prompt, 5, 1000, `${label}: escribe un enunciado de entre 5 y 1000 caracteres.`);
    const fingerprint = questionFingerprint(prompt);
    if (!fingerprint || seenPrompts.has(fingerprint)) throw new NavalQuestionValidationError(`${label}: el enunciado está repetido.`);
    seenPrompts.add(fingerprint);
    if (!Array.isArray(item.options)) throw new NavalQuestionValidationError(`${label}: faltan las respuestas.`);
    const expectedCount = item.type === 'true_false' ? 2 : optionCount;
    if (item.options.length < 2 || item.options.length > 6 || (expectedCount !== undefined && item.options.length !== expectedCount)) {
      throw new NavalQuestionValidationError(`${label}: debe tener ${expectedCount ?? 'entre 2 y 6'} respuestas.`);
    }
    const options = item.options.map((option: unknown) => text(option, 1, 240, `${label}: cada respuesta debe contener entre 1 y 240 caracteres.`));
    if (new Set(options.map(questionFingerprint)).size !== options.length) throw new NavalQuestionValidationError(`${label}: las respuestas deben ser distintas.`);
    if (item.type === 'true_false' && (options[0] !== 'Verdadero' || options[1] !== 'Falso')) {
      throw new NavalQuestionValidationError(`${label}: verdadero/falso requiere las opciones Verdadero y Falso, en ese orden.`);
    }
    if (typeof item.correctIndex !== 'number' || !Number.isInteger(item.correctIndex) || item.correctIndex < 0 || item.correctIndex >= options.length) {
      throw new NavalQuestionValidationError(`${label}: el índice correcto no corresponde a una respuesta.`);
    }
    const explanation = text(item.explanation, 5, 2000, `${label}: falta una explicación educativa de entre 5 y 2000 caracteres.`);
    const id = item.id === undefined ? crypto.randomUUID() : text(item.id, 1, 100, `${label}: identificador no válido.`);
    if (seenIds.has(id)) throw new NavalQuestionValidationError(`${label}: el identificador está repetido.`);
    seenIds.add(id);
    return { id, type: item.type, prompt, options, correctIndex: item.correctIndex, explanation };
  });
  if (mode === 'mixed' && questions.length > 1 && new Set(questions.map((question) => question.type)).size !== 2) {
    throw new NavalQuestionValidationError('El lote mixto debe incluir ambos tipos: opción múltiple y verdadero/falso.');
  }
  return questions;
}

function randomIndex(random: () => number, maximum: number) {
  const value = random();
  return Math.floor((Number.isFinite(value) ? Math.min(Math.max(value, 0), 1 - Number.EPSILON) : 0) * maximum);
}

/** Fisher–Yates on option identities, not texts; the correct answer follows its original identity. */
export function shuffleQuestionOptions(question: NavalQuestion, random: () => number = Math.random): NavalQuestion {
  if (question.type === 'true_false') return { ...question, options: [...question.options] };
  const options = question.options.map((option, index) => ({ option, index }));
  for (let index = options.length - 1; index > 0; index--) {
    const other = randomIndex(random, index + 1);
    [options[index], options[other]] = [options[other], options[index]];
  }
  return { ...question, options: options.map(({ option }) => option), correctIndex: options.findIndex(({ index }) => index === question.correctIndex) };
}
