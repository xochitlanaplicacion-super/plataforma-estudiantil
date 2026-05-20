"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { InstitucionConfig } from "@/lib/types";

// ─── DEFAULTS (fallback si no hay datos en DB) ────────────────────────────────

const DEFAULTS: InstitucionConfig = {
  id: 1,
  nombre_completo: 'Instituto Educativo de Ejemplo',
  nombre_corto: 'Mi Institución',
  siglas: 'IE',
  codigo_matricula: '',
  slogan: 'Plataforma Académica',
  color_primario: '#8B2332',
  color_secundario: '#1A4A3F',
  temas_login: [
    { id: "vino", bgImage: "/images/FONDO_ROJO.png", buttonColor: "#8B2332", textColor: "text-white", glassStyle: "bg-black/20 border-white/30 text-white" },
    { id: "verde", bgImage: "/images/FONDOS_VERDE.png", buttonColor: "#1A4A3F", textColor: "text-white", glassStyle: "bg-black/20 border-white/30 text-white" },
    { id: "beige", bgImage: "/images/fondos_beige.jpg", buttonColor: "#E8D5B7", textColor: "text-[#1A4A3F]", glassStyle: "bg-primary/10 border-primary/20 text-primary" },
  ],
  modo_tema_login: 'aleatorio',
  tema_fijo_index: 0,
  niveles_nombres: [
    { clave: "bachillerato", nombre: "Bachillerato" },
    { clave: "universidad", nombre: "Universidad" },
    { clave: "capacitaciones", nombre: "Capacitaciones" },
  ],
  telefono_contacto: '123 456 7890',
  correo_contacto: 'contacto@miinstitucion.edu',
  horarios_atencion: [],
  logo_url: '/images/logo_placeholder.svg',
  logo_dark_url: '/images/logo_placeholder.svg',
  favicon_url: '/images/logo_placeholder.svg',
};

// ─── GET: Lectura server-side sin cookies (para emails, PDFs, background jobs) ─

export async function getInstitucionConfig(): Promise<InstitucionConfig> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createSupabaseClient(supabaseUrl, supabaseKey);

    const { data, error } = await supabase
      .from("configuracion_sistema")
      .select("*")
      .eq("id", 1)
      .single();

    if (error || !data) return DEFAULTS;

    return {
      id: data.id,
      nombre_completo: data.nombre_completo || DEFAULTS.nombre_completo,
      nombre_corto: data.nombre_corto || DEFAULTS.nombre_corto,
      siglas: data.siglas || DEFAULTS.siglas,
      codigo_matricula: data.codigo_matricula ?? DEFAULTS.codigo_matricula,
      slogan: data.slogan || DEFAULTS.slogan,
      direccion: data.direccion || undefined,
      sitio_web: data.sitio_web || undefined,
      logo_url: data.logo_url || DEFAULTS.logo_url,
      logo_dark_url: data.logo_dark_url || DEFAULTS.logo_dark_url,
      favicon_url: data.favicon_url || DEFAULTS.favicon_url,
      color_primario: data.color_primario || DEFAULTS.color_primario,
      color_secundario: data.color_secundario || DEFAULTS.color_secundario,
      temas_login: (data.temas_login as any[]) || DEFAULTS.temas_login,
      modo_tema_login: data.modo_tema_login || DEFAULTS.modo_tema_login,
      tema_fijo_index: data.tema_fijo_index ?? DEFAULTS.tema_fijo_index,
      niveles_nombres: (data.niveles_nombres as any[]) || DEFAULTS.niveles_nombres,
      telefono_contacto: data.telefono_contacto || DEFAULTS.telefono_contacto,
      correo_contacto: data.correo_contacto || DEFAULTS.correo_contacto,
      horarios_atencion: (data.horarios_atencion as any[]) || [],
      landing_config: data.landing_config || undefined,
      updated_at: data.updated_at,
    };
  } catch {
    return DEFAULTS;
  }
}

// ─── GET: Lectura con autenticación (para la página de configuración) ────────

