import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = 'force-dynamic';

const BUCKET = "logos-institucion";

// Helper centralizado para escanear y calcular los huérfanos globalmente
async function getOrphans() {
  const supabaseAuth = await createServerSupabaseClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { data: profile } = await supabaseAuth.from("profiles").select("rol").eq("id", user.id).single();
  if (!profile || !["admin", "superuser"].includes(profile.rol)) {
    throw new Error("No autorizado");
  }

  // Usar service role para invocar el RPC y borrar archivos
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ukozogwobyucfaizkvlt.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );

  // ── 1. Obtener todas las URLs activas desde las tablas correspondientes ──
  // Ya no usamos el RPC porque fallaba al detectar URLs dentro de JSONs o tablas nuevas.
  // En su lugar, obtenemos los datos directamente y los parseamos con la misma expresión regular.
  const { data: config } = await supabase.from("configuracion_sistema").select("*");
  const { data: niveles } = await supabase.from("niveles").select("*");

  const allContent = JSON.stringify({ config, niveles });

  const activeUrls = new Set<string>();
  const regex = new RegExp(`/${BUCKET}/([^"\\s?\\#]+)`, 'g');

  let match;
  while ((match = regex.exec(allContent)) !== null) {
    if (match[1]) activeUrls.add(match[1]);
  }

  // ── 2. Listar todos los archivos en el bucket ──────────────────────────
  const { data: files, error: listError } = await supabase.storage.from(BUCKET).list("", { limit: 1000 });
  if (listError) throw new Error(`Error al listar archivos: ${listError.message}`);

  // ── 3. Identificar huérfanos ───────────────────────────────────────────
  // Filtramos .emptyFolderPlaceholder por precaución de Supabase
  const orphans = (files || [])
    .filter(f => f.name && !activeUrls.has(f.name) && f.name !== '.emptyFolderPlaceholder')
    .map(f => f.name);

  return { supabase, orphans };
}

// GET: Solo cuenta los huérfanos para mostrar en la UI
export async function GET() {
  try {
    const { orphans } = await getOrphans();
    return NextResponse.json({ count: orphans.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.message === "No autenticado" ? 401 : 500 });
  }
}

// POST: Realiza la eliminación real
export async function POST() {
  try {
    const { supabase, orphans } = await getOrphans();

    if (orphans.length === 0) {
      return NextResponse.json({ success: true, deleted: 0, message: "✅ No hay archivos huérfanos. El bucket está limpio." });
    }

    // ── 4. Borrar huérfanos usando la Storage API ──────────────────────────
    const { error: deleteError } = await supabase.storage.from(BUCKET).remove(orphans);

    if (deleteError) {
      throw new Error(`Error al borrar: ${deleteError.message}`);
    }

    return NextResponse.json({
      success: true,
      deleted: orphans.length,
      files: orphans,
      message: `🗑️ Se borraron ${orphans.length} archivos huérfanos globalmente.`
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Error inesperado" }, { status: err.message === "No autenticado" ? 401 : 500 });
  }
}
