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

    const systemPrompt = `Eres un experto pedagogo creador de ejercicios de "completar espacios en blanco" (fill-in-the-blanks). 
Tu objetivo es ADAPTAR y REDACTAR el texto provisto para que las palabras ocultas representen CONCEPTOS LÓGICOS CLAVE que el alumno deba deducir para que la oración tenga sentido.

Basado en el texto o instrucción provista, debes generar exactamente ${numPalabras} oraciones educativas e independientes. Cada oración debe estar diseñada de manera que contenga un concepto clave (de 1 o máximo 2 palabras) que evalúe el aprendizaje del alumno.

Devuelve ÚNICAMENTE la respuesta en formato JSON con la siguiente estructura exacta:
{
  "text": "La mitocondria es el organelo encargado de producir energía.\\n\\nLa máquina de vapor fue perfeccionada por James Watt en 1769.",
  "suggestedWords": ["energía", "James Watt"],
  "feedback": "Estas palabras fueron elegidas porque son los conceptos centrales que demuestran la comprensión del tema."
}

REGLAS ESTRICTAS Y CRÍTICAS:
1. El campo "text" debe contener exactamente ${numPalabras} oraciones separadas por doble salto de línea (\\n\\n).
2. NO REEMPLACES las palabras clave con espacios, guiones bajos, ni etiquetas como {"blank"}. El texto debe estar COMPLETO, fluido y tener todas las palabras escritas normalmente. El sistema se encargará de ocultarlas visualmente después.
3. El campo "suggestedWords" debe contener exactamente ${numPalabras} conceptos. 
4. REGLA DE ORO INQUEBRANTABLE: Las frases en "suggestedWords" DEBEN SER UN COPY-PASTE EXACTO del campo "text" que acabas de redactar. Si en tu texto escribiste "optimizando", NO puedes sugerir "optimizar". Si escribiste "industrializada", NO sugieras "industrial". NO cambies el tiempo verbal, NO resumas. La palabra sugerida DEBE SER UNA SUBCADENA EXACTA Y LITERAL (substring) de "text", de lo contrario el sistema fallará.
5. Los conceptos sugeridos deben tener máximo 2 palabras y no deben incluir signos de puntuación.
6. En el campo "feedback", escribe una justificación pedagógica de por qué estas palabras son fundamentales. Este texto solo lo verá el profesor.
7. REGLA DE IDIOMA: Mantén estrictamente el MISMO IDIOMA del texto o instrucción original. Si te hablan en español, redacta todo en español. Si te hablan en inglés, redacta todo en inglés. Si hay términos técnicos mixtos, consérvalos, pero el idioma base debe ser idéntico al original. NUNCA mezcles oraciones en español e inglés aleatoriamente.
8. FORMATO PLANO OBLIGATORIO: El campo "text" debe ser TEXTO PLANO. Está estrictamente PROHIBIDO usar formato Markdown como **asteriscos**, negritas, cursivas o subrayados para resaltar las palabras. Escribe el texto normal sin símbolos raros.
9. No incluyas explicaciones adicionales fuera del JSON, ni bloques markdown, solo el JSON puro.`;

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
      return NextResponse.json({ error: "Error al generar completar espacios con IA." }, { status: 500 });
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
        tipo_peticion: 'generar_completar_espacios',
        clase_tema: 'COMPLETAR_ESPACIOS_IA',
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

    // Limpiar el texto de CUALQUIER símbolo de markdown que la IA pueda haber colado
    if (parsedJson.text && typeof parsedJson.text === 'string') {
      parsedJson.text = parsedJson.text
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/__([^_]+)__/g, '$1')
        .replace(/_([^_]+)_/g, '$1')
        .replace(/~~([^~]+)~~/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\[([^\]]+)\]/g, '$1')
        .replace(/\{[^}]+\}/g, '')
        .replace(/\*+/g, '')
        .replace(/_{2,}/g, '');
    }

    // Limpiar las suggestedWords de signos de puntuación y símbolos
    if (Array.isArray(parsedJson.suggestedWords)) {
      parsedJson.suggestedWords = parsedJson.suggestedWords
        .map((w: string) => w.replace(/[*_~`\[\]{}]/g, '').replace(/^[.,;!?]+|[.,;!?]+$/g, '').trim())
        .filter((w: string) => w.length > 0);
    }

    return NextResponse.json(parsedJson);

  } catch (error: any) {
    console.error("Error en generación AI de completar espacios:", error);
    return NextResponse.json({ error: error.message || "Error interno." }, { status: 500 });
  }
}
