import { requireTenantSession } from '@/lib/tenant/context';
import { POST as generateReviewedQuestions } from '@/app/api/exercises/generate-naval-battle/route';

export const maxDuration = 60;
const limits = new Map<string, { start: number; requests: number; active: boolean }>();
const MAX_BYTES = 120_000;

async function boundedJSON(request: Request): Promise<Record<string, unknown>> {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) throw Object.assign(new Error('Envía instrucciones JSON.'), { status: 415 });
  if (Number(request.headers.get('content-length')) > MAX_BYTES) throw Object.assign(new Error('La solicitud es demasiado grande.'), { status: 413 });
  if (!request.body) throw Object.assign(new Error('Solicitud vacía.'), { status: 400 });
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let bytes = 0;
  const cancel = () => { void reader.cancel().catch(() => {}); };
  request.signal.addEventListener('abort', cancel, { once: true });
  try {
    for (;;) {
      request.signal.throwIfAborted();
      const { value, done } = await reader.read(); request.signal.throwIfAborted(); if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BYTES) { await reader.cancel(); throw Object.assign(new Error('La solicitud es demasiado grande.'), { status: 413 }); }
      chunks.push(value);
    }
  } finally { request.signal.removeEventListener('abort', cancel); reader.releaseLock(); }
  const buffer = new Uint8Array(bytes); let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
  let result: unknown;
  try { result = JSON.parse(new TextDecoder().decode(buffer)); } catch { throw Object.assign(new Error('JSON no válido.'), { status: 400 }); }
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw Object.assign(new Error('Solicitud no válida.'), { status: 400 });
  return result as Record<string, unknown>;
}

export async function POST(request: Request) {
  let rate: { start: number; requests: number; active: boolean } | undefined;
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
  try {
    const { user, tenantId } = await requireTenantSession(['profesor']);
    if (request.headers.get('origin') !== new URL(request.url).origin || request.headers.get('sec-fetch-site') === 'cross-site') return json({ error: 'Genera las preguntas desde la plataforma del profesor.' }, 403);
    const key = `${tenantId}:${user.id}`; const now = Date.now();
    for (const [id, entry] of limits) if (!entry.active && now - entry.start > 60_000) limits.delete(id);
    const existing = limits.get(key);
    if (existing?.active || (existing && now - existing.start < 60_000 && existing.requests >= 4)) return json({ error: 'Espera a que termine la generación; máximo cuatro lotes por minuto.' }, 429);
    rate = existing && now - existing.start < 60_000 ? existing : { start: now, requests: 0, active: false };
    rate.active = true; rate.requests++; limits.set(key, rate);
    const body = await boundedJSON(request);
    const types: Record<string, string> = { multiple: 'multiple_choice', truefalse: 'true_false', mixed: 'mixed' };
    if (typeof body.type !== 'string' || !Object.hasOwn(types, body.type)) return json({ error: 'Selecciona opción múltiple, verdadero/falso o ambas.' }, 400);
    if (typeof body.topic !== 'string' || !body.topic.trim() || body.topic.length > 11_500 || typeof body.level !== 'string' || !body.level.trim() || body.level.length > 200) return json({ error: 'Escribe el tema y nivel escolar.' }, 400);
    // Reuse the existing teacher/tenant IA gate, validator, bounded provider,
    // repair logic and session-scoped usage logging; no second provider or key.
    const adapted = new Request(request.url, { method: 'POST', headers: request.headers, signal: request.signal,
      body: JSON.stringify({ prompt: `${body.topic}\nNivel escolar: ${body.level}`, mode: types[body.type], optionCount: body.optionCount, count: body.count, excludedPrompts: body.exclude }),
    });
    const response = await generateReviewedQuestions(adapted);
    const result = await response.json();
    if (!response.ok) return json(result, response.status);
    return json({ questions: result.items.map((item: { id: string; type: string; prompt: string; options: string[]; correctIndex: number; explanation: string }) => ({
      id: item.id, type: item.type === 'true_false' ? 'truefalse' : 'multiple', prompt: item.prompt,
      options: item.options, answerIndex: item.correctIndex, explanation: item.explanation,
    })) });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const status = request.signal.aborted ? 408 : message === 'No autenticado' ? 401 : /No autorizado|inactivo|suspendida|institución/i.test(message) ? 403 : (error as { status?: number })?.status || 500;
    return json({ error: status === 500 ? 'No se pudieron preparar las preguntas; el banco anterior se conserva.' : message || 'Solicitud cancelada.' }, status);
  } finally { if (rate) rate.active = false; }
}
