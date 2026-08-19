import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkAIServiceStatus, aiServiceDisabledResponse } from "@/utils/aiServiceValidation";


const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "openai/gpt-oss-120b"; // Modelo gratuito sugerido para generar titulo

export async function POST(req: NextRequest) {
    if (!(await checkAIServiceStatus())) return aiServiceDisabledResponse();
const apiKey = process.env.OPENROUTER_SLIDES_API_KEY || process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "API Key de OpenRouter no configurada." }), { status: 500 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  const supabaseAdmin = await createServerSupabaseClient();

  try {
    const { message, sessionId } = await req.json();

    if (!message || !sessionId) {
      return new Response(JSON.stringify({ error: "Faltan parametros." }), { status: 400 });
    }

    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://plataforma.edu",
        "X-Title": "IEZ Copilot"
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: "system",
            content: "Genera un título corto y conciso (máximo 4 palabras) para esta conversación basado en el mensaje del usuario. No uses comillas. Solo devuelve el título."
          },
          {
            role: "user",
            content: message
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error("Error en OpenRouter");
    }

    const data = await response.json();
    let title = data.choices?.[0]?.message?.content?.trim() || "Nueva conversación";
    
    // Quitar comillas si el modelo las agregó
    if (title.startsWith('"') && title.endsWith('"')) {
      title = title.substring(1, title.length - 1);
    }

    // Actualizar la base de datos
    await supabaseAdmin
      .from("profesor_chat_history")
      .update({ session_name: title })
      .eq("id", sessionId);

    return new Response(JSON.stringify({ title }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error: any) {
    console.error("[Copilot Title] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
