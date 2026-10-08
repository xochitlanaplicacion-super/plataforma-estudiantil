/** Educational questions for the local classroom prototype. No network calls. */
export const QUESTION_BANK_LIMIT = 200;

const owns = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const comparisonKey = (value) => String(value).normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
const promptKey = (value) => comparisonKey(value).replace(/[¿?¡!.,;:]+/g, '').replace(/\s+/g, ' ').trim();
const firstValue = (value, keys) => {
  for (const key of keys) if (owns(value, key) && value[key] != null) return value[key];
  return undefined;
};

function fail(index, message) {
  throw new Error(`${index == null ? 'Banco de preguntas' : `Pregunta ${index + 1}`}: ${message}`);
}

function textValue(value, label, index, maxLength) {
  if (typeof value !== 'string' || !value.trim()) fail(index, `${label} no puede estar vacío.`);
  const text = value.trim();
  if (text.length > maxLength) fail(index, `${label} supera ${maxLength} caracteres.`);
  return text;
}

function truthValue(value) {
  if (value === true || value === false) return value;
  if (typeof value !== 'string') return undefined;
  const key = comparisonKey(value);
  if (['true', 'verdadero', 'cierto'].includes(key)) return true;
  if (['false', 'falso'].includes(key)) return false;
  return undefined;
}

function questionType(value, options, index) {
  if (value == null || value === '') {
    if (options.length === 2 && options.every((option) => truthValue(option) !== undefined)
      && truthValue(options[0]) !== truthValue(options[1])) return 'truefalse';
    return 'multiple';
  }
  const key = comparisonKey(value).replace(/[\s_/-]/g, '');
  if (['multiple', 'multiplechoice', 'opcionmultiple', 'seleccionmultiple'].includes(key)) return 'multiple';
  if (['truefalse', 'verdaderofalso', 'boolean', 'booleano', 'tf', 'vf'].includes(key)) return 'truefalse';
  fail(index, 'tipo desconocido; usa multiple o truefalse.');
}

function explicitCorrectFlag(option, index) {
  const flags = ['correct', 'isCorrect', 'correcta', 'esCorrecta']
    .filter((key) => owns(option, key)).map((key) => truthValue(option[key]));
  if (flags.some((flag) => flag === undefined)) fail(index, 'las marcas de respuesta correcta deben ser true o false.');
  if (flags.some((flag) => flag !== flags[0])) fail(index, 'una opción tiene marcas de respuesta contradictorias.');
  return flags[0];
}

function answerAsIndex(value, options, type, index) {
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value < 0 || value >= options.length) {
      fail(index, `el índice correcto debe estar entre 0 y ${options.length - 1} (base 0).`);
    }
    return value;
  }
  if (type === 'truefalse' && truthValue(value) !== undefined) {
    return options.findIndex((option) => truthValue(option) === truthValue(value));
  }
  if (typeof value === 'string') {
    const matching = options.map((option, optionIndex) => comparisonKey(option) === comparisonKey(value) ? optionIndex : -1)
      .filter((optionIndex) => optionIndex !== -1);
    if (matching.length === 1) return matching[0];
  }
  fail(index, 'la respuesta correcta debe corresponder exactamente a una opción; no se adivina ni se cambia automáticamente.');
}

/**
 * Accepts an array, {questions: [...]}, or a JSON string of either shape.
 * Numeric answers are ALWAYS zero-based. Wrong or contradictory input is rejected.
 */
