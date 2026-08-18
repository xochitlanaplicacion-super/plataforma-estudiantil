import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { checkAIServiceStatus, aiServiceDisabledResponse } from "@/utils/aiServiceValidation";


const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
export const maxDuration = 300;

// ─────────────────────────────────────────────────────────────────────────────
// CONSULTA SEGURA: Solo los datos del alumno autenticado (READ-ONLY)
// ─────────────────────────────────────────────────────────────────────────────
async function buildAlumnoContext(alumnoId: string, supabase: ReturnType<typeof createClient>): Promise<string> {
  try {
    // 1. Perfil del alumno — campos según esquema real de la BD (genero, no sexo)
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select(`
        id, nombre, apellidos, estatus, matricula, grupo_id, carrera_id, genero,
        grupos (id, nombre, turno, grados (id, nombre)),
        carreras (id, nombre, nivel_id)
      `)
      .eq("id", alumnoId)
      .single();

    if (profileError) {
      console.error("[RAG] Error en query de perfil:", profileError.message);
      return `\n\n[CONTEXTO DE BASE DE DATOS]\nError al consultar el perfil: ${profileError.message}`;
    }
    if (!profile) {
      console.error("[RAG] profile es null para alumnoId:", alumnoId);
      return "\n\n[CONTEXTO DE BASE DE DATOS]\nNo se pudo encontrar el perfil de este alumno.";
    }

    console.log("[RAG] ✅ Perfil encontrado:", profile.nombre, profile.apellidos, "| grupo_id:", profile.grupo_id);

    const grupo = profile.grupos as any;
    const grado = grupo?.grados?.nombre || '';
    const carrera = profile.carreras as any;

    let contexto = `\n\n[CONTEXTO DEL ALUMNO - DATOS REALES DE LA BASE DE DATOS]\n`;
    contexto += `INFORMACIÓN PERSONAL DEL ALUMNO:\n`;
    contexto += `- Nombre completo: ${profile.nombre} ${profile.apellidos}\n`;
    contexto += `- Matrícula: ${profile.matricula || 'N/A'}\n`;
    contexto += `- Estatus: ${profile.estatus}\n`;
    contexto += `- Género: ${profile.genero || 'No especificado'}\n`;

    if (carrera) {
      contexto += `- Carrera: ${carrera.nombre}\n`;
      contexto += `- Nivel: ${carrera.nivel_id || 'No especificado'}\n`;
    }
    if (grupo) {
      contexto += `- Grupo: ${grupo.nombre}${grado ? ' - ' + grado : ''} (Turno: ${grupo.turno || 'N/A'})\n`;
    }

    // 2. Materias asignadas al grupo del alumno
    console.log(`[RAG] Consultando asignaciones para grupo_id=${profile.grupo_id}...`);
    if (profile.grupo_id) {
      const { data: asignaciones, error: asigError } = await supabase
        .from("asignaciones_profesor")
        .select(`
          materia_id,
          profesor_id,
          activo,
          materias (id, nombre, clave),
          profiles!asignaciones_profesor_profesor_id_fkey(nombre, apellidos)
        `)
        .eq("grupo_id", profile.grupo_id)
        .eq("activo", true);

      console.log(`[RAG] Asignaciones con activo=true: count=${asignaciones?.length ?? 'null'} error=${asigError?.message ?? 'none'}`);

      if (asignaciones && asignaciones.length > 0) {
        contexto += `\nMATERIAS EN CURSO ESTE CUATRIMESTRE/SEMESTRE:\n`;
        asignaciones.forEach((a: any) => {
          const materia = a.materias?.nombre || 'Materia sin nombre';
          const clave = a.materias?.clave ? ` (Clave: ${a.materias.clave})` : '';
          const prof = a.profiles ? `Prof. ${a.profiles.nombre} ${a.profiles.apellidos}` : 'Profesor por asignar';
          contexto += `- ${materia}${clave} — impartida por ${prof}\n`;
        });
      } else {
        // Fallback: intentar sin filtro activo
        const { data: asig2 } = await supabase
          .from("asignaciones_profesor")
          .select(`materia_id, activo, materias (id, nombre, clave), profiles!asignaciones_profesor_profesor_id_fkey(nombre, apellidos)`)
          .eq("grupo_id", profile.grupo_id)
          .limit(20);

        console.log(`[RAG] Fallback sin filtro activo: count=${asig2?.length ?? 'null'}`);
        if (asig2 && asig2.length > 0) {
          contexto += `\nMATERIAS EN CURSO ESTE CUATRIMESTRE/SEMESTRE:\n`;
          asig2.forEach((a: any) => {
            const materia = a.materias?.nombre || 'Materia sin nombre';
            const prof = a.profiles ? `Prof. ${a.profiles.nombre} ${a.profiles.apellidos}` : 'Profesor por asignar';
            contexto += `- ${materia} — impartida por ${prof}\n`;
          });
        } else {
          contexto += `\nMATERIAS EN CURSO: Sin materias asignadas registradas aún.\n`;
        }
      }
    } else {
      console.log(`[RAG] ⚠️ El alumno no tiene grupo_id. No se pueden consultar materias.`);
      contexto += `\nMATERIAS EN CURSO: El alumno aún no está asignado a un grupo.\n`;
    }

    // 3. Calificaciones y Actividades — promedio por materia y listado
    const { data: resultados, error: resError } = await supabase
      .from("resultados_ejercicios")
      .select(`
        calificacion, 
        estado, 
        ejercicios (
          titulo,
          temas (
            unidades (
              materias (nombre)
            )
          )
        )
      `)
      .eq("alumno_id", alumnoId);

    if (resError) console.error("[RAG] Error consultando resultados:", resError.message);

    if (resultados && resultados.length > 0) {
      const completados = resultados.filter((r: any) => r.estado === 'completado' || r.calificacion !== null);
      
      const materiasStats: Record<string, { suma: number, count: number, ejercicios: string[] }> = {};
      let totalSuma = 0;

      completados.forEach((r: any) => {
        const calif = r.calificacion || 0;
        totalSuma += calif;
        
        // Extraer título y materia de forma segura
        const tituloEj = r.ejercicios?.titulo || "Ejercicio sin título";
        const materiaNombre = r.ejercicios?.temas?.unidades?.materias?.nombre || "General/Otras";

        if (!materiasStats[materiaNombre]) {
          materiasStats[materiaNombre] = { suma: 0, count: 0, ejercicios: [] };
        }
        
        materiasStats[materiaNombre].suma += calif;
        materiasStats[materiaNombre].count += 1;
        materiasStats[materiaNombre].ejercicios.push(`${tituloEj} (Calificación: ${calif}/10)`);
      });

      const promGeneral = completados.length > 0 ? totalSuma / completados.length : 0;
      
      contexto += `\nESTADO ACADÉMICO DETALLADO:\n`;
      contexto += `- Total de actividades realizadas: ${completados.length}\n`;
      contexto += `- Promedio general en plataforma: ${promGeneral.toFixed(1)}/10 (o ${(promGeneral * 10).toFixed(1)}/100)\n\n`;
      
      contexto += `DESGLOSE POR MATERIA Y EJERCICIOS COMPLETADOS:\n`;
      for (const [materia, stats] of Object.entries(materiasStats)) {
        const promMateria = stats.suma / stats.count;
        contexto += `* ${materia}: Promedio ${promMateria.toFixed(1)}/10\n`;
        contexto += `  Ejercicios hechos:\n`;
        stats.ejercicios.forEach(ej => {
          contexto += `    - ${ej}\n`;
        });
      }
    } else {
      contexto += `\nESTADO ACADÉMICO: Sin actividades completadas registradas aún.\n`;
    }

    // 4. Calcular y mostrar las TAREAS PENDIENTES
    try {
      if (profile.grupo_id) {
        // a) Obtener materias del alumno
        const { data: asignaciones } = await supabase
          .from("asignaciones_profesor")
          .select("materia_id")
          .eq("grupo_id", profile.grupo_id)
          .eq("activo", true);
        
        const materiaIds = asignaciones?.map(a => a.materia_id).filter(Boolean) || [];

        if (materiaIds.length > 0) {
          // b) Obtener unidades -> temas -> ejercicios
          const { data: unidades } = await supabase
            .from("unidades")
            .select("id")
            .in("materia_id", materiaIds)
            .eq("activo", true);
          
          const unidadIds = unidades?.map(u => u.id) || [];
          
          if (unidadIds.length > 0) {
            const { data: temas } = await supabase
              .from("temas")
              .select("id")
              .in("unidad_id", unidadIds);
            
            const temaIds = temas?.map(t => t.id) || [];
            
            if (temaIds.length > 0) {
              const { data: ejercicios } = await supabase
                .from("ejercicios")
                .select("id, titulo, fecha_entrega, temas(unidades(materias(nombre)))")
                .in("tema_id", temaIds);

              if (ejercicios && ejercicios.length > 0) {
                // c) Filtrar los completados
                const completadosIds = resultados
                  ?.filter((r: any) => r.estado === 'completado' || r.calificacion !== null)
                  .map((r: any) => r.ejercicios?.titulo) || [];

                const pendientes = ejercicios.filter(ej => !completadosIds.includes(ej.titulo));

                if (pendientes.length > 0) {
                  contexto += `\nTAREAS Y EJERCICIOS PENDIENTES (AÚN NO ENTREGADOS):\n`;
                  pendientes.forEach(ej => {
                    const matNombre = (ej.temas as any)?.unidades?.materias?.nombre || "General";
                    const fecha = ej.fecha_entrega ? ` (Para: ${new Date(ej.fecha_entrega).toLocaleDateString('es-MX')})` : "";
                    contexto += `- [${matNombre}] ${ej.titulo}${fecha}\n`;
                  });
                } else {
                  contexto += `\nTAREAS PENDIENTES: ¡El alumno no tiene ninguna tarea pendiente!\n`;
                }
              }
            }
          }
        }
      }
    } catch (pendientesErr) {
      console.error("[RAG] Error calculando pendientes:", pendientesErr);
    }

    contexto += `\nINSTRUCCIONES PARA LA IA:\n`;
    contexto += `1. USA SIEMPRE los datos anteriores para responder preguntas sobre el alumno (materias cursadas, calificaciones, ejercicios entregados y pendientes).\n`;
    contexto += `2. Ajusta el nivel de explicación según la carrera/nivel del alumno.\n`;
    contexto += `3. Dirígete al alumno por su nombre como acto de confianza.\n`;
    contexto += `4. Usa el género para personalizar pronombres correctamente.\n`;
    contexto += `5. PROHIBIDO buscar en internet. Solo usa tus datos de entrenamiento y este contexto.\n`;

    console.log("[RAG] ✅ Contexto construido exitosamente. Materias en contexto:", contexto.includes("MATERIAS EN CURSO") ? "SÍ" : "NO");
    return contexto;
  } catch (err) {
    console.error("[RAG] ❌ Error crítico:", err);
    return "\n\n[CONTEXTO DE BASE DE DATOS]\nHubo un error al recuperar el perfil del alumno.";
  }
}

