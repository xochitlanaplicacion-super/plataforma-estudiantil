'use server';

import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { parseFechaLocal } from '@/lib/utils';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

export async function getAlumnoDashboardData(userId: string) {
  try {
    // 1. Perfil del alumno completo
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from('profiles')
      .select(`
        id, nombre, apellidos, estatus, matricula, grupo_id, carrera_id,
        grupos (
          id, nombre, turno, 
          grados (id, nombre)
        ),
        carreras (id, nombre, nivel_id)
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
        materias (id, nombre, clave),
        profiles!asignaciones_profesor_profesor_id_fkey(nombre, apellidos)
      `)
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
          const { data: ejercicios } = await supabaseAdmin
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
            .order('fecha_entrega', { ascending: true });

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
      .select('ejercicio_id, calificacion, aciertos, total_preguntas, bloqueado, calificacion_manual')
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
        calificacion: resultado?.calificacion ?? resultado?.calificacion_manual ?? null,
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
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'No user authenticated' };
  }

  // 1. Obtener datos del ejercicio y registro existente para este alumno
  const { data: exerciseData } = await supabase
    .from('ejercicios')
    .select('fecha_entrega')
    .eq('id', ejercicioId)
    .single();

  const { data: existing } = await supabase
    .from('resultados_ejercicios')
    .select('*')
    .eq('alumno_id', user.id)
    .eq('ejercicio_id', ejercicioId)
    .single();

  // 2. Seguridad: Validar si el ejercicio ya venció
  if (exerciseData?.fecha_entrega) {
    const deadline = parseFechaLocal(exerciseData.fecha_entrega);
    const now = new Date();
    if (now > deadline) {
      return {
        success: true,
        isExpired: true,
        message: 'Ejercicio vencido. Puedes practicar, pero la nota no se guardará.'
      };
    }
  }

  // 3. Si ya está bloqueado (sacó 100 antes), no promediar más
  if (existing?.bloqueado) {
    return { success: true, data: existing, message: 'Calificación perfecta ya registrada.' };
  }

  // Cálculos de promedio acumulado
  const nuevosIntentos = (existing?.intentos || 0) + 1;
  const nuevaSuma = (Number(existing?.suma_calificaciones) || 0) + calificacionIntento;
  const nuevaCalificacionPromedio = Math.min(100, nuevaSuma / nuevosIntentos);

  // Determinar si bloqueamos (si EN ESTE INTENTO sacó 100)
  const debeBloquear = calificacionIntento >= 100;

  // Actualizar el historial de intentos
  const historicoPrevio = Array.isArray(existing?.historico_intentos) ? existing.historico_intentos : [];
  const nuevoIntento = {
    intento: nuevosIntentos,
    fecha: new Date().toISOString(),
    calificacion: calificacionIntento,
    aciertos,
    total_preguntas: total,
    detalles: detallesErrores || null
  };
  const nuevoHistorico = [...historicoPrevio, nuevoIntento];

  const { data, error } = await supabase
    .from('resultados_ejercicios')
    .upsert({
      alumno_id: user.id,
      ejercicio_id: ejercicioId,
      calificacion: nuevaCalificacionPromedio,
      aciertos: aciertos,
      total_preguntas: total,
      intentos: nuevosIntentos,
      suma_calificaciones: nuevaSuma,
      bloqueado: debeBloquear,
      estado: 'completado',
      fecha_completado: new Date().toISOString(),
      historico_intentos: nuevoHistorico
    }, {
      onConflict: 'alumno_id, ejercicio_id'
    })
    .select()
    .single();

  if (error) {
    console.error('Error saving exercise result:', error);
    return { error: error.message };
  }

  return { success: true, data };
}

export async function getMateriasYTemasParaAlumno(userId: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) return [];
  
  const supabaseAdmin = createClient(supabaseUrl, supabaseKey);
  
  const { data: profile } = await supabaseAdmin.from("profiles").select("grupo_id").eq("id", userId).single();
  if (!profile?.grupo_id) return [];

  const { data: asig } = await supabaseAdmin
    .from("asignaciones_profesor")
    .select(`
      materia_id,
      materias (
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
