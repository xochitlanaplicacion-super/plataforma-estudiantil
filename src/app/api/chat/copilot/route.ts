import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// Los modelos se definen dinámicamente dentro de la función POST según la cuota de búsqueda.

// ─────────────────────────────────────────────────────────────────────────────
// CONSULTA SEGURA: Solo los datos del profesor autenticado (READ-ONLY)
// La IA NUNCA toca la base de datos directamente. El servidor consulta,
// filtra por profesor_id y entrega un resumen de texto al modelo.
// ─────────────────────────────────────────────────────────────────────────────
async function buildProfesorContext(profesorId: string, supabase: ReturnType<typeof createClient>): Promise<string> {
  try {
    // 1. Asignaciones del profesor (grupos y materias que imparte)
    const { data: asignaciones } = await supabase
      .from("asignaciones_profesor")
      .select(`grupo_id, materia_id, grupos (id, nombre, turno, grados (nombre)), materias (id, nombre, clave)`)
      .eq("profesor_id", profesorId)
      .eq("activo", true);

    if (!asignaciones || asignaciones.length === 0) {
      return "\n\n[CONTEXTO DE BASE DE DATOS]\nEste profesor aun no tiene grupos o materias asignadas en el sistema.";
    }

    const grupoIds = [...new Set(asignaciones.map((a: any) => a.grupo_id).filter(Boolean))] as string[];
    const materiaIds = [...new Set(asignaciones.map((a: any) => a.materia_id).filter(Boolean))] as string[];

    // 2. Alumnos de los grupos del profesor
    const { data: alumnos } = await supabase
      .from("profiles")
      .select("id, nombre, apellidos, matricula, grupo_id, grupos(nombre)")
      .in("grupo_id", grupoIds)
      .eq("rol", "alumno")
      .eq("estatus", "activo")
      .order("apellidos");

    const alumnoIds = (alumnos || []).map((a: any) => a.id) as string[];

    // 3. Ejercicios de las materias del profesor
    const { data: unidades } = await supabase.from("unidades").select("id").in("materia_id", materiaIds);
    const unidadIds = (unidades || []).map((u: any) => u.id) as string[];

    const { data: temas } = await supabase.from("temas").select("id, titulo").in("unidad_id", unidadIds);
    const temaIds = (temas || []).map((t: any) => t.id) as string[];

    const { data: ejercicios } = await supabase.from("ejercicios").select("id, titulo, tipo, tema_id").in("tema_id", temaIds);
    const ejercicioIds = (ejercicios || []).map((e: any) => e.id) as string[];

    // 3b. Preguntas de los ejercicios (para saber qué conceptos se evalúan exactamente)
    let preguntasPorEjercicio: Record<string, string[]> = {};
    if (ejercicioIds.length > 0) {
      const { data: preguntas } = await supabase
        .from("preguntas")
        .select("ejercicio_id, texto, respuesta_correcta")
        .in("ejercicio_id", ejercicioIds)
        .limit(200);
      if (preguntas) {
        preguntas.forEach((p: any) => {
          if (!preguntasPorEjercicio[p.ejercicio_id]) preguntasPorEjercicio[p.ejercicio_id] = [];
          preguntasPorEjercicio[p.ejercicio_id].push(`"${p.texto}" (Resp. correcta: ${p.respuesta_correcta || "N/D"})`);
        });
      }
    }

    // 3c. Presentaciones (slides) creadas por el profesor, agrupadas por tema
    let slidesPorTema: Record<string, string[]> = {};
    if (temaIds.length > 0) {
      const { data: slides } = await supabase
        .from("slides")
        .select("tema_id, titulo, contenido")
        .in("tema_id", temaIds)
        .eq("created_by", profesorId)
        .limit(100);
      if (slides) {
        slides.forEach((s: any) => {
          if (!slidesPorTema[s.tema_id]) slidesPorTema[s.tema_id] = [];
          // Extraer texto del contenido JSON sin romper todo si falla
          let textoSlide = s.titulo || "";
          try {
            const parsed = typeof s.contenido === "string" ? JSON.parse(s.contenido) : s.contenido;
            // Extraer texto de elementos tipo text/bullet
            if (parsed?.elements) {
              const textos = parsed.elements
                .filter((el: any) => ["text", "bullet_list", "title"].includes(el.type))
                .map((el: any) => el.content || el.text || "")
                .filter(Boolean)
                .join(" | ");
              if (textos) textoSlide += `: ${textos.substring(0, 200)}`;
            }
          } catch { /* ignorar */ }
          slidesPorTema[s.tema_id].push(textoSlide);
        });
      }
    }

    // 4. Resultados de calificaciones con el histórico de intentos para analizar debilidades
    let resultados: any[] = [];
    if (alumnoIds.length > 0 && ejercicioIds.length > 0) {
      const { data: res } = await supabase
        .from("resultados_ejercicios")
        .select("alumno_id, ejercicio_id, calificacion, aciertos, total_preguntas, intentos, historico_intentos")
        .in("alumno_id", alumnoIds)
        .in("ejercicio_id", ejercicioIds);
      resultados = res || [];
    }

    // Análisis de debilidades y errores comunes
    const debilidadesAlumnos: Record<string, string[]> = {};
    const debilidadesGlobales: Record<string, number> = {};

    resultados.forEach((r: any) => {
      if (r.historico_intentos && Array.isArray(r.historico_intentos)) {
        // Analizar el último intento de cada ejercicio
        const ultimoIntento = r.historico_intentos[r.historico_intentos.length - 1];
        if (ultimoIntento && ultimoIntento.detalles && Array.isArray(ultimoIntento.detalles)) {
          // Extraer errores (esCorrecto === false o indefinido si es formato antiguo)
          const errores = ultimoIntento.detalles.filter((d: any) => d.esCorrecto === false || d.esCorrecto === undefined);
          if (errores.length > 0) {
            const ejTitle = ejercicios?.find((e: any) => e.id === r.ejercicio_id)?.titulo || "Ejercicio";
            const temasFallados = errores.slice(0, 3).map((d: any) => {
              let detalle = d.reactivo || "Concepto desconocido";
              if (d.respuesta_alumno && d.respuesta_correcta) {
                detalle += ` (Su respuesta: "${d.respuesta_alumno}" | Correcta: "${d.respuesta_correcta}")`;
              }
              return detalle;
            });

            if (!debilidadesAlumnos[r.alumno_id]) debilidadesAlumnos[r.alumno_id] = [];
            debilidadesAlumnos[r.alumno_id].push(`${ejTitle} (Intentos: ${r.intentos || 1}): falló en -> ${temasFallados.join("; ")}`);

            debilidadesGlobales[ejTitle] = (debilidadesGlobales[ejTitle] || 0) + 1;
          }
        }
      }
    });

    // Top 5 temas más difíciles a nivel global
    const topDebilidadesGlobales = Object.entries(debilidadesGlobales)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([titulo, count]) => `- ${titulo} (${count} alumnos presentaron errores recientes en este tema)`);

    // Resumen de grupos y materias
    const gruposInfo = asignaciones.map((a: any) => {
      const grupoNombre = (a as any).grupos?.nombre || "Grupo sin nombre";
      const gradoNombre = (a as any).grupos?.grados?.nombre || "";
      const materiaNombre = (a as any).materias?.nombre || "Materia sin nombre";
      return `- ${materiaNombre} -> Grupo: ${grupoNombre} ${gradoNombre} (Turno: ${(a as any).grupos?.turno || "N/D"})`;
    }).join("\n");

    // Promedio por alumno
    const promediosPorAlumno = (alumnos || []).map((alumno: any) => {
      const res = resultados.filter((r: any) => r.alumno_id === alumno.id);
      const promedio = res.length > 0
        ? (res.reduce((s: number, r: any) => s + (r.calificacion || 0), 0) / res.length).toFixed(1)
        : null;
      return {
        id: alumno.id,
        nombre: `${alumno.nombre} ${alumno.apellidos}`,
        matricula: alumno.matricula || "N/D",
        grupo: (alumno as any).grupos?.nombre || "Sin grupo",
        grupoId: alumno.grupo_id,
        promedio,
        totalEjercicios: res.length,
      };
    });

    const conCalificacion = promediosPorAlumno.filter((a) => a.promedio !== null);
    const ordenados = [...conCalificacion].sort((a, b) => parseFloat(b.promedio as string) - parseFloat(a.promedio as string));
    const top5 = ordenados.slice(0, 5);
    const bottom5 = ordenados.slice(-5).reverse();

    // Estadisticas por grupo
    const estadisticasPorGrupo = grupoIds.map((gId) => {
      const alumnosGrupo = promediosPorAlumno.filter((a) => a.grupoId === gId);
      const grupoNombre = alumnosGrupo[0]?.grupo || gId;
      const conNota = alumnosGrupo.filter((a) => a.promedio !== null);
      const promedioGrupo = conNota.length > 0
        ? (conNota.reduce((s, a) => s + parseFloat(a.promedio as string), 0) / conNota.length).toFixed(1)
        : "Sin datos";
      return `- Grupo ${grupoNombre}: ${alumnosGrupo.length} alumnos activos, promedio general: ${promedioGrupo}/100`;
    }).join("\n");

    return `

[CONTEXTO DE BASE DE DATOS - SOLO LECTURA - DATOS EXCLUSIVOS DEL PROFESOR]
IMPORTANTE: Esta informacion es REAL y proviene de la base de datos de la institucion. Usala para responder preguntas del profesor sobre sus grupos y alumnos. NO puedes modificar estos datos bajo ningun motivo. Solo puedes analizarlos y dar recomendaciones.

## Materias y Grupos asignados a este profesor:
${gruposInfo}

## Estadisticas generales por grupo:
${estadisticasPorGrupo || "Sin datos suficientes aun."}

## Temas o Ejercicios donde los alumnos estan teniendo mayores dificultades recientemente:
${topDebilidadesGlobales.length > 0 ? topDebilidadesGlobales.join("\n") : "No se han detectado patrones de error recientes."}

## Top 5 alumnos con mejor promedio (de todos sus grupos):
${top5.length > 0
  ? top5.map((a, i) => `${i + 1}. ${a.nombre} | Grupo: ${a.grupo} | Matricula: ${a.matricula} | Promedio: ${a.promedio}/100 | Ejercicios completados: ${a.totalEjercicios}`).join("\n")
  : "No hay calificaciones registradas aun."}

## 5 alumnos con menor promedio (posibles candidatos a apoyo extra o planes de accion):
${bottom5.length > 0 && conCalificacion.length >= 5
  ? bottom5.map((a, i) => {
      const errores = debilidadesAlumnos[a.id] ? debilidadesAlumnos[a.id].slice(0, 4).join(" || ") : "Sin detalles de errores recientes";
      return `${i + 1}. ${a.nombre} | Grupo: ${a.grupo} | Matricula: ${a.matricula} | Promedio: ${a.promedio}/100 | Ejercicios completados: ${a.totalEjercicios}\n   Dificultades detalladas: ${errores}`;
    }).join("\n\n")
  : "No hay suficientes datos para esta seccion aun."}

## Resumen global:
- Total de alumnos activos en sus grupos: ${(alumnos || []).length}
- Total de ejercicios publicados en sus materias: ${ejercicios?.length || 0}
- Total de ejercicios completados por sus alumnos: ${resultados.length}

## Presentaciones (Slides) creadas por el profesor, por tema:
${temas && temas.length > 0
  ? temas.map((t: any) => {
      const slidesDelTema = slidesPorTema[t.id];
      if (!slidesDelTema || slidesDelTema.length === 0) return null;
      return `### Tema: ${t.titulo}\n${slidesDelTema.map(s => `  - ${s}`).join("\n")}`;
    }).filter(Boolean).join("\n\n") || "No hay presentaciones registradas aún."
  : "No hay temas registrados."}

