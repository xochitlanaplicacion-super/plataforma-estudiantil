import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  parseNavalQuestions, questionFingerprint, shuffleQuestionOptions,
  type NavalQuestionMode,
} from '@/lib/activities/naval-questions';
import {
  generateNavalBattleQuestions, inspectNavalBattleGeneration, navalBattleResponseFormat, navalBattleSystemPrompt,
} from '@/lib/ai/naval-battle-generation';

const multiple = {
  type: 'multiple_choice', prompt: '¿Qué profesión atiende a las personas enfermas?',
  options: ['Doctor', 'Chef', 'Pilot', 'Journalist'], correctIndex: 0,
  explanation: 'Doctor trata las enfermedades de las personas; Chef cocina y Pilot pilota aviones.',
};
const binary = {
  type: 'true_false', prompt: 'El agua contiene hidrógeno y oxígeno.',
  options: ['Verdadero', 'Falso'], correctIndex: 0,
  explanation: 'La molécula de agua contiene dos átomos de hidrógeno y uno de oxígeno.',
};
const options = { prompt: 'Profesiones nivel básico descripsiones español respuestas ingles', mode: 'multiple_choice' as NavalQuestionMode, optionCount: 4, count: 1, apiKey: 'test-not-a-secret' };
const reply = (items: unknown[], usage: unknown = { prompt_tokens: 100, completion_tokens: 200 }) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ items }) } }], usage }));

beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('Naval question contract and duplicate protection', () => {
  it('normalizes Unicode, accents, case, punctuation and spacing in previously used prompts', () => {
    expect(questionFingerprint('  ¿QUÉ   profesión atiende? ')).toBe(questionFingerprint('Que profesión atiende'));
    expect(questionFingerprint('¿QUE\u0301 profesión atiende?')).toBe(questionFingerprint({ prompt: 'Qué profesión atiende.' }));
    expect(questionFingerprint('¿Qué es 2+2?')).not.toBe(questionFingerprint('¿Qué es 2+3?'));
  });

  it.each([2, 3, 4, 5, 6])('accepts exactly %i multiple-choice answers and preserves the answer through shuffling', (optionCount) => {
    const item = { ...multiple, options: Array.from({ length: optionCount }, (_, index) => `Concepto ${index}`), correctIndex: optionCount - 1 };
    const [question] = parseNavalQuestions({ items: [item] }, 'multiple_choice', optionCount);
    const shuffled = shuffleQuestionOptions(question, () => 0);
    expect(shuffled.id).toBe(question.id);
    expect(shuffled.options[shuffled.correctIndex]).toBe(`Concepto ${optionCount - 1}`);
    expect(question.options).toEqual(item.options);
  });

  it('keeps Verdadero/Falso labels and correctness stable', () => {
    const [question] = parseNavalQuestions([binary], 'true_false', 6);
    expect(shuffleQuestionOptions(question, () => 0)).toEqual(question);
    expect(question.options).not.toBe(binary.options);
  });

  it.each([
    { ...multiple, correctIndex: 4 }, { ...multiple, correctIndex: -1 }, { ...multiple, correctIndex: 1.5 },
    { ...multiple, correctIndex: '0' }, { ...multiple, correctIndex: undefined },
    { ...multiple, options: ['Doctor', ' doctor! ', 'Chef', 'Pilot'] },
    { ...multiple, options: ['Doctor', null, 'Chef', 'Pilot'] },
    { ...multiple, options: ['Doctor', 'Chef'] },
    { ...multiple, explanation: '' }, { ...multiple, explanation: undefined },
    { ...multiple, prompt: '...' }, { ...multiple, prompt: 'x'.repeat(1001) },
    { ...multiple, type: 'essay' }, { ...multiple, options: ['Doctor', 'Chef', 'Pilot', 'x'.repeat(241)] },
  ])('rejects invalid contracts instead of guessing a correct answer: %j', (item) => {
    expect(() => parseNavalQuestions([item], 'multiple_choice', 4)).toThrow();
  });

  it('rejects binary labels in the wrong order rather than silently flipping correctness', () => {
    expect(() => parseNavalQuestions([{ ...binary, options: ['Falso', 'Verdadero'] }], 'true_false', 2)).toThrow('en ese orden');
    expect(() => parseNavalQuestions([{ ...binary, options: ['True', 'False'] }], 'true_false', 2)).toThrow('en ese orden');
  });

  it('rejects modes and option counts outside the form contract', () => {
    expect(() => parseNavalQuestions([multiple], 'free' as NavalQuestionMode, 4)).toThrow('Selecciona');
    expect(() => parseNavalQuestions([multiple], 'multiple_choice', 7)).toThrow('entre 2 y 6');
    expect(() => parseNavalQuestions([binary], 'multiple_choice', 4)).toThrow('modalidad');
  });

  it('requires both types in a mixed batch, but permits a single fresh question', () => {
    expect(parseNavalQuestions([multiple, binary], 'mixed', 4)).toHaveLength(2);
    expect(parseNavalQuestions([binary], 'mixed', 4)).toHaveLength(1);
    expect(() => parseNavalQuestions([multiple, { ...multiple, prompt: '¿Quién cocina comida en un restaurante?' }], 'mixed', 4)).toThrow('ambos');
  });

  it('rejects repeated prompts and repeated supplied identities', () => {
    expect(() => parseNavalQuestions([multiple, { ...multiple, prompt: 'Que profesion atiende a las personas enfermas.' }])).toThrow('repetido');
    expect(() => parseNavalQuestions([{ ...multiple, id: 'same' }, { ...binary, id: 'same' }])).toThrow('identificador');
  });

  it('returns only the question contract and does not propagate provider-supplied identity fields', () => {
    const [question] = parseNavalQuestions([{ ...multiple, tenant_id: 'someone-else', userId: 'attacker' }]);
    expect(Object.keys(question)).toEqual(['id', 'type', 'prompt', 'options', 'correctIndex', 'explanation']);
  });

  it('rejects count mismatches and old prompts rather than appending repeated items', () => {
    const raw = JSON.stringify({ items: [multiple] });
    expect(inspectNavalBattleGeneration(raw, 2, 'multiple_choice', 4).error).toContain('exactamente 2');
    expect(inspectNavalBattleGeneration(raw, 1, 'multiple_choice', 4, ['Que profesion atiende a las personas enfermas']).error).toContain('ya se utilizó');
    expect(inspectNavalBattleGeneration('not-json', 1, 'multiple_choice', 4).error).toContain('JSON');
  });

  it('bounds response UTF-8 bytes, not just JavaScript string length', () => {
    expect(inspectNavalBattleGeneration('🌊'.repeat(31_000), 1, 'multiple_choice', 4).error).toContain('tamaño');
  });

  it.each([() => NaN, () => Infinity, () => -1, () => 1])('keeps shuffling safe even for invalid or boundary random sources', (random) => {
    const [question] = parseNavalQuestions([multiple]);
    const shuffled = shuffleQuestionOptions(question, random);
    expect(shuffled.options).toHaveLength(4);
    expect(shuffled.options[shuffled.correctIndex]).toBe('Doctor');
  });
});