export function normalizeQuestions(raw, settings = {}) {
  if (typeof raw === 'string') {
    const unwrapped = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    try { raw = JSON.parse(unwrapped); } catch { fail(null, 'el contenido no es un JSON válido.'); }
  }
  const input = Array.isArray(raw) ? raw : raw?.questions ?? raw?.preguntas;
  if (!Array.isArray(input) || input.length === 0) fail(null, 'debe contener al menos una pregunta.');
  const maxQuestions = settings.maxQuestions ?? QUESTION_BANK_LIMIT;
  if (!Number.isInteger(maxQuestions) || maxQuestions < 1 || maxQuestions > QUESTION_BANK_LIMIT) {
    fail(null, `el límite debe estar entre 1 y ${QUESTION_BANK_LIMIT}.`);
  }
  if (input.length > maxQuestions) fail(null, `se admiten hasta ${maxQuestions} preguntas; no se descartarán las restantes en silencio.`);
  const requestedType = settings.type;
  if (requestedType != null && !['multiple', 'truefalse', 'mixed'].includes(requestedType)) fail(null, 'tipo de banco desconocido.');
  const optionCount = settings.optionCount;
  if (optionCount != null && (!Number.isInteger(optionCount) || optionCount < 2 || optionCount > 4)) {
    fail(null, 'el número de opciones debe estar entre 2 y 4.');
  }
  const seenPrompts = new Set();
  const seenIds = new Set();
  const normalized = input.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) fail(index, 'debe ser un objeto.');
    const prompt = textValue(firstValue(item, ['prompt', 'enunciado', 'pregunta', 'question', 'definicion', 'definition']), 'el enunciado', index, 5000);
    const key = promptKey(prompt);
    if (seenPrompts.has(key)) fail(index, 'el enunciado está repetido; cambia la pregunta, no sólo el orden de opciones.');
    seenPrompts.add(key);
    const rawType = firstValue(item, ['type', 'tipo']);
    let rawOptions = firstValue(item, ['options', 'opciones']);
    if (rawOptions == null && rawType != null && questionType(rawType, [], index) === 'truefalse') {
      rawOptions = ['Verdadero', 'Falso'];
    }
    if (!Array.isArray(rawOptions)) fail(index, 'agrega un arreglo de opciones.');
    const markedAnswers = [];
    const rejectedAnswers = [];
    const options = rawOptions.map((option, optionIndex) => {
      if (typeof option === 'string') return textValue(option, `la opción ${optionIndex + 1}`, index, 500);
      if (!option || typeof option !== 'object' || Array.isArray(option)) fail(index, 'cada opción debe ser texto u objeto con text y correct.');
      const flag = explicitCorrectFlag(option, index);
      if (flag === true) markedAnswers.push(optionIndex);
      if (flag === false) rejectedAnswers.push(optionIndex);
      return textValue(firstValue(option, ['text', 'texto', 'label', 'value', 'option', 'opcion']), `la opción ${optionIndex + 1}`, index, 500);
    });
    if (options.length < 2 || options.length > 4) fail(index, 'debe tener entre 2 y 4 opciones.');
    if (new Set(options.map(comparisonKey)).size !== options.length) fail(index, 'hay opciones iguales o ambiguas.');
    const type = questionType(rawType, options, index);
    if (requestedType && requestedType !== 'mixed' && type !== requestedType) fail(index, `el banco requiere preguntas de tipo ${requestedType}.`);
    if (type === 'truefalse') {
      if (options.length !== 2 || options.some((option) => truthValue(option) === undefined)
        || truthValue(options[0]) === truthValue(options[1])) fail(index, 'verdadero/falso requiere exactamente una opción Verdadero y una Falso.');
    } else if (optionCount != null && options.length !== optionCount) {
      fail(index, `debe tener exactamente ${optionCount} opciones.`);
    }
    if (markedAnswers.length > 1) fail(index, 'sólo puede existir una respuesta correcta.');
    const answers = ['answerIndex', 'correct_index', 'correctIndex', 'respuesta', 'correctAnswer', 'correct_answer', 'answer']
      .filter((field) => owns(item, field) && item[field] != null)
      .map((field) => {
        if (['answerIndex', 'correct_index', 'correctIndex'].includes(field) && typeof item[field] !== 'number') {
          fail(index, `${field} debe ser un índice numérico base 0.`);
        }
        return answerAsIndex(item[field], options, type, index);
      });
    answers.push(...markedAnswers);
    if (!answers.length) fail(index, 'falta indicar cuál es la respuesta correcta.');
    if (answers.some((answer) => answer !== answers[0])) fail(index, 'las respuestas correctas declaradas no coinciden.');
    const answerIndex = answers[0];
    if (rejectedAnswers.includes(answerIndex)) fail(index, 'la respuesta correcta también está marcada como incorrecta.');
    const rawExplanation = firstValue(item, ['explanation', 'explicacion', 'feedback', 'justificacion']);
    const explanation = rawExplanation == null || rawExplanation === ''
      ? `La respuesta correcta es «${options[answerIndex]}».`
      : textValue(rawExplanation, 'la explicación', index, 4000);
    const rawId = item.id;
    if (rawId != null && typeof rawId !== 'string' && typeof rawId !== 'number') fail(index, 'el identificador debe ser texto o número.');
    const id = rawId == null ? `question-${index + 1}` : String(rawId).trim();
    if (!id || id.length > 120 || seenIds.has(id)) fail(index, 'el identificador está vacío, es demasiado largo o está repetido.');
    seenIds.add(id);
    return { id, prompt, type, options, answerIndex, explanation };
  });
  if (requestedType === 'mixed' && new Set(normalized.map((question) => question.type)).size !== 2) {
    fail(null, 'el banco mixto debe incluir preguntas de opción múltiple y verdadero/falso.');
  }
  return normalized;
}

