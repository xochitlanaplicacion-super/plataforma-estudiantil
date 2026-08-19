"use server";

import { revalidatePath, unstable_noStore as noStore } from "next/cache";
import { InstitucionConfig } from "@/lib/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireTenantSession, resolveTenantFromHostname } from "@/lib/tenant/context";

const DEFAULTS: InstitucionConfig = {
  id: 0,
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

const PUBLIC_CONFIG_FIELDS = [
  'id', 'tenant_id', 'nombre_completo', 'nombre_corto', 'siglas', 'codigo_matricula',
  'slogan', 'direccion', 'sitio_web', 'url_plataforma', 'nombre_ia', 'logo_url',
  'logo_dark_url', 'favicon_url', 'color_primario', 'color_secundario', 'temas_login',
  'modo_tema_login', 'tema_fijo_index', 'niveles_nombres', 'telefono_contacto',
  'correo_contacto', 'horarios_atencion', 'landing_config', 'updated_at',
].join(',');

function parseConfig(data: any): InstitucionConfig {
  return {
    ...DEFAULTS,
    id: data.id,
    tenant_id: data.tenant_id,
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
    temas_login: data.temas_login || DEFAULTS.temas_login,
    modo_tema_login: data.modo_tema_login || DEFAULTS.modo_tema_login,
    tema_fijo_index: data.tema_fijo_index ?? DEFAULTS.tema_fijo_index,
    niveles_nombres: data.niveles_nombres || DEFAULTS.niveles_nombres,
    telefono_contacto: data.telefono_contacto || DEFAULTS.telefono_contacto,
    correo_contacto: data.correo_contacto || DEFAULTS.correo_contacto,
    horarios_atencion: data.horarios_atencion || [],
    landing_config: data.landing_config || undefined,
    updated_at: data.updated_at,
  };
}
export async function getInstitucionConfig(tenantId?: string): Promise<InstitucionConfig> {
  noStore();
  try {
    const tenant = tenantId ? { id: tenantId } : await resolveTenantFromHostname();
    if (!tenant) return DEFAULTS;

    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from('configuracion_sistema')
      .select(PUBLIC_CONFIG_FIELDS)
      .eq('tenant_id', tenant.id)
      .single();

    return error || !data ? DEFAULTS : parseConfig(data);
  } catch {
    return DEFAULTS;
  }
}

export async function getInstitucionConfigAuth(): Promise<InstitucionConfig> {
  noStore();
  try {
    const context = await requireTenantSession(['superuser', 'admin']);
    const { data, error } = await context.supabase
      .from('configuracion_sistema')
      .select(PUBLIC_CONFIG_FIELDS)
      .eq('tenant_id', context.tenantId)
      .single();

    if (error || !data) return DEFAULTS;
    const config = parseConfig(data);
    const { data: smtpRows } = await context.admin.rpc('get_tenant_smtp_for_service', {
      p_tenant_id: context.tenantId,
    });
    const smtp = Array.isArray(smtpRows) ? smtpRows[0] : smtpRows;

    return {
      ...config,
      smtp_host: smtp?.smtp_host || 'smtp.gmail.com',
      smtp_port: smtp?.smtp_port || 465,
      smtp_user: smtp?.smtp_user || '',
      smtp_password: smtp?.smtp_password ? '••••••••' : '',
      smtp_from_name: smtp?.smtp_from_name || '',
    };
  } catch {
    return DEFAULTS;
  }
}

export async function getTenantSmtpConfig(tenantId: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc('get_tenant_smtp_for_service', { p_tenant_id: tenantId });
  if (error) throw error;
  return (Array.isArray(data) ? data[0] : data) || null;
}

export async function updateInstitucionConfig(config: Partial<InstitucionConfig>) {
  try {
    const context = await requireTenantSession(['superuser', 'admin']);
    const updateData: Record<string, any> = { updated_at: new Date().toISOString() };
    const textFields = [
      'nombre_completo', 'nombre_corto', 'siglas', 'slogan', 'direccion', 'sitio_web',
      'url_plataforma', 'nombre_ia', 'logo_url', 'logo_dark_url', 'favicon_url',
      'color_primario', 'color_secundario', 'modo_tema_login', 'telefono_contacto',
      'correo_contacto', 'codigo_matricula',
    ] as const;

    for (const field of textFields) if (config[field] !== undefined) updateData[field] = config[field];
    if (config.temas_login !== undefined) updateData.temas_login = config.temas_login;
    if (config.tema_fijo_index !== undefined) updateData.tema_fijo_index = config.tema_fijo_index;
    if (config.niveles_nombres !== undefined) updateData.niveles_nombres = config.niveles_nombres;
    if (config.horarios_atencion !== undefined) updateData.horarios_atencion = config.horarios_atencion;
    if (config.landing_config !== undefined) updateData.landing_config = config.landing_config;

    const { error } = await context.supabase
      .from('configuracion_sistema')
      .update(updateData)
      .eq('tenant_id', context.tenantId);
    if (error) return { success: false, error: error.message };

    const smtpWasSubmitted = [config.smtp_host, config.smtp_port, config.smtp_user, config.smtp_password, config.smtp_from_name]
      .some((value) => value !== undefined);
    if (smtpWasSubmitted) {
      const password = config.smtp_password === '••••••••' ? '' : (config.smtp_password || '');
      const { error: smtpError } = await context.admin.rpc('set_tenant_smtp_for_service', {
        p_tenant_id: context.tenantId,
        p_smtp_host: config.smtp_host || 'smtp.gmail.com',
        p_smtp_port: config.smtp_port || 465,
        p_smtp_user: config.smtp_user || '',
        p_smtp_password: password,
        p_smtp_from_name: config.smtp_from_name || '',
        p_updated_by: context.user.id,
      });
      if (smtpError) return { success: false, error: smtpError.message };
    }

    if (config.codigo_matricula !== undefined) {
      const newPrefix = config.codigo_matricula.trim() || 'XXXXXX';
      const { data: profiles } = await context.supabase
        .from('profiles')
        .select('id, matricula')
        .eq('tenant_id', context.tenantId)
        .not('matricula', 'is', null)
        .neq('matricula', '');

      for (const profile of profiles || []) {
        if (profile.matricula && profile.matricula.length >= 13) {
          const matricula = `${newPrefix}${profile.matricula.slice(-13)}`;
          if (matricula !== profile.matricula) {
            await context.supabase.from('profiles').update({ matricula }).eq('id', profile.id);
          }
        }
      }
    }

    revalidatePath('/', 'layout');
    revalidatePath('/dashboard/admin/institucion');
    revalidatePath('/preregistro');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

function storagePathFromUrl(fileUrl: string, bucket: string) {
  const parts = fileUrl.split(`/${bucket}/`);
  return parts.length === 2 ? decodeURIComponent(parts[1].split('?')[0]) : null;
}

export async function uploadLogo(formData: FormData): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    const context = await requireTenantSession(['superuser', 'admin']);
    const file = formData.get('file') as File;
    const tipo = String(formData.get('tipo') || 'logo');
    const oldUrl = formData.get('old_url') as string | null;
    if (!file) return { success: false, error: 'Archivo no proporcionado' };

    if (oldUrl) {
      const oldPath = storagePathFromUrl(oldUrl, 'logos-institucion');
      if (oldPath?.startsWith(`${context.tenantId}/`)) await context.admin.storage.from('logos-institucion').remove([oldPath]);
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
    const path = `${context.tenantId}/branding/${tipo}_${Date.now()}.${ext}`;
    const { data, error } = await context.admin.storage.from('logos-institucion').upload(path, file, { cacheControl: '3600', upsert: false });
    if (error) return { success: false, error: error.message };
    return { success: true, url: context.admin.storage.from('logos-institucion').getPublicUrl(data.path).data.publicUrl };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function deleteStorageFile(fileUrl: string) {
  try {
    if (!fileUrl?.includes('supabase')) return { success: true };
    const context = await requireTenantSession(['superuser', 'admin']);
    const path = storagePathFromUrl(fileUrl, 'logos-institucion');
    if (!path?.startsWith(`${context.tenantId}/`)) return { success: false, error: 'Archivo fuera de la institución' };
    const { error } = await context.admin.storage.from('logos-institucion').remove([path]);
    return error ? { success: false, error: error.message } : { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

const ALLOWED_PROGRAM_TYPES = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
const MAX_FILE_SIZE = 10 * 1024 * 1024;

export async function uploadProgramFile(formData: FormData): Promise<{ success: boolean; url?: string; fileType?: string; error?: string }> {
  try {
    const context = await requireTenantSession(['superuser', 'admin']);
    const file = formData.get('file') as File;
    const oldUrl = formData.get('old_url') as string | null;
    if (!file) return { success: false, error: 'Archivo no proporcionado' };
    if (!ALLOWED_PROGRAM_TYPES.includes(file.type)) return { success: false, error: 'Sólo se aceptan JPG, PNG y PDF.' };
    if (file.size > MAX_FILE_SIZE) return { success: false, error: 'El archivo excede el límite de 10 MB.' };

    if (oldUrl) {
      const oldPath = storagePathFromUrl(oldUrl, 'programas-archivos');
      if (oldPath?.startsWith(`${context.tenantId}/`)) await context.admin.storage.from('programas-archivos').remove([oldPath]);
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || 'bin';
    const path = `${context.tenantId}/programas/prog_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { data, error } = await context.admin.storage.from('programas-archivos').upload(path, file, { cacheControl: '3600', upsert: false });
    if (error) return { success: false, error: error.message };
    return {
      success: true,
      url: context.admin.storage.from('programas-archivos').getPublicUrl(data.path).data.publicUrl,
      fileType: file.type,
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function deleteProgramFile(fileUrl: string) {
  try {
    if (!fileUrl?.includes('supabase')) return { success: true };
    const context = await requireTenantSession(['superuser', 'admin']);
    const path = storagePathFromUrl(fileUrl, 'programas-archivos');
    if (!path?.startsWith(`${context.tenantId}/`)) return { success: false, error: 'Archivo fuera de la institución' };
    const { error } = await context.admin.storage.from('programas-archivos').remove([path]);
    return error ? { success: false, error: error.message } : { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