## Ejercicios y sus preguntas clave (para identificar qué conceptos evalúa cada ejercicio):
${ejercicios && ejercicios.length > 0
  ? ejercicios.map((e: any) => {
      const preguntas = preguntasPorEjercicio[e.id];
      const tema = temas?.find((t: any) => t.id === e.tema_id)?.titulo || "Tema desconocido";
      if (!preguntas || preguntas.length === 0) return `- Ejercicio: "${e.titulo}" (Tema: ${tema}, Tipo: ${e.tipo}) — Sin preguntas registradas`;
      return `- Ejercicio: "${e.titulo}" (Tema: ${tema}, Tipo: ${e.tipo})\n  Preguntas: ${preguntas.slice(0, 3).join(" | ")}`;
    }).join("\n")
  : "No hay ejercicios registrados aún."}
[FIN DEL CONTEXTO DE BASE DE DATOS]`;

  } catch (err: any) {
    console.error("[Copilot] Error construyendo contexto:", err.message);
    return "\n\n[CONTEXTO DE BASE DE DATOS]\nNo se pudo cargar la informacion academica en este momento.";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENROUTER_SLIDES_API_KEY || process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "API Key de OpenRouter no configurada." }), { status: 500 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Cuerpo de la solicitud invalido." }), { status: 400 });
  }

  const { messages, userId, sessionId, institucionNombre, userName } = body;

  if (!messages || !Array.isArray(messages)) {
    return new Response(JSON.stringify({ error: "Se requiere el campo 'messages'." }), { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

  // Consulta segura del contexto academico del profesor (READ-ONLY, filtrado por su ID)
  let profesorContext = "";
  if (userId) {
    profesorContext = await buildProfesorContext(userId, supabaseAdmin);
  }

  const schoolName = institucionNombre || "tu institucion educativa";
  const nameDirective = userName ? `\nEl profesor con el que estás hablando se llama ${userName}. Como gesto de confianza y cercanía, llámalo por su nombre de forma respetuosa.` : "";

  // Consultar cuántas búsquedas web ha hecho el profesor hoy
  let todaySearchCount = 0;
  if (userId) {
    const today = new Date().toISOString().split('T')[0];
    const { data: searchData } = await supabaseAdmin
      .from("ai_daily_web_searches")
      .select("search_count")
      .eq("profesor_id", userId)
      .eq("fecha", today)
      .maybeSingle();
    if (searchData) {
      todaySearchCount = searchData.search_count;
    }
  }

  const canUseWebSearch = todaySearchCount < 2;

  let webSearchInstruction = "";
  if (canUseWebSearch) {
    webSearchInstruction = "\n10. Tienes ACCESO A INTERNET mediante búsqueda web. Si el profesor te pide recursos, planes de acción, sugerencias de ejercicios externos, artículos, o información actualizada para apoyar a sus alumnos, ¡usa tu herramienta de búsqueda web para encontrar e incluir enlaces y recursos reales y útiles!";
  } else {
    webSearchInstruction = "\n10. IMPORTANTE: Tu acceso a internet está deshabilitado temporalmente. Debes responder con la mayor calidad posible basándote estrictamente en tu conocimiento interno. No menciones bajo ninguna circunstancia que no tienes acceso a internet o que no puedes buscar, simplemente disimula y da la mejor respuesta posible que puedas inventar o recordar.";
  }

  const systemPrompt = `Eres el Asistente de Inteligencia Artificial oficial de ${schoolName}. Tu mision es apoyar exclusivamente a los profesores en sus labores academicas.${nameDirective}

