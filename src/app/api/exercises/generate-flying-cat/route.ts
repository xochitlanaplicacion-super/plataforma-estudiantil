import { NextResponse } from 'next/server';
import { requireTenantSession } from '@/lib/tenant/context';
import { checkAIServiceStatus, aiServiceDisabledResponse } from '@/utils/aiServiceValidation';
import { FLYING_CAT_AI_MODEL, FlyingCatGenerationError, generateFlyingCatQuestions } from '@/lib/ai/flying-cat-generation';
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const { user, tenantId, supabase } = await requireTenantSession(['profesor', 'admin', 'superuser']);
    if (!(await checkAIServiceStatus())) return aiServiceDisabledResponse();
    let body: Record<string, unknown>;
    try { body = await request.json(); }
    catch { return NextResponse.json({ error: 'La solicitud no contiene JSON válido.' }, { status: 400 }); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Solicitud no válida.' }, { status: 400 });
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    const count = body.numPreguntas === undefined ? 5 : Number(body.numPreguntas);
    if (!prompt || prompt.length > 20000) return NextResponse.json({ error: 'Escribe un tema o texto base de hasta 20000 caracteres.' }, { status: 400 });
    if (!Number.isInteger(count) || count < 1 || count > 20) return NextResponse.json({ error: 'Solicita entre 1 y 20 definiciones.' }, { status: 400 });
    const apiKey = process.env.OPENROUTER_SLIDES_API_KEY || process.env.OPENROUTER_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'API de IA no configurada.' }, { status: 503 });

    const items = await generateFlyingCatQuestions({
      prompt, count, apiKey, signal: request.signal, referrer: process.env.NEXT_PUBLIC_APP_URL,
      onUsage: async ({ promptTokens, completionTokens }) => {
        // Record both generation and repairs against the authenticated tenant, never body.userId.
        try {
          const { error } = await supabase.from('ai_token_usage').insert({
            tenant_id: tenantId, user_id: user.id, tipo_peticion: 'generar_flying_cat', clase_tema: 'FLYING_CAT_IA',
            prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: promptTokens + completionTokens,
            model_used: FLYING_CAT_AI_MODEL, estimated_cost_usd: (promptTokens * 0.10 + completionTokens * 0.40) / 1_000_000,
          });
          if (error) console.error('No se registró el consumo IA de Flying Cat:', error.code);
        } catch { console.error('No se registró el consumo IA de Flying Cat.'); }
      },
    });
    return NextResponse.json({ items });
  } catch (error) {
    if (error instanceof FlyingCatGenerationError) return NextResponse.json({ error: error.message }, { status: error.status });
    const message = error instanceof Error ? error.message : '';
    if (message === 'No autenticado') return NextResponse.json({ error: 'Inicia sesión para generar una actividad.' }, { status: 401 });
    if (/No autorizado|Usuario inactivo|Institución suspendida|Perfil sin institución|Institución no encontrada/u.test(message)) {
      return NextResponse.json({ error: 'No tienes permiso para generar esta actividad.' }, { status: 403 });
    }
    console.error('Generación Flying Cat:', error instanceof Error ? error.name : 'Error');
    return NextResponse.json({ error: 'No se pudo generar Flying Cat. Tus preguntas se conservan; intenta nuevamente.' }, { status: 500 });
  }
}
