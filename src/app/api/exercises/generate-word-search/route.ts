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
    const { prompt, numPalabras, userId } = body;

    if (!prompt || !numPalabras) {
      return NextResponse.json(
        { error: "Faltan parámetros requeridos (prompt, numPalabras)." },
        { status: 400 }
      );
    }

    const systemPrompt = `Eres un experto creador de sopas de letras educativas. Basado en el texto o instrucción provista, debes extraer/generar exactamente ${numPalabras} palabras clave para una sopa de letras, junto con ${numPalabras} pistas descriptivas que permitan al alumno identificar cada palabra dentro de la sopa.

Devuelve ÚNICAMENTE la respuesta en formato JSON con la siguiente estructura exacta:
{
  "words": ["MITOCONDRIA", "FOTOSINTESIS", "CELULA"],
  "clues": ["Organelo encargado de producir energía (ATP) en la célula.", "Proceso por el cual las plantas convierten luz solar en glucosa.", "Unidad básica y funcional de todos los seres vivos."],
  "feedback": "Estas palabras fueron seleccionadas porque representan los conceptos fundamentales del tema. La dificultad es adecuada para el nivel de comprensión esperado."
}

REGLAS ESTRICTAS:
- Todas las palabras deben estar en MAYÚSCULAS.
- Las palabras no deben contener espacios ni caracteres especiales (ej. si es "Gato Montes", usa "GATOMONTES").
- Genera exactamente ${numPalabras} palabras con sus ${numPalabras} pistas correspondientes.
- Las pistas deben ser textos descriptivos que den un indicio claro de la palabra buscada sin mencionarla directamente.
- En el campo "feedback", escribe una justificación de por qué estas palabras fueron elegidas para la sopa de letras. Este texto solo lo verá el profesor.
- No incluyas bloques markdown ni texto fuera del JSON puro.`;

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
      return NextResponse.json({ error: "Error al generar la sopa de letras con IA." }, { status: 500 });
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
        tipo_peticion: 'generar_sopa_letras',
        clase_tema: 'SOPA_LETRAS_IA',
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
    console.error("Error en generación AI de sopa de letras:", error);
    return NextResponse.json({ error: error.message || "Error interno." }, { status: 500 });
  }
}
