'use server';

import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const BUCKET = 'entregas-alumnos';
const EXPIRY_DAYS = 10;

const ALLOWED_MIME = [
  'application/pdf',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
];

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

// -------------------------------------------------------------------
// 1. SUBIR ENTREGA DE ALUMNO
//    - Valida tipo y tamaño
//    - Si ya existe archivo previo, lo borra del storage
//    - Sube nuevo archivo
//    - Guarda registro en BD (primer_envio_en NO se actualiza si ya existe)
// -------------------------------------------------------------------
export async function subirEntregaAlumno(formData: FormData) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'No autenticado' };

  const file = formData.get('archivo') as File;
  const ejercicioId = formData.get('ejercicioId') as string;

  if (!file || !ejercicioId) return { error: 'Datos incompletos' };
  if (file.size > MAX_SIZE) return { error: 'El archivo supera el límite de 5 MB' };
  if (!ALLOWED_MIME.includes(file.type)) return { error: 'Tipo de archivo no permitido' };

  // Verificar si ya existe un registro (para preservar primer_envio_en)
  const { data: existing } = await supabaseAdmin
    .from('resultados_ejercicios')
    .select('archivo_path, primer_envio_en, caduca_el')
    .eq('alumno_id', user.id)
    .eq('ejercicio_id', ejercicioId)
    .maybeSingle();

  // Si ya tenía archivo previo, borrarlo del storage
  if (existing?.archivo_path) {
    await supabaseAdmin.storage.from(BUCKET).remove([existing.archivo_path]);
  }

  // Construir ruta única: {alumno_id}/{ejercicio_id}/{timestamp}-{nombre}
  const ext = file.name.split('.').pop();
  const timestamp = Date.now();
  const filePath = `${user.id}/${ejercicioId}/${timestamp}.${ext}`;

  // Subir archivo al bucket
  const bytes = await file.arrayBuffer();
  const { error: uploadError } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(filePath, bytes, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) return { error: `Error al subir: ${uploadError.message}` };

  // Obtener URL firmada (válida 7 días para darle margen al profesor)
  const { data: signedData } = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUrl(filePath, 60 * 60 * 24 * 7); // 7 días

  // Calcular fechas: primer_envio_en solo se pone la PRIMERA vez
  const ahora = new Date();
  const primerEnvio = existing?.primer_envio_en ? new Date(existing.primer_envio_en) : ahora;
  const caduca = new Date(primerEnvio.getTime() + EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  // Guardar en base de datos
  const { error: dbError } = await supabaseAdmin
    .from('resultados_ejercicios')
    .upsert({
      alumno_id: user.id,
      ejercicio_id: ejercicioId,
      estado: 'completado',
      archivo_url: signedData?.signedUrl || '',
      archivo_nombre: file.name,
      archivo_path: filePath,
      primer_envio_en: primerEnvio.toISOString(),
      caduca_el: caduca.toISOString(),
    }, { onConflict: 'alumno_id, ejercicio_id' })
    .select()
    .single();

  if (dbError) {
    // Intentar limpiar archivo subido si falló el DB
    await supabaseAdmin.storage.from(BUCKET).remove([filePath]);
    return { error: `Error al registrar: ${dbError.message}` };
  }

  revalidatePath('/dashboard/alumno/materias');
  return { success: true, caduca_el: caduca.toISOString() };
}

// -------------------------------------------------------------------
// 2. OBTENER ENTREGA DE UN ALUMNO PARA UN EJERCICIO
// -------------------------------------------------------------------
export async function getEntregaAlumno(ejercicioId: string) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabaseAdmin
    .from('resultados_ejercicios')
    .select('archivo_url, archivo_nombre, archivo_path, primer_envio_en, caduca_el, calificacion_manual')
    .eq('alumno_id', user.id)
    .eq('ejercicio_id', ejercicioId)
    .maybeSingle();

  return data;
}

// -------------------------------------------------------------------
// 3. CALIFICAR ENTREGA (USO DEL PROFESOR)
//    - Guarda calificacion_manual en resultados_ejercicios
//    - Bloquea el registro (no se aceptan más subidas)
// -------------------------------------------------------------------
export async function calificarEntregaDescriptiva(
  alumnoId: string,
  ejercicioId: string,
  calificacion: number
) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'No autenticado' };

  if (calificacion < 0 || calificacion > 10) {
    return { error: 'Calificación debe ser entre 0 y 10' };
  }

  const { error } = await supabaseAdmin
    .from('resultados_ejercicios')
    .update({
      calificacion_manual: calificacion,
      calificacion: calificacion * 10, // Convertir a escala de 100 para promediar
      bloqueado: true,
      estado: 'calificado',
    })
    .eq('alumno_id', alumnoId)
    .eq('ejercicio_id', ejercicioId);

  if (error) return { error: error.message };

  revalidatePath('/dashboard/profesor');
  return { success: true };
}

// -------------------------------------------------------------------
// 4. OBTENER ENTREGAS PARA EL PROFESOR
//    Retorna todos los alumnos que entregaron un ejercicio dado
// -------------------------------------------------------------------
export async function getEntregasDeEjercicio(ejercicioId: string) {
  // Obtener las entregas
  const { data: entregasData, error } = await supabaseAdmin
    .from('resultados_ejercicios')
    .select(`
      alumno_id,
      archivo_url,
      archivo_nombre,
      archivo_path,
      primer_envio_en,
      caduca_el,
      calificacion_manual,
      estado,
      calificacion,
      aciertos,
      total_preguntas,
      intentos,
      bloqueado,
      fecha_completado,
      historico_intentos
    `)
    .eq('ejercicio_id', ejercicioId)
    .order('primer_envio_en', { ascending: true });

  if (error) return { error: error.message };
  if (!entregasData || entregasData.length === 0) return { data: [] };

  // Extraer los IDs únicos de alumnos y buscar sus perfiles en una consulta separada 
  // (Para evitar errores si falta la Foreign Key directa entre ambas tablas)
  const alumnoIds = Array.from(new Set(entregasData.map(e => e.alumno_id)));
  
  const { data: profilesData, error: profError } = await supabaseAdmin
    .from('profiles')
    .select('id, nombre, apellidos, email')
    .in('id', alumnoIds);

  const profilesMap = new Map();
  if (profilesData) {
    profilesData.forEach(p => profilesMap.set(p.id, p));
  }

  // Combinar entregas con sus perfiles
  const result = entregasData.map(entrega => ({
    ...entrega,
    profiles: profilesMap.get(entrega.alumno_id) || null
  }));

  return { data: result };
}

// -------------------------------------------------------------------
// 5. OBTENER EJERCICIOS DESCRIPTIVOS DE UN TEMA (PARA PROFESOR)
// -------------------------------------------------------------------
export async function getEjerciciosDescriptivosDeTema(temaId: string) {
  const { data, error } = await supabaseAdmin
    .from('ejercicios')
    .select('id, titulo, fecha_entrega')
    .eq('tema_id', temaId)
    .eq('tipo', 'actividad_descriptiva')
    .order('created_at', { ascending: false });

  if (error) return { error: error.message };
  return { data: data || [] };
}

// -------------------------------------------------------------------
// 6. RENOVAR URLs FIRMADAS (para el cron o cuando expiran)
// -------------------------------------------------------------------
export async function renovarUrlFirmada(filePath: string) {
  const { data } = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUrl(filePath, 60 * 60 * 24 * 7);
  return data?.signedUrl || null;
}
