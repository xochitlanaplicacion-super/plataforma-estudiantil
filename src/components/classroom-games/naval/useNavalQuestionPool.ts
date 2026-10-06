'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { parseNavalQuestions, questionFingerprint, shuffleQuestionOptions, type NavalQuestion, type NavalQuestionMode } from '@/lib/activities/naval-questions';
import { navalRandom } from '@/lib/activities/naval-battle';

export interface NavalQuestionRequest { prompt: string; mode: NavalQuestionMode; optionCount: number }

/** Bounded, single-flight queue. Used questions are never recycled; reset aborts the old session. */
export function useNavalQuestionPool() {
  const queue = useRef<NavalQuestion[]>([]);
  const seen = useRef(new Set<string>());
  const prompts = useRef<string[]>([]);
  const config = useRef<NavalQuestionRequest | null>(null);
  const controller = useRef<AbortController | null>(null);
  const epoch = useRef(0);
  const alive = useRef(true);
  const [items, setItems] = useState<NavalQuestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const reset = useCallback(() => {
    epoch.current++;
    controller.current?.abort(); controller.current = null;
    queue.current = []; seen.current.clear(); prompts.current = []; config.current = null;
    setItems([]); setLoading(false); setError('');
  }, []);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; epoch.current++; controller.current?.abort(); };
  }, []);

  const replenish = useCallback(async () => {
    if (!config.current || controller.current || queue.current.length > 5) return;
    const requestConfig = { ...config.current };
    const generation = epoch.current;
    const abort = new AbortController(); controller.current = abort;
    setLoading(true); setError('');
    // A lost connection cannot leave a permanent pending queue on the shared tablet.
    const timeout = setTimeout(() => abort.abort(), 58000);
    try {
      const response = await fetch('/api/exercises/generate-naval-battle', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: abort.signal,
        body: JSON.stringify({ ...requestConfig, count: 10, excludedPrompts: prompts.current.slice(-80) }),
      });
      const payload = await response.json();
      // An aborted request must never repopulate this queue, even if an adapter ignores its signal.
      if (abort.signal.aborted) throw new Error('La generación fue cancelada.');
      if (!response.ok) throw new Error(typeof payload.error === 'string' ? payload.error : 'No se pudo preparar el siguiente lote.');
      const parsed = parseNavalQuestions(payload, requestConfig.mode, requestConfig.optionCount);
      if (!alive.current || generation !== epoch.current) return;
      const fresh = parsed.filter((question) => !seen.current.has(questionFingerprint(question)));
      if (!fresh.length) throw new Error('La IA repitió preguntas ya preparadas. Reintenta: no se reutilizará ninguna.');
      for (const question of fresh) {
        seen.current.add(questionFingerprint(question)); prompts.current.push(question.prompt);
      }
      queue.current = [...queue.current, ...fresh.map((question) => ({ ...question, id: crypto.randomUUID() }))].slice(0, 16);
      setItems([...queue.current]);
    } catch (cause) {
      if (alive.current && generation === epoch.current) setError(abort.signal.aborted
        ? 'La generación tardó demasiado. Puedes reintentar sin perder la partida.'
        : cause instanceof Error ? cause.message : 'No fue posible conectar con la IA.');
    } finally {
      clearTimeout(timeout);
      if (alive.current && generation === epoch.current) { controller.current = null; setLoading(false); }
    }
  }, []);
  const prepare = useCallback(async (requestConfig: NavalQuestionRequest) => {
    reset(); config.current = requestConfig;
    await replenish();
  }, [reset, replenish]);
  const take = useCallback(() => {
    const question = queue.current.shift(); setItems([...queue.current]);
    return question ? shuffleQuestionOptions(question, navalRandom) : null;
  }, []);
  const discard = useCallback((id: string) => {
    queue.current = queue.current.filter((question) => question.id !== id);
    setItems([...queue.current]);
  }, []);
  return { items, loading, error, prepare, replenish, reset, take, discard };
}