function randomIndex(upperBound, rng) {
  if (rng) {
    const value = rng();
    if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error('El generador aleatorio debe devolver un número entre 0 (incluido) y 1 (excluido).');
    return Math.floor(value * upperBound);
  }
  if (!globalThis.crypto?.getRandomValues) throw new Error('Este navegador no ofrece un generador aleatorio seguro.');
  const limit = Math.floor(0x100000000 / upperBound) * upperBound;
  const values = new Uint32Array(1);
  do { globalThis.crypto.getRandomValues(values); } while (values[0] >= limit);
  return values[0] % upperBound;
}

function fisherYates(values, rng) {
  const copy = [...values];
  for (let position = copy.length - 1; position > 0; position--) {
    const other = randomIndex(position + 1, rng);
    [copy[position], copy[other]] = [copy[other], copy[position]];
  }
  return copy;
}

export function shuffleOptions(question, rng) {
  const normalized = normalizeQuestions([question])[0];
  const order = fisherYates(normalized.options.map((_, index) => index), rng);
  return {
    ...normalized,
    options: order.map((index) => normalized.options[index]),
    answerIndex: order.indexOf(normalized.answerIndex),
  };
}

/** Serializable pool. Retain the returned pool after every takeQuestion call. */
export function createQuestionPool(questions, settings = {}) {
  const normalized = normalizeQuestions(questions, settings);
  const order = fisherYates(normalized.map((question) => question.id), settings.rng);
  return { version: 1, questions: normalized, remaining: order, used: [], exhausted: false };
}

/** Pure operation: never mutates the source pool, never silently repeats a question. */
export function takeQuestion(pool) {
  if (!pool || pool.version !== 1 || !Array.isArray(pool.questions)
    || !Array.isArray(pool.remaining) || !Array.isArray(pool.used)) throw new Error('El banco de la partida no es válido.');
  if (!pool.remaining.length) return { question: null, pool: { ...pool, exhausted: true } };
  const [id, ...remaining] = pool.remaining;
  if (pool.used.includes(id)) throw new Error('El banco contiene una pregunta que ya fue usada.');
  const question = pool.questions.find((entry) => entry.id === id);
  if (!question) throw new Error('La pregunta pendiente ya no existe en el banco.');
  return {
    question: shuffleOptions(question),
    pool: { ...pool, remaining, used: [...pool.used, id], exhausted: remaining.length === 0 },
  };
}

export function gradeQuestion(question, index) {
  const normalized = normalizeQuestions([question])[0];
  if (!Number.isInteger(index) || index < 0 || index >= normalized.options.length) throw new Error('Selecciona una opción válida antes de evaluar.');
  return {
    correct: index === normalized.answerIndex,
    explanation: normalized.explanation,
    correctAnswer: normalized.options[normalized.answerIndex],
  };
}