export async function POST(req: NextRequest) {
    if (!(await checkAIServiceStatus())) return aiServiceDisabledResponse();
const apiKey = process.env.OPENROUTER_SLIDES_API_KEY || process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "API Key de OpenRouter no configurada." }), { status: 500 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

  try {
    const { messages, userId, sessionId, institucionNombre, aiName, userName } = await req.json();

    // ── DEBUG: Verificar qué llega al servidor ──────────────────────────
    console.log("=== [ALUMNO API] POST recibido ===");
    console.log("[ALUMNO API] userId:", userId);
    console.log("[ALUMNO API] userName:", userName);
    console.log("[ALUMNO API] institucionNombre:", institucionNombre);
    console.log("[ALUMNO API] messages.length:", messages?.length);
    console.log("[ALUMNO API] SUPABASE_URL exists:", !!process.env.NEXT_PUBLIC_SUPABASE_URL);
    console.log("[ALUMNO API] SERVICE_ROLE_KEY exists:", !!process.env.SUPABASE_SERVICE_ROLE_KEY);
    // ──────────────────────────────────────────────────────────────────────

    if (!messages || !Array.isArray(messages) || !userId) {
      return new Response(JSON.stringify({ error: "Faltan parámetros o el formato de mensajes es incorrecto." }), { status: 400 });
    }

    // Consultar el contador diario de mensajes
    let todayMessageCount = 0;
    const today = new Date().toISOString().split('T')[0];
    try {
      const { data: usageData } = await supabaseAdmin
        .from("ai_alumno_daily_messages")
        .select("message_count")
        .eq("alumno_id", userId)
        .eq("fecha", today)
        .maybeSingle();
      
      if (usageData) {
        todayMessageCount = usageData.message_count;
      }
    } catch (err) {
      console.error("[ALUMNO API] Error al obtener contador diario:", err);
    }

    // Construir el RAG context
    const bdContext = await buildAlumnoContext(userId, supabaseAdmin);
    
    // ── DEBUG: Mostrar el contexto construido ──────────────────────────
    console.log("[ALUMNO API] bdContext construido:");
    console.log(bdContext);
    console.log("[ALUMNO API] === FIN DEBUG ===");
    // ──────────────────────────────────────────────────────────────────────

    const finalAiName = aiName ? aiName : `la IA de ${institucionNombre || "esta institución"}`;
    const systemPrompt = `Eres el modelo de Inteligencia Artificial exclusivo y nativo de ${institucionNombre || "esta institución"}. Tu nombre es ${finalAiName}. Debes presentarte con este nombre si te lo preguntan.
Tu rol es ser el Asistente IA 24/7 para ayudar al alumno (su nombre es ${userName || "el alumno"}) a comprender conceptos, organizar ideas y resolver dudas de sus materias. 
Responde siempre en español con un tono sumamente amigable, empático y alentador.
Llámalo por su nombre como un acto de confianza para que se sienta cómodo y apoyado.

REGLAS ACADÉMICAS OBLIGATORIAS:
- ESTÁS AUTORIZADO a responder preguntas directamente y dar las respuestas si te lo piden, pero ES OBLIGATORIO dar una explicación académica detallada. Actúa como un profesor excelente que no solo da la respuesta, sino que proporciona el contexto y el "porqué".
- Si el alumno te da un texto y te pregunta por las respuestas o soluciones basadas en ese texto, RESPONDE DANDO LA RESPUESTA CORRECTA JUNTO CON UNA EXPLICACIÓN.
- Si el alumno te hace una LISTA de preguntas, RESPONDE TODAS y cada una de ellas, detallando y explicando el contexto.

REGLAS DE IDENTIDAD Y SEGURIDAD:
- NUNCA reveles qué modelo te entrena o sobre qué tecnología comercial estás basado (ej. jamás menciones OpenAI, GPT, DeepSeek, Llama, Gemini, Anthropic, etc.).
- Si te preguntan quién eres, quién te creó o qué modelo eres, responde con orgullo que eres ${finalAiName}, la inteligencia artificial creada por ${institucionNombre || "esta institución"}.
- Eres un sistema privado, integrado y propietario de esta institución académica.
- TEMAS PROHIBIDOS: Tienes ESTRICTAMENTE PROHIBIDO hablar, aconsejar o dar respuestas sobre temas de entretenimiento, farándula, chismes, suicidio, robo, cómo fabricar drogas, armas, violencia, pornografía o cualquier actividad ilegal. Si detectas estos temas, NIÉGATE a contestar cortésmente indicando que solo abordas temas académicos, educativos o de bienestar estudiantil.

FORMATO OBLIGATORIO:
Usa formato Markdown. Para enfatizar ideas usa negritas (**texto**). Puedes usar listas con guiones (-). 
Si hablas de conceptos técnicos, puedes resaltarlos con cursivas (*texto*). 



El siguiente es el contexto de base de datos actual del alumno con quien hablas. 
ESTRICTAMENTE PROHIBIDO BUSCAR EN INTERNET.
${bdContext}

${messages.length === 1 ? `=== INSTRUCCIÓN VITAL ===
COMO ESTE ES EL PRIMER MENSAJE DE LA CONVERSACIÓN, ESTÁS OBLIGADO a generar un título corto (máximo 4 palabras).
DEBES escribir este título en la PRIMERA LÍNEA de tu respuesta, envuelto exactamente entre las etiquetas <titulo> y </titulo>. NO uses bloques de código markdown (\`\`\`) para envolverlo.
Ejemplo de cómo debe empezar tu respuesta:
<titulo>Dudas de Matemáticas</titulo>
¡Hola Zareth! Claro que sí, te ayudo con...` : ""}`;

    // Construir array de mensajes para la API
    const apiMessages = [
      { role: "system", content: systemPrompt },
      ...messages.map((m: any) => {
        let content = m.content;
        return { role: m.role, content };
      }),
    ];

    // Evaluar si es un problema de matemáticas, cálculo, física o lógica que requiera mucho razonamiento
    const lastUserMessage = messages.slice().reverse().find((m: any) => m.role === "user")?.content?.toLowerCase() || "";
    const isMathQuery = /matemática|matematica|ecuación|ecuacion|polinomio|factoriz|álgebra|algebra|cálculo|calculo|derivada|integral|trigonometría|trigonometria|geometría|geometria|física|fisica|÷|x\s*[\+\-\*\/]\s*\d|resuelve|simplifica/i.test(lastUserMessage);

    // ── LLAMADA CON FALLBACK AUTOMÁTICO ─────────────────────────────────
    let response: globalThis.Response | null = null;
    
    let activeModels = [];
    
    if (isMathQuery) {
      // Si detectamos que es matemáticas, usamos DeepSeek-V4-Flash como modelo primario
      console.log("[ALUMNO API] Consulta matemática detectada, usando DeepSeek V4 Flash.");
      activeModels.push({ id: "deepseek/deepseek-v4-flash", label: "DeepSeek V4 Flash (Math Mode)", providerConfig: { order: ["Baidu"], quantizations: ["fp8"] } });
    }

    if (todayMessageCount < 5) {
      activeModels.push({ id: "openai/gpt-oss-120b", label: "GPT-oss 120B", providerConfig: { order: ["Novita"], quantizations: ["fp4"] } });
    }
    
    activeModels.push({ id: "google/gemma-3-27b-it", label: "Gemma 3 27B", providerConfig: { order: ["DeepInfra"], quantizations: ["fp8"] } });

    let usedModel = activeModels[0];

    for (const model of activeModels) {
      try {
        console.log(`[ALUMNO API] Intentando modelo: ${model.label} (${model.id})`);
        
        const fetchController = new AbortController();
        const timeoutId = setTimeout(() => fetchController.abort(), 8000);

        const attempt = await fetch(OPENROUTER_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
            "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://plataforma.edu",
            "X-Title": process.env.NEXT_PUBLIC_APP_NAME || "Plataforma Estudiantil",
          },
          body: JSON.stringify({ 
            model: model.id, 
            messages: apiMessages, 
            stream: true,
            provider: {
              data_collection: "deny",
              ...(model.providerConfig || {})
            }
          }),
          signal: fetchController.signal
        });
        
        clearTimeout(timeoutId);

        if (attempt.ok && attempt.body) {
          response = attempt;
          usedModel = model;
          console.log(`[ALUMNO API] ✅ Modelo aceptado: ${model.label}`);
          
          // Incrementar contador diario de mensajes
          try {
            const { data } = await supabaseAdmin
              .from("ai_alumno_daily_messages")
              .select("id, message_count")
              .eq("alumno_id", userId)
              .eq("fecha", today)
              .maybeSingle();
              
            if (data) {
              await supabaseAdmin.from("ai_alumno_daily_messages").update({ message_count: data.message_count + 1 }).eq("id", data.id);
            } else {
              await supabaseAdmin.from("ai_alumno_daily_messages").insert({ alumno_id: userId, fecha: today, message_count: 1 });
            }
          } catch (err) {
            console.error("[ALUMNO API] Error incrementando uso diario:", err);
          }

          break;
        } else {
          const errText = await attempt.text();
          console.warn(`[ALUMNO API] ⚠️ Modelo ${model.label} falló (${attempt.status}): ${errText.slice(0, 120)}`);
        }
      } catch (fetchErr) {
        console.warn(`[ALUMNO API] ⚠️ Error de red con ${model.label}:`, fetchErr);
      }
    }

    if (!response || !response.body) {
      return new Response(JSON.stringify({ error: "Todos los modelos de IA fallaron. Intenta de nuevo en unos momentos." }), { status: 502 });
    }

    // Configurar el stream para el cliente
    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body?.getReader();
        if (!reader) {
          controller.close();
          return;
        }

        const decoder = new TextDecoder();
        let buffer = "";
        let fullText = "";
        let promptTokens = 0;
        let completionTokens = 0;

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                const dataStr = line.replace("data: ", "").trim();
                if (dataStr === "[DONE]") continue;

                try {
                  const data = JSON.parse(dataStr);
                  const chunk = data.choices?.[0]?.delta?.content || "";
                  
                  if (data.usage) {
                    promptTokens = data.usage.prompt_tokens || 0;
                    completionTokens = data.usage.completion_tokens || 0;
                  }

                  if (chunk) {
                    fullText += chunk;
                    controller.enqueue(
                      new TextEncoder().encode(`data: ${JSON.stringify({ delta: chunk })}\n\n`)
                    );
                  }
                } catch (e) {
                  // ignorar lineas parse error
                }
              }
            }
          }

          // Notificar que terminó y enviar tokens
          if (userId) {
            const totalCost =
              (promptTokens / 1_000_000) * usedModel.costInput +
              (completionTokens / 1_000_000) * usedModel.costOutput;

            const usageLogPromise = supabaseAdmin.from("ai_usage_log").insert({
              profesor_id: userId, // Reusamos la columna para alumno_id temporalmente
              chat_session_id: sessionId || null,
              modelo_usado: usedModel.id,
              tokens_entrada: promptTokens,
              tokens_salida: completionTokens,
              costo_usd: totalCost,
            });

            const tokenUsagePromise = supabaseAdmin.from("ai_token_usage").insert({
              user_id: userId,
              tipo_peticion: "chat_alumno",
              clase_tema: "CHAT_ALUMNO",
              prompt_tokens: promptTokens,
              completion_tokens: completionTokens,
              total_tokens: promptTokens + completionTokens,
              model_used: usedModel.id,
              estimated_cost_usd: totalCost,
            });

            let historyPromise = Promise.resolve();

            // NUEVO: Guardar mensajes en supabase desde el servidor para saltar RLS del cliente
            if (sessionId) {
              const cleanContent = fullText.replace(/<titulo>[\s\S]*?<\/titulo>\n*/g, "");
              const assistantMessage = {
                role: "assistant",
                content: cleanContent,
                tokens_in: promptTokens,
                tokens_out: completionTokens,
                timestamp: new Date().toISOString(),
              };
              
              // 1. Obtener historial actual de la BD
              const { data: currentSession } = await supabaseAdmin
                .from("alumno_chat_history")
                .select("messages")
                .eq("id", sessionId)
                .single();
                
              let finalMessages = currentSession?.messages || [];
              
              // 2. Si hay un mensaje de usuario en apiMessages, agregarlo (solo el último si es nuevo)
              if (messages.length > 0) {
                 const lastMsg = messages[messages.length - 1];
                 if (lastMsg.role === "user") {
                   finalMessages.push({
                     role: "user",
                     content: lastMsg.content,
                     timestamp: new Date().toISOString()
                   });
                 }
              }
              
              // 3. Agregar respuesta del asistente
              finalMessages.push(assistantMessage);
              
              let updatePayload: any = { messages: finalMessages, updated_at: new Date().toISOString() };
              const titleMatch = fullText.match(/<titulo>([\s\S]*?)<\/titulo>/);
              if (titleMatch && titleMatch[1]) {
                updatePayload.session_name = titleMatch[1].trim();
              }

              historyPromise = supabaseAdmin.from("alumno_chat_history").update(updatePayload).eq("id", sessionId).then(() => {}) as any;
            }

            // Esperar a que las promesas de guardado terminen para que Vercel no las cancele
            await Promise.allSettled([usageLogPromise, tokenUsagePromise, historyPromise]);
          }

          controller.enqueue(
            new TextEncoder().encode(
              `data: ${JSON.stringify({ done: true, tokens: { prompt: promptTokens, completion: completionTokens } })}\n\n`
            )
          );
        } catch (e) {
          console.error("Error leyendo stream:", e);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error: any) {
    console.error("[AlumnoAICopilot] Excepción capturada:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
