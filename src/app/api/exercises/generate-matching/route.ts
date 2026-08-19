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
    const { prompt, numPares, userId } = body;

    if (!prompt || !numPares) {
      return NextResponse.json(
        { error: "Faltan parámetros requeridos (prompt, numPares)." },
        { status: 400 }
      );
    }

    const systemPrompt = `Eres un experto creador de ejercicios educativos de emparejamiento. Basado en el texto o instrucción provista, debes generar exactamente ${numPares} pares de conceptos y sus definiciones/contrapartes.

Devuelve ÚNICAMENTE la respuesta en formato JSON con la siguiente estructura exacta:
{
  "items": [
    {
      "left": "Mitocondria",
      "right": "Organelo generador de energía celular (ATP)",
      "feedback": "La mitocondria es conocida como la central energética de la célula porque produce ATP mediante la respiración celular."
    }
  ]
}

REGLAS ESTRICTAS:
- Genera exactamente ${numPares} pares.
- El campo "left" debe contener el concepto, término o pregunta (breve).
- El campo "right" debe contener la definición, par o respuesta.
- En el campo "feedback", escribe una frase de una o dos oraciones que justifique o amplíe por qué ese par es correcto. Este texto solo lo verá el profesor.
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
      return NextResponse.json({ error: "Error al generar emparejamiento con IA." }, { status: 500 });
    }

    const data = await response.json();
    let resultJsonStr = data.choices[0].message.content;

    const promptTokens = data.usage?.prompt_tokens || 0;
    const completionTokens = data.usage?.completion_tokens || 0;
    const totalTokens = promptTokens + completionTokens;
    const totalCostUsd = (promptTokens / 1000000) * COST_PER_M_INPUT + (completionTokens / 1000000) * COST_PER_M_OUTPUT;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (supabaseUrl && supabaseKey) {
      const supabaseAdmin = await createServerSupabaseClient();
      supabaseAdmin.from('ai_token_usage').insert({
        user_id: userId || null,
        tipo_peticion: 'generar_emparejamiento',
        clase_tema: 'EMPAREJAMIENTO_IA',
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
    console.error("Error en generación AI de emparejamiento:", error);
    return NextResponse.json({ error: error.message || "Error interno." }, { status: 500 });
  }
}