REGLAS ABSOLUTAS que JAMAS debes romper:
1. NUNCA menciones el nombre de tu modelo base (no digas DeepSeek, Gemini, Qwen, GPT, Claude, ni ningun otro).
2. NUNCA digas a que empresa perteneces tecnicamente (Google, Alibaba, Anthropic, OpenAI, etc.).
3. Si alguien te pregunta que modelo eres, responde: "Soy el Asistente IA de ${schoolName}, desarrollado exclusivamente para nuestra institucion."
4. Responde siempre en espanol de Mexico, con lenguaje profesional pero calido.
5. Usa Markdown (titulos, tablas, listas, negritas) cuando mejore la legibilidad.
6. SOLO puedes LEER y ANALIZAR los datos del contexto. JAMAS sugieras ni simules modificar, borrar o insertar registros en la base de datos.
7. Cuando el profesor pregunte sobre sus alumnos, grupos o calificaciones, USA los datos reales del contexto adjunto. No los inventes. Si puedes inferir planes de mejora hazlo a partir de "Dificultades detectadas" y "Temas o Ejercicios donde los alumnos estan teniendo mayores dificultades".
8. Si el profesor pregunta sobre datos que no son suyos (otro profesor, otro grupo que no le pertenece), responde que no tienes acceso a esa informacion por razones de privacidad.
9. Si el profesor te pide hacer cambios en la base de datos (agregar alumno, cambiar calificacion, etc.), explica amablemente que no puedes realizar modificaciones desde el chat por seguridad, y que debe hacerlo desde el panel de administracion.${webSearchInstruction}

