'use server';

import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';

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
        carreras (id, nombre)
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

    // 2. MATERIAS ASIGNADAS AL GRUPO (Usando asignaciones_profesor como fuente de verdad)
    // Cada asignación tiene un solo grupo_id (normalizado, sin CSV)
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

    // Formatear la lista de materias
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

    // 3. OBTENER EJERCICIOS REALES
    // Flujo: materias -> unidades -> temas -> ejercicios
    let ejerciciosPublicados: any[] = [];
    
    if (materiaIds.length > 0) {
      const { data: unidades } = await supabaseAdmin
        .from('unidades')
        .select('id, materia_id')
        .in('materia_id', materiaIds)
        .eq('activo', true);

      const unidadIds = unidades?.map(u => u.id) || [];

      if (unidadIds.length > 0) {
        const { data: temas } = await supabaseAdmin
          .from('temas')
          .select('id, titulo, unidad_id')
          .in('unidad_id', unidadIds);

        const temaIds = temas?.map(t => t.id) || [];

        if (temaIds.length > 0) {
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
        calificacion: resultado?.calificacion || null,
        aciertos: resultado?.aciertos || 0,
        total_preguntas: resultado?.total_preguntas || 0,
        bloqueado: resultado?.bloqueado || false
      };
    });

    // Pendientes son solo los NO completados
    const pendientes = todosLosEjercicios.filter(ej => !ej.completado);

    return {
      profile,
      materiasAsignadas,
      pendientes,
      todosLosEjercicios
    };

  } catch (error: any) {
    console.error('Error fetching alumno dashboard:', error.message);
    return { error: error.message };
  }
}

export async function saveExerciseResult(ejercicioId: string, aciertos: number, total: number, calificacionIntento: number) {
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
    const deadline = new Date(exerciseData.fecha_entrega);
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

  // 3. Cálculos de promedio acumulado
  const nuevosIntentos = (existing?.intentos || 0) + 1;
  const nuevaSuma = (Number(existing?.suma_calificaciones) || 0) + calificacionIntento;
  const nuevaCalificacionPromedio = Math.min(100, nuevaSuma / nuevosIntentos);
  
  // 4. Determinar si bloqueamos (si EN ESTE INTENTO sacó 100)
  // Esto evita que el alumno diluya sus errores iniciales; el promedio hasta este punto será su nota final inamovible.
  const debeBloquear = calificacionIntento >= 100;

  const { data, error } = await supabase
    .from('resultados_ejercicios')
    .upsert({
      alumno_id: user.id,
      ejercicio_id: ejercicioId,
      calificacion: nuevaCalificacionPromedio, // Guardamos el promedio
      aciertos: aciertos,
      total_preguntas: total,
      intentos: nuevosIntentos,
      suma_calificaciones: nuevaSuma,
      bloqueado: debeBloquear,
      estado: 'completado',
      fecha_completado: new Date().toISOString()
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
