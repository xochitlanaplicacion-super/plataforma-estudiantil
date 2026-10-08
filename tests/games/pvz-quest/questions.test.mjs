import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import {
  QUESTION_BANK_LIMIT, normalizeQuestions, createQuestionPool,
  takeQuestion, shuffleOptions, gradeQuestion, buildQuestionPrompt,
} from '../../../public/games/pvz-quest/classroom/questions.js';

if (!globalThis.crypto) globalThis.crypto = webcrypto;
const question = (overrides = {}) => ({
  id: 'test', prompt: '¿Cuál es un planeta?', type: 'multiple',
  options: ['Marte', 'Luna', 'Sol'], answerIndex: 0,
  explanation: 'Marte es un planeta del sistema solar.', ...overrides,
});

test('normaliza JSON, aliases y respuesta en índice 0 sin coerción booleana', () => {
  const input = { questions: [{ pregunta: '¿Cuál es un planeta?', opciones: ['Marte', 'Luna'], correct_index: 0 }] };
  const [normalized] = normalizeQuestions(JSON.stringify(input));
  assert.equal(normalized.answerIndex, 0);
  assert.deepEqual(gradeQuestion(normalized, 0), { correct: true, explanation: 'La respuesta correcta es «Marte».', correctAnswer: 'Marte' });
  assert.equal(gradeQuestion(normalized, 1).correct, false);
});

test('admite JSON fenced y respuestas textuales sin recortar conceptos', () => {
  const [normalized] = normalizeQuestions('```json\n' + JSON.stringify([{ enunciado: 'Elige la célula.', opciones: ['Célula eucariota animal', 'Partícula subatómica'], respuesta: 'célula eucariota animal' }]) + '\n```');
  assert.equal(normalized.options[0], 'Célula eucariota animal');
  assert.equal(normalized.answerIndex, 0);
});

test('verdadero falso conserva un false explícito y cualquier orden de opciones', () => {
  const [falseFirst] = normalizeQuestions([{ prompt: 'La Tierra es plana.', type: 'truefalse', options: ['Falso', 'Verdadero'], respuesta: false }]);
  assert.equal(falseFirst.answerIndex, 0);
  assert.equal(gradeQuestion(falseFirst, 0).correct, true);
  const [inferred] = normalizeQuestions([{ prompt: 'La Tierra es plana.', options: ['True', 'False'], correctAnswer: false }]);
  assert.equal(inferred.type, 'truefalse');
  assert.equal(inferred.answerIndex, 1);
  const [implicit] = normalizeQuestions([{ prompt: 'La Tierra es plana.', tipo: 'verdadero_falso', respuesta: false }]);
  assert.deepEqual(implicit.options, ['Verdadero', 'Falso']);
  assert.equal(implicit.answerIndex, 1);
});

test('objetos de opción sólo marcan true como correcto, no el texto false', () => {
  const [normalized] = normalizeQuestions([{ prompt: '¿Cuál es un planeta?', options: [{ text: 'Marte', correct: true }, { text: 'Luna', correct: 'false' }] }]);
  assert.equal(normalized.answerIndex, 0);
  assert.throws(() => normalizeQuestions([{ prompt: 'Planeta', options: [{ text: 'Marte', correct: 'sí' }, { text: 'Luna', correct: false }] }]), /marcas/);
  assert.throws(() => normalizeQuestions([{ prompt: 'Planeta', answerIndex: 0, options: [{ text: 'Marte', correct: false }, { text: 'Luna', correct: false }] }]), /incorrecta/);
});

test('rechaza respuestas ausentes, contradictorias o ambiguas', () => {
  assert.throws(() => normalizeQuestions([question({ answerIndex: undefined })]), /falta indicar/);
  assert.throws(() => normalizeQuestions([question({ correctAnswer: 'Luna' })]), /no coinciden/);
  assert.throws(() => normalizeQuestions([question({ options: ['Marte', 'marte'] })]), /iguales/);
  assert.throws(() => normalizeQuestions([question({ answerIndex: 3 })]), /base 0/);
  assert.throws(() => normalizeQuestions([question({ answerIndex: '0' })]), /numérico/);
  assert.throws(() => normalizeQuestions([question({ answerIndex: undefined, respuesta: 'Júpiter' })]), /corresponder/);
  assert.throws(() => normalizeQuestions([{ prompt: '¿Cuál?', options: [{ text: 'A', correct: true }, { text: 'B', correct: true }] }]), /una respuesta/);
});

