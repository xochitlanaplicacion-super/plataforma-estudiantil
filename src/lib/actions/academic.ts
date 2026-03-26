
'use server';

import { createClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://cuuohbztrxxneozagecr.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

const prepareForUpsert = (data: any) => {
  const cleanData = { ...data };
  
  if (!cleanData.id || cleanData.id === '' || cleanData.id === 'new') {
    delete cleanData.id;
  }

  // Lista negra de campos que son relaciones o metadatos de Supabase
  const blacklist = [
    'niveles', 
    'carreras', 
    'grados', 
    'groups',
    'materias', 
    'profiles', 
    'unidades', 
    'temas', 
    'ejercicios',
    'created_at'
  ];

  Object.keys(cleanData).forEach(key => {
    if (blacklist.includes(key)) {
      delete cleanData[key];
      return;
    }
    // Eliminar cualquier objeto anidado que no sea una fecha
    if (cleanData[key] !== null && typeof cleanData[key] === 'object' && !(cleanData[key] instanceof Date)) {
      delete cleanData[key];
      return;
    }
    if (cleanData[key] === '' || cleanData[key] === undefined) {
      cleanData[key] = null;
    }
  });

  return cleanData;
};

// --- NIVELES ---
export async function getNiveles() {
  const { data, error } = await supabaseAdmin.from('niveles').select('*').order('nombre');
  return { data, error };
}

export async function upsertNivel(nivel: any) {
  const cleanData = prepareForUpsert(nivel);
  const { data, error } = await supabaseAdmin.from('niveles').upsert(cleanData).select().single();
  revalidatePath('/dashboard/admin/estructura');
  return { data, error };
}

export async function deleteNivel(id: string) {
  const { error } = await supabaseAdmin.from('niveles').delete().eq('id', id);
  revalidatePath('/dashboard/admin/estructura');
  return { error };
}

// --- CARRERAS ---
export async function getCarreras(nivelId?: string) {
  let query = supabaseAdmin.from('carreras').select('*, niveles(nombre)');
  if (nivelId) query = query.eq('nivel_id', nivelId);
  const { data, error } = await query.order('nombre');
  return { data, error };
}

export async function upsertCarrera(carrera: any) {
  const cleanData = prepareForUpsert(carrera);
  const { data, error } = await supabaseAdmin.from('carreras').upsert(cleanData).select().single();
  revalidatePath('/dashboard/admin/estructura');
  return { data, error };
}

export async function deleteCarrera(id: string) {
  const { error } = await supabaseAdmin.from('carreras').delete().eq('id', id);
  revalidatePath('/dashboard/admin/estructura');
  return { error };
}

// --- GRADOS ---
export async function getGrados(carreraId: string) {
  const { data, error } = await supabaseAdmin.from('grados').select('*').eq('carrera_id', carreraId).order('orden');
  return { data, error };
}

export async function upsertGrado(grado: any) {
  const cleanData = prepareForUpsert(grado);
  const { data, error } = await supabaseAdmin.from('grados').upsert(cleanData).select().single();
  revalidatePath('/dashboard/admin/grupos');
  return { data, error };
}

export async function deleteGrado(id: string) {
  const { error } = await supabaseAdmin.from('grados').delete().eq('id', id);
  revalidatePath('/dashboard/admin/grupos');
  return { error };
}

// --- GRUPOS ---
export async function getGrupos(carreraId: string) {
  const { data, error } = await supabaseAdmin.from('grupos').select('*, grados(nombre)').eq('carrera_id', carreraId).order('nombre');
  return { data, error };
}

export async function upsertGrupo(grupo: any) {
  const cleanData = prepareForUpsert(grupo);
  const { data, error } = await supabaseAdmin.from('grupos').upsert(cleanData).select().single();
  revalidatePath('/dashboard/admin/grupos');
  return { data, error };
}

export async function deleteGrupo(id: string) {
  const { error } = await supabaseAdmin.from('grupos').delete().eq('id', id);
  revalidatePath('/dashboard/admin/grupos');
  return { error };
}

// --- MATERIAS ---
export async function getMaterias(carreraId: string) {
  const { data, error } = await supabaseAdmin.from('materias').select('*').eq('carrera_id', carreraId).order('nombre');
  return { data, error };
}

export async function upsertMateria(materia: any) {
  const cleanData = prepareForUpsert(materia);
  const { data, error } = await supabaseAdmin.from('materias').upsert(cleanData).select().single();
  revalidatePath('/dashboard/admin/materias');
  return { data, error };
}

export async function deleteMateria(id: string) {
  const { error } = await supabaseAdmin.from('materias').delete().eq('id', id);
  revalidatePath('/dashboard/admin/materias');
  return { error };
}

// --- UNIDADES ---
export async function getUnidades(materiaId: string) {
  const { data, error } = await supabaseAdmin.from('unidades').select('*').eq('materia_id', materiaId).order('orden');
  return { data, error };
}

export async function upsertUnidad(unidad: any) {
  const cleanData = prepareForUpsert(unidad);
  const { data, error } = await supabaseAdmin.from('unidades').upsert(cleanData).select().single();
  return { data, error };
}

export async function deleteUnidad(id: string) {
  const { error } = await supabaseAdmin.from('unidades').delete().eq('id', id);
  return { error };
}

// --- TEMAS ---
export async function getTemas(unidadId: string) {
  const { data, error } = await supabaseAdmin.from('temas').select('*').eq('unidad_id', unidadId).order('orden');
  return { data, error };
}

export async function upsertTema(tema: any) {
  const cleanData = prepareForUpsert(tema);
  const { data, error } = await supabaseAdmin.from('temas').upsert(cleanData).select().single();
  return { data, error };
}

export async function deleteTema(id: string) {
  const { error } = await supabaseAdmin.from('temas').delete().eq('id', id);
  return { error };
}

// --- EJERCICIOS ---
export async function getEjercicios(temaId: string) {
  const { data, error } = await supabaseAdmin.from('ejercicios').select('*').eq('tema_id', temaId).order('orden');
  return { data, error };
}

export async function upsertEjercicio(ejercicio: any) {
  const cleanData = prepareForUpsert(ejercicio);
  const { data, error } = await supabaseAdmin.from('ejercicios').upsert(cleanData).select().single();
  return { data, error };
}

export async function deleteEjercicio(id: string) {
  const { error } = await supabaseAdmin.from('ejercicios').delete().eq('id', id);
  return { error };
}

// --- PROFESORES ---
export async function getProfesores() {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, nombre, apellidos, email')
    .eq('rol', 'profesor')
    .order('nombre');
  return { data, error };
}

export async function getAsignacionesProfesor() {
  const { data, error } = await supabaseAdmin
    .from('asignaciones_profesor')
    .select('*, profiles:profesor_id(nombre, apellidos), niveles(nombre), carreras(nombre), materias(nombre)')
    .order('created_at', { ascending: false });
  return { data, error };
}

export async function upsertAsignacionProfesor(asignacion: any) {
  const cleanData = prepareForUpsert(asignacion);
  const { data, error } = await supabaseAdmin.from('asignaciones_profesor').upsert(cleanData).select().single();
  revalidatePath('/dashboard/admin/profesores');
  return { data, error };
}

export async function deleteAsignacionProfesor(id: string) {
  const { error } = await supabaseAdmin.from('asignaciones_profesor').delete().eq('id', id);
  revalidatePath('/dashboard/admin/profesores');
  return { error };
}

export async function replaceProfesorInAssignments(oldProfesorId: string, newProfesorId: string) {
  try {
    const { error } = await supabaseAdmin
      .from('asignaciones_profesor')
      .update({ profesor_id: newProfesorId })
      .eq('profesor_id', oldProfesorId);
    if (error) throw error;
    revalidatePath('/dashboard/admin/profesores');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// --- INSCRIPCIONES MASIVAS ---
export async function getAlumnosVigentes() {
  try {
    const hoy = new Date().toISOString().split('T')[0];
    
    // CONSULTA NIVEL 1: Intentamos traer todo incluyendo grupos (Asumiendo que grupo_id existe)
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('id, nombre, apellidos, email, matricula, fecha_expiracion, estatus, rol, carrera_id, grupo_id, carreras(nombre)')
      .eq('rol', 'alumno')
      .eq('estatus', 'activo')
      .gte('fecha_expiracion', hoy)
      .order('nombre');

    if (error) {
      // SI FALLA (PGRST200 o PGRST204): Significa que grupo_id no existe en la tabla profiles
      console.warn("Relación grupo_id no encontrada, intentando fallback sin grupos...");
      const { data: fallback, error: fallbackError } = await supabaseAdmin
        .from('profiles')
        .select('id, nombre, apellidos, email, matricula, fecha_expiracion, estatus, rol, carrera_id, carreras(nombre)')
        .eq('rol', 'alumno')
        .eq('estatus', 'activo')
        .gte('fecha_expiracion', hoy)
        .order('nombre');
      
      if (fallbackError) throw fallbackError;
      return { data: fallback, error: null };
    }
    
    return { data, error: null };
  } catch (error: any) {
    console.error("Error crítico getAlumnosVigentes:", error);
    return { data: null, error: error.message };
  }
}

export async function bulkAssignGroup(userIds: string[], groupId: string | null) {
  try {
    const { error } = await supabaseAdmin
      .from('profiles')
      .update({ grupo_id: groupId })
      .in('id', userIds);

    if (error) throw error;
    
    revalidatePath('/dashboard/admin/inscripciones');
    return { success: true };
  } catch (error: any) {
    console.error("Error bulkAssignGroup:", error);
    return { success: false, error: error.message };
  }
}
