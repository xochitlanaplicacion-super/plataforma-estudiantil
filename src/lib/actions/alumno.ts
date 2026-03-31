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
              id, titulo, tipo, created_at, tema_id,
              temas (
                titulo,
                unidades (
                  materias (nombre)
                )
              )
            `)
            .in('tema_id', temaIds)
            .order('created_at', { ascending: false })
            .limit(10);

          ejerciciosPublicados = ejercicios || [];
        }
      }
    }

    // Formatear pendientes para la UI
    const pendientes = ejerciciosPublicados.map(ej => ({
      id: ej.id,
      titulo: ej.titulo,
      tipo: ej.tipo,
      fecha: ej.created_at,
      materia: ej.temas?.unidades?.materias?.nombre || 'General',
      tema: ej.temas?.titulo || ''
    }));

    return {
      profile,
      materiasAsignadas,
      pendientes
    };

  } catch (error: any) {
    console.error('Error fetching alumno dashboard:', error.message);
    return { error: error.message };
  }
}