test('valida límites, mezcla y cantidad exacta de opciones', () => {
  assert.throws(() => normalizeQuestions([question({ options: ['Una'] })]), /entre 2 y 4/);
  assert.throws(() => normalizeQuestions([question()], { optionCount: 4 }), /exactamente 4/);
  assert.throws(() => normalizeQuestions([question()], { type: 'truefalse' }), /requiere/);
  assert.throws(() => normalizeQuestions([question()], { type: 'mixed' }), /mixto/);
  assert.equal(normalizeQuestions([question(), { id: 'tf', prompt: '¿La Tierra es plana?', type: 'truefalse', answerIndex: 1 }], { type: 'mixed', optionCount: 3 }).length, 2);
  assert.throws(() => normalizeQuestions([question({ type: 'truefalse' })]), /verdadero\/falso/);
  assert.throws(() => normalizeQuestions([question()], { optionCount: 5 }), /entre 2 y 4/);
  assert.throws(() => normalizeQuestions([]), /al menos/);
  const many = Array.from({ length: QUESTION_BANK_LIMIT + 1 }, (_, index) => question({ id: String(index), prompt: `Pregunta ${index}` }));
  assert.throws(() => normalizeQuestions(many), /hasta 200/);
});

test('detecta preguntas repetidas aunque cambien espacios, signos, tildes u opciones', () => {
  assert.throws(() => normalizeQuestions([question(), question({ id: 'other', prompt: ' cual   es un planeta ', options: ['Venus', 'Luna'] })]), /repetido/);
  assert.throws(() => normalizeQuestions([question({ prompt: 'a , b' }), question({ id: 'other', prompt: 'a b' })]), /repetido/);
  assert.throws(() => normalizeQuestions([question(), question({ prompt: '¿Cuál es una estrella?' })]), /identificador/);
});

test('Fisher Yates reordena sin mutar ni perder la respuesta o explicación', () => {
  const source = question();
  const shuffled = shuffleOptions(source, () => 0);
  assert.deepEqual(source.options, ['Marte', 'Luna', 'Sol']);
  assert.deepEqual(shuffled.options, ['Luna', 'Sol', 'Marte']);
  assert.equal(shuffled.answerIndex, 2);
  assert.equal(gradeQuestion(shuffled, 2).correctAnswer, 'Marte');
  assert.equal(shuffled.explanation, source.explanation);
  assert.throws(() => shuffleOptions(source, () => 1), /generador/);
});

test('barajado seguro mantiene la misma respuesta con índices válidos', () => {
  for (let index = 0; index < 40; index++) {
    const shuffled = shuffleOptions(question());
    assert.equal(shuffled.options[shuffled.answerIndex], 'Marte');
    assert.equal(new Set(shuffled.options).size, 3);
  }
});

test('pool serializable puro se agota sin repetir ni modificar la versión anterior', () => {
  const bank = Array.from({ length: 10 }, (_, index) => question({ id: `q-${index}`, prompt: `Enunciado ${index}` }));
  const original = createQuestionPool(bank, { rng: () => 0.4 });
  let pool = JSON.parse(JSON.stringify(original));
  const seen = new Set();
  for (let index = 0; index < 10; index++) {
    const next = takeQuestion(pool);
    assert.equal(pool.used.length, index);
    assert.ok(!seen.has(next.question.id));
    assert.equal(gradeQuestion(next.question, next.question.answerIndex).correct, true);
    seen.add(next.question.id);
    pool = next.pool;
  }
  assert.equal(pool.exhausted, true);
  assert.equal(takeQuestion(pool).question, null);
  assert.deepEqual(original.used, []);
  assert.equal(original.remaining.length, 10);
});

test('pool y calificación rechazan estado corrupto o índices inexistentes', () => {
  assert.throws(() => takeQuestion(null), /no es válido/);
  const pool = createQuestionPool([question()]);
  assert.throws(() => takeQuestion({ ...pool, used: ['test'] }), /ya fue usada/);
  assert.throws(() => gradeQuestion(question(), -1), /válida/);
  assert.throws(() => gradeQuestion(question(), undefined), /válida/);
});

test('prompt flexible exige contrato JSON, ambos tipos y exclusiones sin fingir IA', () => {
  const prompt = buildQuestionPrompt({ topic: 'profesiones, descripciones en español y conceptos en inglés', level: 'Primero de secundaria', type: 'mixed', optionCount: 3, count: 8, exclude: ['¿Qué hace un médico?'] });
  assert.match(prompt, /exactamente 8 preguntas/);
  assert.match(prompt, /incluye ambos tipos/);
  assert.match(prompt, /exactamente 3 opciones/);
  assert.match(prompt, /BASE 0/);
  assert.match(prompt, /Primero de secundaria/);
  assert.match(prompt, /¿Qué hace un médico\?/);
  assert.match(prompt, /revisará y aprobará/);
  assert.throws(() => buildQuestionPrompt({ topic: '' }), /vacío/);
  assert.throws(() => buildQuestionPrompt({ topic: 'Tema', count: 51 }), /entre 1 y 50/);
  assert.throws(() => buildQuestionPrompt({ topic: 'Tema', type: 'mixed', count: 1 }), /al menos 2/);
});
