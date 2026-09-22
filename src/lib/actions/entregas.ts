'use server';

import { requireTenantSession } from '@/lib/tenant/context';

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { dispatchSubmissionPush } from '@/lib/notifications/submission-push';
import { randomUUID } from 'node:crypto';
import { descriptiveSubmission } from '@/lib/academic-grading/source-adapters';
import {
  academicExerciseErrorMessage,
  parseExerciseResultResponse,
  validateDescriptiveGrade,
} from '@/lib/academic-grading/exercise-results';
import {
  ACADEMIC_UPLOAD_MAX_BYTES,
  ACADEMIC_UPLOAD_MAX_MB,
  normalizeAcademicUpload,
} from '@/lib/storage/academic-uploads';
import { resolveExerciseUnitId } from '@/lib/academic-grading/submission-context';

const BUCKET = 'entregas-alumnos';
const EXPIRY_DAYS = 10;

const SIGNED_URL_SECONDS = 5 * 60;
const UPLOAD_INTENT_TTL_MS = 10 * 60 * 1000;
const MAX_NEW_UPLOAD_INTENTS_PER_HOUR = 10;

interface StudentUploadInput {
  ejercicioId: string;
  archivoNombre: string;
  archivoTipo: string;
  archivoTamano: number;
}

interface ConfirmStudentUploadInput extends StudentUploadInput {
  archivoPath: string;
  uploadIntentId: string;
}

