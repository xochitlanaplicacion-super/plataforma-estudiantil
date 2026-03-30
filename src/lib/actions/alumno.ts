import { createClient } from '@supabase/supabase-js';

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
    // 1. Perfil del alumno
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from('profiles')
      .select(`
        id, nombre, apellidos, estatus, matricula, grupo_id, carrera_id,
        grupos (nombre, turno, grados(nombre)),
        carreras (nombre)
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

    // 2. Materias del grupo
    const { data: grupoMaterias, error: gmErr } = await supabaseAdmin
      .from('grupo_materias')
      .select(`
        materia_id,
        materias (id, nombre, clave)
      `)
      .eq('grupo_id', profile.grupo_id)
      .eq('activo', true);

    if (gmErr) throw gmErr;

    // 3. Obtener profesores para las materias del grupo
    const materiaIds = grupoMaterias?.map(gm => gm.materia_id) || [];
    
    // Obtenemos todos los profesores asignados a este grupo
    const { data: asignaciones, error: asigErr } = await supabaseAdmin
      .from('asignaciones_profesor')
      .select(`
        materia_id,
        profesor_id,
        profiles!asignaciones_profesor_profesor_id_fkey(nombre, apellidos)
      `)
      .eq('grupo_id', profile.grupo_id)
      .eq('activo', true);

    // Mapear los profesores a cada materia
    const materiasAsignadas = grupoMaterias?.map((gm: any) => {
      const asignacion = asignaciones?.find(a => a.materia_id === gm.materia_id);
      return {
        id: gm.materias?.id,
        nombre: gm.materias?.nombre,
        clave: gm.materias?.clave,
        profesor: (() => {
          if (!asignacion?.profiles) return 'Profesor por asignar';
          const prof = Array.isArray(asignacion.profiles) ? asignacion.profiles[0] : asignacion.profiles;
          return `${(prof as any).nombre} ${(prof as any).apellidos}`;
        })(),
        profesor_id: asignacion?.profesor_id || null
      };
    }) || [];

    // 4. Últimos ejercicios o tareas (simplificado por ahora, se obtendrán todos los ejercicios de la carrera o un límite)
    // Para simplificar, buscamos temas que tengan material
    const { data: ultimosEjercicios } = await supabaseAdmin
      .from('ejercicios')
      .select('id, titulo, tipo, created_at, tema_id')
      .eq('publicado', true)
      .order('created_at', { ascending: false })
      .limit(5);

    return {
      profile,
      materiasAsignadas,
      pendientes: ultimosEjercicios || []
    };

  } catch (error: any) {
    console.error('Error fetching alumno dashboard:', error.message);
    return { error: error.message };
  }
}
