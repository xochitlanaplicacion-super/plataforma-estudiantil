'use server';

import { requireTenantSession } from '@/lib/tenant/context';

import { randomUUID } from 'node:crypto';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  academicExerciseErrorMessage,
  parseExerciseResultResponse,
  validateAutomaticAttempt,
} from '@/lib/academic-grading/exercise-results';
import {
  buildGameLeaderboard,
  type GameLeaderboard,
  type RankedGameType,
} from '@/lib/game-leaderboard';

async function loadGameLeaderboard(
  context: Awaited<ReturnType<typeof requireTenantSession>>,
  ejercicioId: string,
): Promise<GameLeaderboard | null> {
  const { admin, profile, tenantId, supabase, user } = context;
  if (!profile.grupo_id) return null;

  // La misma política que autoriza abrir el ejercicio debe autorizar la tabla.
  const { data: visibleLink } = await supabase
    .from('vinculos_evaluacion_ejercicio')
    .select('ejercicio_id')
    .eq('ejercicio_id', ejercicioId)
    .eq('activo', true)
    .limit(1)
    .maybeSingle();
  if (!visibleLink) return null;

  const { data: exercise } = await admin
    .from('ejercicios')
    .select('id, tipo')
    .eq('id', ejercicioId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (!exercise || !['parkour_race', 'backrooms_scape'].includes(exercise.tipo || '')) return null;

  const { data: students, error: studentsError } = await admin
    .from('profiles')
    .select('id, nombre, apellidos')
    .eq('tenant_id', tenantId)
    .eq('grupo_id', profile.grupo_id)
    .eq('rol', 'alumno')
    .eq('estatus', 'activo');
  if (studentsError || !students?.length) return buildGameLeaderboard(exercise.tipo as RankedGameType, [], [], user.id);

  const studentIds = students.map((student) => student.id);
  const { data: results, error: resultsError } = await admin
    .from('resultados_ejercicios')
    .select('alumno_id, historico_intentos')
    .eq('tenant_id', tenantId)
    .eq('ejercicio_id', ejercicioId)
    .in('alumno_id', studentIds);
  if (resultsError) return null;

  return buildGameLeaderboard(exercise.tipo as RankedGameType, students, results || [], user.id);
}

export async function getGameLeaderboard(ejercicioId: string): Promise<GameLeaderboard | null> {
  const context = await requireTenantSession(['alumno']);
  return loadGameLeaderboard(context, ejercicioId);
}

export async function getAlumnoDashboardData(userId: string) {
  const { supabase: supabaseAdmin, tenantId, user } = await requireTenantSession(['alumno']);
  try {
    if (userId !== user.id) throw new Error('No autorizado para consultar otro alumno');
    // 1. Perfil del alumno completo
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from('profiles')
      .select(`
        id, nombre, apellidos, estatus, matricula, grupo_id, carrera_id,
        grupos (
          id, nombre, turno, 
          grados (id, nombre)
        ),
        carreras (
          id, nombre, nivel_id,
          niveles (id, nombre)
        )
      `)
      .eq('id', userId)
      .single();

    if (profileErr || !profile) {
      throw profileErr || new Error('Perfil no encontrado');
    }

    if (!profile.grupo_id) {
      return {
        profile,
        materiasAsignadas: [],
        pendientes: []
      };
    }

    // 2. MATERIAS ASIGNADAS AL GRUPO
    const { data: asignaciones, error: asigErr } = await supabaseAdmin
      .from('asignaciones_profesor')
      .select(`
        materia_id,
        profesor_id,
        grupo_id,
        materias!asignaciones_profesor_materia_tenant_fkey(id, nombre, clave),
        profiles!asignaciones_profesor_profesor_tenant_fkey(nombre, apellidos)
      `)
      .eq('tenant_id', tenantId)
      .eq('grupo_id', profile.grupo_id)
      .eq('activo', true);

    if (asigErr) throw asigErr;

    const materiasAsignadas = asignaciones?.map((asig: any) => ({
      id: asig.materias?.id,
      nombre: asig.materias?.nombre,
      clave: asig.materias?.clave,
      profesor: asig.profiles
        ? `${asig.profiles.nombre} ${asig.profiles.apellidos}`
        : 'Profesor por asignar',
      profesor_id: asig.profesor_id || null
    })) || [];

    const materiaIds = materiasAsignadas.map(m => m.id).filter(Boolean);

    // 3. OBTENER ESTRUCTURA COMPLETA (Unidades, Temas, Recursos y Ejercicios)
    let todasLasUnidades: any[] = [];
    let ejerciciosPublicados: any[] = [];

    if (materiaIds.length > 0) {
      // Obtener Unidades
      const { data: unidades } = await supabaseAdmin
        .from('unidades')
        .select('*')
        .in('materia_id', materiaIds)
        .eq('activo', true)
        .order('orden');

      const unidadIds = unidades?.map(u => u.id) || [];

      if (unidadIds.length > 0) {
        // Obtener Temas
        const { data: temas } = await supabaseAdmin
          .from('temas')
          .select('*')
          .in('unidad_id', unidadIds)
          .order('orden');

        const temaIds = temas?.map(t => t.id) || [];

        if (temaIds.length > 0) {
          // Esta tabla tiene RLS por inscripción/asignación: un alumno sólo
          // recibe vínculos de su tenant, ciclo y grupo activos.
          const { data: visibleLinks, error: linksError } = await supabaseAdmin
            .from('vinculos_evaluacion_ejercicio')
            .select('ejercicio_id')
            .eq('activo', true);
          if (linksError) throw linksError;
          const visibleExerciseIds = [...new Set((visibleLinks || []).map((link) => link.ejercicio_id))];

          // Obtener Recursos (Materiales)
          const { data: recursosRaw } = await supabaseAdmin
            .from('resources')
            .select('*')
            .in('tema_id', temaIds);

          // Mapear campos de la BD (titulo, archivo_url, tipo) a los esperados por el frontend (nombre, url, tipo)
          const recursos = recursosRaw?.map(r => ({
            id: r.id,
            nombre: r.titulo || r.nombre || 'Archivo sin nombre',
            url: r.archivo_url || r.url || '',
            tema_id: r.tema_id,
            tipo: r.tipo || '',
            file_path: r.file_path || ''
          })) || [];

          // Obtener Ejercicios
          const { data: ejercicios } = visibleExerciseIds.length > 0
            ? await supabaseAdmin
              .from('ejercicios')
              .select(`
                id, titulo, tipo, created_at, tema_id, fecha_entrega,
                temas (
                  titulo,
                  unidades (
                    materia_id,
                    materias (nombre)
                  )
                )
              `)
              .in('tema_id', temaIds)
              .in('id', visibleExerciseIds)
              .order('fecha_entrega', { ascending: true })
            : { data: [] };

          ejerciciosPublicados = ejercicios || [];

          // Obtener Presentaciones (Diapositivas)
          const { data: slidesRaw } = await supabaseAdmin
            .from('slides')
            .select('*')
            .in('tema_id', temaIds)
            .order('orden');
          
          const slides = slidesRaw || [];

          // Estructurar Árbol: Unidades -> Temas -> Recursos & Slides
          todasLasUnidades = unidades?.map(u => ({
            ...u,
            materias: { nombre: materiasAsignadas.find((m: any) => m.id === u.materia_id)?.nombre || 'General' },
            temas: temas?.filter(t => t.unidad_id === u.id).map(t => ({
              ...t,
              recursos: recursos?.filter(r => r.tema_id === t.id) || [],
              slides: slides?.filter(s => s.tema_id === t.id) || []
            })) || []
          })) || [];
        }
      }
    }

    const hechos = (await supabaseAdmin
      .from('resultados_ejercicios')
      .select('ejercicio_id, calificacion, aciertos, total_preguntas, bloqueado')
      .eq('alumno_id', userId)).data || [];

    const hechosMap = new Map(hechos.map(h => [h.ejercicio_id, h]));

    // Formatear todos los ejercicios con su estado/nota
    const todosLosEjercicios = ejerciciosPublicados.map(ej => {
      const resultado = hechosMap.get(ej.id);
      return {
        id: ej.id,
        titulo: ej.titulo,
        tipo: ej.tipo,
        fecha: ej.created_at,
        fecha_entrega: ej.fecha_entrega,
        materia: ej.temas?.unidades?.materias?.nombre || 'General',
        materia_id: ej.temas?.unidades?.materia_id,
        tema: ej.temas?.titulo || '',
        completado: !!resultado,
        calificacion: resultado?.calificacion ?? null,
        aciertos: resultado?.aciertos || 0,
        total_preguntas: resultado?.total_preguntas || 0,
        bloqueado: resultado?.bloqueado || false
      };
    });

    const pendientes = todosLosEjercicios.filter(ej => !ej.completado);

    // Obtener fechas de evaluación del grupo del alumno
    let fechasEvaluacion: Record<string, string> = {};
    try {
      const { data: fechasData } = await supabaseAdmin
        .from('fechas_evaluacion')
        .select('materia_id, fecha_evaluacion')
        .eq('grupo_id', profile.grupo_id);

      if (fechasData) {
        // Buscar fecha global (materia_id = null)
        const fechaGlobal = fechasData.find(f => f.materia_id === null);

        // Mapear: para cada materia, usar su fecha específica o la global
        materiaIds.forEach(mId => {
          const especifica = fechasData.find(f => f.materia_id === mId);
          if (especifica) {
            fechasEvaluacion[mId] = especifica.fecha_evaluacion;
          } else if (fechaGlobal) {
            fechasEvaluacion[mId] = fechaGlobal.fecha_evaluacion;
          }
        });
      }
    } catch {
      // Si la tabla no existe aún, no bloquear nada
    }

    // Obtener progreso de videos
    const { data: videoProgressRaw } = await supabaseAdmin
      .from('video_progreso_alumno')
      .select('*')
      .eq('alumno_id', userId);
    
    const videoProgress = videoProgressRaw || [];

    return {
      profile,
      materiasAsignadas,
      pendientes,
      todosLosEjercicios,
      unidades: todasLasUnidades,
      fechasEvaluacion,
      videoProgress
    };

  } catch (error: any) {
    console.error('Error fetching alumno dashboard:', error.message);
    return { error: error.message };
  }
}

export async function saveExerciseResult(
  ejercicioId: string, 
  aciertos: number, 
  total: number, 
  calificacionIntento: number,
  detallesErrores?: any
) {
  const context = await requireTenantSession(['alumno']);
  const { supabase } = context;
  try {
    validateAutomaticAttempt({ hits: aciertos, total, rawPercentage: calificacionIntento });
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Resultado inválido' };
  }

  const { data: existing, error: readError } = await supabase
    .from('resultados_ejercicios')
    .select('row_version')
    .eq('ejercicio_id', ejercicioId)
    .maybeSingle();
  if (readError) return { error: readError.message };

  const { data, error } = await supabase.rpc('guardar_resultado_ejercicio_academico', {
    p_ejercicio_id: ejercicioId,
    p_operacion: 'automatic_attempt',
    p_idempotency_key: randomUUID(),
    p_expected_row_version: existing?.row_version ?? 0,
    p_aciertos: aciertos,
    p_total_preguntas: total,
    p_porcentaje_bruto: calificacionIntento,
    p_detalles: detallesErrores ?? null,
  });
  if (error) return { error: academicExerciseErrorMessage(error) };

  try {
    const response = parseExerciseResultResponse(data);
    return {
      success: true,
      isExpired: response.status === 'expired',
      message: response.message,
      data: response.grade === undefined ? undefined : {
        calificacion: response.grade,
        row_version: response.rowVersion,
        intentos: response.attempts,
        bloqueado: response.blocked ?? response.status === 'locked',
      },
      leaderboard: response.saved ? await loadGameLeaderboard(context, ejercicioId) : null,
    };
  } catch {
    return { error: 'La base de datos devolvió una respuesta académica inválida.' };
  }
}

export async function getMateriasYTemasParaAlumno(userId: string) {
  const { supabase: supabaseAdmin, tenantId, user } = await requireTenantSession(['alumno']);
  if (userId !== user.id) return [];
  const { data: profile } = await supabaseAdmin.from("profiles").select("grupo_id").eq("id", userId).single();
  if (!profile?.grupo_id) return [];

  const { data: asig } = await supabaseAdmin
    .from("asignaciones_profesor")
    .select(`
      materia_id,
      materias!asignaciones_profesor_materia_tenant_fkey (
        id, nombre,
        unidades (
          id, titulo,
          orden,
          temas (
            id, titulo,
            orden
          )
        )
      )
    `)
    .eq("tenant_id", tenantId)
    .eq("grupo_id", profile.grupo_id)
    .eq("activo", true);
    
  if (!asig) return [];
  
  // Limpiar duplicados de materia (si los hay)
  const materias = Array.from(new Map(asig.filter((a: any) => a.materias).map((a: any) => [a.materias.id, a.materias])).values()) as any[];
  
  // Ordenar unidades y temas
  materias.forEach(m => {
    if (m.unidades) {
      m.unidades.sort((a: any, b: any) => (a.orden || 0) - (b.orden || 0));
      m.unidades.forEach((u: any) => {
        if (u.temas) {
          u.temas.sort((a: any, b: any) => (a.orden || 0) - (b.orden || 0));
        }
      });
    }
  });
  
  return materias;
}

export async function saveVideoProgress(temaId: string, videoUrl: string, progresoSegundos: number, duracionTotal: number, completado: boolean) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return { error: 'No user authenticated' };

  try {
    const { error } = await supabase
      .from('video_progreso_alumno')
      .upsert({
        alumno_id: user.id,
        tema_id: temaId,
        video_url: videoUrl,
        progreso_segundos: progresoSegundos,
        duracion_total: duracionTotal,
        completado: completado,
        ultimo_visto: new Date().toISOString()
      }, {
        onConflict: 'alumno_id, tema_id, video_url'
      });

    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    console.error('Error saving video progress:', err.message);
    return { error: err.message };
  }
}
