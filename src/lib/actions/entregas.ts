'use server';

import { requireTenantSession } from '@/lib/tenant/context';

import { revalidatePath } from 'next/cache';
import { randomUUID } from 'node:crypto';

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
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
];

const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
};

const EXTENSION_BY_MIME: Record<string, string> = {
  ...Object.fromEntries(Object.entries(MIME_BY_EXTENSION).map(([extension, mime]) => [mime, extension])),
  'image/jpg': 'jpg',
};

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const SIGNED_URL_SECONDS = 5 * 60;

function normalizarArchivo(file: File) {
  const extensionNombre = file.name.split('.').pop()?.toLowerCase() || '';
  const mimeDeclarado = file.type.toLowerCase() === 'image/jpg' ? 'image/jpeg' : file.type.toLowerCase();
  const mimeGenerico = !mimeDeclarado || mimeDeclarado === 'application/octet-stream';
  if (!mimeGenerico && !ALLOWED_MIME.includes(mimeDeclarado)) return null;

  const mime = mimeGenerico ? MIME_BY_EXTENSION[extensionNombre] : mimeDeclarado;
  const extension = EXTENSION_BY_MIME[mime] || extensionNombre;

  if (!mime || !ALLOWED_MIME.includes(mime) || !extension) return null;
  return { mime, extension };
}

