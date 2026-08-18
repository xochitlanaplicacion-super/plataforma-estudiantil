import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkAIServiceStatus, aiServiceDisabledResponse } from "@/utils/aiServiceValidation";


// Usamos el modelo principal de los alumnos para mantener coherencia, o gemini-2.5-flash-lite que es rápido para JSON
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const ALUMNO_MODELS = [
  { id: "openai/gpt-oss-120b",        label: "GPT-oss 120B",   costInput: 0.039, costOutput: 0.18 },
  { id: "qwen/qwen3.5-flash-02-23",   label: "Qwen 3.5 Flash", costInput: 0.065, costOutput: 0.26 },
];

export async function POST(req: Request) {
    if (!(await checkAIServiceStatus())) return aiServiceDisabledResponse();
try {
    const body = await req.json();
    const { source, type, count, userId, chatMessages, materiaId, unidadId, temaId } = body;

    if (!userId || !source || !type || !count) {
      return NextResponse.json({ error: "Faltan parámetros requeridos." }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

    let contextText = "";

    // 1. Recolectar contexto según el Origen
    if (source === "texto") {
      contextText = body.textoLibre?.trim() || "Genera preguntas de cultura general nivel preparatoria.";
    } else if (source === "chat") {
      // Tomamos los últimos 10 mensajes del chat
      if (chatMessages && Array.isArray(chatMessages)) {
        const last10 = chatMessages.slice(-10);
        contextText = last10.map(m => `${m.role === 'user' ? 'Alumno' : 'Asistente'}: ${m.content}`).join("\n\n");
      }
      if (!contextText.trim()) {
        contextText = "Genera preguntas sobre cultura general nivel preparatoria.";
      }
    } else if (source === "materia") {
      if (!temaId) {
        return NextResponse.json({ error: "Se requiere un tema para generar desde materias." }, { status: 400 });
      }

      // Buscar diapositivas
      const { data: slides } = await supabaseAdmin.from("slides").select("titulo, contenido").eq("tema_id", temaId);
      if (slides && slides.length > 0) {
        contextText += "Contenido de diapositivas del tema:\n";
        slides.forEach(s => {
          contextText += `\n--- Diapositiva: ${s.titulo} ---\n${s.contenido || ''}\n`;
        });
      }

      // Si el contexto es muy corto, buscar ejercicios previos del profe
      if (contextText.length < 200) {
        const { data: ejercicios } = await supabaseAdmin.from("ejercicios").select("titulo, descripcion").eq("tema_id", temaId);
        if (ejercicios && ejercicios.length > 0) {
          contextText += "\n\nEjercicios previos del tema (usar como inspiración de los temas evaluados):\n";
          ejercicios.forEach(e => {
            contextText += `- ${e.titulo}: ${e.descripcion || ''}\n`;
          });
        }
      }

      // Si sigue sin haber nada, solo le pasamos el nombre de la materia/tema (requerimos consultar sus nombres)
      if (contextText.length < 50) {
        const { data: tema } = await supabaseAdmin.from("temas").select("titulo, unidades(titulo, materias(nombre))").eq("id", temaId).single();
        if (tema) {
          const materiaNombre = (tema.unidades as any)?.materias?.nombre || "";
          const unidadNombre = (tema.unidades as any)?.titulo || "";
          contextText = `Genera un ejercicio sobre el tema "${tema.titulo}" de la unidad "${unidadNombre}" de la materia "${materiaNombre}".
ESTRICTAMENTE BASATE EN LA MATERIA: "${materiaNombre}". NUNCA generes preguntas de una materia diferente. Si la materia es de Humanidades (ej. Filosofía), NO preguntes de Ciencias Exactas (ej. Física o Matemáticas), y viceversa. Si no hay contexto en diapositivas, UTILIZA TU CONOCIMIENTO INTERNO EXPERTO SOBRE ESTE TEMA ESPECÍFICO.`;
        } else {
          contextText = "Genera preguntas educativas nivel preparatoria.";
        }
      }
    }

    console.log("\n=== [GENERAR EJERCICIO] PROMPT CONSTRUIDO ===");
    console.log(`[Fuente]: ${source} | [Tipo]: ${type} | [Materia ID]: ${materiaId || 'N/A'}`);
    console.log(`[Contexto Textual a enviar]:\n${contextText}\n==============================================\n`);

    // 2. Construir Prompt según tipo
    let systemPrompt = `Eres un experto creador de ejercicios interactivos educativos. 
MISION PRINCIPAL: Basándote en el contexto y en la materia indicada, genera EXACTAMENTE ${count} reactivos académicos.
REGLA DE ORO: SI EL CONTEXTO INDICA UNA MATERIA ESPECÍFICA (EJ. FILOSOFÍA, HISTORIA), DEBES GENERAR PREGUNTAS ÚNICA Y EXCLUSIVAMENTE SOBRE ESA MATERIA. PROHIBIDO GENERAR PREGUNTAS DE OTRAS DISCIPLINAS (COMO FÍSICA O MATEMÁTICAS) SI NO CORRESPONDEN A LA MATERIA SOLICITADA. SI NO HAY CONTEXTO TEXTUAL, UTILIZA TU CONOCIMIENTO INTERNO SOBRE EL TEMA SOLICITADO.
NO inventes asociaciones modernas (como redes sociales, influencers o tecnología) a menos que el contexto lo mencione explícitamente. Mantén un tono académico apropiado para la materia.`;
    
    if (type === "multiple") {
      systemPrompt += `
Cada pregunta debe tener exactamente 4 opciones de respuesta (solo una correcta).
Las opciones deben tener IDs "1", "2", "3" y "4".
El campo "correctId" debe indicar el ID de la opción correcta.

INSTRUCCIÓN CRÍTICA DE CALIDAD:
- Las 3 opciones incorrectas (distractores) deben ser ALTAMENTE PLAUSIBLES, no deben ser genéricas ni obvias.
- Las opciones incorrectas deben tener un nivel de detalle y longitud similar a la correcta para que no se pueda deducir la respuesta correcta por pura intuición visual.
- NUNCA pongas la respuesta correcta siempre en el ID "2" o en la misma posición, mézclalas de manera aleatoria a través de los ejercicios.

Devuelve ÚNICAMENTE la respuesta en formato JSON estricto con esta estructura:
{
  "items": [
    {
      "question": "¿Pregunta?",
      "options": [
        { "id": "1", "text": "Distractor complejo" }, 
        { "id": "2", "text": "Respuesta correcta detallada" },
        { "id": "3", "text": "Distractor creíble" }, 
        { "id": "4", "text": "Distractor basado en un error común" }
      ],
      "correctId": "2",
      "feedback": "Breve explicación de la respuesta correcta."
    }
  ]
}
`;
    } else if (type === "boolean") {
      systemPrompt += `
Debes generar enunciados declarativos precisos. Para cada uno, indica si es verdadero o falso.
Mezcla aleatoriamente la cantidad de verdaderos y falsos (no hagas que todos sean verdaderos o todos falsos).

Devuelve ÚNICAMENTE la respuesta en formato JSON estricto con esta estructura:
{
  "items": [
    {
      "statement": "El sol gira alrededor de la tierra.",
      "correct": false,
      "feedback": "La Tierra gira alrededor del Sol."
    }
  ]
}
`;
    }

    systemPrompt += `
REGLAS ESTRICTAS:
- Genera exactamente ${count} reactivos.
- NO uses bloques markdown (como \`\`\`json), solo devuelve el texto del JSON puro.
- Asegúrate de que el JSON sea válido.
`;

    const userPrompt = `CONTEXTO PARA GENERAR EL EJERCICIO:\n\n${contextText}`;

    // 3. Llamar a la IA
    const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_SLIDES_API_KEY;
    
    // Fallback manual
    let responseText = "";
    let isSuccess = false;

    for (const modelConfig of ALUMNO_MODELS) {
      try {
        const attempt = await fetch(OPENROUTER_URL, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://plataforma.edu",
            "X-Title": "IEZ Alumno AI Exercises",
          },
          body: JSON.stringify({
            model: modelConfig.id,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt }
            ]
          }),
        });

        if (attempt.ok) {
          const data = await attempt.json();
          responseText = data.choices[0]?.message?.content || "";
          
          if (userId && data.usage) {
            const pt = data.usage.prompt_tokens || 0;
            const ct = data.usage.completion_tokens || 0;
            const totalCost = (pt / 1_000_000) * modelConfig.costInput + (ct / 1_000_000) * modelConfig.costOutput;

            supabaseAdmin.from("ai_usage_log").insert({
              profesor_id: userId,
              chat_session_id: null,
              modelo_usado: modelConfig.id,
              tokens_entrada: pt,
              tokens_salida: ct,
              costo_usd: totalCost,
            }).then(({ error }) => { if (error) console.error("[Generar Ejercicio] ai_usage_log:", error); });

            supabaseAdmin.from("ai_token_usage").insert({
              user_id: userId,
              tipo_peticion: "generar_ejercicio_alumno",
              clase_tema: "GENERADOR_EJERCICIOS",
              prompt_tokens: pt,
              completion_tokens: ct,
              total_tokens: pt + ct,
              model_used: modelConfig.id,
              estimated_cost_usd: totalCost,
            }).then(({ error }) => { if (error) console.error("[Generar Ejercicio] ai_token_usage:", error); });
          }

          isSuccess = true;
          break;
        }
      } catch (err) {
        console.warn(`[API Generar Ejercicio] Falló el modelo ${modelConfig.id}`, err);
      }
    }

    if (!isSuccess || !responseText) {
      return NextResponse.json({ error: "No se pudo generar el ejercicio con la IA." }, { status: 502 });
    }

    // 4. Limpiar JSON y Parsear
    responseText = responseText.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
    
    try {
      const parsed = JSON.parse(responseText);
      if (!parsed.items || !Array.isArray(parsed.items)) {
        throw new Error("Estructura JSON inválida (falta items).");
      }
      return NextResponse.json(parsed);
    } catch (parseError) {
      console.error("[API Generar Ejercicio] Error parseando JSON de IA:", responseText);
      return NextResponse.json({ error: "La IA generó un formato inválido. Intenta de nuevo." }, { status: 500 });
    }

  } catch (error: any) {
    console.error("[API Generar Ejercicio] Excepción:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
