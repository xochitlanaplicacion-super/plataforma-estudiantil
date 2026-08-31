import { NextResponse } from 'next/server';
import { requireTenantSession } from '@/lib/tenant/context';
import { checkAIServiceStatus, aiServiceDisabledResponse } from '@/utils/aiServiceValidation';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL_ID = 'google/gemini-2.5-flash-lite';
const COST_PER_M_INPUT = 0.10;
const COST_PER_M_OUTPUT = 0.40;

export async function POST(request: Request) {
  if (!(await checkAIServiceStatus())) return aiServiceDisabledResponse();
  try {
    const { prompt, numPreguntas = 5 } = await request.json();
    const count = Math.max(2, Math.min(20, Number(numPreguntas) || 5));
    if (!String(prompt || '').trim()) {
      return NextResponse.json({ error: 'Escribe el tema o texto base.' }, { status: 400 });
    }
    const { user, tenantId, supabase } = await requireTenantSession(['profesor', 'admin', 'superuser']);
    const apiKey = process.env.OPENROUTER_SLIDES_API_KEY || process.env.OPENROUTER_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'API de IA no configurada.' }, { status: 500 });

    const systemPrompt = `Eres especialista en evaluación escolar. Genera exactamente ${count} reactivos en español para un juego educativo.
Mezcla de forma equilibrada reactivos de opción múltiple y verdadero/falso. No escribas contenido aterrador, violento ni ambiguo.
Devuelve únicamente JSON válido con esta estructura:
{"items":[
 {"type":"multiple_choice","prompt":"Pregunta","options":["A","B","C","D"],"correctIndex":0,"feedback":"Justificación breve"},
 {"type":"true_false","prompt":"Afirmación","correctIndex":1,"feedback":"Justificación breve"}
]}
Reglas: type sólo puede ser multiple_choice o true_false; correctIndex usa 0-3 en opción múltiple y 0=Verdadero, 1=Falso; cada opción múltiple tiene exactamente cuatro respuestas plausibles y una sola correcta; feedback siempre explica la respuesta; no incluyas markdown.`;

    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'https://plataforma.edu',
        'X-Title': 'Plataforma Estudiantil · Backrooms Scape',
      },
      body: JSON.stringify({
        model: MODEL_ID,
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: String(prompt) }],
        response_format: { type: 'json_object' },
      }),
    });
    if (!response.ok) {
      console.error('Backrooms Scape AI:', await response.text());
      return NextResponse.json({ error: 'No se pudieron generar las preguntas.' }, { status: 502 });
    }
    const data = await response.json();
    const usage = data.usage || {};
    const promptTokens = Number(usage.prompt_tokens) || 0;
    const completionTokens = Number(usage.completion_tokens) || 0;
    const totalTokens = promptTokens + completionTokens;
    const estimatedCost = promptTokens / 1_000_000 * COST_PER_M_INPUT
      + completionTokens / 1_000_000 * COST_PER_M_OUTPUT;
    const raw = String(data.choices?.[0]?.message?.content || '')
      .replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.items)) throw new Error('La IA no devolvió reactivos válidos.');

    const { error: usageError } = await supabase.from('ai_token_usage').insert({
      tenant_id: tenantId,
      user_id: user.id,
      tipo_peticion: 'generar_backrooms_scape',
      clase_tema: 'BACKROOMS_SCAPE_IA',
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: totalTokens,
      model_used: MODEL_ID,
      estimated_cost_usd: estimatedCost,
    });
    if (usageError) console.error('No se registró el consumo IA de Backrooms Scape:', usageError);
    return NextResponse.json({ items: parsed.items.slice(0, count) });
  } catch (error) {
    console.error('Generación Backrooms Scape:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error interno.' }, { status: 500 });
  }
}
