import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL_ID = "google/gemini-2.5-flash-lite";
const COST_PER_M_INPUT = 0.10;
const COST_PER_M_OUTPUT = 0.40;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { prompt, numPasos, userId } = body;

    if (!prompt || !numPasos) {
      return NextResponse.json(
        { error: "Faltan parámetros requeridos (prompt, numPasos)." },
        { status: 400 }
      );
    }

    const systemPrompt = `Eres un experto creador de ejercicios educativos de ordenamiento de secuencias. Basado en el texto o instrucción provista, debes generar exactamente ${numPasos} pasos o etapas que el alumno debe ordenar correctamente.

Devuelve ÚNICAMENTE la respuesta en formato JSON con la siguiente estructura exacta:
{
  "items": ["Paso 1 texto", "Paso 2 texto", "Paso 3 texto"],
  "feedback": "Justificación global: Esta secuencia sigue el orden lógico de X porque primero debe ocurrir A, luego B, y finalmente C."
}

REGLAS ESTRICTAS:
- Genera exactamente ${numPasos} pasos.
- Los pasos en el array "items" deben estar en el ORDEN CORRECTO (el sistema los mostrará desordenados al alumno).
- Cada paso debe ser una oración clara y concisa.
- En el campo "feedback" (fuera del array), escribe una explicación global de por qué ese es el orden correcto. Este texto solo lo verá el profesor.
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
        "HTTP-Referer": "https://iez.edu.mx",
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
      return NextResponse.json({ error: "Error al generar secuencia con IA." }, { status: 500 });
    }

    const data = await response.json();
    let resultJsonStr = data.choices[0].message.content;

    const promptTokens = data.usage?.prompt_tokens || 0;
    const completionTokens = data.usage?.completion_tokens || 0;
    const totalTokens = promptTokens + completionTokens;
    const totalCostUsd = (promptTokens / 1000000) * COST_PER_M_INPUT + (completionTokens / 1000000) * COST_PER_M_OUTPUT;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (supabaseUrl && supabaseKey) {
      const supabaseAdmin = createClient(supabaseUrl, supabaseKey);
      supabaseAdmin.from('ai_token_usage').insert({
        user_id: userId || null,
        tipo_peticion: 'generar_ordenar_secuencia',
        clase_tema: 'ORDENAR_SECUENCIA_IA',
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
    console.error("Error en generación AI de secuencia:", error);
    return NextResponse.json({ error: error.message || "Error interno." }, { status: 500 });
  }
}