async function profesorPuedeAccederEjercicio(
  admin: any,
  tenantId: string,
  profesorId: string,
  ejercicioId: string,
  alumnoId?: string
) {
  const { data: ejercicio } = await admin
    .from('ejercicios')
    .select('tema_id')
    .eq('id', ejercicioId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (!ejercicio?.tema_id) return false;

  const { data: tema } = await admin
    .from('temas')
    .select('unidad_id')
    .eq('id', ejercicio.tema_id)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (!tema?.unidad_id) return false;

  const { data: unidad } = await admin
    .from('unidades')
    .select('materia_id')
    .eq('id', tema.unidad_id)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (!unidad?.materia_id) return false;

  let grupoId: string | null = null;
  if (alumnoId) {
    const { data: alumno } = await admin
      .from('profiles')
      .select('grupo_id')
      .eq('id', alumnoId)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    grupoId = alumno?.grupo_id || null;
  }

  let query = admin
    .from('asignaciones_profesor')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('profesor_id', profesorId)
    .eq('materia_id', unidad.materia_id)
    .eq('activo', true);
  if (grupoId) query = query.eq('grupo_id', grupoId);

  const { data: asignacion } = await query.limit(1).maybeSingle();
  return Boolean(asignacion);
}

// -------------------------------------------------------------------
// 1. SUBIR ENTREGA DE ALUMNO
//    - Valida tipo y tamaño
//    - Si ya existe archivo previo, lo borra del storage
//    - Sube nuevo archivo
//    - Guarda registro en BD (primer_envio_en NO se actualiza si ya existe)
// -------------------------------------------------------------------
export async function subirEntregaAlumno(formData: FormData) {
  const { admin, tenantId, user } = await requireTenantSession(['alumno']);

  const file = formData.get('archivo') as File;
  const ejercicioId = formData.get('ejercicioId') as string;

  if (!file || !ejercicioId) return { error: 'Datos incompletos' };
  if (file.size <= 0) return { error: 'El archivo está vacío' };
  if (file.size > MAX_SIZE) return { error: 'El archivo supera el límite de 10 MB' };
  const archivoNormalizado = normalizarArchivo(file);
  if (!archivoNormalizado) return { error: 'Tipo de archivo no permitido' };

  const { data: ejercicio } = await admin
    .from('ejercicios')
    .select('id, tipo')
    .eq('id', ejercicioId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (!ejercicio || ejercicio.tipo !== 'actividad_descriptiva') {
    return { error: 'La actividad descriptiva no existe en tu institución' };
  }

  // Verificar si ya existe un registro (para preservar primer_envio_en)
  const { data: existing } = await admin
    .from('resultados_ejercicios')
    .select('archivo_path, primer_envio_en, caduca_el')
    .eq('tenant_id', tenantId)
    .eq('alumno_id', user.id)
    .eq('ejercicio_id', ejercicioId)
    .maybeSingle();

  // Construir ruta única: {tenant}/entregas/{alumno}/{ejercicio}/{uuid}.{ext}
  const filePath = `${tenantId}/entregas/${user.id}/${ejercicioId}/${randomUUID()}.${archivoNormalizado.extension}`;

  // Subir primero el archivo nuevo; el anterior se elimina sólo cuando la BD confirma el cambio.
  const bytes = await file.arrayBuffer();
  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(filePath, bytes, {
      contentType: archivoNormalizado.mime,
      upsert: false,
    });

  if (uploadError) return { error: `Error al subir: ${uploadError.message}` };

  // Calcular fechas: primer_envio_en solo se pone la PRIMERA vez
  const ahora = new Date();
  const primerEnvio = existing?.primer_envio_en ? new Date(existing.primer_envio_en) : ahora;
  const caduca = new Date(primerEnvio.getTime() + EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  // Guardar en base de datos
  const { error: dbError } = await admin
    .from('resultados_ejercicios')
    .upsert({
      tenant_id: tenantId,
      alumno_id: user.id,
      ejercicio_id: ejercicioId,
      estado: 'completado',
      archivo_url: null,
      archivo_nombre: file.name,
      archivo_path: filePath,
      primer_envio_en: primerEnvio.toISOString(),
      caduca_el: caduca.toISOString(),
    }, { onConflict: 'alumno_id, ejercicio_id' })
    .select()
    .single();

  if (dbError) {
    // Intentar limpiar archivo subido si falló el DB
    await admin.storage.from(BUCKET).remove([filePath]);
    return { error: `Error al registrar: ${dbError.message}` };
  }

  if (existing?.archivo_path && existing.archivo_path !== filePath) {
    await admin.storage.from(BUCKET).remove([existing.archivo_path]);
  }

  revalidatePath('/dashboard/alumno/materias');
  revalidatePath(`/dashboard/alumno/ejercicios/${ejercicioId}`);
  return { success: true, caduca_el: caduca.toISOString(), archivo_path: filePath };
}

// -------------------------------------------------------------------
// 2. OBTENER ENTREGA DE UN ALUMNO PARA UN EJERCICIO
// -------------------------------------------------------------------
export async function getEntregaAlumno(ejercicioId: string) {
  const { admin, tenantId, user } = await requireTenantSession(['alumno']);

  const { data } = await admin
    .from('resultados_ejercicios')
    .select('archivo_url, archivo_nombre, archivo_path, primer_envio_en, caduca_el, calificacion_manual')
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
    const { admin, tenantId, user, profile } = await requireTenantSession([
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
      const permitido = await profesorPuedeAccederEjercicio(
        admin,
        tenantId,
        user.id,
        entrega.ejercicio_id,
        entrega.alumno_id
      );
      if (!permitido) return { error: 'La entrega no pertenece a uno de tus grupos' };
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
//    - Guarda calificacion_manual en resultados_ejercicios
//    - Bloquea el registro (no se aceptan más subidas)
// -------------------------------------------------------------------
export async function calificarEntregaDescriptiva(
  alumnoId: string,
  ejercicioId: string,
  calificacion: number
) {
  const { admin, tenantId, user, profile } = await requireTenantSession(['profesor', 'admin', 'superuser']);

  if (calificacion < 0 || calificacion > 10) {
    return { error: 'Calificación debe ser entre 0 y 10' };
  }

  if (profile.rol === 'profesor') {
    const permitido = await profesorPuedeAccederEjercicio(
      admin,
      tenantId,
      user.id,
      ejercicioId,
      alumnoId
    );
    if (!permitido) return { error: 'La entrega no pertenece a uno de tus grupos' };
  }

  const { error } = await admin
    .from('resultados_ejercicios')
    .update({
      calificacion_manual: calificacion,
      calificacion: calificacion * 10, // Convertir a escala de 100 para promediar
      bloqueado: true,
      estado: 'calificado',
    })
    .eq('tenant_id', tenantId)
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
        calificacion_manual,
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
