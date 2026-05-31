import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkAIServiceStatus, aiServiceDisabledResponse } from "@/utils/aiServiceValidation";

// ── Tipos ──────────────────────────────────────────────────────────────
interface ChatSession {
  id: string;
  user_id: string;
  session_name: string;
  messages: { role: string; content: string }[];
  updated_at: string;
  user_type: "alumno" | "profesor";
}

interface DeepSeekResult {
  sesiones: {
    session_id: string;
    categoria: string;
    es_alerta: boolean;
    motivo_alerta?: string;
  }[];
  categorias_detectadas: string[];
}

// ── Endpoint Principal ─────────────────────────────────────────────────
export async function POST(req: Request) {
  try {
    const { days = 15 } = await req.json();
    const numDays = Number(days);

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // ── VALIDACIÓN DE PAGO: si no hay cuota activa, no se contacta a la IA ──
    const isActive = await checkAIServiceStatus(supabaseAdmin);
    if (!isActive) {
      return aiServiceDisabledResponse();
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - numDays);
    const startDateStr = startDate.toISOString();

    // ── PASO 1: Cargar chats del período ────────────────────────────────
    const [alumnosRes, profesoresRes] = await Promise.all([
      supabaseAdmin
        .from("alumno_chat_history")
        .select("id, alumno_id, session_name, messages, updated_at")
        .gte("updated_at", startDateStr),
      supabaseAdmin
        .from("profesor_chat_history")
        .select("id, profesor_id, session_name, messages, updated_at")
        .gte("updated_at", startDateStr),
    ]);

    if (alumnosRes.error) throw alumnosRes.error;
    if (profesoresRes.error) throw profesoresRes.error;

    // Normalizar a estructura común
    const allSessions: ChatSession[] = [
      ...(alumnosRes.data || []).map((s: any) => ({
        ...s, user_id: s.alumno_id, user_type: "alumno" as const,
      })),
      ...(profesoresRes.data || []).map((s: any) => ({
        ...s, user_id: s.profesor_id, user_type: "profesor" as const,
      })),
    ];

    if (allSessions.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No hay chats en el periodo seleccionado.",
        sesiones_nuevas: 0,
      });
    }

    // ── PASO 2: Obtener análisis anteriores (Delta Check) ───────────────
    const sessionIds = allSessions.map((s) => s.id);
    const { data: analyzed, error: analyzedErr } = await supabaseAdmin
      .from("ai_session_categories")
      .select("session_id, last_analyzed_at")
      .in("session_id", sessionIds);

    if (analyzedErr) throw analyzedErr;

    // Mapa de session_id -> fecha del último análisis
    const lastAnalyzedMap = new Map<string, string>(
      (analyzed || []).map((r: any) => [r.session_id, r.last_analyzed_at])
    );

    // ── PASO 3: Filtrar solo sesiones nuevas o modificadas ─────────────
    const sessionsToAnalyze = allSessions.filter((s) => {
      const lastAnalyzed = lastAnalyzedMap.get(s.id);
      if (!lastAnalyzed) return true; // Nunca analizada → incluir
      // Incluir solo si hubo mensajes nuevos después del último análisis
      return new Date(s.updated_at) > new Date(lastAnalyzed);
    });

    if (sessionsToAnalyze.length === 0) {
      return NextResponse.json({
        success: true,
        message: "Todo está al día. No hay mensajes nuevos que analizar.",
        sesiones_nuevas: 0,
      });
    }

    // ── PASO 4: Cargar categorías existentes (para contexto a DeepSeek) ─
    const { data: existingCats } = await supabaseAdmin
      .from("ai_session_categories")
      .select("categoria")
      .order("categoria");

    const uniqueCategories: string[] = [
      ...new Set((existingCats || []).map((r: any) => r.categoria as string)),
    ];

    // ── PASO 5: Condensar (solo prompts del usuario) ───────────────────
    const condensed = sessionsToAnalyze.map((s) => {
      const userMsgs = (s.messages || [])
        .filter((m: any) => m.role === "user")
        .map((m: any) => m.content)
        .join(" | ");
      return {
        session_id: s.id,
        mensajes_del_usuario: userMsgs,
      };
    });

    // ── PASO 6: Llamar a DeepSeek ──────────────────────────────────────
    const categoriasCtx =
      uniqueCategories.length > 0
        ? `Categorías ya existentes (úsalas si aplican, crea nuevas solo si el tema es completamente diferente):\n${uniqueCategories.join(", ")}`
        : "No hay categorías previas. Créalas libremente según los temas detectados.";

    const prompt = `Eres un auditor de seguridad para una institución educativa.
Analiza cada sesión de chat de alumnos y profesores (solo sus mensajes, no las respuestas del bot).

${categoriasCtx}

Reglas:
1. Asigna una sola categoría temática a cada sesión (ej: "Matemáticas", "Historia", "Consultas Personales", "Tecnología").
2. Marca es_alerta = true si detectas: violencia, contenido sexual, autolesión, trampas académicas graves, contenido ilegal, o temas completamente ajenos a lo educativo.
3. Si es_alerta = true, incluye motivo_alerta con una explicación breve.
4. Devuelve ÚNICAMENTE un JSON válido sin markdown con esta estructura:
{
  "sesiones": [
    { "session_id": "uuid", "categoria": "Nombre", "es_alerta": false }
  ],
  "categorias_detectadas": ["Categoría1", "Categoría2"]
}

Sesiones a analizar:
${JSON.stringify(condensed)}`;

    const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_SLIDES_API_KEY;

    const aiResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://institutoemilianozapata.edu.mx", // Required by OpenRouter
        "X-Title": "Monitoreo IA"
      },
      body: JSON.stringify({
        model: "deepseek/deepseek-v4-flash", // OpenRouter model syntax
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        response_format: { type: "json_object" },
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI API Error:", errText);
      throw new Error(`Error en el servicio de análisis: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    let result: DeepSeekResult;
    try {
      const raw = aiData.choices[0].message.content.trim()
        .replace(/^```json/g, "").replace(/```$/g, "").trim();
      result = JSON.parse(raw);
    } catch (e) {
      throw new Error("El servicio de análisis devolvió un formato inesperado");
    }

    const now = new Date().toISOString();

    // ── PASO 7: Guardar categorías (UPSERT en ai_session_categories) ────
    const sessionMap = new Map(sessionsToAnalyze.map((s) => [s.id, s]));

    const categoryUpserts = (result.sesiones || []).map((r) => {
      const session = sessionMap.get(r.session_id);
      return {
        session_id: r.session_id,
        user_id: session?.user_id || "",
        user_type: session?.user_type || "alumno",
        session_name: session?.session_name || "Sin nombre",
        categoria: r.categoria,
        last_analyzed_at: now,
      };
    });

    if (categoryUpserts.length > 0) {
      const { error: catErr } = await supabaseAdmin
        .from("ai_session_categories")
        .upsert(categoryUpserts, { onConflict: "session_id" });
      if (catErr) console.error("Error guardando categorías:", catErr);
    }

    // ── PASO 8: Guardar alertas (UPSERT en ai_red_list_alerts) ──────────
    const alertUpserts = (result.sesiones || [])
      .filter((r) => r.es_alerta && r.motivo_alerta)
      .map((r) => {
        const session = sessionMap.get(r.session_id);
        return {
          session_id: r.session_id,
          user_id: session?.user_id || "",
          user_type: session?.user_type || "alumno",
          session_name: session?.session_name || "Sin nombre",
          motivo: r.motivo_alerta!,
          fecha_chat: session?.updated_at || now,
        };
      });

    if (alertUpserts.length > 0) {
      const { error: alertErr } = await supabaseAdmin
        .from("ai_red_list_alerts")
        .upsert(alertUpserts, { onConflict: "session_id" });
      if (alertErr) console.error("Error guardando alertas:", alertErr);
    }

    return NextResponse.json({
      success: true,
      sesiones_analizadas: sessionsToAnalyze.length,
      alertas_nuevas: alertUpserts.length,
      categorias_detectadas: result.categorias_detectadas || [],
    });

  } catch (error: any) {
    console.error("Error en ia-monitoring:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
