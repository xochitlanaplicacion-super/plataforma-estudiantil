import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  flyingCatResponseFormat, flyingCatSystemPrompt, generateFlyingCatQuestions, inspectFlyingCatGeneration,
} from '@/lib/ai/flying-cat-generation';

const question = {
  prompt: 'Profesional que atiende a las personas enfermas.', options: ['Doctor', 'Chef', 'Journalist'],
  correctIndex: 0, feedback: 'Doctor es médico: atiende enfermedades; Chef cocina y Journalist informa noticias.',
};
const aiResponse = (items: unknown[], tokens = 300) => new Response(JSON.stringify({
  choices: [{ message: { content: JSON.stringify({ items }) } }],
  usage: { prompt_tokens: 100, completion_tokens: tokens },
}));
const options = { prompt: 'Description de trabajos la descripcion en Español las palabras en ingles', count: 1, apiKey: 'test-not-a-secret' };
beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
afterEach(() => vi.unstubAllGlobals());

describe('Flying Cat adapts ordinary teacher instructions and repairs AI responses', () => {
  it('uses a structured schema and explicitly separates definition, concepts and explanation languages', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(aiResponse([question]));
    const items = await generateFlyingCatQuestions(options);
    const sent = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    expect(sent.response_format.type).toBe('json_schema');
    expect(sent.response_format.json_schema.strict).toBe(true);
    expect(sent.provider).toEqual({ require_parameters: true });
    expect(sent.messages[0].content).toContain('actividad bilingüe');
    expect(sent.messages[0].content).toContain('faltas de ortografía');
    expect(sent.messages[1].content).toBe(options.prompt);
    expect(items[0].prompt).toBe(question.prompt);
    expect(items[0].options[items[0].correctIndex]).toBe('Doctor');
    expect(items[0].feedback).toBe(question.feedback);
  });

  it('repairs long concepts rather than asking the teacher to rewrite a sensible instruction', async () => {
    const usage = vi.fn(async () => {});
    vi.mocked(fetch).mockResolvedValueOnce(aiResponse([{ ...question, options: ['Doctor que cura pacientes', 'Chef', 'Journalist'] }]))
      .mockResolvedValueOnce(aiResponse([question], 200));
    const items = await generateFlyingCatQuestions({ ...options, onUsage: usage });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(items[0].options[items[0].correctIndex]).toBe('Doctor');
    const repair = JSON.parse(vi.mocked(fetch).mock.calls[1][1]!.body as string);
    expect(repair.messages.at(-1).content).toContain('sinónimos breves precisos');
    expect(repair.messages.at(-1).content).toContain('Mantén el tema, nivel e idiomas');
    expect(usage.mock.calls).toEqual([
      [{ promptTokens: 100, completionTokens: 300, repair: false }],
      [{ promptTokens: 100, completionTokens: 200, repair: true }],
    ]);
  });

  it.each(['', undefined])('asks AI to complete missing feedback instead of silently inventing an explanation: %s', async (feedback) => {
    vi.mocked(fetch).mockResolvedValueOnce(aiResponse([{ ...question, feedback }])).mockResolvedValueOnce(aiResponse([question]));
    const items = await generateFlyingCatQuestions(options);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(items[0].feedback).toBe(question.feedback);
  });

  it('repairs excessive options while preserving a correct answer outside the first four', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(aiResponse([{ ...question, options: ['Chef', 'Pilot', 'Farmer', 'Journalist', 'Doctor'], correctIndex: 4 }]))
      .mockResolvedValueOnce(aiResponse([{ ...question, options: ['Chef', 'Doctor'], correctIndex: 1 }]));
    const items = await generateFlyingCatQuestions(options);
    expect(items[0].options).toHaveLength(2);
    expect(items[0].options[items[0].correctIndex]).toBe('Doctor');
  });

  it('repairs invalid JSON and incorrect question counts without silently dropping questions', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: '{broken' } }] })))
      .mockResolvedValueOnce(aiResponse([question, { ...question, prompt: 'Profesional que prepara comida.', options: ['Doctor', 'Chef'], correctIndex: 1 } ]));
    expect(await generateFlyingCatQuestions({ ...options, count: 2 })).toHaveLength(2);
  });

  it('stops after two invalid responses and preserves an actionable non-blaming error', async () => {
    vi.mocked(fetch).mockImplementation(async () => aiResponse([{ ...question, correctIndex: 20 }]));
    await expect(generateFlyingCatQuestions(options)).rejects.toThrow('Tus preguntas actuales se conservan');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('stops before a provider call when the teacher cancels', async () => {
    const controller = new AbortController(); controller.abort();
    await expect(generateFlyingCatQuestions({ ...options, signal: controller.signal })).rejects.toThrow('cancelada');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reports provider and connection failures without retry loops or internal credentials', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('private-provider-details', { status: 429 }));
    await expect(generateFlyingCatQuestions(options)).rejects.toThrow('servicio de IA no está disponible');
    vi.mocked(fetch).mockRejectedValueOnce(new Error('private-provider-details'));
    await expect(generateFlyingCatQuestions(options)).rejects.toThrow('no respondió a tiempo');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('normalizes harmless spacing without truncating a concept or replacing the correct answer', () => {
    const spaced = { ...question, options: ['  Doctor  ', 'Flight   attendant'], correctIndex: 1 };
    const inspected = inspectFlyingCatGeneration(JSON.stringify({ items: [spaced] }), 1);
    expect(inspected.items?.[0]).toMatchObject({ options: ['Doctor', 'Flight attendant'], correctIndex: 1 });
    expect(inspectFlyingCatGeneration(JSON.stringify({ items: [{ ...spaced, options: ['Doctor', 'A flight attendant'] }] }), 1).error).toContain('2 palabras');
    expect(inspectFlyingCatGeneration(JSON.stringify({ items: [{ ...question, feedback: '' }] }), 1).error).toContain('feedback');
  });

  it('promises the exact form quantity while accommodating short beginner definitions', () => {
    expect(flyingCatResponseFormat(10).json_schema.schema.properties.items).toMatchObject({ minItems: 10, maxItems: 10 });
    expect(flyingCatSystemPrompt(10)).toContain('descripciones simples, cortas');
    expect(flyingCatSystemPrompt(10)).toContain('número del formulario tiene prioridad');
  });
});
