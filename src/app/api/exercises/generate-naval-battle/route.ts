import { NextResponse } from 'next/server';
import { requireTenantSession } from '@/lib/tenant/context';
import { checkAIServiceStatus, aiServiceDisabledResponse } from '@/utils/aiServiceValidation';
import { NAVAL_BATTLE_AI_MODEL, NavalBattleGenerationError, generateNavalBattleQuestions } from '@/lib/ai/naval-battle-generation';
import type { NavalQuestionMode } from '@/lib/activities/naval-questions';

export const maxDuration = 60;
const MAX_BODY_BYTES = 120_000;

class RequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

async function readRequest(request: Request): Promise<Record<string, unknown>> {
  const contentLength = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) throw new RequestError('La solicitud excede el tamaño permitido.', 413);
  if (!request.body) throw new RequestError('La solicitud no contiene JSON válido.', 400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  const cancel = () => { void reader.cancel().catch(() => {}); };
  request.signal.addEventListener('abort', cancel, { once: true });
  try {
    while (true) {
      request.signal.throwIfAborted();
      const { value, done } = await reader.read();
      request.signal.throwIfAborted();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new RequestError('La solicitud excede el tamaño permitido.', 413);
      }
      chunks.push(value);
    }
    const buffer = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
    let body: unknown;
    try { body = JSON.parse(new TextDecoder().decode(buffer)); }
    catch { throw new RequestError('La solicitud no contiene JSON válido.', 400); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new RequestError('Solicitud no válida.', 400);
    return body as Record<string, unknown>;
  } finally {
    request.signal.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
}

export async function POST(request: Request) {
  try {
    // Verify server-side identity before parsing an untrusted body or calling the paid provider.
    const { user, tenantId, supabase } = await requireTenantSession(['profesor']);
    if (!(await checkAIServiceStatus())) return NextResponse.json({
      error: 'El servicio de IA no está habilitado para esta institución. Tus preguntas actuales se conservan.',
    }, { status: aiServiceDisabledResponse().status });
    if (request.signal.aborted) return NextResponse.json({ error: 'La generación fue cancelada. Tus preguntas actuales se conservan.' }, { status: 408 });
    const body = await readRequest(request);
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    if (!prompt || prompt.length > 12_000) return NextResponse.json({ error: 'Escribe un tema o instrucciones de hasta 12000 caracteres.' }, { status: 400 });
    if (body.mode !== 'multiple_choice' && body.mode !== 'true_false' && body.mode !== 'mixed') return NextResponse.json({ error: 'Selecciona opción múltiple, verdadero/falso o ambas.' }, { status: 400 });
    if (typeof body.optionCount !== 'number' || !Number.isInteger(body.optionCount) || body.optionCount < 2 || body.optionCount > 6) return NextResponse.json({ error: 'Selecciona entre 2 y 6 opciones.' }, { status: 400 });
    if (typeof body.count !== 'number' || !Number.isInteger(body.count) || body.count < 1 || body.count > 12) return NextResponse.json({ error: 'Solicita entre 1 y 12 preguntas por lote.' }, { status: 400 });
    if (body.excludedPrompts !== undefined && (!Array.isArray(body.excludedPrompts) || body.excludedPrompts.length > 80 || body.excludedPrompts.some((value) => typeof value !== 'string' || value.length > 1000))) {
      return NextResponse.json({ error: 'La lista de preguntas anteriores admite hasta 80 enunciados de 1000 caracteres cada uno.' }, { status: 400 });
    }
    const apiKey = process.env.OPENROUTER_SLIDES_API_KEY || process.env.OPENROUTER_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'El servicio de IA no está configurado.' }, { status: 503 });
    const items = await generateNavalBattleQuestions({
      prompt, mode: body.mode as NavalQuestionMode, optionCount: body.optionCount, count: body.count,
      excludedPrompts: (body.excludedPrompts as string[] | undefined) ?? [],
      apiKey, signal: request.signal, referrer: process.env.NEXT_PUBLIC_APP_URL,
      onUsage: async ({ promptTokens, completionTokens }) => {
        try {
          // Session-scoped RLS client, authenticated tenant/user; body identities are never trusted.
          const { error } = await supabase.from('ai_token_usage').insert({
            tenant_id: tenantId, user_id: user.id, tipo_peticion: 'generar_batalla_naval', clase_tema: 'BATALLA_NAVAL_AULA_IA',
            prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: promptTokens + completionTokens,
            model_used: NAVAL_BATTLE_AI_MODEL, estimated_cost_usd: (promptTokens * 0.10 + completionTokens * 0.40) / 1_000_000,
          }).abortSignal(AbortSignal.any([request.signal, AbortSignal.timeout(3000)]));
          if (error) console.error('No se registró el consumo IA de Batalla Naval:', error.code);
        } catch { console.error('No se registró el consumo IA de Batalla Naval.'); }
      },
    });
    return NextResponse.json({ items });
  } catch (error) {
    if (request.signal.aborted) return NextResponse.json({ error: 'La generación fue cancelada. Tus preguntas actuales se conservan.' }, { status: 408 });
    if (error instanceof RequestError || error instanceof NavalBattleGenerationError) return NextResponse.json({ error: error.message }, { status: error.status });
    const message = error instanceof Error ? error.message : '';
    if (message === 'No autenticado') return NextResponse.json({ error: 'Inicia sesión como profesor para generar preguntas.' }, { status: 401 });
    if (/No autorizado|Usuario inactivo|Institución suspendida|Perfil sin institución|Institución no encontrada/u.test(message)) return NextResponse.json({ error: 'No tienes permiso para generar estas preguntas.' }, { status: 403 });
    console.error('Generación Batalla Naval:', error instanceof Error ? error.name : 'Error');
    return NextResponse.json({ error: 'No se pudo generar el siguiente lote. Tus preguntas actuales se conservan; puedes reintentar.' }, { status: 500 });
  }
}
