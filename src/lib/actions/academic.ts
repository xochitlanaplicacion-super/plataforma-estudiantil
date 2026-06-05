
'use server';

import { createClient } from '@supabase/supabase-js';
import { revalidatePath, unstable_noStore as noStore } from 'next/cache';

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

  const blacklist = [
    'niveles',
    'carreras',
    'grados',
    'groups',
    'grupos',
    'materias',
    'profiles',
    'unidades',
    'temas',
    'ejercicios',
    'slides',
    'resources',
    'created_at',
    'updated_at'
  ];

  Object.keys(cleanData).forEach(key => {
    if (blacklist.includes(key)) {
      delete cleanData[key];
      return;
    }
    if (cleanData[key] !== null && typeof cleanData[key] === 'object' && !(cleanData[key] instanceof Date)) {
      if (key !== 'videos' && key !== 'slides' && key !== 'asignaciones_ids') {
        delete cleanData[key];
      }
    }
    // IMPORTANTE: Aseguramos que undefined sea null, pero preservamos strings (incluso vacíos)
    if (cleanData[key] === undefined) {
      cleanData[key] = null;
    }
  });

  return cleanData;
};

// --- AGRUPACIONES PROFESOR ---
export async function getMisAgrupaciones(profesorId: string) {
  const { data, error } = await supabaseAdmin
    .from('agrupaciones_profesor')
    .select('*')
    .eq('profesor_id', profesorId)
    .order('created_at', { ascending: false });
  return { data, error };
}

export async function upsertAgrupacion(agrupacion: any) {
  const cleanData = prepareForUpsert(agrupacion);
  const { data, error } = await supabaseAdmin.from('agrupaciones_profesor').upsert(cleanData).select().single();
  revalidatePath('/dashboard/profesor');
  return { data, error };
}

export async function deleteAgrupacion(id: string) {
  const { error } = await supabaseAdmin.from('agrupaciones_profesor').delete().eq('id', id);
  revalidatePath('/dashboard/profesor');
  return { error };
}

