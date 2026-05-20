import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const BUCKET = "logos-institucion";

export async function POST() {
  try {
    // ── Verificar que el usuario sea admin o superuser ─────────────────────
    const supabaseAuth = await createServerSupabaseClient();
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const { data: profile } = await supabaseAuth.from("profiles").select("rol").eq("id", user.id).single();
    if (!profile || !["admin", "superuser"].includes(profile.rol)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    // ── Usar service role para operaciones de storage ──────────────────────
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // ── 1. Obtener URLs activas de la base de datos ────────────────────────
    const { data: config } = await supabase
      .from("configuracion_sistema")
      .select("logo_url, logo_dark_url, favicon_url, landing_config, temas_login")
      .eq("id", 1)
      .single();

    const activeUrls = new Set<string>();

    const addIfSupabase = (url: string | null | undefined) => {
      if (url && url.includes(BUCKET)) {
        // Extraer solo el nombre del archivo
        const parts = url.split(`/${BUCKET}/`);
        if (parts[1]) activeUrls.add(parts[1].split("?")[0]);
      }
    };

    addIfSupabase(config?.logo_url);
    addIfSupabase(config?.logo_dark_url);
    addIfSupabase(config?.favicon_url);

    // Landing config
    const lc = config?.landing_config;
    if (lc) {
      addIfSupabase(lc.hero_image);
      addIfSupabase(lc.about_image);
      (lc.banner_images || []).forEach((url: string) => addIfSupabase(url));
      (lc.programs || []).forEach((p: any) => addIfSupabase(p?.image));
    }

    // Fondos de temas de login
    (config?.temas_login || []).forEach((t: any) => addIfSupabase(t?.bgImage));

    // ── 2. Listar todos los archivos en el bucket ──────────────────────────
    const { data: files, error: listError } = await supabase.storage
      .from(BUCKET)
      .list("", { limit: 1000 });

    if (listError) {
      return NextResponse.json({ error: `Error al listar archivos: ${listError.message}` }, { status: 500 });
    }

    // ── 3. Identificar huérfanos ───────────────────────────────────────────
    const orphans = (files || [])
      .filter(f => f.name && !activeUrls.has(f.name))
      .map(f => f.name);

    if (orphans.length === 0) {
      return NextResponse.json({ success: true, deleted: 0, message: "✅ No hay archivos huérfanos. El bucket está limpio." });
    }

    // ── 4. Borrar huérfanos usando la Storage API ──────────────────────────
    const { error: deleteError } = await supabase.storage.from(BUCKET).remove(orphans);

    if (deleteError) {
      return NextResponse.json({ error: `Error al borrar: ${deleteError.message}` }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      deleted: orphans.length,
      files: orphans,
      message: `🗑️ Se borraron ${orphans.length} archivos huérfanos del bucket.`
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Error inesperado" }, { status: 500 });
  }
}