async function obtenerContextoEntrega(
  supabase: any,
  admin: any,
  tenantId: string,
  alumnoId: string,
  ejercicioId: string
) {
  const { data: ejercicio } = await admin
    .from('ejercicios')
    .select('id, tipo, fecha_entrega, temas(unidad_id)')
    .eq('id', ejercicioId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (!ejercicio || ejercicio.tipo !== 'actividad_descriptiva') {
    return { error: 'La actividad descriptiva no existe en tu institución' } as const;
  }

  const { data: existing } = await admin
    .from('resultados_ejercicios')
    .select('archivo_path, primer_envio_en, caduca_el')
    .eq('tenant_id', tenantId)
    .eq('alumno_id', alumnoId)
    .eq('ejercicio_id', ejercicioId)
    .maybeSingle();

  // Este acceso usa deliberadamente el cliente autenticado: la RLS de los
  // vinculos sólo deja ver al alumno las asignaciones de su grupo vigente.
  const { data: link } = await supabase
    .from('vinculos_evaluacion_ejercicio')
    .select('id, ciclo_escolar_id, asignacion_profesor_id, periodos_evaluacion!inner(estado)')
    .eq('tenant_id', tenantId)
    .eq('ejercicio_id', ejercicioId)
    .eq('origen', 'descriptiveSubmission')
    .eq('activo', true)
    .eq('periodos_evaluacion.estado', 'activo')
    .limit(1)
    .maybeSingle();

  const { data: assignment } = link ? await admin
    .from('asignaciones_profesor')
    .select('grupo_id')
    .eq('tenant_id', tenantId)
    .eq('id', link.asignacion_profesor_id)
    .eq('ciclo_escolar_id', link.ciclo_escolar_id)
    .eq('activo', true)
    .maybeSingle() : { data: null };
  const { data: enrollment } = link && assignment?.grupo_id ? await admin
    .from('inscripciones_alumno')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('ciclo_escolar_id', link.ciclo_escolar_id)
    .eq('grupo_id', assignment.grupo_id)
    .eq('alumno_id', alumnoId)
    .eq('activo', true)
    .maybeSingle() : { data: null };
  const unitId = resolveExerciseUnitId(ejercicio.temas);

  if (!link || !assignment || !enrollment || !unitId) {
    return { error: 'La actividad aún no tiene una fuente de evaluación activa para tu inscripción.' } as const;
  }
  return { ejercicio, existing, link, enrollment, unitId, error: null } as const;
}

// -------------------------------------------------------------------
// 1. ENTREGA DE ALUMNO EN DOS FASES
//    El binario viaja directo del navegador a Supabase mediante una URL firmada.
//    Sólo la autorización y los metadatos pequeños pasan por la Server Action.
// -------------------------------------------------------------------
export async function prepararCargaEntregaAlumno(input: StudentUploadInput) {
  try {
    const { supabase, admin, tenantId, user } = await requireTenantSession(['alumno']);
    const archivo = normalizeAcademicUpload({
      name: input.archivoNombre,
      type: input.archivoTipo,
      size: input.archivoTamano,
    }, { allowImages: true });
    if (!input.ejercicioId || !archivo) {
      return { error: `Archivo inválido o mayor a ${ACADEMIC_UPLOAD_MAX_MB} MB.` };
    }

    const contexto = await obtenerContextoEntrega(supabase, admin, tenantId, user.id, input.ejercicioId);
    if (contexto.error) return { error: contexto.error };

    const now = new Date();
    const expiresAt = new Date(now.getTime() + UPLOAD_INTENT_TTL_MS);
    const normalizedName = input.archivoNombre.slice(0, 255);
    const { data: activeIntent } = await admin
      .from('student_submission_upload_intents')
      .select('id, object_path, status, expires_at')
      .eq('tenant_id', tenantId)
      .eq('alumno_id', user.id)
      .eq('ejercicio_id', input.ejercicioId)
      .in('status', ['pending', 'processing'])
      .limit(1)
      .maybeSingle();

    if (activeIntent) {
      if (
        activeIntent.status === 'processing' &&
        new Date(activeIntent.expires_at).getTime() > now.getTime()
      ) {
        return { error: 'La entrega anterior todavía se está confirmando. Espera unos segundos e inténtalo de nuevo.' };
      }

      // Cada autorización recibe una ruta nueva. El cambio condicional evita
      // cancelar un intento que otra petición acaba de reclamar para confirmar.
      const { data: cancelledIntent } = await admin
        .from('student_submission_upload_intents')
        .update({
          status: 'cancelled',
          updated_at: now.toISOString(),
        })
        .eq('id', activeIntent.id)
        .eq('tenant_id', tenantId)
        .eq('status', activeIntent.status)
        .select('id, object_path')
        .maybeSingle();
      if (!cancelledIntent) {
        return { error: 'La entrega anterior comenzó a confirmarse. Espera unos segundos e inténtalo de nuevo.' };
      }

      const { data: referenced } = await admin
        .from('resultados_ejercicios')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('alumno_id', user.id)
        .eq('ejercicio_id', input.ejercicioId)
        .eq('archivo_path', cancelledIntent.object_path)
        .limit(1)
        .maybeSingle();
      if (referenced) {
        await admin
          .from('student_submission_upload_intents')
          .update({ status: 'confirmed', confirmed_at: now.toISOString(), updated_at: now.toISOString() })
          .eq('id', cancelledIntent.id)
          .eq('status', 'cancelled');
      } else {
        // Sólo se limpia una ruta que no está referenciada por una entrega.
        // Si un token anterior termina después, el cron también la recogerá.
        await admin.storage.from(BUCKET).remove([cancelledIntent.object_path]);
      }
    }

    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const { count } = await admin
      .from('student_submission_upload_intents')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('alumno_id', user.id)
      .eq('ejercicio_id', input.ejercicioId)
      .gte('created_at', oneHourAgo);
    if ((count || 0) >= MAX_NEW_UPLOAD_INTENTS_PER_HOUR) {
      return { error: 'Se alcanzó el límite temporal de intentos para esta tarea. Espera una hora o solicita apoyo al profesor.' };
    }

    const filePath = `${tenantId}/entregas/${user.id}/${input.ejercicioId}/${randomUUID()}`;
    const { data: intent, error: intentError } = await admin
      .from('student_submission_upload_intents')
      .insert({
        tenant_id: tenantId,
        alumno_id: user.id,
        ejercicio_id: input.ejercicioId,
        object_path: filePath,
        original_name: normalizedName,
        content_type: archivo.mime,
        size_bytes: input.archivoTamano,
        status: 'pending',
        expires_at: expiresAt.toISOString(),
        updated_at: now.toISOString(),
      })
      .select('id, object_path')
      .single();
    if (intentError || !intent) {
      return { error: `No se pudo registrar la autorización de carga: ${intentError?.message || 'intento no disponible'}` };
    }

    const { data, error } = await admin.storage
      .from(BUCKET)
      .createSignedUploadUrl(filePath, { upsert: false });
    if (error || !data?.token) {
      return { error: `No se pudo preparar la carga: ${error?.message || 'token no disponible'}` };
    }

    return {
      success: true,
      uploadIntentId: intent.id,
      archivoPath: filePath,
      token: data.token,
      contentType: archivo.mime,
    };
  } catch (error: any) {
    return { error: error.message || 'No se pudo preparar la carga.' };
  }
}

export async function confirmarCargaEntregaAlumno(input: ConfirmStudentUploadInput) {
  const { supabase, admin, tenantId, user } = await requireTenantSession(['alumno']);
  const archivo = normalizeAcademicUpload({
    name: input.archivoNombre,
    type: input.archivoTipo,
    size: input.archivoTamano,
  }, { allowImages: true });
  const expectedPrefix = `${tenantId}/entregas/${user.id}/${input.ejercicioId}/`;
  if (!archivo || !input.archivoPath?.startsWith(expectedPrefix)) {
    return { error: 'La ruta o el archivo de la entrega no es válido.' };
  }

  const relativeName = input.archivoPath.slice(expectedPrefix.length);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(relativeName)) {
    return { error: 'La ruta de la entrega no coincide con el archivo autorizado.' };
  }

  // Se consulta antes de cualquier validación que pudiera limpiar Storage.
  // Una ruta ya persistida jamás debe borrarse por metadata manipulada o por
  // un reintento ocurrido después de que el periodo haya cerrado.
  const { data: alreadyConfirmed } = await admin
    .from('resultados_ejercicios')
    .select('archivo_path, caduca_el')
    .eq('tenant_id', tenantId)
    .eq('alumno_id', user.id)
    .eq('ejercicio_id', input.ejercicioId)
    .maybeSingle();
  if (alreadyConfirmed?.archivo_path === input.archivoPath) {
    await admin
      .from('student_submission_upload_intents')
      .update({ status: 'confirmed', confirmed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', input.uploadIntentId)
      .eq('tenant_id', tenantId)
      .eq('object_path', input.archivoPath)
      .in('status', ['pending', 'processing']);
    return {
      success: true,
      caduca_el: alreadyConfirmed.caduca_el,
      archivo_path: input.archivoPath,
      alreadyConfirmed: true,
    };
  }

  const { data: intent } = await admin
    .from('student_submission_upload_intents')
    .select('id, object_path, original_name, content_type, size_bytes, status, expires_at')
    .eq('id', input.uploadIntentId)
    .eq('tenant_id', tenantId)
    .eq('alumno_id', user.id)
    .eq('ejercicio_id', input.ejercicioId)
    .maybeSingle();
  if (
    !intent ||
    intent.object_path !== input.archivoPath ||
    intent.original_name !== input.archivoNombre.slice(0, 255) ||
    intent.content_type !== archivo.mime ||
    Number(intent.size_bytes) !== input.archivoTamano ||
    intent.status !== 'pending' ||
    new Date(intent.expires_at).getTime() <= Date.now()
  ) {
    return { error: 'La autorización de carga ya no es válida. Selecciona el archivo y vuelve a subirlo.' };
  }

  const { data: storedObjects, error: objectError } = await admin.storage
    .from(BUCKET)
    .list(expectedPrefix.slice(0, -1), { search: relativeName, limit: 10 });
  const storedObject = storedObjects?.find((object: any) => object.name === relativeName);
  const storedSize = Number(storedObject?.metadata?.size);
  const storedMime = String(storedObject?.metadata?.mimetype || storedObject?.metadata?.contentType || '').toLowerCase();
  if (
    objectError ||
    !storedObject ||
    !Number.isFinite(storedSize) ||
    storedSize <= 0 ||
    storedSize > ACADEMIC_UPLOAD_MAX_BYTES ||
    storedSize !== input.archivoTamano ||
    (storedMime && storedMime !== archivo.mime)
  ) {
    return { error: 'Storage no confirmó un archivo válido de hasta 20 MB.' };
  }

  const processingAt = new Date().toISOString();
  const { data: claimedIntent } = await admin
    .from('student_submission_upload_intents')
    .update({ status: 'processing', updated_at: processingAt })
    .eq('id', intent.id)
    .eq('tenant_id', tenantId)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();
  if (!claimedIntent) {
    return { error: 'La entrega ya se está confirmando. Actualiza la página en unos segundos.' };
  }

  const contexto = await obtenerContextoEntrega(supabase, admin, tenantId, user.id, input.ejercicioId);
  if (contexto.error) {
    await admin
      .from('student_submission_upload_intents')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', intent.id)
      .eq('status', 'processing');
    return { error: contexto.error };
  }
  const { ejercicio, existing, link, enrollment, unitId } = contexto;
  const ahora = new Date();
  const primerEnvio = existing?.primer_envio_en ? new Date(existing.primer_envio_en) : ahora;
  const caduca = new Date(primerEnvio.getTime() + EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  const submission = descriptiveSubmission({
    submittedAt: ahora,
    dueAt: ejercicio.fecha_entrega ? new Date(ejercicio.fecha_entrega) : null,
  });

  const { error: dbError } = await admin
    .from('resultados_ejercicios')
    .upsert({
      tenant_id: tenantId,
      alumno_id: user.id,
      ejercicio_id: input.ejercicioId,
      estado: submission.state,
      archivo_url: null,
      archivo_nombre: input.archivoNombre.slice(0, 255),
      archivo_path: input.archivoPath,
      primer_envio_en: primerEnvio.toISOString(),
      caduca_el: caduca.toISOString(),
      ...(existing ? {} : {
        inscripcion_alumno_id: enrollment!.id,
        vinculo_evaluacion_id: link!.id,
        unidad_origen_id: unitId,
        origen: 'descriptiveSubmission' as const,
        registro_legacy: false,
      }),
    }, { onConflict: 'alumno_id, ejercicio_id' })
    .select()
    .single();

  if (dbError) {
    await admin
      .from('student_submission_upload_intents')
      .update({ status: 'pending', updated_at: new Date().toISOString() })
      .eq('id', intent.id)
      .eq('status', 'processing');
    return { error: `Error al registrar: ${dbError.message}` };
  }
  const confirmedAt = new Date().toISOString();
  const { error: confirmationError } = await admin
    .from('student_submission_upload_intents')
    .update({ status: 'confirmed', confirmed_at: confirmedAt, updated_at: confirmedAt })
    .eq('id', intent.id)
    .eq('status', 'processing');
  if (confirmationError) {
    console.error('[KIBO entrega] La nota se guardó, pero no se pudo cerrar el intento de carga:', confirmationError.message);
  }
  if (existing?.archivo_path && existing.archivo_path !== input.archivoPath) {
    await admin.storage.from(BUCKET).remove([existing.archivo_path]);
  }

  revalidatePath('/dashboard/alumno/materias');
  revalidatePath(`/dashboard/alumno/ejercicios/${input.ejercicioId}`);
  after(async () => { try { await dispatchSubmissionPush(); } catch { console.warn('[KIBO push] Entrega guardada; aviso pendiente de reintento.'); } });
  return { success: true, caduca_el: caduca.toISOString(), archivo_path: input.archivoPath };
}

// -------------------------------------------------------------------
// 2. OBTENER ENTREGA DE UN ALUMNO PARA UN EJERCICIO
// -------------------------------------------------------------------
export async function getEntregaAlumno(ejercicioId: string) {
  const { admin, tenantId, user } = await requireTenantSession(['alumno']);

  const { data } = await admin
    .from('resultados_ejercicios')
    .select('archivo_url, archivo_nombre, archivo_path, primer_envio_en, caduca_el, calificacion')
    .eq('tenant_id', tenantId)
    .eq('alumno_id', user.id)
    .eq('ejercicio_id', ejercicioId)
    .maybeSingle();

  return data;
}

// -------------------------------------------------------------------
// 3. GENERAR ACCESO EFÍMERO PARA VER O DESCARGAR
//    Nunca reutiliza la URL persistida: se firma al momento durante 5 minutos.
// -------------------------------------------------------------------
export async function obtenerAccesoArchivoEntrega(
  filePath: string,
  modo: 'ver' | 'descargar'
) {
  try {
    const { supabase, admin, tenantId, user, profile } = await requireTenantSession([
      'alumno',
      'profesor',
      'admin',
      'superuser',
    ]);
    if (!filePath || !filePath.startsWith(`${tenantId}/entregas/`)) {
      return { error: 'Ruta de archivo inválida' };
    }

    const { data: entrega } = await admin
      .from('resultados_ejercicios')
      .select('alumno_id, ejercicio_id, archivo_path, archivo_nombre, caduca_el')
      .eq('tenant_id', tenantId)
      .eq('archivo_path', filePath)
      .maybeSingle();
    if (!entrega?.archivo_path) return { error: 'El archivo ya no está disponible' };
    if (entrega.caduca_el && new Date(entrega.caduca_el).getTime() <= Date.now()) {
      return { error: 'El archivo cumplió su periodo de conservación' };
    }

    if (profile.rol === 'alumno' && entrega.alumno_id !== user.id) {
      return { error: 'No tienes permiso para abrir esta entrega' };
    }
    if (profile.rol === 'profesor') {
      // La RLS académica valida el vínculo, la inscripción y la asignación
      // exacta del profesor; no se infiere acceso desde profiles.grupo_id.
      const { data: permittedResult } = await supabase
        .from('resultados_ejercicios')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('archivo_path', filePath)
        .maybeSingle();
      if (!permittedResult) return { error: 'La entrega no pertenece a uno de tus grupos' };
    }

    const options = modo === 'descargar'
      ? { download: entrega.archivo_nombre || true }
      : undefined;
    const { data, error } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(entrega.archivo_path, SIGNED_URL_SECONDS, options);
    if (error || !data?.signedUrl) {
      return { error: error?.message || 'No se pudo generar el acceso al archivo' };
    }
    return {
      success: true,
      url: data.signedUrl,
      nombre: entrega.archivo_nombre || 'entrega',
    };
  } catch (error: any) {
    return { error: error.message || 'No se pudo abrir el archivo' };
  }
}

// -------------------------------------------------------------------
// 4. CALIFICAR ENTREGA (USO DEL PROFESOR)
//    - Guarda la calificacion canonica 0-10 en resultados_ejercicios
//    - Bloquea el registro (no se aceptan más subidas)
// -------------------------------------------------------------------
export async function calificarEntregaDescriptiva(
  alumnoId: string,
  ejercicioId: string,
  calificacion: number,
  expectedRowVersion: number
) {
  const { supabase } = await requireTenantSession(['profesor', 'admin', 'superuser']);

  let notaCanonica: number;
  try {
    notaCanonica = validateDescriptiveGrade(calificacion);
  } catch {
    return { error: 'Calificación debe ser entre 0 y 10' };
  }

  if (!Number.isInteger(expectedRowVersion) || expectedRowVersion < 1) {
    return { error: 'La versión de la entrega es inválida. Actualiza la lista.' };
  }
  const { data, error } = await supabase.rpc('guardar_resultado_ejercicio_academico', {
    p_ejercicio_id: ejercicioId,
    p_operacion: 'descriptive_grade',
    p_idempotency_key: randomUUID(),
    p_expected_row_version: expectedRowVersion,
    p_alumno_id: alumnoId,
    p_calificacion_10: notaCanonica,
  });
  if (error) return { error: academicExerciseErrorMessage(error) };

  let response;
  try {
    response = parseExerciseResultResponse(data);
  } catch {
    return { error: 'La base de datos devolvió una respuesta académica inválida.' };
  }

  revalidatePath('/dashboard/profesor');
  return {
    success: true,
    grade: response.grade,
    rowVersion: response.rowVersion,
    correlationId: response.correlationId,
  };
}

// -------------------------------------------------------------------
// 4. OBTENER ENTREGAS PARA EL PROFESOR
//    Retorna todos los alumnos que entregaron un ejercicio dado
// -------------------------------------------------------------------
export async function getEntregasDeEjercicio(ejercicioId: string) {
  const { supabase: supabaseAdmin } = await requireTenantSession();
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
      estado,
      calificacion,
      row_version,
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

export async function getEntregasAgrupadasPorSyncId(syncId: string) {
  const { supabase: supabaseAdmin } = await requireTenantSession();
  // 1. Obtener todos los ejercicios con este sync_id y sus nombres de grupo
  const { data: ejercicios } = await supabaseAdmin
    .from('ejercicios')
    .select(`
      id,
      temas (
        unidades (
          materias (
            asignaciones_profesor (
              grupos (nombre)
            )
          )
        )
      )
    `)
    .eq('sync_id', syncId);

  if (!ejercicios || ejercicios.length === 0) return { data: [] };

  const ejercicioIds = ejercicios.map(e => e.id);
  const mapEjercicioGrupo = new Map<string, string>();
  
  ejercicios.forEach((e: any) => {
    // Navigating the nested object
    const asigList = e.temas?.unidades?.materias?.asignaciones_profesor;
    let grupoNombre = 'Grupo Desconocido';
    if (asigList && asigList.length > 0 && asigList[0].grupos?.nombre) {
      grupoNombre = asigList[0].grupos.nombre;
    }
    mapEjercicioGrupo.set(e.id, grupoNombre);
  });

  // 2. Fetch entregas para esos IDs
  const { data: entregasData, error } = await supabaseAdmin
    .from('resultados_ejercicios')
    .select(`
      alumno_id,
      ejercicio_id,
      archivo_url,
      archivo_nombre,
      archivo_path,
      primer_envio_en,
      caduca_el,
      estado,
      calificacion,
      row_version,
      aciertos,
      total_preguntas,
      intentos,
      bloqueado,
      fecha_completado,
      historico_intentos
    `)
    .in('ejercicio_id', ejercicioIds)
    .order('primer_envio_en', { ascending: true });

  if (error) return { error: error.message };
  if (!entregasData || entregasData.length === 0) return { data: [] };

  const alumnoIds = Array.from(new Set(entregasData.map(e => e.alumno_id)));
  
  const { data: profilesData } = await supabaseAdmin
    .from('profiles')
    .select('id, nombre, apellidos, email')
    .in('id', alumnoIds);

  const profilesMap = new Map();
  if (profilesData) {
    profilesData.forEach(p => profilesMap.set(p.id, p));
  }

  // 3. Combinar todo
  const result = entregasData.map(entrega => ({
    ...entrega,
    grupo_nombre: mapEjercicioGrupo.get(entrega.ejercicio_id),
    profiles: profilesMap.get(entrega.alumno_id) || null
  }));

  return { data: result };
}

// -------------------------------------------------------------------
// 5. OBTENER EJERCICIOS DESCRIPTIVOS DE UN TEMA (PARA PROFESOR)
// -------------------------------------------------------------------
export async function getEjerciciosDescriptivosDeTema(temaId: string) {
  const { supabase: supabaseAdmin } = await requireTenantSession();
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
// 7. OBTENER TODAS LAS ENTREGAS ACTIVAS DE ACTIVIDADES DESCRIPTIVAS
//    PARA UN PROFESOR (vista global, agrupadas por materia)
// -------------------------------------------------------------------
export async function getEntregasGlobalesProfesor(_profesorId?: string) {
  const { admin: supabaseAdmin, tenantId, user } = await requireTenantSession(['profesor']);
  const profesorId = user.id;
  try {
    // 1. Obtener asignaciones activas del profesor
    const { data: asignaciones, error: asigError } = await supabaseAdmin
      .from('asignaciones_profesor')
      .select('materia_id, grupo_id, materias(id, nombre), grupos(id, nombre)')
      .eq('tenant_id', tenantId)
      .eq('profesor_id', profesorId)
      .eq('activo', true);

    if (asigError || !asignaciones || asignaciones.length === 0) {
      return { data: [], error: asigError?.message };
    }

    // Recopilar IDs únicos de materias
    const materiaIds = Array.from(new Set(asignaciones.map(a => a.materia_id).filter(Boolean))) as string[];

    if (materiaIds.length === 0) return { data: [] };

    // 2. Obtener unidades de esas materias
    const { data: unidades } = await supabaseAdmin
      .from('unidades')
      .select('id, materia_id')
      .eq('tenant_id', tenantId)
      .in('materia_id', materiaIds);

    if (!unidades || unidades.length === 0) return { data: [] };
    const unidadIds = unidades.map(u => u.id);

    // 3. Obtener temas de esas unidades
    const { data: temas } = await supabaseAdmin
      .from('temas')
      .select('id, unidad_id')
      .eq('tenant_id', tenantId)
      .in('unidad_id', unidadIds);

    if (!temas || temas.length === 0) return { data: [] };
    const temaIds = temas.map(t => t.id);

    // 4. Obtener solo ejercicios de tipo actividad_descriptiva
    const { data: ejercicios } = await supabaseAdmin
      .from('ejercicios')
      .select('id, tema_id, titulo, fecha_entrega, tipo, sync_id')
      .eq('tenant_id', tenantId)
      .in('tema_id', temaIds)
      .eq('tipo', 'actividad_descriptiva');

    if (!ejercicios || ejercicios.length === 0) return { data: [] };
    const ejercicioIds = ejercicios.map(e => e.id);

    // 5. Obtener entregas (resultados) que aún no caducaron
    const ahora = new Date().toISOString();
    const { data: entregas } = await supabaseAdmin
      .from('resultados_ejercicios')
      .select(`
        alumno_id,
        ejercicio_id,
        archivo_url,
        archivo_nombre,
        archivo_path,
        primer_envio_en,
        caduca_el,
        calificacion,
        row_version,
        estado
      `)
      .eq('tenant_id', tenantId)
      .in('ejercicio_id', ejercicioIds)
      .not('archivo_path', 'is', null)
      .gte('caduca_el', ahora)
      .order('primer_envio_en', { ascending: true });

    if (!entregas || entregas.length === 0) return { data: [] };

    // 6. Obtener perfiles de los alumnos
    const alumnoIds = Array.from(new Set(entregas.map(e => e.alumno_id)));
    const { data: profiles } = await supabaseAdmin
      .from('profiles')
      .select('id, nombre, apellidos, email, grupo_id')
      .eq('tenant_id', tenantId)
      .in('id', alumnoIds);

    const profilesMap = new Map<string, any>();
    profiles?.forEach(p => profilesMap.set(p.id, p));

    // 7. Obtener nombres de grupos de los alumnos
    const grupoIdsAlumnos = Array.from(new Set((profiles || []).map(p => p.grupo_id).filter(Boolean)));
    const gruposMap = new Map<string, string>();
    if (grupoIdsAlumnos.length > 0) {
      const { data: gruposData } = await supabaseAdmin
        .from('grupos')
        .select('id, nombre')
        .eq('tenant_id', tenantId)
        .in('id', grupoIdsAlumnos);
      gruposData?.forEach(g => gruposMap.set(g.id, g.nombre));
    }

    // 8. Construir mapeo de ejercicio -> materia
    const temaToUnidadMap = new Map<string, string>();
    temas.forEach(t => temaToUnidadMap.set(t.id, t.unidad_id));
    const unidadToMateriaMap = new Map<string, string>();
    unidades.forEach(u => unidadToMateriaMap.set(u.id, u.materia_id));

    // Mapeo de materia_id -> nombre
    const materiaNombreMap = new Map<string, string>();
    asignaciones.forEach((a: any) => {
      if (a.materias?.id && a.materias?.nombre) {
        materiaNombreMap.set(a.materias.id, a.materias.nombre);
      }
    });

    // 9. Agrupar por materia
    const materiaGroups = new Map<string, {
      materiaId: string;
      materiaNombre: string;
      ejercicios: Map<string, {
        ejercicioId: string;
        ejercicioTitulo: string;
        fechaEntrega: string | null;
        entregas: any[];
      }>;
    }>();

    for (const entrega of entregas) {
      const ejercicio = ejercicios.find(e => e.id === entrega.ejercicio_id);
      if (!ejercicio) continue;

      const unidadId = temaToUnidadMap.get(ejercicio.tema_id);
      if (!unidadId) continue;
      const materiaId = unidadToMateriaMap.get(unidadId);
      if (!materiaId) continue;

      if (!materiaGroups.has(materiaId)) {
        materiaGroups.set(materiaId, {
          materiaId,
          materiaNombre: materiaNombreMap.get(materiaId) || 'Materia',
          ejercicios: new Map(),
        });
      }

      const group = materiaGroups.get(materiaId)!;
      if (!group.ejercicios.has(ejercicio.id)) {
        group.ejercicios.set(ejercicio.id, {
          ejercicioId: ejercicio.id,
          ejercicioTitulo: ejercicio.titulo,
          fechaEntrega: ejercicio.fecha_entrega,
          entregas: [],
        });
      }

      const profile = profilesMap.get(entrega.alumno_id);
      const grupoNombre = profile?.grupo_id ? gruposMap.get(profile.grupo_id) || null : null;

      group.ejercicios.get(ejercicio.id)!.entregas.push({
        ...entrega,
        profiles: profile ? { nombre: profile.nombre, apellidos: profile.apellidos, email: profile.email } : null,
        grupo_nombre: grupoNombre,
      });
    }

    // 10. Convertir a array serializable
    const result = Array.from(materiaGroups.values()).map(group => ({
      materiaId: group.materiaId,
      materiaNombre: group.materiaNombre,
      ejercicios: Array.from(group.ejercicios.values()),
    }));

    return { data: result };
  } catch (err: any) {
    console.error('Error en getEntregasGlobalesProfesor:', err);
    return { data: [], error: err.message };
  }
}
