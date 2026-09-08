import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireTenantSession } from '@/lib/tenant/context';
import { checkAIServiceStatus, aiServiceDisabledResponse } from '@/utils/aiServiceValidation';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL_ID = 'google/gemini-2.5-flash-lite';
const COST_PER_M_INPUT = 0.10;
const COST_PER_M_OUTPUT = 0.40;

const requestSchema = z.object({
  prompt: z.string().trim().min(5).max(12_000),
  count: z.coerce.number().int().min(1).max(40),
  mode: z.enum(['multiple_choice', 'true_false', 'mixed']),
});

const aiItemSchema = z.object({
  type: z.enum(['multiple_choice', 'true_false']),
  prompt: z.string().trim().min(3).max(1000),
  options: z.array(z.string().trim().min(1).max(300)).length(4).optional(),
  correctIndex: z.coerce.number().int(),
  feedback: z.string().trim().max(1000).optional().default(''),
}).superRefine((item, context) => {
  if (item.type === 'multiple_choice' && (!item.options || item.correctIndex < 0 || item.correctIndex > 3)) {
    context.addIssue({ code: 'custom', message: 'Reactivo de opción múltiple inválido' });
  }
  if (item.type === 'true_false' && ![0, 1].includes(item.correctIndex)) {
    context.addIssue({ code: 'custom', message: 'Reactivo de verdadero o falso inválido' });
  }
});

const aiResponseSchema = z.object({ items: z.array(aiItemSchema).min(1).max(40) });

function modeInstruction(mode: z.infer<typeof requestSchema>['mode']) {
  if (mode === 'multiple_choice') return 'Todos los reactivos deben ser de opción múltiple.';
  if (mode === 'true_false') return 'Todos los reactivos deben ser de verdadero o falso.';
  return 'Combina de forma equilibrada reactivos de opción múltiple y de verdadero o falso.';
}

export async function POST(request: Request) {
  if (!(await checkAIServiceStatus())) return aiServiceDisabledResponse();

  try {
    const input = requestSchema.parse(await request.json());
    const { user, tenantId, admin } = await requireTenantSession(['profesor']);
    const apiKey = process.env.OPENROUTER_SLIDES_API_KEY || process.env.OPENROUTER_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'El servicio de IA no está configurado.' }, { status: 500 });

    const systemPrompt = `Eres especialista en diseño de prácticas escolares. Genera exactamente ${input.count} reactivos claros, apropiados para el tema y sin ambigüedades.
${modeInstruction(input.mode)}
Devuelve únicamente JSON válido con esta estructura:
{"items":[{"type":"multiple_choice","prompt":"Pregunta","options":["Opción 1","Opción 2","Opción 3","Opción 4"],"correctIndex":0,"feedback":"Explicación breve"},{"type":"true_false","prompt":"Afirmación","correctIndex":1,"feedback":"Explicación breve"}]}
Reglas: type sólo puede ser multiple_choice o true_false; correctIndex es base cero; para opción múltiple usa exactamente cuatro opciones plausibles, diferentes y una sola correcta; para verdadero/falso usa 0=Verdadero y 1=Falso y omite options; distribuye las respuestas correctas de opción múltiple entre distintas posiciones, evitando patrones como que todas sean B; feedback siempre justifica la respuesta; no incluyas markdown ni texto fuera del JSON.`;

    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'https://plataforma.edu',
        'X-Title': 'KIBO · Banco de actividades',
      },
      body: JSON.stringify({
        model: MODEL_ID,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: input.prompt },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      console.error('[classroom-bank-ai] provider', response.status, await response.text());
      return NextResponse.json({ error: 'La IA no pudo generar el banco. Intenta nuevamente.' }, { status: 502 });
    }

    const data = await response.json();
    const raw = String(data.choices?.[0]?.message?.content || '')
      .replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();
    const parsed = aiResponseSchema.parse(JSON.parse(raw));
    if (parsed.items.length !== input.count) {
      return NextResponse.json({ error: `La IA devolvió ${parsed.items.length} de ${input.count} preguntas. Intenta nuevamente.` }, { status: 502 });
    }

    const invalidMode = parsed.items.some((item) => input.mode !== 'mixed' && item.type !== input.mode);
    if (invalidMode) return NextResponse.json({ error: 'La IA devolvió tipos distintos a los solicitados. Intenta nuevamente.' }, { status: 502 });

    const usage = data.usage || {};
    const promptTokens = Number(usage.prompt_tokens) || 0;
    const completionTokens = Number(usage.completion_tokens) || 0;
    const { error: usageError } = await (admin as any).from('ai_token_usage').insert({
      tenant_id: tenantId,
      user_id: user.id,
      tipo_peticion: 'generar_banco_actividades',
      clase_tema: `BANCO_AULA_${input.mode.toUpperCase()}`,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
      model_used: MODEL_ID,
      estimated_cost_usd: promptTokens / 1_000_000 * COST_PER_M_INPUT
        + completionTokens / 1_000_000 * COST_PER_M_OUTPUT,
    });
    if (usageError) console.error('[classroom-bank-ai] usage', usageError);

    return NextResponse.json({
      items: parsed.items.map((item) => ({
        prompt: item.prompt,
        questionType: item.type,
        options: item.type === 'true_false' ? ['Verdadero', 'Falso'] : item.options!,
        correctIndex: item.correctIndex,
        explanation: item.feedback,
      })),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || 'Revisa los datos solicitados.' }, { status: 400 });
    }
    console.error('[classroom-bank-ai]', error);
    return NextResponse.json({ error: 'No fue posible generar el banco de actividades.' }, { status: 500 });
  }
}