describe('Naval battle generation and bounded internal repair', () => {
  it('uses strict structured output, flexible bilingual instructions and a teacher-provided topic', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(reply([multiple]));
    const [question] = await generateNavalBattleQuestions(options);
    expect(question.options[question.correctIndex]).toBe('Doctor');
    const sent = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    expect(sent.model).toBe('google/gemini-2.5-flash-lite');
    expect(sent.provider).toEqual({ require_parameters: true });
    expect(sent.response_format).toMatchObject({ type: 'json_schema', json_schema: { strict: true } });
    expect(sent.messages[0].content).toContain('faltas de ortografía');
    expect(sent.messages[0].content).toContain('peticiones bilingües');
    expect(JSON.parse(sent.messages[1].content).teacherInstructions).toBe(options.prompt);
  });

  it('generates a mixed batch with exact form option count', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(reply([multiple, binary]));
    const items = await generateNavalBattleQuestions({ ...options, mode: 'mixed', count: 2 });
    expect(items.map(({ type }) => type)).toEqual(['multiple_choice', 'true_false']);
    expect(items[1].options).toEqual(['Verdadero', 'Falso']);
  });

  it.each([
    { ...multiple, explanation: '' },
    { ...multiple, correctIndex: 99 },
    { ...multiple, options: [...multiple.options, 'Extra'] },
  ])('repairs an invalid question once without guessing answers: %j', async (invalid) => {
    vi.mocked(fetch).mockResolvedValueOnce(reply([invalid])).mockResolvedValueOnce(reply([multiple]));
    const usage = vi.fn(async () => {});
    const items = await generateNavalBattleQuestions({ ...options, onUsage: usage });
    expect(items[0].options[items[0].correctIndex]).toBe('Doctor');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(usage.mock.calls).toEqual([
      [{ promptTokens: 100, completionTokens: 200, repair: false }],
      [{ promptTokens: 100, completionTokens: 200, repair: true }],
    ]);
    const repaired = JSON.parse(vi.mocked(fetch).mock.calls[1][1]!.body as string);
    expect(repaired.messages.at(-1).content).toContain('sin adivinarlos');
  });

  it('repairs an excluded or repeated prompt with a new question, not a recycled fallback', async () => {
    const fresh = { ...multiple, prompt: '¿Qué profesional cocina los alimentos de un restaurante?', correctIndex: 1 };
    vi.mocked(fetch).mockResolvedValueOnce(reply([multiple])).mockResolvedValueOnce(reply([fresh]));
    const items = await generateNavalBattleQuestions({ ...options, excludedPrompts: [multiple.prompt] });
    expect(items[0].prompt).toBe(fresh.prompt);
    expect(items[0].options[items[0].correctIndex]).toBe('Chef');
    const repaired = JSON.parse(vi.mocked(fetch).mock.calls[1][1]!.body as string);
    expect(repaired.messages.at(-1).content).toContain('excludedPrompts');
  });

  it('stops after two invalid responses and preserves the current game and mode', async () => {
    vi.mocked(fetch).mockImplementation(async () => reply([multiple]));
    await expect(generateNavalBattleQuestions({ ...options, excludedPrompts: [multiple.prompt] })).rejects.toMatchObject({ status: 502 });
    expect(fetch).toHaveBeenCalledTimes(2);
    vi.mocked(fetch).mockImplementation(async () => reply([]));
    await expect(generateNavalBattleQuestions(options)).rejects.toThrow('Tus preguntas actuales se conservan');
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it('repairs malformed content JSON and wrong counts without silently truncating', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: '{broken' } }] })))
      .mockResolvedValueOnce(reply([multiple]));
    expect(await generateNavalBattleQuestions(options)).toHaveLength(1);
    vi.mocked(fetch).mockImplementation(async () => reply([multiple, binary]));
    await expect(generateNavalBattleQuestions({ ...options, mode: 'mixed', count: 1 })).rejects.toMatchObject({ status: 502 });
  });

  it('rejects an oversized chunked provider envelope before parsing it', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('x'.repeat(120_001)));
    await expect(generateNavalBattleQuestions(options)).rejects.toThrow('demasiado grande');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects an oversized Content-Length response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('ignored', { headers: { 'Content-Length': '120001' } }));
    await expect(generateNavalBattleQuestions(options)).rejects.toThrow('demasiado grande');
  });

  it('cancels before any paid provider request', async () => {
    const controller = new AbortController(); controller.abort();
    await expect(generateNavalBattleQuestions({ ...options, signal: controller.signal })).rejects.toMatchObject({ status: 408 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('propagates cancellation during a provider request without exposing provider errors', async () => {
    const controller = new AbortController();
    vi.mocked(fetch).mockImplementationOnce(async () => { controller.abort(); throw new Error('secret provider context'); });
    await expect(generateNavalBattleQuestions({ ...options, signal: controller.signal })).rejects.toMatchObject({ status: 408 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('stops a stalled provider body when its deadline aborts', async () => {
    vi.useFakeTimers();
    const timeout = new AbortController();
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(timeout.signal);
    vi.mocked(fetch).mockResolvedValueOnce(new Response(new ReadableStream<Uint8Array>({ start() {} })));
    const generation = generateNavalBattleQuestions(options);
    const expected = expect(generation).rejects.toMatchObject({ status: 504 });
    await vi.advanceTimersByTimeAsync(1);
    timeout.abort(new DOMException('Timed out', 'TimeoutError'));
    await expected;
    timeoutSpy.mockRestore();
  });

  it('does not expose errors, credentials or response bodies from provider failures', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('private-provider-context', { status: 429 }));
    await expect(generateNavalBattleQuestions(options)).rejects.toMatchObject({ status: 503 });
    vi.mocked(fetch).mockRejectedValueOnce(new Error('secret api key'));
    await expect(generateNavalBattleQuestions(options)).rejects.toThrow('No se pudo conectar');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('keeps usage tokens finite and nonnegative', async () => {
    const usage = vi.fn(async () => {});
    vi.mocked(fetch).mockResolvedValueOnce(reply([multiple], { prompt_tokens: -4, completion_tokens: '200' }));
    await generateNavalBattleQuestions({ ...options, onUsage: usage });
    expect(usage).toHaveBeenCalledWith({ promptTokens: 0, completionTokens: 0, repair: false });
  });

  it('sets the schema to the exact count and option count for each selected mode', () => {
    const schema = navalBattleResponseFormat(8, 'multiple_choice', 6).json_schema.schema.properties.items;
    expect(schema).toMatchObject({ minItems: 8, maxItems: 8, items: { properties: { options: { minItems: 6, maxItems: 6 } } } });
    expect(navalBattleSystemPrompt(8, 'mixed', 4)).toContain('incluye AMBOS tipos');
    expect(navalBattleSystemPrompt(8, 'mixed', 4)).toContain('no presentes este lote como un banco finito');
  });
});
