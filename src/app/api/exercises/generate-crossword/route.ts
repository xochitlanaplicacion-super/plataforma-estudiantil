import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkAIServiceStatus, aiServiceDisabledResponse } from "@/utils/aiServiceValidation";


const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// Tarifas para google/gemini-2.5-flash-lite (USD por 1 Millón de tokens)
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

    const systemPrompt = `Eres un experto creador de crucigramas educativos. Basado en el texto o instrucción provista, debes extraer/generar exactamente ${numPalabras} palabras clave y crear ${numPalabras} pistas descriptivas que den un indicio claro a cada palabra. Devuelve únicamente la respuesta en formato JSON con la siguiente estructura: 
{
  "words": ["PALABRA1", "PALABRA2"], 
  "clues": ["Pista para la palabra 1", "Pista para la palabra 2"]
}
IMPORTANTE:
- Todas las palabras deben estar en MAYÚSCULAS.
- Las palabras no deben contener espacios ni caracteres especiales (ej. si es "Gato Montes", usa "GATOMONTES").
- El número exacto de palabras devueltas en los arrays debe ser de ${numPalabras}.`;

    const userPrompt = `
Instrucciones o texto base: 
${prompt}
`;

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
      return NextResponse.json(
        { error: "Error al generar el crucigrama con IA." },
        { status: 500 }
      );
    }

    const data = await response.json();
    let resultJsonStr = data.choices[0].message.content;
    
    // Extraer tokens de la respuesta de OpenRouter para facturación
    const promptTokens = data.usage?.prompt_tokens || 0;
    const completionTokens = data.usage?.completion_tokens || 0;
    const totalTokens = data.usage?.total_tokens || (promptTokens + completionTokens);

    // Calcular costo estimado en dólares
    const promptCost = (promptTokens / 1000000) * COST_PER_M_INPUT;
    const completionCost = (completionTokens / 1000000) * COST_PER_M_OUTPUT;
    const totalCostUsd = promptCost + completionCost;

    // Registrar en Supabase de forma asíncrona silenciosa
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (supabaseUrl && supabaseKey) {
      const supabaseAdmin = createClient(supabaseUrl, supabaseKey);
      
      supabaseAdmin.from('ai_token_usage').insert({
        user_id: userId || null,
        tipo_peticion: 'generar_crucigrama',
        clase_tema: 'CRUCIGRAMA_IA',
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: totalTokens,
        model_used: MODEL_ID,
        estimated_cost_usd: totalCostUsd
      }).then(({ error }) => {
        if (error) console.error("Error guardando uso de tokens de IA:", error);
      });
    }

    // Limpiar si el modelo devolvió bloques markdown de código
    resultJsonStr = resultJsonStr.replace(/^```json\s*/, "").replace(/\s*```$/, "").trim();

    const parsedJson = JSON.parse(resultJsonStr);

    return NextResponse.json(parsedJson);

  } catch (error: any) {
    console.error("Error en generación AI de crucigrama:", error);
    return NextResponse.json({ error: error.message || "Error interno." }, { status: 500 });
  }
}
