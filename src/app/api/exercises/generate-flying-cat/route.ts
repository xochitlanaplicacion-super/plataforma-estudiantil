import { NextResponse } from 'next/server';
import { requireTenantSession } from '@/lib/tenant/context';
import { checkAIServiceStatus, aiServiceDisabledResponse } from '@/utils/aiServiceValidation';
import { createFlyingCatContent, normalizeFlyingCatContent, shuffleFlyingCatOptions, validateFlyingCatContent } from '@/lib/activities/flying-cat';

const MODEL_ID = 'google/gemini-2.5-flash-lite';
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const { user, tenantId, supabase } = await requireTenantSession(['profesor', 'admin', 'superuser']);
    if (!(await checkAIServiceStatus())) return aiServiceDisabledResponse();
    let body: Record<string, unknown>;
    try { body = await request.json(); }
    catch { return NextResponse.json({ error: 'La solicitud no contiene JSON válido.' }, { status: 400 }); }
    if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Solicitud no válida.' }, { status: 400 });
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    const count = body.numPreguntas === undefined ? 5 : Number(body.numPreguntas);
    if (!prompt || prompt.length > 20000) return NextResponse.json({ error: 'Escribe un tema o texto base de hasta 20000 caracteres.' }, { status: 400 });
    if (!Number.isInteger(count) || count < 1 || count > 20) return NextResponse.json({ error: 'Solicita entre 1 y 20 definiciones.' }, { status: 400 });
    const apiKey = process.env.OPENROUTER_SLIDES_API_KEY || process.env.OPENROUTER_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'API de IA no configurada.' }, { status: 503 });

    const systemPrompt = `Eres especialista en juegos de vocabulario y evaluación escolar. Genera exactamente ${count} reactivos para Flying Cat (Pilot Cat), usando el idioma y nivel pedidos por el docente.
Cada prompt es una definición detallada, descripción o caso de uso de 35 a 110 palabras, entre 30 y 1600 caracteres, que permite identificar UN concepto sin revelar su nombre. No uses preguntas cortas como "¿Qué es X?".
Cada reactivo tiene de 2 a 4 conceptos plausibles distintos; cada concepto tiene MÁXIMO DOS PALABRAS Y 24 CARACTERES, incluidos espacios. Usa nombres cortos, nunca oraciones. Una sola opción corresponde completamente a la definición.
Distribuye aleatoriamente la respuesta correcta entre las opciones; no sigas un patrón ni la pongas siempre primero. correctIndex es su posición REAL, empezando en 0.
feedback es obligatorio: explica con claridad por qué ese concepto es correcto y la diferencia frente a los distractores, sin referencias a letras o posiciones porque luego se barajan.
Devuelve solamente JSON válido con esta estructura exacta (sin markdown):
{"items":[{"prompt":"Descripción larga o caso de uso","options":["Concepto uno","Concepto dos","Concepto tres"],"correctIndex":1,"feedback":"Explicación educativa"}]}
No dupliques conceptos ni reactivos. Si el texto base contiene palabras largas, elige conceptos o sinónimos válidos que cumplan el límite sin deformar su significado.`;
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: AbortSignal.timeout(55000),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'https://plataforma.edu',
        'X-Title': 'Plataforma Estudiantil · Flying Cat',
      },
      body: JSON.stringify({ model: MODEL_ID, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: prompt }], response_format: { type: 'json_object' } }),
    });
    if (!response.ok) return NextResponse.json({ error: 'La IA no pudo generar las definiciones. Intenta nuevamente.' }, { status: 502 });
    const data = await response.json();
    const promptTokens = Number(data.usage?.prompt_tokens) || 0;
    const completionTokens = Number(data.usage?.completion_tokens) || 0;
    // Server identity, not a userId supplied by the caller, defines the billing tenant.
    const { error: usageError } = await supabase.from('ai_token_usage').insert({
      tenant_id: tenantId,
      user_id: user.id,
      tipo_peticion: 'generar_flying_cat',
      clase_tema: 'FLYING_CAT_IA',
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
      model_used: MODEL_ID,
      estimated_cost_usd: (promptTokens * 0.10 + completionTokens * 0.40) / 1_000_000,
    });
    if (usageError) console.error('No se registró el consumo IA de Flying Cat:', usageError.code);
    let parsed: any;
    try {
      const raw = String(data.choices?.[0]?.message?.content || '').replace(/^```(?:json)?\s*/u, '').replace(/\s*```$/u, '').trim();
      parsed = JSON.parse(raw);
    } catch { return NextResponse.json({ error: 'La IA respondió con JSON inválido. No se modificaron tus definiciones.' }, { status: 502 }); }
    if (!Array.isArray(parsed?.items) || parsed.items.length !== count) {
      return NextResponse.json({ error: 'La IA no devolvió la cantidad solicitada. No se recortaron ni agregaron preguntas.' }, { status: 502 });
    }
    const candidate = { ...createFlyingCatContent(), items: parsed.items.map((item: any) => ({ ...item, id: crypto.randomUUID() })) };
    const validation = validateFlyingCatContent(candidate);
    if (validation) return NextResponse.json({ error: `Revisa las instrucciones para la IA: ${validation}` }, { status: 502 });
    const content = normalizeFlyingCatContent(candidate);
    return NextResponse.json({ items: content.items.map((item) => shuffleFlyingCatOptions(item)) });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'No autenticado') return NextResponse.json({ error: 'Inicia sesión para generar una actividad.' }, { status: 401 });
    if (/No autorizado|Usuario inactivo|Institución suspendida|Perfil sin institución|Institución no encontrada/u.test(message)) {
      return NextResponse.json({ error: 'No tienes permiso para generar esta actividad.' }, { status: 403 });
    }
    console.error('Generación Flying Cat:', error instanceof Error ? error.name : 'Error');
    return NextResponse.json({ error: 'No se pudo generar Flying Cat. Intenta nuevamente.' }, { status: 500 });
  }
}
