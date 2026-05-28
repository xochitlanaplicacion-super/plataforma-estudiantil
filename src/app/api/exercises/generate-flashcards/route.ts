import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL_ID = "google/gemini-2.5-flash-lite";
const COST_PER_M_INPUT = 0.10;
const COST_PER_M_OUTPUT = 0.40;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { prompt, numTarjetas, userId } = body;

    if (!prompt || !numTarjetas) {
      return NextResponse.json(
        { error: "Faltan parámetros requeridos (prompt, numTarjetas)." },
        { status: 400 }
      );
    }

    const systemPrompt = `Eres un experto creador de tarjetas de estudio (flashcards) educativas. Basado en el texto o instrucción provista, debes generar exactamente ${numTarjetas} tarjetas donde el frente tiene un término o concepto y el reverso tiene su definición o explicación.

Devuelve ÚNICAMENTE la respuesta en formato JSON con la siguiente estructura exacta:
{
  "items": [
    {
      "front": "Mitocondria",
      "back": "Organelo celular responsable de producir energía en forma de ATP mediante la respiración celular."
    },
    {
      "front": "Fotosíntesis",
      "back": "Proceso biológico mediante el cual las plantas convierten luz solar, agua y CO2 en glucosa y oxígeno."
    }
  ]
}

REGLAS ESTRICTAS:
- Genera exactamente ${numTarjetas} tarjetas.
- El campo "front" debe ser breve: un término, concepto, pregunta o fórmula.
- El campo "back" debe ser una definición o explicación clara y concisa (máximo 2-3 oraciones).
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
      return NextResponse.json({ error: "Error al generar flashcards con IA." }, { status: 500 });
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
        tipo_peticion: 'generar_flashcards',
        clase_tema: 'FLASHCARDS_IA',
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
    console.error("Error en generación AI de flashcards:", error);
    return NextResponse.json({ error: error.message || "Error interno." }, { status: 500 });
  }
}
