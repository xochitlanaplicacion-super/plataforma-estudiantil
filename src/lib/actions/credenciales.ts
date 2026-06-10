'use server';

import { createServerSupabaseClient } from '../supabase/server';
import { revalidatePath } from 'next/cache';

export async function getConfigCredenciales() {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('config_credenciales')
    .select('*')
    .limit(1)
    .single();

  if (error || !data) {
    // Fallback to system config defaults if no credential config exists
    const { data: sysConfig } = await supabase.from('configuracion_sistema').select('color_primario, color_secundario').single();
    
    return {
      color_primario: sysConfig?.color_primario || '#6B2D5B',
      color_secundario: sysConfig?.color_secundario || '#F5F0EB',
      color_texto_primario: '#FFFFFF',
      color_texto_secundario: '#333333',
      fuente_principal: 'Montserrat',
      fuente_secundaria: 'Open Sans',
    };
  }

  return data;
}

export async function updateConfigCredenciales(config: any) {
  const supabase = await createServerSupabaseClient();
  const { data: existing } = await supabase.from('config_credenciales').select('id').limit(1).maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from('config_credenciales')
      .update({ ...config, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
    if (error) return { success: false, error: error.message };
  } else {
    const { error } = await supabase.from('config_credenciales').insert(config);
    if (error) return { success: false, error: error.message };
  }
  
  revalidatePath('/dashboard/admin/credenciales');
  return { success: true };
}

export async function getAlumnosCredenciales() {
  const supabase = await createServerSupabaseClient();
  
  // 1. Fetch active students from view
  const { data: alumnosView } = await supabase
    .from('vista_alumnos_inscritos')
    .select('*');

  if (!alumnosView || alumnosView.length === 0) return [];

  const ids = alumnosView.map((a: any) => a.id);

  // 2. Fetch profiles for foto_perfil and fecha_inicio
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, foto_perfil, fecha_inicio')
    .in('id', ids);

  const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

  // 3. Fetch auth status
  const { data: autorizaciones } = await supabase
    .from('credenciales_autorizadas')
    .select('alumno_id, autorizado')
    .in('alumno_id', ids);

  const authMap = new Map((autorizaciones || []).map((a: any) => [a.alumno_id, a.autorizado]));

  // Merge
  const merged = alumnosView.map((alumno: any) => {
    const p = profileMap.get(alumno.id);
    return {
      ...alumno,
      foto_perfil: p?.foto_perfil || null,
      fecha_inicio: p?.fecha_inicio || null,
      autorizado: authMap.get(alumno.id) || false
    };
  });

  return merged;
}

export async function toggleAutorizacionCredencial(alumnoId: string, newState: boolean) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return { success: false, error: 'No autorizado' };

  const { data: existing } = await supabase
    .from('credenciales_autorizadas')
    .select('id')
    .eq('alumno_id', alumnoId)
    .maybeSingle();

  let error;
  if (existing) {
    const { error: updErr } = await supabase
      .from('credenciales_autorizadas')
      .update({ autorizado: newState, autorizado_por: user.id, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
    error = updErr;
  } else {
    const { error: insErr } = await supabase
      .from('credenciales_autorizadas')
      .insert({ alumno_id: alumnoId, autorizado: newState, autorizado_por: user.id });
    error = insErr;
  }

  if (error) {
    console.error('Error toggling auth:', error);
    return { success: false, error: error.message };
  }

  revalidatePath('/dashboard/admin/credenciales');
  return { success: true };
}

export async function getInstitutionConfig() {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from('configuracion_sistema')
    .select('logo_url, nombre_completo, nombre_corto')
    .limit(1)
    .maybeSingle();
  return data || {};
}