// --- NIVELES ---
export async function getNiveles() {
  noStore();
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

export async function getAllGrupos() {
  const { data, error } = await supabaseAdmin
    .from('grupos')
    .select('*, carreras(nombre, nivel_id, niveles(nombre)), grados(nombre)')
    .order('nombre');
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

export async function upsertUnidad(unidad: any, syncTargetMateriaIds?: string[]) {
  const cleanData = prepareForUpsert(unidad);

  if (syncTargetMateriaIds && syncTargetMateriaIds.length > 0 && !cleanData.id) {
    const sync_id = crypto.randomUUID();
    const recordsToInsert = syncTargetMateriaIds.map(mId => ({
      ...cleanData,
      materia_id: mId,
      sync_id
    }));
    const { data, error } = await supabaseAdmin.from('unidades').insert(recordsToInsert).select();
    revalidatePath('/dashboard/profesor');
    return { data: data?.find(d => d.materia_id === cleanData.materia_id) || data?.[0], error };
  }

  if (cleanData.sync_id && cleanData.id) {
    const updateData = { ...cleanData };
    delete updateData.id;
    delete updateData.materia_id;
    const { data, error } = await supabaseAdmin.from('unidades').update(updateData).eq('sync_id', cleanData.sync_id).select();
    revalidatePath('/dashboard/profesor');
    return { data: data?.find(d => d.id === cleanData.id) || null, error };
  }

  const { data, error } = await supabaseAdmin.from('unidades').upsert(cleanData).select().single();
  revalidatePath('/dashboard/profesor');
  return { data, error };
}

export async function deleteUnidad(id: string, sync_id?: string) {
  if (sync_id) {
    const { error } = await supabaseAdmin.from('unidades').delete().eq('sync_id', sync_id);
    revalidatePath('/dashboard/profesor');
    return { error };
  }
  const { error } = await supabaseAdmin.from('unidades').delete().eq('id', id);
  revalidatePath('/dashboard/profesor');
  return { error };
}

// --- TEMAS ---
export async function getTemas(unidadId: string) {
  const { data, error } = await supabaseAdmin.from('temas').select('*').eq('unidad_id', unidadId).order('orden');
  return { data, error };
}

export async function upsertTema(tema: any, isSyncCreation: boolean = false) {
  const cleanData = prepareForUpsert(tema);

  if (isSyncCreation && !cleanData.id && cleanData.unidad_id) {
    const { data: unidadObj } = await supabaseAdmin.from('unidades').select('sync_id').eq('id', cleanData.unidad_id).single();
    if (unidadObj?.sync_id) {
      const { data: unidadesSync } = await supabaseAdmin.from('unidades').select('id').eq('sync_id', unidadObj.sync_id);
      if (unidadesSync && unidadesSync.length > 0) {
        const sync_id = crypto.randomUUID();
        const recordsToInsert = unidadesSync.map(u => ({
          ...cleanData,
          unidad_id: u.id,
          sync_id
        }));
        const { data, error } = await supabaseAdmin.from('temas').insert(recordsToInsert).select();
        revalidatePath('/dashboard/profesor');
        return { data: data?.find(d => d.unidad_id === cleanData.unidad_id) || data?.[0], error };
      }
    }
  }

  if (cleanData.sync_id && cleanData.id) {
    const updateData = { ...cleanData };
    delete updateData.id;
    delete updateData.unidad_id;
    const { data, error } = await supabaseAdmin.from('temas').update(updateData).eq('sync_id', cleanData.sync_id).select();
    revalidatePath('/dashboard/profesor');
    return { data: data?.find(d => d.id === cleanData.id) || null, error };
  }

  const { data, error } = await supabaseAdmin.from('temas').upsert(cleanData).select().single();
  revalidatePath('/dashboard/profesor');
  return { data, error };
}

export async function deleteTema(id: string, sync_id?: string) {
  if (sync_id) {
    const { error } = await supabaseAdmin.from('temas').delete().eq('sync_id', sync_id);
    revalidatePath('/dashboard/profesor');
    return { error };
  }
  const { error } = await supabaseAdmin.from('temas').delete().eq('id', id);
  revalidatePath('/dashboard/profesor');
  return { error };
}

// --- EJERCICIOS ---
export async function getEjercicios(temaId: string) {
  const { data, error } = await supabaseAdmin.from('ejercicios').select('*').eq('tema_id', temaId).order('orden');
  return { data, error };
}

export async function upsertEjercicio(ejercicio: any, isSyncCreation: boolean = false) {
  const cleanData = prepareForUpsert(ejercicio);

  if (isSyncCreation && !cleanData.id && cleanData.tema_id) {
    const { data: temaObj } = await supabaseAdmin.from('temas').select('sync_id').eq('id', cleanData.tema_id).single();
    if (temaObj?.sync_id) {
      const { data: temasSync } = await supabaseAdmin.from('temas').select('id').eq('sync_id', temaObj.sync_id);
      if (temasSync && temasSync.length > 0) {
        const sync_id = crypto.randomUUID();
        const recordsToInsert = temasSync.map(t => ({
          ...cleanData,
          tema_id: t.id,
          sync_id
        }));
        const { data, error } = await supabaseAdmin.from('ejercicios').insert(recordsToInsert).select();
        revalidatePath('/dashboard/profesor');
        return { data: data?.find(d => d.tema_id === cleanData.tema_id) || data?.[0], error };
      }
    }
  }

  if (cleanData.sync_id && cleanData.id) {
    const updateData = { ...cleanData };
    delete updateData.id;
    delete updateData.tema_id;
    const { data, error } = await supabaseAdmin.from('ejercicios').update(updateData).eq('sync_id', cleanData.sync_id).select();
    revalidatePath('/dashboard/profesor');
    return { data: data?.find(d => d.id === cleanData.id) || null, error };
  }

  const { data, error } = await supabaseAdmin.from('ejercicios').upsert(cleanData).select().single();
  revalidatePath('/dashboard/profesor');
  return { data, error };
}

export async function deleteEjercicio(id: string, sync_id?: string) {
  if (sync_id) {
    const { error } = await supabaseAdmin.from('ejercicios').delete().eq('sync_id', sync_id);
    revalidatePath('/dashboard/profesor');
    return { error };
  }
  const { error } = await supabaseAdmin.from('ejercicios').delete().eq('id', id);
  revalidatePath('/dashboard/profesor');
  return { error };
}

// --- SLIDES (PRESENTACIONES) ---
export async function getSlides(temaId: string) {
  const { data, error } = await supabaseAdmin
    .from('slides')
    .select('*')
    .eq('tema_id', temaId)
    .order('orden');
  return { data, error };
}

export async function upsertSlide(slide: any, isSyncCreation: boolean = false) {
  try {
    const cleanData = prepareForUpsert(slide);

    // Intentamos limpiarlo antes por si acaso (PGRST204)
    const fallbackData = { ...cleanData };
    delete fallbackData.created_by;
    delete fallbackData.estilo;

    if (isSyncCreation && !fallbackData.id && fallbackData.tema_id) {
      const { data: temaObj } = await supabaseAdmin.from('temas').select('sync_id').eq('id', fallbackData.tema_id).single();
      if (temaObj?.sync_id) {
        const { data: temasSync } = await supabaseAdmin.from('temas').select('id').eq('sync_id', temaObj.sync_id);
        if (temasSync && temasSync.length > 0) {
          const sync_id = crypto.randomUUID();
          const recordsToInsert = temasSync.map(t => ({
            ...fallbackData,
            tema_id: t.id,
            sync_id
          }));
          const { data, error } = await supabaseAdmin.from('slides').insert(recordsToInsert).select();
          revalidatePath('/dashboard/profesor');
          return { data: data?.find(d => d.tema_id === fallbackData.tema_id) || data?.[0], error };
        }
      }
    }

    if (fallbackData.sync_id && fallbackData.id) {
      const updateData = { ...fallbackData };
      delete updateData.id;
      delete updateData.tema_id;
      const { data, error } = await supabaseAdmin.from('slides').update(updateData).eq('sync_id', fallbackData.sync_id).select();
      revalidatePath('/dashboard/profesor');
      return { data: data?.find(d => d.id === fallbackData.id) || null, error };
    }

    const { data, error } = await supabaseAdmin.from('slides').upsert(fallbackData).select().single();
    revalidatePath('/dashboard/profesor');
    return { data, error };
  } catch (err: any) {
    return { data: null, error: err };
  }
}

export async function updateSlidesOrder(updates: { id: string, orden: number }[]) {
  try {
    // Supabase permite upsert por lotes si mandamos un array.
    // Como solo queremos actualizar el 'orden', necesitamos proveer también el ID.
    // Es posible que upsert sobreescriba campos no especificados si la base de datos lo requiere,
    // pero con supabase-js `.upsert(array)` solo hace merge de las columnas enviadas si configuramos onConflict bien.
    // Otra opción segura es hacer un update iterando sobre cada uno o usar Promise.all. 
    // Usaremos Promise.all para estar 100% seguros de no sobreescribir otros datos accidentalmente.
    const promises = updates.map(update => 
      supabaseAdmin.from('slides')
        .update({ orden: update.orden })
        .eq('id', update.id)
    );
    
    await Promise.all(promises);
    
    revalidatePath('/dashboard/profesor');
    return { success: true };
  } catch (err: any) {
    console.error("Error al reordenar diapositivas:", err);
    return { success: false, error: err };
  }
}

export async function deleteSlide(id: string, sync_id?: string) {
  if (sync_id) {
    const { error } = await supabaseAdmin.from('slides').delete().eq('sync_id', sync_id);
    revalidatePath('/dashboard/profesor');
    return { error };
  }
  const { error } = await supabaseAdmin.from('slides').delete().eq('id', id);
  revalidatePath('/dashboard/profesor');
  return { error };
}

// --- RECURSOS (FILES) ---
export async function getResources(temaId: string) {
  const { data, error } = await supabaseAdmin
    .from('resources')
    .select('*')
    .eq('tema_id', temaId)
    .order('created_at', { ascending: false });
  return { data, error };
}

export async function upsertResource(resource: any, isSyncCreation: boolean = false) {
  const cleanData = prepareForUpsert(resource);

  if (isSyncCreation && !cleanData.id && cleanData.tema_id) {
    const { data: temaObj } = await supabaseAdmin.from('temas').select('sync_id').eq('id', cleanData.tema_id).single();
    if (temaObj?.sync_id) {
      const { data: temasSync } = await supabaseAdmin.from('temas').select('id').eq('sync_id', temaObj.sync_id);
      if (temasSync && temasSync.length > 0) {
        const sync_id = crypto.randomUUID();
        const recordsToInsert = temasSync.map(t => ({
          ...cleanData,
          tema_id: t.id,
          sync_id
        }));
        const { data, error } = await supabaseAdmin.from('resources').insert(recordsToInsert).select();
        revalidatePath('/dashboard/profesor');
        return { data: data?.find(d => d.tema_id === cleanData.tema_id) || data?.[0], error };
      }
    }
  }

  if (cleanData.sync_id && cleanData.id) {
    const updateData = { ...cleanData };
    delete updateData.id;
    delete updateData.tema_id;
    const { data, error } = await supabaseAdmin.from('resources').update(updateData).eq('sync_id', cleanData.sync_id).select();
    revalidatePath('/dashboard/profesor');
    return { data: data?.find(d => d.id === cleanData.id) || null, error };
  }

  const { data, error } = await supabaseAdmin.from('resources').upsert(cleanData).select().single();
  revalidatePath('/dashboard/profesor');
  return { data, error };
}

export async function deleteResourceRecord(id: string, sync_id?: string) {
  if (sync_id) {
    const { error } = await supabaseAdmin.from('resources').delete().eq('sync_id', sync_id);
    revalidatePath('/dashboard/profesor');
    return { error };
  }
  const { error } = await supabaseAdmin.from('resources').delete().eq('id', id);
  revalidatePath('/dashboard/profesor');
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

export async function getMyAsignaciones(profesorId: string) {
  const { data, error } = await supabaseAdmin
    .from('asignaciones_profesor')
    .select('*, niveles(nombre), carreras(nombre), materias(nombre), grupos(nombre, grados(nombre))')
    .eq('profesor_id', profesorId)
    .eq('activo', true)
    .order('created_at', { ascending: false });
  return { data, error };
}

export async function upsertAsignacionProfesor(asignacion: any) {
  const cleanData = prepareForUpsert(asignacion);
  const { data, error } = await supabaseAdmin.from('asignaciones_profesor').upsert(cleanData).select().single();
  revalidatePath('/dashboard/admin/profesores');
  revalidatePath('/dashboard/profesor');
  return { data, error };
}

export async function deleteAsignacionProfesor(id: string) {
  const { error } = await supabaseAdmin.from('asignaciones_profesor').delete().eq('id', id);
  revalidatePath('/dashboard/admin/profesores');
  revalidatePath('/dashboard/profesor');
  return { error };
}

export async function replaceProfesorInAssignments(oldProfesorId: string, newProfesorId: string) {
  try {
    // 1. Transferir asignaciones de grupos y materias
    const { error: errorAsig } = await supabaseAdmin
      .from('asignaciones_profesor')
      .update({ profesor_id: newProfesorId })
      .eq('profesor_id', oldProfesorId);

    if (errorAsig) throw errorAsig;

    // 2. Transferir propiedad del contenido
    try {
      await Promise.all([
        supabaseAdmin.from('unidades').update({ created_by: newProfesorId }).eq('created_by', oldProfesorId),
        supabaseAdmin.from('temas').update({ created_by: newProfesorId }).eq('created_by', oldProfesorId),
        supabaseAdmin.from('ejercicios').update({ created_by: newProfesorId }).eq('created_by', oldProfesorId),
        supabaseAdmin.from('slides').update({ created_by: newProfesorId }).eq('created_by', oldProfesorId),
        supabaseAdmin.from('resources').update({ created_by: newProfesorId }).eq('created_by', oldProfesorId)
      ]);
    } catch (e) {
      console.warn("Algunas tablas no tienen la columna created_by aún. Traspaso parcial completado.");
    }

    revalidatePath('/dashboard/admin/profesores');
    revalidatePath('/dashboard/profesor');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// --- INSCRIPCIONES MASIVAS ---
export async function getAlumnosVigentes() {
  try {
    const hoy = new Date().toISOString().split('T')[0];

    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('id, nombre, apellidos, email, matricula, fecha_expiracion, estatus, rol, carrera_id, grupo_id, carreras(nombre, nivel_id, niveles(nombre))')
      .eq('rol', 'alumno')
      .eq('estatus', 'activo')
      .gte('fecha_expiracion', hoy)
      .order('nombre');

    if (error) {
      const { data: fb } = await supabaseAdmin
        .from('profiles')
        .select('id, nombre, apellidos, email, matricula, fecha_expiracion, estatus, rol, carrera_id, carreras(nombre, nivel_id, niveles(nombre))')
        .eq('rol', 'alumno')
        .eq('estatus', 'activo')
        .gte('fecha_expiracion', hoy)
        .order('nombre');

      return { data: fb, error: null };
    }

    return { data, error: null };
  } catch (error: any) {
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
    return { success: false, error: error.message };
  }
}

// --- GRUPOS Y ALUMNOS ---
export async function getAlumnosPorGrupo(groupId: string) {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, nombre, apellidos, curp, email, matricula, fecha_expiracion, estatus, rol, carrera_id, grupo_id')
    .eq('grupo_id', groupId)
    .eq('rol', 'alumno')
    .eq('estatus', 'activo')
    .order('apellidos');
  return { data, error };
}