export async function getInstitucionConfigAuth(): Promise<InstitucionConfig> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("configuracion_sistema")
    .select("*")
    .eq("id", 1)
    .single();

  if (error || !data) return DEFAULTS;

  return {
    id: data.id,
    nombre_completo: data.nombre_completo || DEFAULTS.nombre_completo,
    nombre_corto: data.nombre_corto || DEFAULTS.nombre_corto,
    siglas: data.siglas || DEFAULTS.siglas,
    codigo_matricula: data.codigo_matricula ?? DEFAULTS.codigo_matricula,
    slogan: data.slogan || DEFAULTS.slogan,
    direccion: data.direccion || undefined,
    sitio_web: data.sitio_web || undefined,
    logo_url: data.logo_url || DEFAULTS.logo_url,
    logo_dark_url: data.logo_dark_url || DEFAULTS.logo_dark_url,
    favicon_url: data.favicon_url || DEFAULTS.favicon_url,
    color_primario: data.color_primario || DEFAULTS.color_primario,
    color_secundario: data.color_secundario || DEFAULTS.color_secundario,
    temas_login: (data.temas_login as any[]) || DEFAULTS.temas_login,
    modo_tema_login: data.modo_tema_login || DEFAULTS.modo_tema_login,
    tema_fijo_index: data.tema_fijo_index ?? DEFAULTS.tema_fijo_index,
    niveles_nombres: (data.niveles_nombres as any[]) || DEFAULTS.niveles_nombres,
    telefono_contacto: data.telefono_contacto || DEFAULTS.telefono_contacto,
    correo_contacto: data.correo_contacto || DEFAULTS.correo_contacto,
    horarios_atencion: (data.horarios_atencion as any[]) || [],
    landing_config: data.landing_config || undefined,
    updated_at: data.updated_at,
  };
}

// ─── UPDATE: Guardar configuración ───────────────────────────────────────────

export async function updateInstitucionConfig(config: Partial<InstitucionConfig>) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "No autenticado" };

  const { data: profile } = await supabase.from("profiles").select("rol").eq("id", user.id).single();
  if (!profile || !["admin", "superuser"].includes(profile.rol)) {
    return { success: false, error: "No autorizado. Solo el superusuario puede modificar la configuración." };
  }

  // Construir solo los campos que se envían
  const updateData: Record<string, any> = { updated_at: new Date().toISOString() };

  const textFields = [
    'nombre_completo', 'nombre_corto', 'siglas', 'slogan', 'direccion',
    'sitio_web', 'logo_url', 'logo_dark_url', 'favicon_url',
    'color_primario', 'color_secundario', 'modo_tema_login',
    'telefono_contacto', 'correo_contacto', 'codigo_matricula'
  ] as const;

  for (const field of textFields) {
    if (config[field] !== undefined) {
      updateData[field] = config[field];
    }
  }

  if (config.temas_login !== undefined) updateData.temas_login = config.temas_login;
  if (config.tema_fijo_index !== undefined) updateData.tema_fijo_index = config.tema_fijo_index;
  if (config.niveles_nombres !== undefined) updateData.niveles_nombres = config.niveles_nombres;
  if (config.horarios_atencion !== undefined) updateData.horarios_atencion = config.horarios_atencion;
  if (config.landing_config !== undefined) updateData.landing_config = config.landing_config;

  const { error } = await supabase
    .from("configuracion_sistema")
    .update(updateData)
    .eq("id", 1);

  if (error) return { success: false, error: error.message };

  // ─── Actualización Retroactiva de Matrículas ─────────────────────────────
  if (config.codigo_matricula !== undefined) {
    const newPrefix = config.codigo_matricula.trim() || 'XXXXXX';
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, matricula')
      .not('matricula', 'is', null)
      .neq('matricula', '');
      
    if (profiles && profiles.length > 0) {
      // Usamos Promise.all con un limite de concurrencia o simplemente loop para no saturar si son muchos
      // Como Next.js permite await en array map usando Promise.all, lo haremos por chunks o secuencial.
      // Secuencial es seguro para no tirar la base.
      for (const p of profiles) {
        if (p.matricula && p.matricula.length >= 13) {
          const suffix13 = p.matricula.slice(-13);
          const newMatricula = `${newPrefix}${suffix13}`;
          
          if (newMatricula !== p.matricula) {
            await supabase.from('profiles').update({ matricula: newMatricula }).eq('id', p.id);
          }
        }
      }
    }
  }

  // Revalidar todas las rutas que consumen estos datos
  revalidatePath("/", "layout");
  revalidatePath("/");
  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/admin/institucion");
  revalidatePath("/dashboard/alumno");
  revalidatePath("/dashboard/profesor");
  revalidatePath("/acerca-de-nosotros");
  revalidatePath("/preregistro");
  revalidatePath("/expired");

  return { success: true };
}

