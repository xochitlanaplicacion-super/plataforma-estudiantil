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
  
  // 1. Fetch profiles where rol = 'alumno' and estatus = 'activo'
  const { data: profiles } = await supabase
    .from('profiles')
    .select('*')
    .eq('rol', 'alumno')
    .eq('estatus', 'activo');

  if (!profiles || profiles.length === 0) return [];

  const profileIds = profiles.map((p: any) => p.id);
  const carreraIds = [...new Set(profiles.map((p: any) => p.carrera_id).filter(Boolean))];
  const grupoIds = [...new Set(profiles.map((p: any) => p.grupo_id).filter(Boolean))];

  // 2. Fetch relations safely
  const { data: carreras } = carreraIds.length > 0 
    ? await supabase.from('carreras').select('id, nombre, nivel_id').in('id', carreraIds) 
    : { data: [] };
  
  const { data: grupos } = grupoIds.length > 0 
    ? await supabase.from('grupos').select('id, nombre').in('id', grupoIds) 
    : { data: [] };

  const nivelIds = [...new Set((carreras || []).map((c: any) => c.nivel_id).filter(Boolean))];
  const { data: niveles } = nivelIds.length > 0 
    ? await supabase.from('niveles').select('id, nombre').in('id', nivelIds) 
    : { data: [] };

  const carreraMap = new Map((carreras || []).map((c: any) => [c.id, c]));
  const grupoMap = new Map((grupos || []).map((g: any) => [g.id, g]));
  const nivelMap = new Map((niveles || []).map((n: any) => [n.id, n]));

  // 3. Fetch auth status
  const { data: autorizaciones } = await supabase
    .from('credenciales_autorizadas')
    .select('alumno_id, autorizado')
    .in('alumno_id', profileIds);

  const authMap = new Map((autorizaciones || []).map((a: any) => [a.alumno_id, a.autorizado]));

  // Merge
  const merged = profiles.map((p: any) => {
    const carrera = carreraMap.get(p.carrera_id);
    const nivel = carrera ? nivelMap.get(carrera.nivel_id) : null;
    const grupo = grupoMap.get(p.grupo_id);

    return {
      id: p.id,
      nombre: p.nombre,
      apellidos: p.apellidos,
      email: p.email,
      matricula: p.matricula,
      foto_perfil: p.foto_perfil,
      fecha_inicio: p.fecha_inicio,
      fecha_expiracion: p.fecha_expiracion,
      estatus: p.estatus,
      carrera: carrera ? carrera.nombre : '',
      nivel: nivel ? nivel.nombre : '',
      grupo: grupo ? grupo.nombre : '',
      autorizado: authMap.get(p.id) || false
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
    .select('logo_url, nombre_completo, nombre_corto, direccion, telefono_contacto, correo_contacto, sitio_web')
    .limit(1)
    .maybeSingle();
  return data || {};
}

export async function uploadWatermarkImage(formData: FormData) {
  const supabase = await createServerSupabaseClient();
  const file = formData.get('file') as File;
  if (!file) return { success: false, error: 'No file provided' };

  // Delete previous watermark images in the bucket
  const { data: existingFiles } = await supabase.storage.from('credenciales-watermark').list();
  if (existingFiles && existingFiles.length > 0) {
    const filePaths = existingFiles.map((f: any) => f.name);
    await supabase.storage.from('credenciales-watermark').remove(filePaths);
  }

  const ext = file.name.split('.').pop();
  const fileName = `watermark_${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('credenciales-watermark')
    .upload(fileName, file, { upsert: true });

  if (uploadError) return { success: false, error: uploadError.message };

  const { data: urlData } = supabase.storage
    .from('credenciales-watermark')
    .getPublicUrl(fileName);

  // Save URL to config
  await updateConfigCredenciales({ trama_imagen_url: urlData.publicUrl });

  revalidatePath('/dashboard/admin/credenciales');
  return { success: true, url: urlData.publicUrl };
}

export async function deleteWatermarkImage() {
  const supabase = await createServerSupabaseClient();

  // Delete all files in the watermark bucket
  const { data: existingFiles } = await supabase.storage.from('credenciales-watermark').list();
  if (existingFiles && existingFiles.length > 0) {
    const filePaths = existingFiles.map((f: any) => f.name);
    await supabase.storage.from('credenciales-watermark').remove(filePaths);
  }

  // Clear URL in config
  await updateConfigCredenciales({ trama_imagen_url: null, trama_tipo: 'ninguno' });

  revalidatePath('/dashboard/admin/credenciales');
  return { success: true };
}

// ────────────────────────────────────────────────────────────
// REVERSO: Imagen de fondo completo
// ────────────────────────────────────────────────────────────

async function cleanBucketFiles(supabase: any, bucket: string, prefix: string) {
  const { data: existingFiles } = await supabase.storage.from(bucket).list('', {
    search: prefix,
  });
  // Fallback: list all and filter by prefix
  const { data: allFiles } = await supabase.storage.from(bucket).list();
  const toDelete = (allFiles || []).filter((f: any) => f.name.startsWith(prefix));
  if (toDelete.length > 0) {
    await supabase.storage.from(bucket).remove(toDelete.map((f: any) => f.name));
  }
}

export async function uploadReversoImage(formData: FormData) {
  const supabase = await createServerSupabaseClient();
  const file = formData.get('file') as File;
  if (!file) return { success: false, error: 'No se proporcionó archivo' };
  if (file.size > 10 * 1024 * 1024) return { success: false, error: 'El archivo excede 10MB' };

  // Clean previous reverso images
  await cleanBucketFiles(supabase, 'credenciales-reverso', 'reverso_');

  const ext = file.name.split('.').pop();
  const fileName = `reverso_${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('credenciales-reverso')
    .upload(fileName, file, { upsert: true });

  if (uploadError) return { success: false, error: uploadError.message };

  const { data: urlData } = supabase.storage
    .from('credenciales-reverso')
    .getPublicUrl(fileName);

  await updateConfigCredenciales({ reverso_imagen_url: urlData.publicUrl });

  revalidatePath('/dashboard/admin/credenciales');
  return { success: true, url: urlData.publicUrl };
}

export async function deleteReversoImage() {
  const supabase = await createServerSupabaseClient();

  await cleanBucketFiles(supabase, 'credenciales-reverso', 'reverso_');
  await updateConfigCredenciales({ reverso_imagen_url: null });

  revalidatePath('/dashboard/admin/credenciales');
  return { success: true };
}

// ────────────────────────────────────────────────────────────
// REVERSO: Firma del Director
// ────────────────────────────────────────────────────────────

export async function uploadFirmaDirector(formData: FormData) {
  const supabase = await createServerSupabaseClient();
  const file = formData.get('file') as File;
  if (!file) return { success: false, error: 'No se proporcionó archivo' };

  await cleanBucketFiles(supabase, 'credenciales-reverso', 'firma_');

  const ext = file.name.split('.').pop();
  const fileName = `firma_${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('credenciales-reverso')
    .upload(fileName, file, { upsert: true });

  if (uploadError) return { success: false, error: uploadError.message };

  const { data: urlData } = supabase.storage
    .from('credenciales-reverso')
    .getPublicUrl(fileName);

  await updateConfigCredenciales({ firma_director_url: urlData.publicUrl });

  revalidatePath('/dashboard/admin/credenciales');
  return { success: true, url: urlData.publicUrl };
}

export async function deleteFirmaDirector() {
  const supabase = await createServerSupabaseClient();

  await cleanBucketFiles(supabase, 'credenciales-reverso', 'firma_');
  await updateConfigCredenciales({ firma_director_url: null });

  revalidatePath('/dashboard/admin/credenciales');
  return { success: true };
}

// ────────────────────────────────────────────────────────────
// REVERSO: Sello de la Institución
// ────────────────────────────────────────────────────────────

export async function uploadSelloInstitucion(formData: FormData) {
  const supabase = await createServerSupabaseClient();
  const file = formData.get('file') as File;
  if (!file) return { success: false, error: 'No se proporcionó archivo' };

  await cleanBucketFiles(supabase, 'credenciales-reverso', 'sello_');

  const ext = file.name.split('.').pop();
  const fileName = `sello_${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('credenciales-reverso')
    .upload(fileName, file, { upsert: true });

  if (uploadError) return { success: false, error: uploadError.message };

  const { data: urlData } = supabase.storage
    .from('credenciales-reverso')
    .getPublicUrl(fileName);

  await updateConfigCredenciales({ sello_institucion_url: urlData.publicUrl });

  revalidatePath('/dashboard/admin/credenciales');
  return { success: true, url: urlData.publicUrl };
}

export async function deleteSelloInstitucion() {
  const supabase = await createServerSupabaseClient();

  await cleanBucketFiles(supabase, 'credenciales-reverso', 'sello_');
  await updateConfigCredenciales({ sello_institucion_url: null });

  revalidatePath('/dashboard/admin/credenciales');
  return { success: true };
}
