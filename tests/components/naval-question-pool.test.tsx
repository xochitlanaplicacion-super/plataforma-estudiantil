// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useNavalQuestionPool } from '@/components/classroom-games/naval/useNavalQuestionPool';
import { questionFingerprint } from '@/lib/activities/naval-questions';

const configuration = { prompt: 'Ciencias de primaria', mode: 'multiple_choice' as const, optionCount: 4 };
const questions = (start = 0, count = 10) => Array.from({ length: count }, (_, index) => ({
  id: `provider-id-${start + index}`, type: 'multiple_choice', prompt: `¿Qué concepto corresponde al ejemplo científico número ${start + index}?`,
  options: ['Primera respuesta', 'Respuesta correcta', 'Tercera respuesta', 'Cuarta respuesta'], correctIndex: 1,
  explanation: 'La segunda respuesta identifica el concepto científico del ejemplo.',
}));
const response = (items = questions()) => new Response(JSON.stringify({ items }), { headers: { 'Content-Type': 'application/json' } });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('Naval Battle single-flight fresh question queue', () => {
  it('does not call the AI until the teacher explicitly prepares a question mode', async () => {
    const { result } = renderHook(useNavalQuestionPool);
    await act(async () => { await result.current.replenish(); });
    expect(fetch).not.toHaveBeenCalled();
    expect(result.current.items).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('uses the authenticated same-origin API with exact form options and a bounded fresh batch', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response());
    const { result } = renderHook(useNavalQuestionPool);
    await act(async () => { await result.current.prepare(configuration); });
    expect(fetch).toHaveBeenCalledOnce();
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('/api/exercises/generate-naval-battle');
    const sent = vi.mocked(fetch).mock.calls[0][1]!;
    expect(sent.method).toBe('POST');
    expect(JSON.parse(sent.body as string)).toEqual({ ...configuration, count: 10, excludedPrompts: [] });
    expect(sent.signal).toBeInstanceOf(AbortSignal);
    expect(result.current.items).toHaveLength(10);
    expect(result.current.items[0].id).not.toBe('provider-id-0');
    expect(result.current.error).toBe('');
    expect(result.current.loading).toBe(false);
  });

  it('deduplicates concurrent refill calls even before React has rendered loading state', async () => {
    const pending = deferred<Response>();
    vi.mocked(fetch).mockReturnValueOnce(pending.promise);
    const { result } = renderHook(useNavalQuestionPool);
    let operation!: Promise<void>;
    act(() => { operation = result.current.prepare(configuration); void result.current.replenish(); void result.current.replenish(); });
    expect(fetch).toHaveBeenCalledOnce();
    expect(result.current.loading).toBe(true);
    await act(async () => { pending.resolve(response()); await operation; });
    expect(result.current.items).toHaveLength(10);
    await act(async () => { await result.current.replenish(); });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('takes a shuffled question preserving its correct answer and removes it once', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response());
    const { result } = renderHook(useNavalQuestionPool);
    await act(async () => { await result.current.prepare(configuration); });
    let taken: ReturnType<typeof result.current.take>;
    act(() => { taken = result.current.take(); });
    expect(taken!.options[taken!.correctIndex]).toBe('Respuesta correcta');
    expect(result.current.items).toHaveLength(9);
    expect(result.current.items.some(({ id }) => id === taken!.id)).toBe(false);
  });

  it('remembers taken and teacher-discarded prompts, not only currently visible questions', async () => {
    const initial = questions();
    vi.mocked(fetch).mockResolvedValueOnce(response(initial));
    const { result } = renderHook(useNavalQuestionPool);
    await act(async () => { await result.current.prepare(configuration); });
    const discarded = result.current.items[1];
    act(() => { result.current.take(); result.current.discard(discarded.id); for (let index = 0; index < 4; index++) result.current.take(); });
    expect(result.current.items).toHaveLength(4);
    vi.mocked(fetch).mockResolvedValueOnce(response([
      { ...initial[0], prompt: initial[0].prompt.toUpperCase().replaceAll('¿', '').replaceAll('?', '.') },
      initial[1], ...questions(10, 8),
    ]));
    await act(async () => { await result.current.replenish(); });
    expect(result.current.items).toHaveLength(12);
    expect(result.current.items.some(({ prompt }) => questionFingerprint(prompt) === questionFingerprint(initial[0].prompt))).toBe(false);
    expect(result.current.items.some(({ prompt }) => questionFingerprint(prompt) === questionFingerprint(initial[1].prompt))).toBe(false);
    const sent = JSON.parse(vi.mocked(fetch).mock.calls[1][1]!.body as string);
    expect(sent.excludedPrompts).toEqual(initial.map(({ prompt }) => prompt));
  });

  it('returns an empty exhausted queue instead of recycling a used question', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response());
    const { result } = renderHook(useNavalQuestionPool);
    await act(async () => { await result.current.prepare(configuration); });
    act(() => { for (let index = 0; index < 10; index++) result.current.take(); });
    let next: ReturnType<typeof result.current.take>;
    act(() => { next = result.current.take(); });
    expect(next!).toBeNull();
    expect(result.current.items).toEqual([]);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('preserves remaining questions after an AI failure and does not retry automatically', async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockResolvedValueOnce(response());
    const { result } = renderHook(useNavalQuestionPool);
    await act(async () => { await result.current.prepare(configuration); });
    act(() => { for (let index = 0; index < 7; index++) result.current.take(); });
    const pending = [...result.current.items];
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ error: 'El servicio de IA no está disponible.' }), { status: 503 }));
    await act(async () => { await result.current.replenish(); });
    expect(result.current.items).toEqual(pending);
    expect(result.current.error).toContain('no está disponible');
    expect(result.current.loading).toBe(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(180_000); });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('allows an explicit retry without discarding remaining questions or old-prompt exclusions', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response());
    const { result } = renderHook(useNavalQuestionPool);
    await act(async () => { await result.current.prepare(configuration); });
    act(() => { for (let index = 0; index < 7; index++) result.current.take(); });
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Lost connection'));
    await act(async () => { await result.current.replenish(); });
    vi.mocked(fetch).mockResolvedValueOnce(response(questions(10)));
    await act(async () => { await result.current.replenish(); });
    expect(result.current.error).toBe('');
    expect(result.current.items).toHaveLength(13);
    expect(JSON.parse(vi.mocked(fetch).mock.calls[2][1]!.body as string).excludedPrompts).toHaveLength(10);
  });

  it('reports an all-duplicate batch without replacing current questions or retrying in a loop', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response());
    const { result } = renderHook(useNavalQuestionPool);
    await act(async () => { await result.current.prepare(configuration); });
    act(() => { for (let index = 0; index < 7; index++) result.current.take(); });
    const pending = [...result.current.items];
    vi.mocked(fetch).mockResolvedValueOnce(response());
    await act(async () => { await result.current.replenish(); });
    expect(result.current.items).toEqual(pending);
    expect(result.current.error).toContain('no se reutilizará ninguna');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('caps transmitted exclusions at the last eighty while retaining all-seen duplicate protection', async () => {
    vi.mocked(fetch).mockImplementation(async (_url, init) => {
      const generation = vi.mocked(fetch).mock.calls.length - 1;
      return response(questions(generation * 10));
    });
    const { result } = renderHook(useNavalQuestionPool);
    await act(async () => { await result.current.prepare(configuration); });
    for (let generation = 1; generation < 10; generation++) {
      act(() => { while (result.current.take()) {} });
      await act(async () => { await result.current.replenish(); });
      expect(result.current.items.length).toBeLessThanOrEqual(16);
    }
    const sent = JSON.parse(vi.mocked(fetch).mock.calls[9][1]!.body as string);
    expect(sent.excludedPrompts).toHaveLength(80);
    expect(sent.excludedPrompts[0]).toBe(questions(10)[0].prompt);
    expect(sent.excludedPrompts.at(-1)).toBe(questions(80).at(-1)!.prompt);
    act(() => { while (result.current.take()) {} });
    vi.mocked(fetch).mockResolvedValueOnce(response(questions(0)));
    await act(async () => { await result.current.replenish(); });
    expect(result.current.items).toEqual([]);
    expect(result.current.error).toContain('repitió');
  });

  it('aborts on reset and ignores a stale response even if a fetch implementation ignores cancellation', async () => {
    const pending = deferred<Response>();
    vi.mocked(fetch).mockReturnValueOnce(pending.promise);
    const { result } = renderHook(useNavalQuestionPool);
    let operation!: Promise<void>;
    act(() => { operation = result.current.prepare(configuration); });
    const signal = vi.mocked(fetch).mock.calls[0][1]!.signal!;
    act(() => { result.current.reset(); });
    expect(signal.aborted).toBe(true);
    await act(async () => { pending.resolve(response()); await operation; });
    expect(result.current.items).toEqual([]);
    expect(result.current.error).toBe('');
    expect(result.current.loading).toBe(false);
  });

  it('does not let an old session finish clear the new session loading state', async () => {
    const old = deferred<Response>(); const current = deferred<Response>();
    vi.mocked(fetch).mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    const { result } = renderHook(useNavalQuestionPool);
    let oldOperation!: Promise<void>; let currentOperation!: Promise<void>;
    act(() => { oldOperation = result.current.prepare(configuration); });
    act(() => { currentOperation = result.current.prepare({ ...configuration, prompt: 'Nuevo tema' }); });
    expect(vi.mocked(fetch).mock.calls[0][1]!.signal!.aborted).toBe(true);
    await act(async () => { old.resolve(response()); await oldOperation; });
    expect(result.current.loading).toBe(true);
    expect(result.current.items).toEqual([]);
    await act(async () => { current.resolve(response(questions(10))); await currentOperation; });
    expect(result.current.loading).toBe(false);
    expect(result.current.items[0].prompt).toBe(questions(10)[0].prompt);
  });

  it('aborts on unmount and does not publish its late response', async () => {
    const pending = deferred<Response>();
    vi.mocked(fetch).mockReturnValueOnce(pending.promise);
    const { result, unmount } = renderHook(useNavalQuestionPool);
    let operation!: Promise<void>;
    act(() => { operation = result.current.prepare(configuration); });
    const signal = vi.mocked(fetch).mock.calls[0][1]!.signal!;
    unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => { pending.resolve(response()); await operation; });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('times out a stuck request and rejects a late result from an abort-ignoring provider', async () => {
    vi.useFakeTimers();
    const pending = deferred<Response>();
    vi.mocked(fetch).mockReturnValueOnce(pending.promise);
    const { result } = renderHook(useNavalQuestionPool);
    let operation!: Promise<void>;
    act(() => { operation = result.current.prepare(configuration); });
    await act(async () => { await vi.advanceTimersByTimeAsync(58_000); });
    expect(vi.mocked(fetch).mock.calls[0][1]!.signal!.aborted).toBe(true);
    await act(async () => { pending.resolve(response()); await operation; });
    expect(result.current.items).toEqual([]);
    expect(result.current.error).toContain('tardó demasiado');
    expect(result.current.loading).toBe(false);
  });
});
