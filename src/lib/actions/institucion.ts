"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { revalidatePath, unstable_noStore as noStore } from "next/cache";
import { InstitucionConfig } from "@/lib/types";

// ─── DEFAULTS (fallback si no hay datos en DB) ────────────────────────────────

const DEFAULTS: InstitucionConfig = {
  id: 1,
  nombre_completo: 'Mi Institución',
  nombre_corto: 'Mi Institución',
  siglas: 'MI',
  codigo_matricula: '',
  slogan: 'Plataforma Académica',
  color_primario: '#0f172a',
  color_secundario: '#334155',
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
  telefono_contacto: '',
  correo_contacto: '',
  horarios_atencion: [],
  logo_url: '/images/logo_placeholder.svg',
  logo_dark_url: '/images/logo_placeholder.svg',
  favicon_url: '/images/logo_placeholder.svg',
};

// ─── GET: Lectura server-side sin cookies (para emails, PDFs, background jobs) ─

export async function getInstitucionConfig(): Promise<InstitucionConfig> {
  noStore();
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
      url_plataforma: data.url_plataforma || undefined,
      nombre_ia: data.nombre_ia || undefined,
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
      // SMTP: SIN fallback - si no están configurados, el correo no se envía
      smtp_host: data.smtp_host || undefined,
      smtp_port: data.smtp_port || undefined,
      smtp_user: data.smtp_user || undefined,
      smtp_password: data.smtp_password || undefined,
      smtp_from_name: data.smtp_from_name || undefined,
    };
  } catch {
    return DEFAULTS;
  }
}

// ─── GET: Lectura con autenticación (para la página de configuración) ────────

export async function getInstitucionConfigAuth(): Promise<InstitucionConfig> {
  noStore();
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
    url_plataforma: data.url_plataforma || undefined,
    nombre_ia: data.nombre_ia || undefined,
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
    smtp_host: data.smtp_host || undefined,
    smtp_port: data.smtp_port || undefined,
    smtp_user: data.smtp_user || undefined,
    smtp_password: data.smtp_password || undefined,
    smtp_from_name: data.smtp_from_name || undefined,
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
    'sitio_web', 'url_plataforma', 'nombre_ia', 'logo_url', 'logo_dark_url', 'favicon_url',
    'color_primario', 'color_secundario', 'modo_tema_login',
    'telefono_contacto', 'correo_contacto', 'codigo_matricula',
    'smtp_host', 'smtp_user', 'smtp_password', 'smtp_from_name'
  ] as const;

  // Campo numérico SMTP
  if (config.smtp_port !== undefined) updateData.smtp_port = config.smtp_port;

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

  const adminClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { error } = await adminClient
    .from("configuracion_sistema")
    .update(updateData)
    .eq("id", 1);

  if (error) return { success: false, error: error.message };

  // ─── Actualización Retroactiva de Matrículas ─────────────────────────────
  if (config.codigo_matricula !== undefined) {
    const newPrefix = config.codigo_matricula.trim() || 'XXXXXX';
    const { data: profiles } = await adminClient
      .from('profiles')
      .select('id, matricula')
      .not('matricula', 'is', null)
      .neq('matricula', '');
      
    if (profiles && profiles.length > 0) {
      for (const p of profiles) {
        if (p.matricula && p.matricula.length >= 13) {
          const suffix13 = p.matricula.slice(-13);
          const newMatricula = `${newPrefix}${suffix13}`;
          
          if (newMatricula !== p.matricula) {
            await adminClient.from('profiles').update({ matricula: newMatricula }).eq('id', p.id);
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

  const adminClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // ── 1. Borrar el archivo previo del bucket si existe ──────────────────────
  if (oldUrl) {
    const parts = oldUrl.split('/logos-institucion/');
    if (parts.length === 2) {
      const oldFilename = parts[1].split('?')[0];
      if (oldFilename) {
        await adminClient.storage.from("logos-institucion").remove([oldFilename]);
      }
    }
  }

  // ── 2. Subir el nuevo archivo con nombre fijo por tipo (logo, logo_dark, favicon) ─
  const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
  const filename = `${tipo}_${Date.now()}.${ext}`;

  const { data: uploadData, error: uploadError } = await adminClient.storage
    .from("logos-institucion")
    .upload(filename, file, { cacheControl: "3600", upsert: true });

  if (uploadError) return { success: false, error: uploadError.message };

  const { data: urlData } = adminClient.storage
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

  const adminClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { error } = await adminClient.storage.from("logos-institucion").remove([filename]);
  if (error) return { success: false, error: error.message };

  return { success: true };
}

// ─── UPLOAD: Subir archivo de programa al bucket programas-archivos ───────────

const ALLOWED_PROGRAM_TYPES = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export async function uploadProgramFile(formData: FormData): Promise<{ success: boolean; url?: string; fileType?: string; error?: string }> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "No autenticado" };

  const { data: profile } = await supabase.from("profiles").select("rol").eq("id", user.id).single();
  if (!profile || !["admin", "superuser"].includes(profile.rol)) {
    return { success: false, error: "No autorizado" };
  }

  const file = formData.get("file") as File;
  const oldUrl = formData.get("old_url") as string | null;

  if (!file) return { success: false, error: "Archivo no proporcionado" };

  // Validar tipo
  if (!ALLOWED_PROGRAM_TYPES.includes(file.type)) {
    return { success: false, error: `Tipo de archivo no permitido (${file.type}). Solo se aceptan JPG, PNG y PDF.` };
  }

  // Validar tamaño
  if (file.size > MAX_FILE_SIZE) {
    return { success: false, error: `El archivo excede el límite de 10 MB (${(file.size / 1024 / 1024).toFixed(1)} MB).` };
  }

  const adminClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // Borrar archivo anterior si existe
  if (oldUrl) {
    const parts = oldUrl.split('/programas-archivos/');
    if (parts.length === 2) {
      const oldFilename = parts[1].split('?')[0];
      if (oldFilename) {
        await adminClient.storage.from("programas-archivos").remove([oldFilename]);
      }
    }
  }

  // Subir nuevo archivo
  const ext = file.name.split('.').pop()?.toLowerCase() || 'bin';
  const filename = `prog_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { data: uploadData, error: uploadError } = await adminClient.storage
    .from("programas-archivos")
    .upload(filename, file, { cacheControl: "3600", upsert: true });

  if (uploadError) return { success: false, error: uploadError.message };

  const { data: urlData } = adminClient.storage
    .from("programas-archivos")
    .getPublicUrl(uploadData.path);

  return { success: true, url: urlData.publicUrl, fileType: file.type };
}

// ─── DELETE: Borrar archivo de programa del bucket programas-archivos ─────────

export async function deleteProgramFile(fileUrl: string): Promise<{ success: boolean; error?: string }> {
  if (!fileUrl || !fileUrl.includes('supabase')) return { success: true };

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "No autenticado" };

  const { data: profile } = await supabase.from("profiles").select("rol").eq("id", user.id).single();
  if (!profile || !["admin", "superuser"].includes(profile.rol)) {
    return { success: false, error: "No autorizado" };
  }

  const parts = fileUrl.split('/programas-archivos/');
  if (parts.length !== 2) return { success: false, error: "URL de archivo no válida para este bucket" };

  const filename = parts[1].split('?')[0];
  if (!filename) return { success: false, error: "No se pudo extraer el nombre del archivo" };

  const adminClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { error } = await adminClient.storage.from("programas-archivos").remove([filename]);
  if (error) return { success: false, error: error.message };

  return { success: true };
}
