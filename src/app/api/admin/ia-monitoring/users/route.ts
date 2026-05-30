import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type"); // 'alumno' o 'profesor'
    const userId = searchParams.get("userId"); // Opcional, para obtener el detalle de un usuario

    if (!type || (type !== "alumno" && type !== "profesor")) {
      return NextResponse.json({ error: "Tipo de usuario inválido" }, { status: 400 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // ── Si piden detalle de un usuario específico ──
    if (userId) {
      const table = type === "alumno" ? "alumno_chat_history" : "profesor_chat_history";
      const userColumn = type === "alumno" ? "alumno_id" : "profesor_id";

      const { data: chats, error } = await supabaseAdmin
        .from(table)
        .select(`
          id, session_name, messages, updated_at
        `)
        .eq(userColumn, userId)
        .order("updated_at", { ascending: false });

      if (error) throw error;

      // Obtener categorías detectadas previamente para estas sesiones
      const sessionIds = chats?.map(c => c.id) || [];
      const { data: catData } = await supabaseAdmin
        .from("ai_session_categories")
        .select("session_id, categoria, es_alerta, last_analyzed_at")
        .in("session_id", sessionIds);

      const catMap = new Map(catData?.map(c => [c.session_id, c]) || []);

      const formattedChats = chats?.map(c => ({
        ...c,
        ai_analysis: catMap.get(c.id) || null
      }));

      return NextResponse.json({ success: true, chats: formattedChats });
    }

    // ── Si piden el directorio de usuarios ──
    // Se extrae la lista de perfiles que tengan al menos 1 chat en la tabla correspondiente
    const profileTable = type === "alumno" ? "profiles" : "profesores_profiles";
    const chatTable = type === "alumno" ? "alumno_chat_history" : "profesor_chat_history";
    const fkColumn = type === "alumno" ? "alumno_id" : "profesor_id";

    // Usaremos Supabase RPC o una consulta cruzada.
    // Como las tablas pueden ser grandes, lo ideal es obtener los IDs únicos de chats, 
    // y luego hacer un in() a la tabla de perfiles.
    
    // 1. Obtener IDs únicos con conteos
    const { data: chatData, error: chatError } = await supabaseAdmin
      .from(chatTable)
      .select(fkColumn);

    if (chatError) throw chatError;

    const userCounts: Record<string, number> = {};
    chatData?.forEach(row => {
      const uid = row[fkColumn];
      if (uid) {
        userCounts[uid] = (userCounts[uid] || 0) + 1;
      }
    });

    const activeUserIds = Object.keys(userCounts);

    if (activeUserIds.length === 0) {
      return NextResponse.json({ success: true, users: [] });
    }

    // 2. Obtener perfiles
    let profilesSelect = "id, nombre, apellidos, estatus";
    if (type === "alumno") {
      profilesSelect += ", matricula";
    }

    const { data: profiles, error: profError } = await supabaseAdmin
      .from(profileTable)
      .select(profilesSelect)
      .in("id", activeUserIds)
      .ilike("estatus", "activo");

    if (profError) throw profError;

    // 3. Unir datos
    const result = profiles?.map(p => ({
      ...p,
      total_sesiones: userCounts[p.id],
      user_type: type
    })).sort((a, b) => b.total_sesiones - a.total_sesiones) || [];

    return NextResponse.json({ success: true, users: result });

  } catch (error: any) {
    console.error("Error fetching AI users:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
