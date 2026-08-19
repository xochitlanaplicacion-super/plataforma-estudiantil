import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkAIServiceStatus, aiServiceDisabledResponse } from "@/utils/aiServiceValidation";


const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL_ID = "google/gemini-2.5-flash-lite";
const COST_PER_M_INPUT = 0.10;
const COST_PER_M_OUTPUT = 0.40;

export async function POST(req: Request) {
    if (!(await checkAIServiceStatus())) return aiServiceDisabledResponse();
try {
    const body = await req.json();
    const { prompt, numPreguntas, userId } = body;

    if (!prompt || !numPreguntas) {
      return NextResponse.json(
        { error: "Faltan parámetros requeridos (prompt, numPreguntas)." },
        { status: 400 }
      );
    }

    const systemPrompt = `Eres un experto creador de exámenes educativos. Basado en el texto o instrucción provista, debes extraer/generar exactamente ${numPreguntas} preguntas de opción múltiple.
Cada pregunta debe tener exactamente 4 opciones de respuesta, donde solo una es correcta.
Las opciones de respuesta deben tener IDs del "1" al "4".
El campo "correctId" debe indicar el ID de la opción correcta (ej: "2").

Devuelve ÚNICAMENTE la respuesta en formato JSON con la siguiente estructura exacta:
{
  "items": [
    {
      "question": "¿Cuál es la capital de Francia?",
      "options": [
        { "id": "1", "text": "Roma" },
        { "id": "2", "text": "París" },
        { "id": "3", "text": "Londres" },
        { "id": "4", "text": "Madrid" }
      ],
      "correctId": "2",
      "feedback": "París es la capital y ciudad más poblada de Francia desde el siglo III."
    }
  ]
}

REGLAS ESTRICTAS:
- Genera exactamente ${numPreguntas} preguntas.
- El JSON debe tener la llave "items".
- En el campo "feedback", escribe una breve justificación de por qué la respuesta es correcta. Este texto solo lo verá el profesor.
- No incluyas explicaciones adicionales fuera del JSON, ni bloques markdown, solo el JSON puro.`;

    const userPrompt = `Instrucciones o texto base: \n${prompt}`;

    const apiKey = process.env.OPENROUTER_SLIDES_API_KEY || process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: "API Key de OpenRouter no configurada." }, { status: 500 });
    }

    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://plataforma.edu",
        "X-Title": "IEZ Platform",
      },
      body: JSON.stringify({
        model: MODEL_ID,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        response_format: { type: "json_object" }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Error from OpenRouter:", errorText);
      return NextResponse.json({ error: "Error al generar opción múltiple con IA." }, { status: 500 });
    }

    const data = await response.json();
    let resultJsonStr = data.choices[0].message.content;
    
    // Tokens y facturación
    const promptTokens = data.usage?.prompt_tokens || 0;
    const completionTokens = data.usage?.completion_tokens || 0;
    const totalTokens = promptTokens + completionTokens;
    const totalCostUsd = (promptTokens / 1000000) * COST_PER_M_INPUT + (completionTokens / 1000000) * COST_PER_M_OUTPUT;

    // Registro en Supabase
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (supabaseUrl && supabaseKey) {
      const supabaseAdmin = await createServerSupabaseClient();
      supabaseAdmin.from('ai_token_usage').insert({
        user_id: userId || null,
        tipo_peticion: 'generar_opcion_multiple',
        clase_tema: 'OPCION_MULTIPLE_IA',
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: totalTokens,
        model_used: MODEL_ID,
        estimated_cost_usd: totalCostUsd
      }).then(({ error }) => {
        if (error) console.error("Error guardando uso de tokens de IA:", error);
      });
    }

    resultJsonStr = resultJsonStr.replace(/^```json\s*/, "").replace(/\s*```$/, "").trim();
    const parsedJson = JSON.parse(resultJsonStr);

    return NextResponse.json(parsedJson);
  } catch (error: any) {
    console.error("Error en generación AI de quiz:", error);
    return NextResponse.json({ error: error.message || "Error interno." }, { status: 500 });
  }
}