// ─── UPLOAD: Subir logo al bucket ────────────────────────────────────────────

export async function uploadLogo(formData: FormData): Promise<{ success: boolean; url?: string; error?: string }> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "No autenticado" };

  const { data: profile } = await supabase.from("profiles").select("rol").eq("id", user.id).single();
  if (!profile || !["admin", "superuser"].includes(profile.rol)) {
    return { success: false, error: "No autorizado" };
  }

  const file = formData.get("file") as File;
  const tipo = formData.get("tipo") as string; // 'logo', 'logo_dark', 'favicon'
  const oldUrl = formData.get("old_url") as string | null; // URL del archivo previo (opcional)

  if (!file || !tipo) return { success: false, error: "Archivo o tipo no proporcionado" };

  // ── 1. Borrar el archivo previo del bucket si existe ──────────────────────
  if (oldUrl) {
    // Extraer el nombre del archivo desde la URL pública de Supabase Storage
    // Formato: .../storage/v1/object/public/logos-institucion/FILENAME
    const parts = oldUrl.split('/logos-institucion/');
    if (parts.length === 2) {
      const oldFilename = parts[1].split('?')[0]; // quitar query params si los hubiera
      if (oldFilename) {
        await supabase.storage.from("logos-institucion").remove([oldFilename]);
        // No bloqueamos el proceso si falla el borrado del anterior
      }
    }
  }

  // ── 2. Subir el nuevo archivo con nombre fijo por tipo (logo, logo_dark, favicon) ─
  const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
  const filename = `${tipo}_${Date.now()}.${ext}`;

  const { data: uploadData, error: uploadError } = await supabase.storage
    .from("logos-institucion")
    .upload(filename, file, { cacheControl: "3600", upsert: true });

  if (uploadError) return { success: false, error: uploadError.message };

  const { data: urlData } = supabase.storage
    .from("logos-institucion")
    .getPublicUrl(uploadData.path);

  return { success: true, url: urlData.publicUrl };
}

// ─── DELETE: Borrar archivo del bucket por su URL pública ─────────────────────

export async function deleteStorageFile(fileUrl: string): Promise<{ success: boolean; error?: string }> {
  if (!fileUrl || !fileUrl.includes('supabase')) return { success: true }; // nada que borrar

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "No autenticado" };

  const { data: profile } = await supabase.from("profiles").select("rol").eq("id", user.id).single();
  if (!profile || !["admin", "superuser"].includes(profile.rol)) {
    return { success: false, error: "No autorizado" };
  }

  // Extraer nombre del archivo desde la URL pública
  // Formato: .../storage/v1/object/public/logos-institucion/FILENAME
  const parts = fileUrl.split('/logos-institucion/');
  if (parts.length !== 2) return { success: false, error: "URL de archivo no válida" };

  const filename = parts[1].split('?')[0];
  if (!filename) return { success: false, error: "No se pudo extraer el nombre del archivo" };

  const { error } = await supabase.storage.from("logos-institucion").remove([filename]);
  if (error) return { success: false, error: error.message };

  return { success: true };
}