${profesorContext}

${messages.length === 1 ? `=== INSTRUCCIÓN VITAL ===
COMO ESTE ES EL PRIMER MENSAJE DE LA CONVERSACIÓN, ESTÁS OBLIGADO a generar un título corto (máximo 4 palabras).
DEBES escribir este título en la PRIMERA LÍNEA de tu respuesta, envuelto exactamente entre las etiquetas <titulo> y </titulo>. NO uses bloques de código markdown (\`\`\`) para envolverlo.
Ejemplo de cómo debe empezar tu respuesta:
<titulo>Planeación de Historia</titulo>
¡Hola profe! Claro que sí, te ayudo con...` : ""}`;

  // Limitar historial a los últimos 6 mensajes (3 del usuario y 3 del asistente)
  const recentMessages = messages.slice(-6);

  const fullMessagesPayload = [
    { role: "system", content: systemPrompt },
    ...recentMessages,
  ];

  let lastError = "Error desconocido";

  // ORQUESTACIÓN MULTI-MODELO:
  // Si tiene oportunidad de búsqueda, usamos DeepSeek V4 Flash (mejor razonamiento para búsquedas)
  // Si ya agotó sus búsquedas, ahorramos usando Qwen 3.5 Flash (excelente redacción interna)
  const activeModels = canUseWebSearch
    ? [{ id: "deepseek/deepseek-v4-flash", costInput: 0.14, costOutput: 0.28 }]
    : [{ id: "qwen/qwen3.5-flash-02-23", costInput: 0.065, costOutput: 0.26 }];

  for (const model of activeModels) {
    try {
      const response = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://iez.edu.mx",
          "X-Title": "IEZ Platform - Copiloto Profesor",
        },
        body: JSON.stringify({
          model: model.id,
          messages: fullMessagesPayload,
          stream: true,
          provider: { data_collection: "deny" },
          ...(canUseWebSearch ? { plugins: [{ id: "web", max_results: 5 }] } : {})
        }),
      });

      if (!response.ok || !response.body) {
        const errText = await response.text();
        console.warn(`[Copilot] Fallo ${model.id}:`, errText);
        lastError = errText;
        continue;
      }

      const encoder = new TextEncoder();
      let fullText = "";
      let promptTokens = 0;
      let completionTokens = 0;
      let didWebSearch = false;

      const stream = new ReadableStream({
        async start(controller) {
          const reader = response.body!.getReader();
          const decoder = new TextDecoder();

          let buffer = "";

          try {
            // ── Phase 1: Read the stream from OpenRouter ──
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
                      promptTokens = data.usage.prompt_tokens || promptTokens;
                      completionTokens = data.usage.completion_tokens || completionTokens;
                    }

                    if (chunk) {
                      fullText += chunk;
                      controller.enqueue(
                        encoder.encode(`data: ${JSON.stringify({ delta: chunk })}\n\n`)
                      );
                    }
                  } catch (e) {
                    // ignorar lineas parse error
                  }
                }
              }
            }

            // ── Phase 3: Save to Supabase and send done signal ──
            if (userId && supabaseUrl && supabaseKey) {
              const totalCost =
                (promptTokens / 1_000_000) * model.costInput +
                (completionTokens / 1_000_000) * model.costOutput;

              const hasLink = /(https?:\/\/|www\.|[a-zA-Z0-9-]+\.(com|es|mx|net|org|edu|gob)\b)/i.test(fullText);
              if (canUseWebSearch && hasLink) didWebSearch = true;

              if (didWebSearch) {
                const today = new Date().toISOString().split('T')[0];
                supabaseAdmin.from("ai_daily_web_searches").upsert(
                  { profesor_id: userId, fecha: today, search_count: todaySearchCount + 1 },
                  { onConflict: 'profesor_id, fecha' }
                ).then(({ error }: any) => {
                  if (error) console.error("[Copilot] Error upsert web search:", error);
                });
              }

              const usageLogPromise = supabaseAdmin.from("ai_usage_log").insert({
                profesor_id: userId, chat_session_id: sessionId || null,
                modelo_usado: model.id, tokens_entrada: promptTokens,
                tokens_salida: completionTokens, costo_usd: totalCost,
              });

              const tokenUsagePromise = supabaseAdmin.from("ai_token_usage").insert({
                user_id: userId, tipo_peticion: "chat_profesor",
                clase_tema: "CHAT_PROFESOR", prompt_tokens: promptTokens,
                completion_tokens: completionTokens, total_tokens: promptTokens + completionTokens,
                model_used: model.id, estimated_cost_usd: totalCost,
              });

              let historyPromise = Promise.resolve();

              if (sessionId) {
                const cleanContent = fullText.replace(/<titulo>[\s\S]*?<\/titulo>\n*/g, "");
                const assistantMessage = {
                  role: "assistant", content: cleanContent,
                  tokens_in: promptTokens, tokens_out: completionTokens,
                  timestamp: new Date().toISOString(),
                };
                
                const { data: currentSession } = await supabaseAdmin
                  .from("profesor_chat_history")
                  .select("messages")
                  .eq("id", sessionId)
                  .single();
                  
                let finalMessages = currentSession?.messages || [];
                if (messages.length > 0) {
                   const lastMsg = messages[messages.length - 1];
                   if (lastMsg.role === "user") {
                     finalMessages.push({ role: "user", content: lastMsg.content, timestamp: new Date().toISOString() });
                   }
                }
                
                finalMessages.push(assistantMessage);
                
                let updatePayload: any = { messages: finalMessages, updated_at: new Date().toISOString() };
                const titleMatch = fullText.match(/<titulo>([\s\S]*?)<\/titulo>/);
                if (titleMatch && titleMatch[1]) updatePayload.session_name = titleMatch[1].trim();

                historyPromise = supabaseAdmin.from("profesor_chat_history").update(updatePayload).eq("id", sessionId).then(() => {}) as any;
              }

              await Promise.allSettled([usageLogPromise, tokenUsagePromise, historyPromise]);
            }

            controller.enqueue(encoder.encode(
              `data: ${JSON.stringify({ done: true, fullText, modelUsed: model.id, tokens: { prompt: promptTokens, completion: completionTokens } })}\n\n`
            ));
          } catch (streamError) {
            console.error("[Copilot] Error en stream:", streamError);
            controller.error(streamError);
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
          "X-Model-Used": model.id,
        },
      });
    } catch (err: any) {
      console.warn(`[Copilot] Excepcion con ${model.id}:`, err.message);
      lastError = err.message;
    }
  }

  return new Response(
    JSON.stringify({ error: `Todos los modelos fallaron. Ultimo error: ${lastError}` }),
    { status: 503 }
  );
}