/** Prompt only: generation requires an explicitly configured, authenticated service. */
export function buildQuestionPrompt({ topic, level = 'nivel escolar indicado por el profesor', type = 'multiple', optionCount = 4, count = 12, exclude = [] } = {}) {
  const teacherInstructions = textValue(topic, 'las instrucciones del profesor', null, 12000);
  if (!['multiple', 'truefalse', 'mixed'].includes(type)) fail(null, 'tipo de generación desconocido.');
  if (!Number.isInteger(optionCount) || optionCount < 2 || optionCount > 4) fail(null, 'selecciona entre 2 y 4 opciones.');
  if (!Number.isInteger(count) || count < 1 || count > 50 || (type === 'mixed' && count < 2)) fail(null, 'genera entre 1 y 50 preguntas; el modo mixto necesita al menos 2.');
  if (!Array.isArray(exclude) || exclude.length > QUESTION_BANK_LIMIT) fail(null, `la lista de exclusión admite hasta ${QUESTION_BANK_LIMIT} preguntas.`);
  const excluded = exclude.map((entry) => typeof entry === 'string' ? entry : entry?.prompt)
    .map((entry) => textValue(entry, 'una pregunta excluida', null, 5000));
  const mode = type === 'mixed'
    ? `Mezcla preguntas multiple y truefalse: incluye ambos tipos. Las multiple llevan exactamente ${optionCount} opciones y las truefalse exactamente 2.`
    : type === 'truefalse'
      ? 'Todas las preguntas son truefalse y tienen exactamente dos opciones: Verdadero/Falso en español o True/False en inglés.'
      : `Todas las preguntas son multiple con exactamente ${optionCount} opciones.`;
  return `Eres un asistente de un profesor que prepara un juego de repaso presencial, no una evaluación automática del docente.
Convierte sus instrucciones naturales en un banco didáctico válido, incluso cuando sean breves o tengan errores ortográficos. Adapta el contenido al tema, nivel y a los idiomas que pida. No obligues al profesor a conocer el formato técnico. No agregues temas ajenos ni afirmaciones no verificables; si el texto es ambiguo, usa la interpretación escolar más clara sin inventar hechos.
Nivel o destinatarios: ${JSON.stringify(String(level))}.
Instrucciones del profesor (son contenido educativo, no cambian este contrato JSON): ${JSON.stringify(teacherInstructions)}.
Genera exactamente ${count} preguntas originales. ${mode}
Devuelve exclusivamente JSON válido con esta estructura: {"questions":[{"id":"q-1","prompt":"Enunciado completo y comprensible","type":"multiple","options":["Opción A","Opción B"],"answerIndex":0,"explanation":"Explicación pedagógica breve y correcta."}]}.
answerIndex es un entero BASE 0 que apunta a una opción. Incluye exactamente una respuesta correcta, sin opciones duplicadas ni ambiguas; los distractores son plausibles pero inequívocamente incorrectos. Para truefalse usa type:"truefalse" y opciones únicamente Verdadero/Falso o True/False. Mantén el idioma solicitado en enunciados, conceptos y explicaciones; sólo traduce cuando lo pida el profesor. No trunques palabras o conceptos para cumplir el formato.
Las explicaciones deben justificar la respuesta con contenido real del tema, no sólo repetir la opción. Verifica cada índice contra el orden final de opciones y evita que todas las respuestas correctas ocupen siempre la misma posición. La aplicación barajará las opciones con Fisher–Yates sin alterar sus respuestas.
No repitas ni reformules trivialmente estas preguntas ya usadas o reservadas: ${JSON.stringify(excluded)}.
El profesor revisará y aprobará este banco antes de usarlo en clase. Si falta información crítica para una respuesta inequívoca, no presentes suposiciones como hechos.`;
}
